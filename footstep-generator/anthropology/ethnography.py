#!/usr/bin/env python3
"""D-PLACE ethnographic societies as the "nearest known analog" for a place and way of life.

    poetry run python footstep-generator/anthropology/ethnography.py fetch    # D-PLACE zips -> data/raw/dplace/
    poetry run python footstep-generator/anthropology/ethnography.py          # write ethnography.json.gz

Two halves, both described in docs/ops/ethnography.md:

1. `build_export` merges the Ethnographic Atlas, SCCS and Binford datasets (one record per
   D-PLACE `xd_id`), adds each society's biome (TEOW) and climate (ecoClimate), and keeps
   25 variables, each a row of `VARIABLES` below that names the human constant it grounds.
2. `nearest_analogs` (in analogs.py, re-exported here) ranks those societies for a place, a year and a way of life.

The export is a derived work of CC BY-NC 4.0 data (the task notes said CC BY; D-PLACE's
datasets are CC BY-NC), so it is CC BY-NC-SA 4.0. The ranking itself is deploy/budgie/api/analogs.py,
which the day API uses (docs/ops/ethnography.md#in-the-day-prompt).
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Iterable, Literal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "deploy" / "budgie" / "api"))
import build  # noqa: E402  shares the zip reader, the Ethnographic Atlas way-of-life rule and fetch()
# The ranking (nearest_analogs, describe, CAVEAT...) lives in the API directory so the day API can ship it.
from analogs import (  # noqa: E402,F401  re-exported: tests and docs use them as `ethnography.X`
    CAVEAT, ETHNOGRAPHIC_PRESENT, HISTORICAL_BEFORE, SUBSISTENCE_KEYS, WAYS, WAY_ALIASES, WAY_SHARE, describe,
    cell_centre, haversine_km, load, nearest_analogs)
from analogs import OUT  # noqa: E402  deploy/budgie/api/ethnography.json.gz, committed

ROOT = build.ROOT
DPLACE = build.RAW / "dplace"
VERSION = 1

# --- datasets -------------------------------------------------------------------------------

DATASET_KEYS = ("EA", "SCCS", "Binford", "TEOW", "ecoClimate")
_REPO = "https://github.com/D-PLACE/dplace-dataset-"
DOWNLOADS = {DPLACE / f"dplace-dataset-{slug}.zip": f"{_REPO}{slug}/archive/refs/heads/main.zip"
             for slug in ("ea", "sccs", "binford", "teow", "ecoclimate")}
ZIPS: dict[str, Path] = dict(zip(DATASET_KEYS, DOWNLOADS))
DATASET_NOTES = {
    "EA": ("Ethnographic Atlas: 1,291 societies, coded mostly for 1850-1950",
           "Murdock, G. P. et al. 1999. Ethnographic Atlas. World Cultures 10:24-136 (codebook)", "CC BY-NC 4.0"),
    "SCCS": ("Standard Cross-Cultural Sample: 186 well-described societies",
             "Murdock, G. P. & White, D. R. 1969. Standard Cross-Cultural Sample. Ethnology 9:329-369", "CC BY-NC 4.0"),
    "Binford": ("Binford's hunter-gatherer data: 339 groups",
                "Binford, L. 2001. Constructing Frames of Reference. University of California Press", "CC BY-NC 4.0"),
    "TEOW": ("Terrestrial ecoregion and biome at each society (present day)",
             "Olson, D. M. et al. 2001. Terrestrial ecoregions of the world. BioScience 51(11):933-938", "CC BY-NC 4.0"),
    "ecoClimate": ("Modelled 1900-1949 climate at each society (CCSM model)",
                   "Lima-Ribeiro, M. S. et al. 2015. ecoClimate. Biodiversity Informatics 10:1-21", "CC BY-NC-SA 4.0"),
}

# --- the variables --------------------------------------------------------------------------

Kind = Literal["code", "number", "percent"]


@dataclass(frozen=True)
class Variable:
    """One exported variable: where it comes from and which human constant it grounds.

    `code` variables hold the D-PLACE code number, decoded by the labels in the export's
    `variables` table (read from each dataset's own codes.csv). `percent` variables hold a
    midpoint percentage (from an EA band such as "26-35%" or a Binford number). `number`
    variables hold the raw number in `unit`.
    """
    key: str
    dataset: str
    var: str
    constant: str
    kind: Kind = "code"
    unit: str = ""


# The "subsistence mix" is five EA variables (share of the diet), so 21 ideas in 25 columns.
VARIABLES: tuple[Variable, ...] = (
    Variable("gathering", "EA", "EA001", "Food", "percent"),
    Variable("hunting", "EA", "EA002", "Food", "percent"),
    Variable("fishing", "EA", "EA003", "Food", "percent"),
    Variable("herding", "EA", "EA004", "Food", "percent"),
    Variable("agriculture", "EA", "EA005", "Food", "percent"),
    Variable("dominant_activity", "EA", "EA042", "Gathering resources"),
    Variable("agriculture_intensity", "EA", "EA028", "Gathering resources"),
    Variable("major_crop", "EA", "EA029", "Food"),
    Variable("domestic_animals", "EA", "EA040", "Animals"),
    Variable("milking", "EA", "EA041", "Animals"),
    Variable("settlement_pattern", "EA", "EA030", "Habitat"),
    Variable("community_size", "EA", "EA031", "Groups"),
    Variable("house_plan", "EA", "EA079", "Habitat"),
    Variable("house_walls", "EA", "EA081", "Habitat"),
    Variable("house_roof", "EA", "EA083", "Habitat"),
    Variable("levels_beyond_local", "EA", "EA033", "Groups"),
    Variable("class_differences", "EA", "EA066", "Politics and philosophy"),
    Variable("descent", "EA", "EA043", "Groups"),
    Variable("marital_residence", "EA", "EA012", "Groups"),
    Variable("high_gods", "EA", "EA034", "Religion and ritual"),
    Variable("internal_war", "SCCS", "SCCS891", "War and conflict"),
    Variable("external_war_attacking", "SCCS", "SCCS892", "War and conflict"),
    Variable("trade_as_food", "SCCS", "SCCS1", "Markets and trade"),
    Variable("trade_in_subsistence", "SCCS", "SCCS732", "Markets and trade"),
    Variable("mobility", "Binford", "B009", "Daily schedule"),
    Variable("camp_size_aggregated", "Binford", "B011", "Groups", "number", "people"),
    Variable("moves_per_year", "Binford", "B013", "Daily schedule", "number", "moves"),
    Variable("density_per_km2", "Binford", "B008", "Place, time, density", "number", "people/km2"),
    Variable("cooperating_group", "Binford", "B010", "Groups", "number", "people"),
)
BY_KEY = {v.key: v for v in VARIABLES}
BINFORD_MIX = {"B001": "gathering", "B002": "hunting", "B003": "fishing"}  # percent, sums to 100

URBAN_COMMUNITY_CODES = (7, 8)  # EA031: indigenous towns over 5,000 or cities over 50,000
BINFORD_WAY = {1: "foraging", 2: "foraging", 3: "fishing"}  # B004: hunting, gathering, fishing

# --- build: read D-PLACE ---------------------------------------------------------------------

def _csv(dataset: str, suffix: str) -> list[dict]:
    return build.read_csv(ZIPS[dataset], suffix)


def _code_number(code_id: str) -> int | None:
    m = re.search(r"-(\d+)$", code_id or "")
    return int(m.group(1)) if m else None


def _band_midpoint(label: str) -> float | None:
    """'26-35%' -> 30.5, '0-5%' -> 2.5, '86-100%' -> 93."""
    m = re.fullmatch(r"(\d+)-(\d+)%", label.strip())
    if not m:
        return None
    return (int(m.group(1)) + int(m.group(2))) / 2


def _number(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_bib(dataset: str) -> dict[str, str]:
    """bib key -> 'Author (year). Title' from a dataset's sources.bib (enough for D-PLACE's flat entries)."""
    with zipfile.ZipFile(ZIPS[dataset]) as z, z.open(build.zip_member(z, "cldf/sources.bib")) as f:
        text = f.read().decode("utf-8")
    out = {}
    for entry in re.split(r"\n@", "\n" + text)[1:]:
        key = re.match(r"\w+\{([^,\s]+),", entry)
        if not key:
            continue
        got = {m.group(1): re.sub(r"\s+", " ", m.group(2)).strip()
               for m in re.finditer(r"^\s*(author|title|year)\s*=\s*\{(.*?)\},?\s*$", entry, re.M | re.S)}
        out[key.group(1)] = f"{got.get('author', 'Unknown')} ({got.get('year', 'n.d.')}). {got.get('title', '')}"[:160]
    return out


def zip_commit(dataset: str) -> str:
    """The git commit GitHub stamps into the archive comment: pins which release was read."""
    with zipfile.ZipFile(ZIPS[dataset]) as z:
        return z.comment.decode("ascii", "replace").strip()


@dataclass
class Raw:
    """One dataset's societies and its coded rows, indexed for the merge."""
    societies: dict[str, dict]
    rows: dict[str, dict[str, dict]] = field(default_factory=lambda: defaultdict(dict))  # soc -> var -> row
    sources: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))  # soc -> bib key -> n


