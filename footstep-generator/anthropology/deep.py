#!/usr/bin/env python3
"""The deep-past section of the anthropology atlas (100,000-11,000 BCE).

    poetry run python footstep-generator/anthropology/deep.py            # add/replace `deep` in the atlas

Reads the existing deploy/budgie/api/anthropology.json.gz (HYDE, D-PLACE and Seshat parts untouched)
and writes it back with a `deep` key. `build.py` calls `build_deep()` too, so a full rebuild has it.

Inputs (all under data/, gitignored): habitat images (habitat_lookup.py: Krapp biome, Beyer
temperature and rain per 0.5 degree and 1 ka), modelled population images
(prehistory_population.py), data/fauna/fauna.json.gz (fauna/phylacine.py build); plus
prehistory/arrivals.yaml and anthropology/deep_past.yaml, which are committed.

Data shape, one direction of flow:

    habitat bp_{ka}.webp + humans_{era}.webp --5 degree blocks--> per cell, per era: temp, rain, biome, ice %, people
    fauna.json.gz 1 degree cells             --5 degree blocks--> per cell: [species, last ka it is present, 1 degree cells holding it]
    arrivals.yaml first matching region      --cell centre-----> per cell: region index
    deep_past.yaml, arrivals.yaml            ------------------> regions, other hominins, technocomplexes, biome prey (verbatim)
"""
from __future__ import annotations

import gzip
import json
import math
import sys
from collections.abc import Callable
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(ROOT / "deploy" / "budgie" / "api"))
import atlas as anth  # noqa: E402
import grid_image  # noqa: E402
import habitat_lookup as hab  # noqa: E402

ATLAS = ROOT / "deploy" / "budgie" / "api" / "anthropology.json.gz"
ARRIVALS = HERE.parent / "prehistory" / "arrivals.yaml"
CULTURES = HERE / "deep_past.yaml"
HABITAT = ROOT / "data" / "tiles" / "habitat"
PREHISTORY = ROOT / "data" / "tiles" / "prehistory"
FAUNA = ROOT / "data" / "fauna" / "fauna.json.gz"
META = ROOT / "footsteps-web" / "public" / "habitat_meta.json"

DEEP_VERSION = 1
BLOCK = 10          # 0.5 degree pixels per 5 degree cell side
ICE = hab.ICE
MIN_SUBCELLS = 3    # a species counts in a 5 degree cell once 3 of its 25 one-degree cells hold it
SHORT = {"neanderthals": "Neanderthals", "denisovans": "Denisovans", "floresiensis": "Homo floresiensis"}

DEEP_SOURCES = {
    anth.PREHISTORY: {
        "what": "Arrival dates of Homo sapiens per region, other hominins, and the modelled forager population (100,000-11,000 BCE).",
        "url": "docs/research/0002-pre-hyde-population-model/research.md",
        "licence": "Footsteps; a model, not data. Arrival citations are marked checked or memory.",
    },
    anth.CULTURES: {
        "what": "A small cited table of technocomplexes (tools, ornaments, art, shelter) by region and time.",
        "url": "footstep-generator/anthropology/deep_past.yaml",
        "licence": "Footsteps; each entry names its papers and whether they were checked or written from memory.",
    },
    anth.BIOME_PREY: {
        "what": "Typical big game by biome class.",
        "url": "footstep-generator/anthropology/deep_past.yaml",
        "licence": "Footsteps; after Kelly 2013 and Binford 2001, from memory.",
    },
    anth.KRAPP: {
        "what": "BIOME4 biome per 0.5 degree cell per 1 ka, 100,000 BP to today, and land ice.",
        "url": "https://doi.org/10.5281/zenodo.8415273",
        "licence": "CC BY 4.0 (Krapp, Beyer, Manica et al. 2021, via pastclim).",
    },
    anth.BEYER: {
        "what": "Annual mean temperature and precipitation per 0.5 degree cell per 1-2 ka, 120,000 BP to today.",
        "url": "https://doi.org/10.6084/m9.figshare.12293345.v4",
        "licence": "CC BY 4.0 (Beyer, Krapp & Manica 2020).",
    },
    anth.PHYLACINE: {
        "what": "Present-natural ranges of 329 large mammals, with extinction dates from a cited table.",
        "url": "https://github.com/MegaPast2Future/PHYLACINE_1.2",
        "licence": "CC0 (Faurby et al. 2018). Our extinction dates are mostly regional guesses; see docs/ops/fauna.md.",
    },
}


# --- grid helpers ---------------------------------------------------------------------------

