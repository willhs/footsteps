#!/usr/bin/env python3
"""Ingest the Allen Ancient DNA Resource (AADR) annotation table as dated evidence of people.

    python footstep-generator/evidence/aadr.py fetch    # latest 1240K .anno (metadata only) -> data/raw/aadr/
    python footstep-generator/evidence/aadr.py build    # -> data/evidence/aadr_samples.json.gz
    python footstep-generator/evidence/aadr.py report   # earliest per region + coverage by era -> markdown

See README.md beside this file for the rules and what the numbers do and do not mean.

Data shape (one direction of flow, each stage a pure function over a DataFrame):

    .anno row --parse--> Sample (one row per library: located, dated, not present-day)
              --dedupe--> one row per Individual ID (the best-assessed library)
              --region--> + continent and arrival-table region id
    Sample = one ancient individual. Its date is a cal BP mean plus a 95.4% range (`old` >= `young`),
    `date_type` says how it was dated (direct radiocarbon, archaeological context, kinship tethering) and
    `hominin` says who (sapiens, neanderthal, denisovan, or their hybrid).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import urllib.request
from datetime import date
from enum import Enum
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

from evidence import regions as reg  # noqa: E402

RAW_DIR = ROOT / "data" / "raw" / "aadr"
OUT_DIR = ROOT / "data" / "evidence"
DATASET_API = "https://dataverse.harvard.edu/api/datasets/:persistentId/versions/:latest?persistentId=doi:10.7910/DVN/FFIDCW"
FILE_URL = "https://dataverse.harvard.edu/api/access/datafile/{id}"
ANNO_SUFFIX = "_1240K.aadr.PUB.anno"  # every ancient individual; the HO table adds present-day people

# Header text starts (the headers are long sentences). 'ASSESSMENT' is matched exactly because
# 'ASSESSMENT WARNINGS' follows it.
COLUMNS = {
    "id": "Genetic ID",
    "individual": "Individual ID",
    "pub": "Publication abbreviation",
    "doi": "doi for publication",
    "method": "Method for Determining Date",
    "mean": "Date mean in BP",
    "sd": "Date standard deviation in BP",
    "full": "Full Date",
    "group": "Group ID",
    "locality": "Locality",
    "country": "Political Entity",
    "lat": "Latitude",
    "lon": "Longitude",
    "assess": "ASSESSMENT",
}
EXACT = {"assess"}

# BCE years convert with +1950 (not +1949): this is AADR's own convention, so a range and its mean agree.
BP_ZERO = 1950


class DateType(str, Enum):
    DIRECT = "direct"  # the individual's own radiocarbon date (the strongest)
    CONTEXT = "context"  # an archaeological range, or dates on other finds in the same layer or site
    TETHERED = "tethered"  # dated through a close genetic relative's radiocarbon date
    OTHER = "other"


class Hominin(str, Enum):
    SAPIENS = "sapiens"
    NEANDERTHAL = "neanderthal"
    DENISOVAN = "denisovan"
    HYBRID = "neanderthal_denisovan"


# Contamination and quality calls from the AADR curators. Lower is better; used only to pick which
# library of one individual to keep and to let a consumer filter. Nothing is dropped for it: a
# contaminated library still comes from a real, dated skeleton.
ASSESS_RANK = {
    "Pass": 0, "MERGE_PASS": 1, "PROVISIONAL_PASS": 2, "Questionable": 3, "MERGE_QUESTIONABLE": 4,
    "PROVISIONAL_QUESTIONABLE": 5, "CRITICAL": 6, "MERGE_CRITICAL": 7, "PROVISIONAL_CRITICAL": 8,
}


def date_type(method: str) -> DateType:
    m = method.strip().lower()
    if m.startswith("direct"):
        return DateType.DIRECT
    if m.startswith("context"):
        return DateType.CONTEXT
    if "tether" in m:
        return DateType.TETHERED
    return DateType.OTHER


# Denisovan genomes by AADR group. Not a pattern: 'Russia_DenisovaCave' is the Essel 2023 pendant DNA, a
# Homo sapiens woman, and other groups from the cave may follow.
DENISOVAN_GROUPS = frozenset({"russia_denisova", "russia_denisovacave_mpleistocene"})


def hominin(group: str) -> Hominin:
    g = group.casefold()
    if "neanderthal" in g and "denisova" in g:
        return Hominin.HYBRID
    if "neanderthal" in g:
        return Hominin.NEANDERTHAL
    if g in DENISOVAN_GROUPS:
        return Hominin.DENISOVAN
    return Hominin.SAPIENS


# --- dates ---------------------------------------------------------------------------------------

_RANGE = re.compile(
    r"^\s*(?P<a>\d+)\s*(?:cal)?(?P<aera>BCE|CE)?\s*-\s*(?P<b>\d+)\s*(?:cal)?(?P<bera>BCE|CE)\b"
)
_YEAR = re.compile(r"^\s*(?P<a>\d+)\s*(?:cal)?(?P<era>BCE|CE)\b")


def _to_bp(year: int, era: str) -> int:
    return year + BP_ZERO if era == "BCE" else BP_ZERO - year


def parse_range(full: str) -> tuple[int, int] | None:
    """(old, young) in BP from a 'Full Date' such as '3648-3528 calBCE (4820±34 BP, UBA-29003)',
    '600-700 CE', '50 BCE - 120 CE' or the single year '550 CE'. None when it has no closed range
    (e.g. '>43500 calBCE', 'present')."""
    full = full.replace("\u2013", "-")
    m = _RANGE.match(full)
    if m:
        old = _to_bp(int(m["a"]), m["aera"] or m["bera"])
        young = _to_bp(int(m["b"]), m["bera"])
        return (old, young) if old >= young else None
    m = _YEAR.match(full)
    if m:
        bp = _to_bp(int(m["a"]), m["era"])
        return bp, bp
    return None


def resolve_range(full: str, mean: float, sd: float) -> tuple[int, int, str]:
    """The sample's 95.4% range in BP and where it came from:
    'anno'    the table's own range, which contains the mean (give or take 2 sd; the mean is an OxCal mu);
    'mean_sd' mean +- 2 sd, because the range is open-ended or unreadable;
    'conflict' mean +- 2 sd, because the table's own range and mean disagree (a table error: one of them
               is wrong and we cannot tell which). Consumers should not rely on these dates."""
    rng = parse_range(full)
    slack = max(10.0, 2 * sd)
    fallback = int(round(mean + 2 * sd)), int(round(max(mean - 2 * sd, 0)))
    if rng is None:
        return *fallback, "mean_sd"
    if rng[1] - slack <= mean <= rng[0] + slack:
        return rng[0], rng[1], "anno"
    return *fallback, "conflict"


# --- place ---------------------------------------------------------------------------------------

# AADR gives a country, not a continent. This is the continent label the arrival-table regions
# need (regions.py filters on p3k14c's continent names). Russia is split at 60E below.
_C = {
    "Europe": "Hungary|United Kingdom|Austria|Italy|Germany|Spain|Denmark|France|Poland|Czechia|Belgium|Ukraine"
    "|Sweden|Croatia|Serbia|Romania|Greece|Bulgaria|Netherlands|Portugal|Norway|Slovakia|Ireland|Estonia|Moldova"
    "|Switzerland|Latvia|Iceland|Slovenia|Lithuania|Albania|Montenegro|North Macedonia|Finland|Faroe Islands"
    "|Crimea|Channel Islands|Gibraltar|Malta|Luxembourg|Bosnia-Herzegovina|Belarus",
    "Asia": "China|Mongolia|Armenia|Iran|Pakistan|Israel|Turkmenistan|Uzbekistan|Kyrgyzstan|Jordan|Taiwan|Nepal"
    "|Lebanon|India|Thailand|Yemen|Japan|Georgia|Syria|Vietnam|Indonesia|Republic of Korea|Tajikistan|Iraq"
    "|Azerbaijan|Laos|Bahrain|Malaysia|Cambodia|Philippines|Afghanistan|Cyprus|Kazakhstan|Turkey",
    "Africa": "Kenya|Tunisia|Sudan|Tanzania|South Africa|Morocco|Malawi|Cameroon|Algeria"
    "|Democratic Republic of the Congo|Botswana|Ethiopia|Egypt|Zambia|Uganda|Saint Helena|Canary Islands",
    "North America": "USA|Mexico|Canada|Greenland|Dominican Republic|Cuba|Bahamas|Puerto Rico|Haiti|Saint Lucia"
    "|Curacao|Guadeloupe|Sint Maarten",
    "Central America": "Belize|Panama",
    "South America": "Argentina|Peru|Brazil|Colombia|Bolivia|Chile|Venezuela|Uruguay|Paraguay",
    "Australia": "Australia|Papua New Guinea",  # the Sahul side, as p3k14c labels it
    "Oceania": "Guam|Vanuatu|Palau|Federated States of Micronesia|Tonga|French Polynesia|Solomon Islands",
}
COUNTRY_CONTINENT: dict[str, str] = {c: cont for cont, names in _C.items() for c in names.split("|")}
RUSSIA_ASIA_FROM_LON = 60.0  # the Urals


def continent_of(country: str, lon: float) -> str:
    """'' when the country is not in the table (such a sample falls in region 'other')."""
    if country == "Russia":
        return "Asia" if lon >= RUSSIA_ASIA_FROM_LON else "Europe"
    return COUNTRY_CONTINENT.get(country, "")


def _decimals(raw: str) -> int:
    return len(raw.split(".")[1]) if "." in raw else 0


# --- boundary: raw .anno -> clean samples --------------------------------------------------------


class IngestStats(dict):
    """Row counts at each drop, written into the export so nothing disappears silently."""


def _pick_columns(header: list[str]) -> dict[str, int]:
    found: dict[str, int] = {}
    for key, start in COLUMNS.items():
        for i, h in enumerate(header):
            if (h == start) if key in EXACT else h.startswith(start):
                found[key] = i
                break
    missing = sorted(set(COLUMNS) - set(found))
    if missing:
        raise ValueError(f"AADR .anno is missing expected columns: {missing}")
    return found


def parse(anno_path: Path) -> tuple[pd.DataFrame, IngestStats]:
    """One row per usable library: not present-day, has a numeric date and coordinates. Not deduped."""
    raw = pd.read_csv(anno_path, sep="\t", dtype=str, keep_default_na=False)
    ix = _pick_columns(list(raw.columns))
    r = raw.iloc[:, [ix[k] for k in COLUMNS]].copy()
    r.columns = list(COLUMNS)
    r = r.apply(lambda s: s.str.strip().replace("..", ""))
    stats = IngestStats(rows=len(r))

    modern = r.method.str.startswith("Modern") | (r.full == "present")
    stats["dropped_present_day"] = int(modern.sum())
    r = r[~modern]
    numeric = r.lat.str.fullmatch(r"-?\d+(\.\d+)?") & r.lon.str.fullmatch(r"-?\d+(\.\d+)?")
    numeric &= r["mean"].str.fullmatch(r"-?\d+(\.\d+)?") & r.sd.str.fullmatch(r"\d+(\.\d+)?")
    stats["dropped_no_coordinates_or_date"] = int((~numeric).sum())  # reference genomes, unlocated finds
    r = r[numeric].copy()
    r["lat"], r["lon"] = r.lat.astype(float), r.lon.astype(float)
    on_earth = r.lat.between(-90, 90) & r.lon.between(-180, 180) & ~((r.lat == 0) & (r.lon == 0))
    stats["dropped_bad_coordinates"] = int((~on_earth).sum())
    r = r[on_earth].copy()

    r["loc_dp"] = [min(_decimals(a), _decimals(b)) for a, b in zip(r.lat.astype(str), r.lon.astype(str))]
    r["date_bp"] = r["mean"].astype(float).round().astype(int)
    r["date_sd"] = r.sd.astype(float).round().astype(int)
    ranges = [resolve_range(f, float(m), float(s)) for f, m, s in zip(r.full, r["mean"], r.sd)]
    r["old"], r["young"], r["range_src"] = [x[0] for x in ranges], [x[1] for x in ranges], [x[2] for x in ranges]
    r["date_type"] = [date_type(m).value for m in r.method]
    r["hominin"] = [hominin(g).value for g in r.group]
    r["rank"] = r.assess.map(ASSESS_RANK).fillna(9).astype(int)
    r = r.drop(columns=["mean", "sd"]).reset_index(drop=True)
    return r, stats


def dedupe(r: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    """One row per Individual ID (AADR lists one skeleton once per library and data type: '.AG', '.SG',
    '_d', '_alt'). Keeps the best-assessed library, earliest in the file on a tie.
    Returns (deduped, rows_dropped, individuals_whose_libraries_disagree_on_date_or_place)."""
    key = r.individual.where(r.individual != "", r.id)
    disagree = int(
        (r.assign(k=key).groupby("k")[["date_bp", "lat", "lon"]].nunique().max(axis=1) > 1).sum()
    )
    best = r.assign(k=key, pos=np.arange(len(r))).sort_values(["rank", "pos"]).drop_duplicates("k")
    out = best.sort_values("pos").drop(columns=["k", "pos"]).reset_index(drop=True)
    return out, len(r) - len(out), disagree


def assign_regions(r: pd.DataFrame) -> pd.DataFrame:
    r = r.copy()
    r["continent"] = [continent_of(c, lon) for c, lon in zip(r.country, r.lon)]
    r["region"] = reg.assign_regions(r.lat.to_numpy(), r.lon.to_numpy(), r.continent.to_numpy())
    return r


def ingest(anno_path: Path) -> tuple[pd.DataFrame, IngestStats]:
    r, stats = parse(anno_path)
    r, dropped, disagree = dedupe(r)
    stats["dropped_duplicate_libraries"] = dropped
    stats["individuals_with_conflicting_libraries"] = disagree
    r = assign_regions(r)
    stats["samples"] = len(r)
    stats["unmapped_countries"] = sorted(set(r.country[r.continent == ""]))
    stats["hominin"] = {k: int(v) for k, v in r.hominin.value_counts().items()}
    stats["date_type"] = {k: int(v) for k, v in r.date_type.value_counts().items()}
    stats["range_src"] = {k: int(v) for k, v in r.range_src.value_counts().items()}
    stats["assessment"] = {k: int(v) for k, v in r.assess.value_counts().items()}
    return r, stats


# --- export --------------------------------------------------------------------------------------


def export_web(r: pd.DataFrame, stats: IngestStats, source_name: str, path: Path) -> dict:
    """Compact per-sample JSON (gzip), publications interned. Sorted north to south for stable diffs."""
    refs: list[str] = []
    ref_ix: dict[str, int] = {}
    rows = []
    for s in r.sort_values(["lat", "lon", "id"]).itertuples():
        ref = (s.pub + (f" (doi:{s.doi})" if s.doi else "")).strip()
        if ref not in ref_ix:
            ref_ix[ref] = len(refs)
            refs.append(ref)
        row = {
            "id": s.id, "la": round(s.lat, 5), "lo": round(s.lon, 5), "dp": s.loc_dp,
            "d": s.date_bp, "sd": s.date_sd, "r": [s.old, s.young], "t": s.date_type[0],
            "n": s.locality, "c": s.country, "g": s.group, "q": s.assess, "rg": s.region, "p": ref_ix[ref],
        }
        if s.range_src != "anno":
            row["rs"] = s.range_src
        if s.hominin != Hominin.SAPIENS.value:
            row["h"] = s.hominin
        rows.append(row)
    doc = {
        "meta": {
            "dataset": f"AADR {source_name} (Allen Ancient DNA Resource, Reich Lab, annotation table only)",
            "licence": "CC0 1.0 (Harvard Dataverse doi:10.7910/DVN/FFIDCW); cite Mallick et al. 2024, "
            "Scientific Data 11:182, doi:10.1038/s41597-024-03031-7, and the paper in each sample's `p`",
            "built": date.today().isoformat(),
            "dates": "cal BP = years before 1950; year CE = 1950 - cal BP. `d` is the table's mean, `sd` its sd, "
            "`r` = [old, young] the table's 95.4% range (or mean +- 2 sd when `rs` is set)",
            "fields": {
                "id": "AADR Genetic ID of the kept library", "la/lo": "latitude/longitude as published, 5 dp max",
                "dp": "decimal places of the coarser coordinate: 0-1 is a rounded or centroid place, 3+ a site",
                "d": "date mean, cal BP", "sd": "date sd, years", "r": "[old, young] 95.4% range, cal BP",
                "rs": "only when the range is mean +- 2 sd rather than the table's own: mean_sd (open-ended or unreadable "
                "range) or conflict (the table's range and mean disagree; do not trust the date)",
                "t": "d direct radiocarbon, c context, t tethered to a relative's date, o other",
                "n": "locality as published", "c": "political entity", "g": "AADR genetic group label",
                "q": "curators' assessment (Pass ... CRITICAL); kept, not filtered", "rg": "arrival-table region",
                "p": "index into refs: first-listed publication of the data", "h": "only when not sapiens",
            },
            "attribution": "`h` marks Neanderthals and Denisovans, which AADR includes. Everything else is "
            "Homo sapiens by the table's own group labels.",
            "caveat": "A sample dates one skeleton, not a population. Counts follow where labs have sampled "
            "(Europe, the Holocene), not where people lived. Never sum samples into a head count.",
            "counts": {**stats, "samples_exported": len(rows)},
        },
        "refs": refs,
        "samples": rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    return doc["meta"]


# --- fetch + CLI ---------------------------------------------------------------------------------


def latest_anno_file() -> dict:
    """The newest release's 1240K annotation file (id, name, md5) from the Dataverse record."""
    with urllib.request.urlopen(DATASET_API, timeout=60) as resp:
        files = json.load(resp)["data"]["files"]
    hits = [f["dataFile"] for f in files if f["dataFile"]["filename"].endswith(ANNO_SUFFIX)]
    if len(hits) != 1:
        raise RuntimeError(f"expected one *{ANNO_SUFFIX} in the AADR dataset, found {len(hits)}")
    return hits[0]


