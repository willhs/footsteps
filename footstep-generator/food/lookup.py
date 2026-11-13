"""Query the built food file: what could be on the plate at a place and year. Pure functions over the loaded dict.

    d = load(Path("data/food/food.json.gz"))
    plate(d, lat=33.0, lon=36.0, year=-7000)

`plate` answers four separate questions and keeps them separate, because they have different sources
and different confidence:

    available   domesticates whose diffusion claims put them in the cell by then (cited table)
    grown       the subset the HYDE land use makes plausible: crops need cropland, livestock need
                cropland or grazing land, companion animals (dogs) need nothing
    land_use    HYDE cropland and grazing levels in the cell (none, trace, some, heavy)
    forager     the broad forager staples of the cell's biome, with the coast added when it meets the sea

`available` without `grown` is the interesting case: the table says the crop had arrived but HYDE
shows no farming there (HYDE is modelled from population, so the gap is also a measure of HYDE's
limits for the earliest farming).
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from food.model import CELL_DEG, ERAS, cell_origin, era_index


def load(path: Path) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def _level(s: str, i: int, names: list[str]) -> str:
    return names[int(s[i])]


def plate(d: dict, lat: float, lon: float, year: float) -> dict:
    """Food at a point and year (any year; it uses the latest era at or before it, the first era for earlier years)."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("lat must be -90..90 and lon -180..180")
    lat0, lon0 = cell_origin(lat, lon)
    e = era_index(year)
    names = d["levels"]["names"]
    base = {"cell": {"south": lat0, "west": lon0, "size_deg": CELL_DEG}, "year": year, "era": ERAS[e]}
    cell = d["cells"].get(f"{lat0},{lon0}")
    if cell is None:  # sea at every era
        return {**base, "land": False, "available": [], "grown": [], "land_use": None, "forager": None, "confidence": {}}
    crop, graze = int(cell["crop"][e]), int(cell["graze"][e])
    taxa = {t["id"]: t for t in d["taxa"]}
    available = sorted(tid for tid, first in cell["first"].items() if first <= e)
    grown = []
    for tid in available:
        needs = taxa[tid]["needs"]
        if needs == "none" or (needs == "crop" and crop > 0) or (needs == "farm" and (crop > 0 or graze > 0)):
            grown.append(tid)
    biome = int(cell["biome"][e], 36)
    forager = None
    if biome:
        forager = {"biome": biome, "biome_name": d["biome_names"].get(str(biome)), **d["foragers"]["biomes"][str(biome)]}
        if cell["coast"][e] == "1":
            forager["coastal"] = d["foragers"]["coastal"]
    return {
        **base, "land": True, "available": available, "grown": grown,
        "land_use": {"cropland": names[crop], "grazing": names[graze]},
        "forager": forager,
        "confidence": {tid: _claim_confidence(taxa[tid], lat0, lon0) for tid in available},
    }


def _claim_confidence(t: dict, lat0: int, lon0: int) -> str:
    """Confidence of the oldest claim holding the cell's centre (ties: the most confident)."""
    lon, lat = lon0 + CELL_DEG / 2, lat0 + CELL_DEG / 2
    held = [c for c in t["claims"] if any(x0 <= lon <= x1 and y0 <= lat <= y1 for x0, x1, y0, y1 in c["boxes"])]
    oldest = max(c["ka"] for c in held)
    order = {"high": 2, "medium": 1, "low": 0}
    return max((c["confidence"] for c in held if c["ka"] == oldest), key=order.__getitem__)