def blocks(a: np.ndarray) -> np.ndarray:
    """(360, 720, ...) north-up half-degree array -> (36, 72, 100, ...) pixels of each 5 degree cell."""
    rows, cols = a.shape[0] // BLOCK, a.shape[1] // BLOCK
    out = a.reshape(rows, BLOCK, cols, BLOCK, *a.shape[2:]).swapaxes(1, 2)
    return out.reshape(rows, cols, BLOCK * BLOCK, *a.shape[2:])


def pixel_area_km2() -> np.ndarray:
    """(360, 720) km2 of each half-degree pixel, north-up."""
    edges = np.radians(90 - 0.5 * np.arange(361))
    band = (np.sin(edges[:-1]) - np.sin(edges[1:])) * np.radians(0.5) * grid_image.EARTH_R_KM**2
    return np.repeat(band[:, None], 720, axis=1)


def cell_key(row: int, col: int) -> str:
    return f"{85 - 5 * row},{-180 + 5 * col}"


def mode(values: np.ndarray, valid: np.ndarray, size: int = 29) -> np.ndarray:
    """Most common value among valid entries along axis -1, 0 if none; values are small ints."""
    counts = np.stack([((values == v) & valid).sum(-1) for v in range(size)], axis=-1)
    top = counts.argmax(-1)
    return np.where(counts.max(-1) > 0, top, 0)


# --- per cell x era climate and people ------------------------------------------------------

def era_blocks(era: int, area: np.ndarray) -> dict[str, np.ndarray]:
    """For one deep era: per 5 degree cell (36, 72) temperature, rain, biome, ice %, land km2, people."""
    k = anth.ka_of_era(era)
    with Image.open(HABITAT / f"bp_{k}.webp") as im:
        img = np.array(im)
    biome, tb, pb = img[..., 0], img[..., 1], img[..., 2]
    people = grid_image.decode(PREHISTORY / f"humans_{era}.webp")
    land = biome > 0
    clear = land & (biome != ICE)

    b_b, t_b, p_b = blocks(biome), blocks(tb), blocks(pb)
    area_b, people_b, land_b, clear_b = blocks(area), blocks(people), blocks(land), blocks(clear)
    # Climate from clear land with data; where the only data is on cells Krapp calls sea (the
    # exposed shelf), from any non-ice pixel with data. Otherwise unknown.
    has = (t_b > 0) & (p_b > 0)
    use = clear_b & has
    fallback = (b_b != ICE) & has
    use = np.where(use.any(-1, keepdims=True), use, fallback)
    n = use.sum(-1)
    temp = np.where(n > 0, (hab.decode_temp(t_b) * use).sum(-1) / np.maximum(n, 1), np.nan)
    rain = np.where(n > 0, (hab.decode_precip(p_b) * use).sum(-1) / np.maximum(n, 1), np.nan)
    ice = (b_b == ICE).sum(-1)  # of 100 pixels: a percentage
    return {
        "temp": temp, "rain": rain, "biome": mode(b_b, clear_b), "ice": ice,
        "land_km2": (area_b * (land_b | (people_b > 0))).sum(-1),
        "people": people_b.sum(-1),
    }


def climate_and_people() -> tuple[dict[str, dict], list[int]]:
    area = pixel_area_km2()
    eras = anth.DEEP_ERAS
    stack = {name: [] for name in ("temp", "rain", "biome", "ice", "land_km2", "people")}
    for era in eras:
        for name, arr in era_blocks(era, area).items():
            stack[name].append(arr)
    arrays = {name: np.stack(v) for name, v in stack.items()}  # (eras, 36, 72)
    cells = {}
    for r in range(36):
        for c in range(72):
            land = arrays["land_km2"][:, r, c]
            if land.max() <= 0:
                continue
            cells[cell_key(r, c)] = {
                "temp": [None if math.isnan(v) else round(float(v), 1) for v in arrays["temp"][:, r, c]],
                "rain": [None if math.isnan(v) else round(float(v)) for v in arrays["rain"][:, r, c]],
                "biome": [int(v) for v in arrays["biome"][:, r, c]],
                "ice": [int(v) for v in arrays["ice"][:, r, c]],
                "people": [round(float(v)) for v in arrays["people"][:, r, c]],
                "land_km2": round(float(land.max())),
            }
    return cells, eras


# --- fauna per 5 degree cell ----------------------------------------------------------------

ROLE_CODE = {"prey": "prey", "herd": "herd", "predator": "predator"}