def read_dataset(dataset: str) -> Raw:
    raw = Raw({r["ID"]: r for r in _csv(dataset, "cldf/societies.csv")})
    for row in _csv(dataset, "cldf/data.csv"):
        if row["Soc_ID"] not in raw.societies:
            continue
        raw.rows[row["Soc_ID"]].setdefault(row["Var_ID"], row)
        raw.sources[row["Soc_ID"]].update(re.sub(r"\[.*\]$", "", k) for k in row["Source"].split(";") if k)  # drop page refs
    return raw


def code_labels(dataset: str, var_ids: Iterable[str]) -> dict[str, dict[str, str]]:
    wanted = set(var_ids)
    out: dict[str, dict[str, str]] = defaultdict(dict)
    for r in _csv(dataset, "cldf/codes.csv"):
        n = _code_number(r["ID"])
        if r["Var_ID"] in wanted and n is not None:
            out[r["Var_ID"]][str(n)] = r["Name"]
    return out


def variable_value(var: Variable, row: dict | None, labels: dict[str, str]) -> float | int | None:
    if row is None:
        return None
    if var.kind == "number":
        v = _number(row["Value"])
        return None if v is None or v < 0 else v
    n = _code_number(row["Code_ID"])
    if n is None:
        return None
    return _band_midpoint(labels.get(str(n), "")) if var.kind == "percent" else n


