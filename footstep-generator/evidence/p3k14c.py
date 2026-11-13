#!/usr/bin/env python3
"""Ingest the p3k14c radiocarbon compilation: calibrate, dedupe into sites, export.

    python footstep-generator/evidence/p3k14c.py fetch    # CSV + IntCal20/SHCal20/Marine20 -> data/raw/
    python footstep-generator/evidence/p3k14c.py build    # -> data/evidence/
    python footstep-generator/evidence/p3k14c.py report   # earliest dates per region -> markdown

See README.md beside this file for the rules and what the numbers do and do not mean.

Data shape (one direction of flow, each stage a pure function over a DataFrame):

    raw CSV row --parse--> Date (clean, normalised, one row per distinct sample)
                --calibrate--> + cal range / HPD intervals / status / curve used
                --cluster--> + site_id (a Site is a named place, or an unnamed point)
                --region--> + region id
    Site = all dates sharing a site_id; `local` iff its best LocAccuracy >= LOCAL_MIN_ACCURACY.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date
from enum import Enum
from hashlib import sha1
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

from evidence import calibrate as cal  # noqa: E402
from evidence import regions as reg  # noqa: E402

RAW_DIR = ROOT / "data" / "raw" / "p3k14c"
OUT_DIR = ROOT / "data" / "evidence"
CSV_NAME = "p3k14c_2022.06.csv"
CSV_URL = "https://www.p3k14c.org/data/p3k14c_2022.06.csv"
CURVE_URLS = {
    "intcal20.14c": "https://intcal.org/curves/intcal20.14c",
    "shcal20.14c": "https://intcal.org/curves/shcal20.14c",
    "marine20.14c": "https://intcal.org/curves/marine20.14c",
}

# p3k14c codebook: 0 country only, 1 province/state/county, 2 within ~500 m, 3 exact.
# 0 and 1 are administrative centroids: fine for a country map, wrong for a local one.
LOCAL_MIN_ACCURACY = 2
SITE_LINK_KM = 2.0  # same name + country within this distance is one site

REQUIRED_COLUMNS = (
    "LabID", "Age", "Error", "Material", "Taxa", "Method", "Long", "Lat", "LocAccuracy",
    "SiteName", "Country", "Continent", "Source", "Reference",
)


class CarbonSource(str, Enum):
    """What the dated carbon came from, which decides the curve and how far to trust the age."""

    TERRESTRIAL = "terrestrial"  # IntCal20 / SHCal20
    MARINE = "marine"  # Marine20 with the global mean reservoir (DeltaR = 0): approximate
    UNCERTAIN = "uncertain"  # shell, bulk sediment, carbonate: reservoir/old-carbon risk; IntCal


_MARINE = re.compile(
    r"marine|mytilus|haliotis|crassostrea|mercenaria|oyster|abalone|limpet|cockle|mussel"
    r"|\b(clam|whale|seal|dugong|fish|turtle|sea ?lion|walrus|porpoise|dolphin)\b",
    re.I,
)
_UNCERTAIN = re.compile(r"shell|sediment|soil|carbonate|bulk|travertine|speleothem|mortar|marl|\bmud\b", re.I)


def carbon_source(material: str, taxa: str) -> CarbonSource:
    text = f"{material} {taxa}"
    if _MARINE.search(text):
        return CarbonSource.MARINE
    if _UNCERTAIN.search(text):
        return CarbonSource.UNCERTAIN
    return CarbonSource.TERRESTRIAL


def norm_method(raw: object) -> str:
    """AMS, radiometric (conventional / beta counting) or unknown; the column is 77% empty."""
    if not isinstance(raw, str):
        return "unknown"
    t = raw.lower()
    if "ams" in t:
        return "AMS"
    if "radiometric" in t or "conventional" in t:
        return "radiometric"
    return "unknown"


def norm_name(raw: object) -> str:
    """Accent-, case- and punctuation-insensitive site name; '' for none."""
    if not isinstance(raw, str):
        return ""
    t = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9]+", "", t)


def fix_text(raw: object) -> str:
    """Repair UTF-8 that was mis-decoded as Mac Roman ('√ú' for 'Ü') or cp1252 ('Ã¼' for 'ü'),
    which p3k14c carries in some site names and references. Text that is already fine is kept."""
    if not isinstance(raw, str):
        return ""
    for enc, marker in (("mac_roman", "√"), ("cp1252", "Ã")):
        if marker in raw:
            try:
                return raw.encode(enc).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
    return raw.replace("\u00c2", "") if raw.endswith("\u00c2") else raw


def _norm_material(raw: object) -> str:
    return raw.strip().lower() if isinstance(raw, str) else ""


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 12742.0 * np.arcsin(np.sqrt(h))


# --- boundary: raw CSV -> clean dates ----------------------------------------------------------


class IngestStats(dict):
    """Row counts at each drop, written into the export so nothing disappears silently."""


def parse(csv_path: Path) -> tuple[pd.DataFrame, IngestStats]:
    raw = pd.read_csv(csv_path, low_memory=False, encoding="utf-8")
    missing = [c for c in REQUIRED_COLUMNS if c not in raw.columns]
    if missing:
        raise ValueError(f"{csv_path} is missing columns {missing}")
    stats = IngestStats(raw_rows=len(raw))

    d = pd.DataFrame(
        {
            "lab_id": raw.LabID.astype(str).str.strip(),
            "age": pd.to_numeric(raw.Age, errors="coerce"),
            "err": pd.to_numeric(raw.Error, errors="coerce"),
            "lat": pd.to_numeric(raw.Lat, errors="coerce"),
            "lon": pd.to_numeric(raw.Long, errors="coerce"),
            "acc": pd.to_numeric(raw.LocAccuracy, errors="coerce").fillna(0).astype(int),
            "material": raw.Material.map(fix_text).map(_norm_material),
            "taxa": raw.Taxa.map(fix_text).str.strip(),
            "method": raw.Method.map(norm_method),
            "site_name": raw.SiteName.map(fix_text).str.strip(),
            "country": raw.Country.map(fix_text).str.strip(),
            "continent": raw.Continent.fillna("").astype(str).str.strip(),
            "source": raw.Source.fillna("").astype(str).str.strip(),
            "reference": raw.Reference.map(fix_text).str.strip(),
        }
    )

    bad_age = d.age.isna() | d.err.isna() | (d.age <= 0) | (d.err <= 0)
    no_xy = d.lat.isna() | d.lon.isna() | (d.lat.abs() > 90) | (d.lon.abs() > 180)
    stats["dropped_bad_age_or_error"] = int(bad_age.sum())
    stats["dropped_no_coordinates"] = int((no_xy & ~bad_age).sum())
    d = d[~bad_age & ~no_xy].copy()

    # LabID is unique in 2022.06, but catalogues overlap: the same sample under two lab ids.
    # Only treat as a duplicate when a named, locally-placed site has the same age, error,
    # material and coordinates; a province centroid shares coordinates with thousands of dates.
    d["_name_key"] = d.site_name.map(norm_name)
    key = [d.age, d.err, d.lat.round(4), d.lon.round(4), d._name_key, d.material]
    local_named = (d.acc >= LOCAL_MIN_ACCURACY) & (d._name_key != "")
    d = d.sort_values("acc", ascending=False, kind="stable")  # keep the best-located copy
    dup = pd.DataFrame(key).T.loc[d.index].duplicated(keep="first") & local_named.loc[d.index]
    stats["dropped_cross_catalogue_duplicates"] = int(dup.sum())
    d = d[~dup].sort_index()

    d["carbon_source"] = [
        carbon_source(m, t).value for m, t in zip(d.material, d.taxa)
    ]
    d["region"] = reg.assign_regions(d.lat.values, d.lon.values, d.continent.values)
    stats["dates"] = len(d)
    return d.reset_index(drop=True), stats


# --- calibrate ---------------------------------------------------------------------------------


def calibrate_dates(d: pd.DataFrame, curves: dict[str, cal.Curve]) -> pd.DataFrame:
    """Add curve, status, cal_old / cal_young / cal_median and the HPD intervals string."""
    curve_name = np.where(
        d.carbon_source == CarbonSource.MARINE.value,
        "Marine20",
        np.where(d.lat < 0, "SHCal20", "IntCal20"),
    )
    out = d.copy()
    out["curve"] = curve_name
    out["status"] = ""
    out["cal_old"] = pd.array([None] * len(d), dtype="Int64")
    out["cal_young"] = pd.array([None] * len(d), dtype="Int64")
    out["cal_median"] = pd.array([None] * len(d), dtype="Int64")
    out["intervals"] = ""
    for name, curve in curves.items():
        rows = np.flatnonzero(curve_name == name)
        if rows.size == 0:
            continue
        results = cal.calibrate(d.age.values[rows], d.err.values[rows], curve)
        sub = out.index[rows]
        out.loc[sub, "status"] = [r.status.value for r in results]
        out.loc[sub, "cal_old"] = pd.array([r.old for r in results], dtype="Int64")
        out.loc[sub, "cal_young"] = pd.array([r.young for r in results], dtype="Int64")
        out.loc[sub, "cal_median"] = pd.array([r.median for r in results], dtype="Int64")
        out.loc[sub, "intervals"] = [
            ";".join(f"{o}-{y}" for o, y in r.intervals) for r in results
        ]
    return out


# --- cluster dates into sites ------------------------------------------------------------------


def _components(lat: np.ndarray, lon: np.ndarray, link_km: float) -> np.ndarray:
    """Connected-component label per point, linking points within link_km (single linkage)."""
    n = len(lat)
    label = np.arange(n)
    if n == 1:
        return label
    near = haversine_km(lat[:, None], lon[:, None], lat[None, :], lon[None, :]) <= link_km
    for i in range(n):
        if label[i] != i:
            continue
        stack, label[i] = [i], i
        seen = {i}
        while stack:
            j = stack.pop()
            for k in np.flatnonzero(near[j]):
                if k not in seen:
                    seen.add(k)
                    label[k] = i
                    stack.append(k)
    return label


def cluster_sites(d: pd.DataFrame) -> pd.Series:
    """site key per date.

    Locally-placed named dates: same normalised name + country, within SITE_LINK_KM (so a site
    given slightly different coordinates by two catalogues is one site; two "Cave 1"s in one
    country 500 km apart are not). Everything else (centroids, unnamed points) is grouped by
    exact-ish coordinates: a centroid is a locality, not a site, and is never merged by name.
    """
    site = pd.Series("", index=d.index, dtype=object)
    local_named = (d.acc >= LOCAL_MIN_ACCURACY) & (d._name_key != "")
    for (name, country), g in d[local_named].groupby(["_name_key", "country"], sort=False):
        pts = g[["lat", "lon"]].drop_duplicates()
        lab = _components(pts.lat.values, pts.lon.values, SITE_LINK_KM)
        by_point = {(la, lo): int(x) for la, lo, x in zip(pts.lat, pts.lon, lab)}
        site.loc[g.index] = [f"n|{name}|{country}|{by_point[(la, lo)]}" for la, lo in zip(g.lat, g.lon)]
    rest = ~local_named
    site.loc[rest] = [
        f"p|{a}|{n}|{c}|{la:.3f}|{lo:.3f}"
        for a, n, c, la, lo in zip(
            d.acc[rest], d._name_key[rest], d.country[rest], d.lat[rest], d.lon[rest]
        )
    ]
    return site


# --- sites -------------------------------------------------------------------------------------


def _top(values: pd.Series, k: int) -> list[str]:
    v = values[values != ""]
    return [str(x) for x in v.value_counts().index[:k]]


def build_sites(d: pd.DataFrame) -> tuple[list[dict], dict[str, str]]:
    """One record per site, and the site_key -> site id map. Pure: DataFrame with site_key +
    calibration columns in, dicts out.

    Site-level range: `cal` is the hull of every date's 95.4% range (honest but wide);
    `med` is the oldest and youngest date's median (what a label would quote).
    """
    sites = []
    key_to_id: dict[str, str] = {}
    for key, g in d.groupby("site_key", sort=False):
        best = g.acc.max()
        placed = g[g.acc == best]
        ok = g[g.status == cal.CalStatus.OK.value]
        beyond = int((g.status == cal.CalStatus.OLDER_THAN_CURVE.value).sum())
        oldest = ok.loc[ok.cal_median.astype(float).idxmax()] if len(ok) else None
        youngest = ok.loc[ok.cal_median.astype(float).idxmin()] if len(ok) else None
        lat, lon = round(float(placed.lat.mean()), 4), round(float(placed.lon.mean()), 4)
        name = _top(g.site_name, 1)
        rec = {
            "id": sha1(f"{key}|{lat}|{lon}".encode()).hexdigest()[:10],
            "name": name[0] if name else "",
            "lat": lat,
            "lon": lon,
            "acc": int(best),
            "country": _top(g.country, 1)[0] if (g.country != "").any() else "",
            "region": g.region.iloc[0],
            "n": int(len(g)),
            "cal": [int(ok.cal_old.astype(float).max()), int(ok.cal_young.astype(float).min())] if len(ok) else None,
            "med": [int(oldest.cal_median), int(youngest.cal_median)] if oldest is not None else None,
            "methods": sorted(set(g.method)),
            "materials": _top(g.material, 3),
            "source": sorted(set(s.strip() for v in g.source for s in v.split(";") if s.strip())),
            "reference": oldest.reference if oldest is not None else _top(g.reference, 1)[0] if (g.reference != "").any() else "",
            "carbon_source": oldest.carbon_source if oldest is not None else g.carbon_source.iloc[0],
        }
        if beyond:
            rec["older_than_curve"] = beyond
        sites.append(rec)
        key_to_id[key] = rec["id"]
    sites.sort(key=lambda s: (s["lat"], s["lon"], s["id"]))
    return sites, key_to_id


def export_web(sites: list[dict], stats: IngestStats, path: Path) -> dict:
    """Compact per-site JSON (gzip) for the web app: local sites only, references interned."""
    local = [s for s in sites if s["acc"] >= LOCAL_MIN_ACCURACY]
    refs: list[str] = []
    ref_ix: dict[str, int] = {}
    srcs: list[str] = []
    src_ix: dict[str, int] = {}

    def intern(table: list[str], ix: dict[str, int], v: str) -> int:
        if v not in ix:
            ix[v] = len(table)
            table.append(v)
        return ix[v]

    rows = []
    for s in local:
        row = {
            "id": s["id"], "n": s["name"], "la": s["lat"], "lo": s["lon"], "ac": s["acc"],
            "c": s["country"], "nd": s["n"], "cal": s["cal"], "med": s["med"],
            "m": s["methods"], "mt": s["materials"],
            "s": [intern(srcs, src_ix, x) for x in s["source"]],
            "r": intern(refs, ref_ix, s["reference"]) if s["reference"] else -1,
        }
        if s["carbon_source"] != CarbonSource.TERRESTRIAL.value:
            row["cs"] = s["carbon_source"]
        if "older_than_curve" in s:
            row["oc"] = s["older_than_curve"]
        rows.append(row)

    doc = {
        "meta": {
            "dataset": "p3k14c 2022.06",
            "licence": "CC0 1.0 (data); cite Bird et al. 2022, Scientific Data 9:27, doi:10.1038/s41597-022-01118-7",
            "built": date.today().isoformat(),
            "calibration": "IntCal20 (north), SHCal20 (south of the equator), Marine20 with DeltaR=0 for marine "
            "material; 95.4% HPD; cal BP = years before 1950; year CE = 1950 - cal BP",
            "fields": {
                "id": "stable site id", "n": "name", "la/lo": "latitude/longitude, 4 dp",
                "ac": "LocAccuracy of the best-placed date: 2 = within ~500 m, 3 = exact",
                "c": "country", "nd": "dates at the site",
                "cal": "[oldest, youngest] edge of the 95.4% ranges of all dates (cal BP)",
                "med": "[oldest, youngest] date median (cal BP)",
                "m": "AMS / radiometric / unknown", "mt": "up to three most common materials",
                "s": "indexes into sources", "r": "index into refs of the oldest date's reference, -1 none",
                "cs": "set when the oldest date is marine or reservoir-uncertain (treat with care)",
                "oc": "dates older than the calibration curve (>= ~55 cal ka)",
            },
            "attribution": "p3k14c does not record which hominin made the site: every site is unattributed",
            "caveat": "Dates per site reflect research effort and preservation, not people. A date dates "
            "a sample, not an occupation or a person.",
            "counts": {
                **stats, "sites_local": len(local),
                "sites_centroid_only_not_exported": len(sites) - len(local),
            },
        },
        "sources": srcs,
        "refs": refs,
        "sites": rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    return doc["meta"]


# --- pipeline + CLI ----------------------------------------------------------------------------


def load_curves(raw_dir: Path) -> dict[str, cal.Curve]:
    return {
        "IntCal20": cal.load_curve(raw_dir / "intcal20.14c", "IntCal20"),
        "SHCal20": cal.load_curve(raw_dir / "shcal20.14c", "SHCal20"),
        "Marine20": cal.load_curve(raw_dir / "marine20.14c", "Marine20"),
    }


def ingest(raw_dir: Path = RAW_DIR) -> tuple[pd.DataFrame, list[dict], IngestStats]:
    d, stats = parse(raw_dir / CSV_NAME)
    d = calibrate_dates(d, load_curves(raw_dir))
    d["site_key"] = cluster_sites(d)
    sites, key_to_id = build_sites(d)
    d["site_id"] = d.site_key.map(key_to_id)
    stats["sites"] = len(sites)
    stats["status"] = {k: int(v) for k, v in d.status.value_counts().items()}
    stats["carbon_source"] = {k: int(v) for k, v in d.carbon_source.value_counts().items()}
    stats["loc_accuracy"] = {str(k): int(v) for k, v in d.acc.value_counts().sort_index().items()}
    return d, sites, stats


def fetch(raw_dir: Path) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    for name, url in {CSV_NAME: CSV_URL, **CURVE_URLS}.items():
        dest = raw_dir / name
        if dest.exists():
            print(f"have {dest}")
            continue
        print(f"get  {url}")
        urllib.request.urlretrieve(url, dest)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "build", "report"])
    ap.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = ap.parse_args(argv)
    if args.command == "fetch":
        fetch(args.raw_dir)
        return 0
    d, sites, stats = ingest(args.raw_dir)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.command == "report":
        from evidence import report

        ev = report.earliest_by_region(d)
        (args.out_dir / "earliest_by_region.json").write_text(json.dumps(ev, indent=1, ensure_ascii=False))
        text = report.render_markdown(ev)
        (args.out_dir / "earliest_by_region.md").write_text(text)
        print(text)
        return 0
    meta = export_web(sites, stats, args.out_dir / "p3k14c_sites.json.gz")
    d.drop(columns=["_name_key", "site_key"]).to_csv(args.out_dir / "p3k14c_dates.csv.gz", index=False)
    print(json.dumps(meta["counts"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