def fauna_by_cell(path: Path = FAUNA) -> tuple[list[list], dict[str, list]]:
    """(species table, per 5 degree cell [[species, last ka present, one-degree cells holding it], ...]).

    A species is present in the 5 degree cell at step k once MIN_SUBCELLS of its one-degree cells
    are (their `first step` <= k); `last ka` is the youngest such step. Ice is applied by the caller."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        fa = json.load(f)
    firsts: dict[str, dict[int, list[int]]] = {}
    for cid, flat in fa["cells"].items():
        row, col = divmod(int(cid), 360)  # row 0 = 90N-89N, col 0 = 180W-179W
        south_lat = 90 - row - 1
        key = f"{math.floor(south_lat / 5) * 5},{math.floor((col - 180) / 5) * 5}"
        per = firsts.setdefault(key, {})
        for i in range(0, len(flat), 2):
            per.setdefault(flat[i], []).append(flat[i + 1])
    used: dict[int, int] = {}
    out: dict[str, list] = {}
    for key, per in firsts.items():
        rows = []
        for sid, steps in per.items():
            if len(steps) < MIN_SUBCELLS:
                continue
            last_ka = sorted(steps)[MIN_SUBCELLS - 1]
            rows.append([used.setdefault(sid, len(used)), last_ka, len(steps)])
        if rows:
            out[key] = sorted(rows)
    table: list[list] = [[] for _ in used]
    for sid, new in used.items():
        s = fa["species"][sid]
        table[new] = [s["common"], s["name"], s["kg"], ROLE_CODE[s["role"]], int(s["extinct"])]
    return table, out


# --- regions ------------------------------------------------------------------------------

def region_index(regions: list[dict]) -> Callable[[float, float], int]:
    """The arrival-table region for a point: the first box holding it, else the nearest
    (prehistory_population.assign_regions, at the cell centre)."""
    def of(lat: float, lon: float) -> int:
        best, best_d = 0, math.inf
        for i, r in enumerate(regions):
            west, south, east, north = r["bbox"]
            dx, dy = max(west - lon, lon - east, 0), max(south - lat, lat - north, 0)
            d = dx * dx + dy * dy
            if d < best_d:
                best, best_d = i, d
            if d == 0:
                break
        return best
    return of


def load_tables() -> tuple[dict, dict]:
    arrivals = yaml.safe_load(ARRIVALS.read_text())
    cultures = yaml.safe_load(CULTURES.read_text())
    return arrivals, cultures


def build_deep() -> dict:
    arrivals, cultures = load_tables()
    regions = [{k: r[k] for k in ("id", "name", "bbox", "arrival_ka_bp", "verification", "source")}
               for r in arrivals["regions"]]
    others = [{"id": h["id"], "short": SHORT[h["id"]], "name": h["name"], "bbox": h["bbox"],
               "last_ka_bp": h["last_ka_bp"], "verification": h["verification"], "source": h["source"]}
              for h in arrivals["other_hominins"]]
    cells, _ = climate_and_people()
    species, fauna = fauna_by_cell()
    of = region_index(regions)
    for key, cell in cells.items():
        south, west = (int(v) for v in key.split(","))
        cell["region"] = of(south + anth.CELL_DEG / 2, west + anth.CELL_DEG / 2)
        if key in fauna:
            cell["fauna"] = fauna[key]
    biomes = json.loads(META.read_text())["biomes"]
    return {
        "version": DEEP_VERSION,
        "eras": [anth.DEEP_ERAS[0], anth.DEEP_ERAS[-1], 1000],
        "biomes": biomes,
        "regions": regions,
        "other_hominins": others,
        "cultures": cultures["cultures"],
        "biome_prey": cultures["biome_prey"],
        "species": species,
        "cells": cells,
    }


def add_to(atlas: dict) -> dict:
    atlas["deep"] = build_deep()
    atlas["sources"] = {**{k: v for k, v in atlas["sources"].items() if k not in DEEP_SOURCES}, **DEEP_SOURCES}
    return atlas


def main() -> None:
    atlas = json.loads(gzip.decompress(ATLAS.read_bytes()))
    atlas = add_to(atlas)
    ATLAS.write_bytes(gzip.compress(json.dumps(atlas, separators=(",", ":")).encode(), mtime=0))
    deep = atlas["deep"]
    print(f"deep past: {len(deep['cells'])} cells x {len(anth.DEEP_ERAS)} eras, {len(deep['species'])} species, "
          f"{len(deep['cultures'])} technocomplexes -> {ATLAS.relative_to(ROOT)} ({ATLAS.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
