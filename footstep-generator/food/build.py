#!/usr/bin/env python3
"""Build the food-over-time lookup: which domesticates were around each 5-degree cell at each era.

    poetry run python footstep-generator/food/build.py            # -> data/food/food.json.gz + claims.csv
    poetry run python footstep-generator/food/build.py --data DIR # read the habitat tiles from DIR/tiles/habitat
    poetry run python footstep-generator/food/build.py check      # sanity checks on the built file

Inputs: `data/tiles/habitat/bp_{ka}.webp` (Krapp biome, for the modal biome and coast per era) and
`use_{year}.webp` (HYDE cropland and grazing shares), both made by `habitat_lookup.py`. Output is
git-ignored. Nothing in the app reads it. See docs/ops/food.md and docs/research/0008-food-over-time.

Per cell (land at any era), the file holds:
    first   taxon id -> index of the first era at which the diffusion claims put it there
    crop    one digit per era: HYDE cropland level 0 none, 1 trace, 2 some, 3 heavy
    graze   the same for HYDE grazing land
    biome   one base-36 character per era: the commonest land biome in the cell (0 = all sea, s = land ice)
    coast   one 0/1 per era: the cell holds both land and sea
Presence is monotone (`first` is all that is needed); land use is not (farming can retreat).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import habitat_lookup as hl  # noqa: E402
from food import foragers  # noqa: E402
from food.animals import ANIMALS  # noqa: E402
from food.crops import CROPS  # noqa: E402
from food.model import CELL_DEG, ERAS, Taxon, cell_centre, era_bp  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("FOOTSTEPS_DATA", ROOT / "data"))  # a worktree has no data/: point this at a checkout that has
OUT_NAME = "food.json.gz"
VERSION = 1
TAXA: tuple[Taxon, ...] = CROPS + ANIMALS

BLOCK = round(CELL_DEG / 0.5)  # 0.5-degree pixels per cell side
ROWS, COLS = 180 // CELL_DEG, 360 // CELL_DEG
ICE = hl.ICE
LEVEL_NAMES = ("none", "trace", "some", "heavy")
# mean share of the cell's land under the use: below TRACE is a trace, below SOME is some, else heavy
TRACE, SOME = 0.01, 0.10
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


# --- pure helpers (tested) -----------------------------------------------------------------

def blocks(a: np.ndarray) -> np.ndarray:
    """(360, 720, ...) north-up image -> (ROWS, COLS, BLOCK*BLOCK, ...) pixels per 5-degree cell, row 0 = 90N-85N."""
    h, w = a.shape[:2]
    if (h, w) != (ROWS * BLOCK, COLS * BLOCK):
        raise ValueError(f"expected {ROWS * BLOCK}x{COLS * BLOCK}, got {h}x{w}")
    rest = a.shape[2:]
    return a.reshape(ROWS, BLOCK, COLS, BLOCK, *rest).swapaxes(1, 2).reshape(ROWS, COLS, BLOCK * BLOCK, *rest)


def use_levels(share: np.ndarray, land: np.ndarray) -> np.ndarray:
    """Land-use level per cell. `share` and `land` are (ROWS, COLS, px): HYDE byte shares and a land mask.
    0 none (every land pixel zero), 1 trace (mean share < TRACE), 2 some (< SOME), 3 heavy."""
    n = np.maximum(land.sum(-1), 1)
    mean = (share * land).sum(-1) / n / 255.0
    any_use = ((share > 0) & land).any(-1)
    lvl = np.where(mean >= SOME, 3, np.where(mean >= TRACE, 2, np.where(any_use, 1, 0)))
    return lvl.astype(np.uint8)


def modal_biome(biome: np.ndarray) -> np.ndarray:
    """(ROWS, COLS, px) Krapp classes -> commonest land class per cell. Land means 1..27; if only ice is
    present the cell is ICE; if there is no land it is 0."""
    out = np.zeros(biome.shape[:2], dtype=np.uint8)
    for r in range(biome.shape[0]):
        for c in range(biome.shape[1]):
            px = biome[r, c]
            land = px[(px > 0) & (px != ICE)]
            if land.size:
                out[r, c] = np.bincount(land).argmax()
            elif (px == ICE).any():
                out[r, c] = ICE
    return out


def coastal(biome: np.ndarray) -> np.ndarray:
    """A cell is coastal when it has both sea (0) and land (>0) pixels."""
    return ((biome == 0).any(-1) & (biome > 0).any(-1)).astype(np.uint8)


def first_era(arrival_ka: float | None) -> int | None:
    """Index of the first era whose snapshot year is at or after `arrival_ka` (None: arrives after the last era)."""
    if arrival_ka is None:
        return None
    for i, year in enumerate(ERAS):
        if arrival_ka * 1000 >= era_bp(year):
            return i
    return None


def cell_key(lat0: int, lon0: int) -> str:
    return f"{lat0},{lon0}"


def taxon_json(t: Taxon) -> dict:
    return {
        "id": t.id, "name": t.name, "kind": t.kind, "group": t.group, "centre": t.centre, "origin_ka": t.origin_ka,
        "needs": t.needs, "note": t.note,
        "claims": [{"ka": c.ka, "kind": c.kind, "boxes": [list(b) for b in c.boxes], "basis": c.basis.value,
                    "confidence": c.confidence, "checked": c.checked, "source": c.source} for c in t.claims],
    }


# --- inputs --------------------------------------------------------------------------------

def read_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"))


def load_inputs(data: Path) -> tuple[list[np.ndarray], list[np.ndarray], list[np.ndarray]]:
    """Per era: (biome blocks, cropland blocks, grazing blocks), each (ROWS, COLS, px)."""
    hab = data / "tiles" / "habitat"
    biomes, crops, grazes = [], [], []
    for year in ERAS:
        ka = hl.year_to_ka(year)
        biomes.append(blocks(read_rgb(hab / f"bp_{ka}.webp")[..., 0]))
        use = read_rgb(hab / f"use_{year}.webp")
        crops.append(blocks(use[..., 0]))
        grazes.append(blocks(use[..., 1]))
    return biomes, crops, grazes


# --- build ---------------------------------------------------------------------------------

def build(data: Path) -> dict:
    biomes, crops, grazes = load_inputs(data)
    biome_e = np.stack([modal_biome(b) for b in biomes])  # (era, ROWS, COLS)
    coast_e = np.stack([coastal(b) for b in biomes])
    crop_e = np.stack([use_levels(c.astype(float), b > 0) for c, b in zip(crops, biomes)])
    graze_e = np.stack([use_levels(g.astype(float), b > 0) for g, b in zip(grazes, biomes)])
    cells: dict[str, dict] = {}
    for r in range(ROWS):
        for c in range(COLS):
            if not (biome_e[:, r, c] > 0).any():
                continue  # sea at every era
            lat0, lon0 = 90 - (r + 1) * CELL_DEG, -180 + c * CELL_DEG
            lon, lat = cell_centre(lat0, lon0)
            first = {}
            for t in TAXA:
                i = first_era(t.arrival_ka(lon, lat))
                if i is not None:
                    first[t.id] = i
            cells[cell_key(lat0, lon0)] = {
                "first": first,
                "crop": "".join(str(v) for v in crop_e[:, r, c]),
                "graze": "".join(str(v) for v in graze_e[:, r, c]),
                "biome": "".join(B36[v] for v in biome_e[:, r, c]),
                "coast": "".join(str(v) for v in coast_e[:, r, c]),
            }
    meta = json.loads((ROOT / "footsteps-web" / "public" / "habitat_meta.json").read_text())
    return {
        "version": VERSION, "built": date.today().isoformat(), "cell_deg": CELL_DEG, "eras": ERAS,
        "era_rule": "an era is a snapshot at that calendar year; a domesticate is present iff its claim ka*1000 >= 1950 - year",
        "levels": {"names": list(LEVEL_NAMES), "trace_below": TRACE, "some_below": SOME,
                   "rule": "mean HYDE share of the cell's land: none = zero everywhere, trace < 1%, some < 10%, heavy >= 10%"},
        "licence": "Derived from HYDE 3.5 (CC BY 3.0), Krapp et al. 2021 (CC BY 4.0) and a hand-compiled, cited table",
        "taxa": [taxon_json(t) for t in TAXA],
        "biome_names": meta["biomes"],
        "foragers": {"biomes": {str(k): vars_of(v) for k, v in foragers.BIOME_DIETS.items()}, "coastal": vars_of(foragers.COASTAL)},
        "cells": cells,
    }


def vars_of(d: foragers.ForagerDiet) -> dict:
    return {"plants": list(d.plants), "animals": list(d.animals), "plant_weight": d.plant_weight, "note": d.note}


def write(out_dir: Path, data: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / OUT_NAME
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    with open(out_dir / "claims.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["taxon", "kind", "claim_kind", "ka_bp", "basis", "confidence", "checked", "boxes", "source"])
        for t in TAXA:
            for c in t.claims:
                w.writerow([t.id, t.kind, c.kind, c.ka, c.basis.value, c.confidence, c.checked,
                            ";".join("/".join(f"{v:g}" for v in b) for b in c.boxes), c.source])
    return path


def check(path: Path) -> int:
    from food import lookup
    d = lookup.load(path)
    problems: list[str] = []
    probes = [  # (label, lat, lon, year, taxon expected present?, taxon id)
        ("wheat in the Levant at 7000 BCE", 33, 36, -7000, True, "wheat"),
        ("wheat not in Britain at 7000 BCE", 52, -1, -7000, False, "wheat"),
        ("wheat in Britain at 2000 BCE", 52, -1, -2000, True, "wheat"),
        ("maize not in Europe at 1000 CE", 47, 8, 1000, False, "maize"),
        ("maize in Mexico at 3000 BCE", 18, -100, -3000, True, "maize"),
        ("horse not in the Americas at 1400 CE", 19, -99, 1400, False, "horse"),
        ("horse in Mexico at 1600 CE", 19, -99, 1600, True, "horse"),
        ("rice in the Yangtze at 3000 BCE", 30, 115, -3000, True, "rice"),
    ]
    for label, lat, lon, year, want, tid in probes:
        got = tid in lookup.plate(d, lat, lon, year)["available"]
        if got != want:
            problems.append(f"{label}: got {got}")
    print(f"{len(d['cells'])} land cells, {len(d['taxa'])} taxa, {path.stat().st_size / 1e3:.0f} KB")
    for p in problems:
        print("FAIL", p)
    return 1 if problems else 0


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("cmd", nargs="?", default="build", choices=("build", "check"))
    p.add_argument("--data", type=Path, default=DATA, help="data root holding tiles/habitat (default <repo>/data)")
    p.add_argument("--out", type=Path, default=None, help="output directory (default <data>/food)")
    a = p.parse_args()
    out = a.out or (DATA / "food")
    if a.cmd == "check":
        sys.exit(check(out / OUT_NAME))
    path = write(out, build(a.data))
    print(f"wrote {path} ({path.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