def classify_way(values: dict, ea_codes: dict | None, binford_dominant: int | None) -> str | None:
    """Way of life: EA's rule (build.way_class) where EA covers the society, else Binford's most
    important activity. A society with an indigenous town (EA031 >= 7) is 'urban'."""
    if values.get("community_size") in URBAN_COMMUNITY_CODES:
        return "urban"
    if ea_codes:
        return build.way_class(ea_codes)
    return BINFORD_WAY.get(binford_dominant) if binford_dominant is not None else None


def build_export() -> dict:
    ea, sccs, binford = read_dataset("EA"), read_dataset("SCCS"), read_dataset("Binford")
    teow = {r["Soc_ID"]: r["Value"] for r in _csv("TEOW", "cldf/data.csv")
            if r["Var_ID"] == "Biome" and r["Code_ID"] != "Biome-NA"}
    eco: dict[str, dict[str, float]] = defaultdict(dict)
    for r in _csv("ecoClimate", "cldf/data.csv"):
        if r["Var_ID"] in ("AnnualMeanTemperature", "MonthlyMeanPrecipitation") and _number(r["Value"]) is not None:
            eco[r["Soc_ID"]][r["Var_ID"]] = float(r["Value"])
    labels = {ds: code_labels(ds, [v.var for v in VARIABLES if v.dataset == ds]) for ds in ("EA", "SCCS", "Binford")}
    by_xd = {ds: {s["xd_id"]: sid for sid, s in raw.societies.items() if s["xd_id"]}
             for ds, raw in (("EA", ea), ("SCCS", sccs), ("Binford", binford))}
    datasets = {"EA": ea, "SCCS": sccs, "Binford": binford}

    societies = []
    for xd in dict.fromkeys([*[s["xd_id"] for s in ea.societies.values()],
                             *[s["xd_id"] for s in binford.societies.values()]]):
        ids = {ds: by_xd[ds][xd] for ds in datasets if xd in by_xd[ds]}
        home_ds = "EA" if "EA" in ids else "Binford"
        home = datasets[home_ds].societies[ids[home_ds]]
        if not home["Latitude"] or not home["Longitude"]:
            continue
        values: dict[str, float | int] = {}
        for var in VARIABLES:
            if var.dataset not in ids:
                continue
            raw = datasets[var.dataset]
            v = variable_value(var, raw.rows[ids[var.dataset]].get(var.var), labels[var.dataset].get(var.var, {}))
            if v is not None:
                values[var.key] = v
        if "EA" not in ids and "Binford" in ids:  # hunter-gatherers Binford has and the Atlas lacks
            for var_id, key in BINFORD_MIX.items():
                row = binford.rows[ids["Binford"]].get(var_id)
                if row and (n := _number(row["Value"])) is not None and n >= 0:
                    values[key] = n
            values.update(herding=0, agriculture=0)
        ea_codes = None
        if "EA" in ids:
            ea_codes = {vid: n for vid, row in ea.rows[ids["EA"]].items()
                        if re.fullmatch(r"EA00[1-5]|EA042", vid) and (n := _code_number(row["Code_ID"])) is not None}
        b_row = binford.rows[ids["Binford"]].get("B004") if "Binford" in ids else None
        way = classify_way(values, ea_codes, _code_number(b_row["Code_ID"]) if b_row else None)
        if way is None:
            continue
        sources: Counter = Counter()
        for ds, sid in ids.items():
            sources.update(datasets[ds].sources[sid])
        env = eco.get(ids[home_ds], {})
        focal = home["main_focal_year"]
        society = {
            "id": xd, "name": home["Name"], "lat": float(home["Latitude"]), "lon": float(home["Longitude"]),
            "year": int(focal) if focal else None, "region": home["region"], "glottocode": home["Glottocode"] or None,
            "way": way, "biome": teow.get(ids[home_ds]) or None,
            "temp_c": round(env["AnnualMeanTemperature"], 1) if "AnnualMeanTemperature" in env else None,
            "precip_mm": round(env["MonthlyMeanPrecipitation"] * 12 / 1000) if "MonthlyMeanPrecipitation" in env else None,
            "ids": ids, "sources": [k for k, _ in sources.most_common(5)], "n_sources": len(sources),
            "values": values,
        }
        societies.append({k: v for k, v in society.items() if v is not None})

    bib = {}
    for ds in datasets:
        bib.update(read_bib(ds))
    used = {k for s in societies for k in s["sources"]}
    return {
        "version": VERSION, "built": date.today().isoformat(),
        "licence": "CC BY-NC-SA 4.0 (derived from CC BY-NC 4.0 and CC BY-NC-SA 4.0 sources)",
        "ethnographic_present": list(ETHNOGRAPHIC_PRESENT), "caveat": CAVEAT,
        "datasets": {ds: {"what": DATASET_NOTES[ds][0], "citation": DATASET_NOTES[ds][1],
                          "licence": DATASET_NOTES[ds][2], "url": _REPO + ZIPS[ds].stem.split("-")[-1],
                          "commit": zip_commit(ds)} for ds in DATASET_KEYS},
        "variables": {v.key: {"dataset": v.dataset, "id": v.var, "constant": v.constant, "kind": v.kind,
                              **({"unit": v.unit} if v.unit else {}),
                              **({"codes": labels[v.dataset][v.var]} if v.kind == "code" else {})}
                      for v in VARIABLES},
        "bib": {k: bib[k] for k in sorted(used) if k in bib},
        "societies": societies,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", choices=["fetch", "build"], default="build")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    if args.command == "fetch":
        return build.fetch(DOWNLOADS)
    export = build_export()
    args.out.write_bytes(gzip.compress(json.dumps(export, separators=(",", ":")).encode(), mtime=0))
    ways = Counter(s["way"] for s in export["societies"])
    print(f"{len(export['societies'])} societies {dict(ways)}, {len(export['bib'])} sources -> "
          f"{args.out.relative_to(ROOT)} ({args.out.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