def fetch(raw_dir: Path) -> Path:
    info = latest_anno_file()
    dest = raw_dir / info["filename"]
    raw_dir.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"have {dest}")
        return dest
    print(f"get  {info['filename']} ({info['filesize'] / 1e6:.1f} MB)")
    urllib.request.urlretrieve(FILE_URL.format(id=info["id"]), dest)
    if hashlib.md5(dest.read_bytes()).hexdigest() != info["md5"]:
        dest.unlink()
        raise RuntimeError(f"md5 mismatch for {info['filename']}; deleted the download")
    return dest


def find_anno(raw_dir: Path) -> Path:
    found = sorted(raw_dir.glob(f"*{ANNO_SUFFIX}"))
    if not found:
        raise FileNotFoundError(f"no *{ANNO_SUFFIX} in {raw_dir}; run `aadr.py fetch`")
    return found[-1]  # names sort by release (v66.p1 < v67...)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "build", "report"])
    ap.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = ap.parse_args(argv)
    if args.command == "fetch":
        fetch(args.raw_dir)
        return 0
    anno = find_anno(args.raw_dir)
    r, stats = ingest(anno)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.command == "report":
        from evidence import aadr_report

        text = aadr_report.render_markdown(aadr_report.report(r, stats), anno.name)
        (args.out_dir / "aadr_report.md").write_text(text)
        print(text)
        return 0
    meta = export_web(r, stats, anno.name.removesuffix(ANNO_SUFFIX), args.out_dir / "aadr_samples.json.gz")
    print(json.dumps(meta["counts"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
