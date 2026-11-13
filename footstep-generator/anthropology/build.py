#!/usr/bin/env python3
"""Build the anthropology atlas the day API serves (see README.md beside this file).

    poetry run python footstep-generator/anthropology/build.py fetch   # download D-PLACE, Seshat
    poetry run python footstep-generator/anthropology/build.py         # write the atlas

Inputs: data/tiles/grid/humans_{year}.webp and landuse_{year}.png (grid_image.py), and the
zips `fetch` puts in data/raw/. Output: deploy/budgie/api/anthropology.json.gz.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(ROOT / "deploy" / "budgie" / "api"))
import atlas as anth  # noqa: E402  the runtime shares eras, cells and source names
import grid_image  # noqa: E402

GRID = ROOT / "data" / "tiles" / "grid"
RAW = ROOT / "data" / "raw"
OUT = ROOT / "deploy" / "budgie" / "api" / "anthropology.json.gz"
VERSION = 1

DOWNLOADS = {
    RAW / "dplace" / "dplace-dataset-ea.zip": "https://github.com/D-PLACE/dplace-dataset-ea/archive/refs/heads/main.zip",
    RAW / "dplace" / "dplace-dataset-teow.zip": "https://github.com/D-PLACE/dplace-dataset-teow/archive/refs/heads/main.zip",
    RAW / "seshat" / "equinox.zip": "https://zenodo.org/records/6629022/files/MajidBenam/Equinox_data-1.0.zip?download=1",
}

SOURCES = {
    anth.HYDE: {
        "what": "Population and land use (cropland, grazing, irrigation) per 5 arc-min cell, 10,000 BCE-1900.",
        "url": "https://landuse.sites.uu.nl/hyde-project/",
        "licence": "Open data; cite Klein Goldewijk et al., HYDE 3 (Utrecht University / PBL).",
    },
    anth.EA: {
        "what": "Murdock's Ethnographic Atlas, 1,291 societies, ethnographic present (mostly 1850-1950).",
        "url": "https://github.com/D-PLACE/dplace-dataset-ea",
        "licence": "CC BY-NC 4.0 (Kirby et al. 2016, D-PLACE).",
    },
    anth.TEOW: {
        "what": "Terrestrial ecoregion and biome at each D-PLACE society (Olson et al. 2001), present day.",
        "url": "https://github.com/D-PLACE/dplace-dataset-teow",
        "licence": "CC BY-NC 4.0 (D-PLACE).",
    },
    anth.SESHAT: {
        "what": "Seshat Global History Databank, Equinox 2020 release: 35 sites, polities per century.",
        "url": "https://zenodo.org/records/6629022",
        "licence": "CC BY-NC-SA 4.0 (Turchin et al., Seshat). This atlas inherits CC BY-NC-SA.",
    },
    anth.MODEL: {
        "what": "Gap-filled on first request by Claude Haiku via OpenRouter, from the real facts above.",
        "url": "",
        "licence": "Generated text; speculative.",
    },
}


# --- download -------------------------------------------------------------------------------

def fetch(downloads: dict[Path, str] = DOWNLOADS) -> None:
    for path, url in downloads.items():
        if path.exists():
            print(f"have {path.relative_to(ROOT)}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as res:
            path.write_bytes(res.read())
        print(f"fetched {path.relative_to(ROOT)} ({path.stat().st_size / 1e6:.1f} MB)")


def zip_member(z: zipfile.ZipFile, suffix: str) -> str:
    names = [n for n in z.namelist() if n.endswith(suffix)]
    if len(names) != 1:
        raise ValueError(f"{z.filename}: expected one {suffix}, found {names}")
    return names[0]


def read_csv(zip_path: Path, suffix: str) -> list[dict]:
    with zipfile.ZipFile(zip_path) as z, z.open(zip_member(z, suffix)) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")))


# --- HYDE -----------------------------------------------------------------------------------

def aggregate_cells(people: np.ndarray, landuse: np.ndarray, land: np.ndarray,
                    pixel_km2: np.ndarray, cell_px: int) -> np.ndarray:
    """Per-pixel grids (rows north to south) -> per-cell [people, land_km2, crop, graze, irri, lived].

    people: (H, W) people per pixel; landuse: (H, W, 3) shares of pixel area; land: (H, W) bool;
    pixel_km2: (H, 1) area per row. Shares are of the cell's land area. `lived` is the
    people-weighted mean pixel density: the people per km2 the average person lives among.
    Returns (H/cell_px, W/cell_px, 6), row 0 = northernmost cell.
    """
    h, w = people.shape
    rows, cols = h // cell_px, w // cell_px

    def cell_sum(a: np.ndarray) -> np.ndarray:
        return a.reshape(rows, cell_px, cols, cell_px).sum(axis=(1, 3))

    area = np.broadcast_to(pixel_km2, (h, w))
    land_km2 = cell_sum(np.where(land, area, 0.0))
    out = np.zeros((rows, cols, 6))
    out[..., 0] = cell_sum(people)
    weighted = cell_sum(people * people / area)
    out[..., 5] = np.divide(weighted, out[..., 0], out=np.zeros_like(weighted), where=out[..., 0] > 0)
    out[..., 1] = land_km2
    for i in range(3):
        km2 = cell_sum(landuse[..., i] * area)
        out[..., 2 + i] = np.divide(km2, land_km2, out=np.zeros_like(km2), where=land_km2 > 0)
    np.clip(out[..., 2:5], 0, 1, out=out[..., 2:5])
    return out


def load_landuse(year: int) -> np.ndarray:
    with Image.open(GRID / f"landuse_{year}.png") as image:
        return np.asarray(image.convert("RGB"), dtype=np.float32) / 255


def hyde_cells() -> dict[str, list]:
    """CellKey -> 30 rows of [people, land_km2, crop, graze, irri, lived] for every cell with land."""
    g = grid_image.GLOBAL_GRID
    cell_px = round(anth.CELL_DEG / g["cellsize"])
    pixel_km2 = grid_image.cell_areas_km2(g["nrows"], g["cellsize"], g["yllcorner"])[:, None]
    land = np.zeros((g["nrows"], g["ncols"]), dtype=bool)
    for year in anth.ERAS:  # land = people or land use in any era
        land |= (grid_image.decode(GRID / f"humans_{year}.webp") > 0) | (load_landuse(year).max(axis=2) > 0)
    per_era = []
    for year in anth.ERAS:
        people = grid_image.decode(GRID / f"humans_{year}.webp")
        per_era.append(aggregate_cells(people, load_landuse(year), land, pixel_km2, cell_px))
        print(f"HYDE {year}: {people.sum() / 1e6:,.1f}M people", flush=True)
    stack = np.stack(per_era)  # (eras, rows, cols, 5)
    cells = {}
    rows, cols = stack.shape[1:3]
    for r in range(rows):
        for c in range(cols):
            if stack[0, r, c, 1] <= 0:
                continue
            key = f"{90 - (r + 1) * anth.CELL_DEG},{-180 + c * anth.CELL_DEG}"
            cells[key] = [[round(float(p)), round(float(a)), round(float(cr), 4), round(float(gr), 4),
                           round(float(ir), 4), round(float(lv), 3)]
                          for p, a, cr, gr, ir, lv in stack[:, r, c]]
    return cells


# --- D-PLACE --------------------------------------------------------------------------------

EA030_SETTLEMENT = {1: "mobile camp", 2: "seasonal camp", 3: "seasonal camp", 4: "village",
                    5: "hamlet", 6: "hamlet", 7: "village", 8: "town"}
EA079_PLAN = {1: "semicircular", 2: "circular", 3: "oval", 4: "polygonal", 5: "rectangular",
              6: "courtyard"}
EA081_WALL = {1: "stone, stucco or fired brick", 2: "plaster, mud and dung or wattle and daub",
              3: "wood, poles or bamboo", 4: "bark", 5: "hides or skins", 6: "felt or cloth",
              7: "mats or wattle", 8: "grass, leaves or thatch", 9: "adobe or dried brick"}
EA083_ROOF = {1: "stone or slate", 2: "clay, mud and dung", 3: "wood or bamboo", 4: "bark",
              5: "hides or skins", 6: "felt or cloth", 7: "mats", 8: "grass, leaves or thatch",
              9: "earth or turf", 10: "ice or snow", 11: "tile or fired brick"}
# No example crops: an analogue from another continent or century would name the wrong ones.
EA029_CROP = {3: "vegetables and legumes", 4: "tree fruits", 5: "roots or tubers", 6: "cereal grains"}
EA040_ANIMALS = {2: "pigs", 3: "sheep and goats", 4: "horses or donkeys", 5: "reindeer",
                 6: "camels, llamas or alpacas", 7: "cattle, yaks or water buffalo"}
EA042_CLASS = {1: "foraging", 2: "fishing", 3: "foraging", 4: "herding", 5: "farming",
               6: "farming", 7: "farming", 9: "farming"}


def dwelling(codes: dict) -> dict | None:
    plan, wall, roof = EA079_PLAN.get(codes.get("EA079")), codes.get("EA081"), EA083_ROOF.get(codes.get("EA083"))
    if wall == 11 and roof:
        phrase, material = f"walls and roof of {roof}", roof
    elif EA081_WALL.get(wall) or roof:
        parts = [f"walls of {EA081_WALL[wall]}" if wall in EA081_WALL else None,
                 f"roof of {roof}" if roof else None]
        phrase, material = ", ".join(p for p in parts if p), EA081_WALL.get(wall) or roof
    else:
        return None
    noun = f"{plan} house" if plan else "house"
    return {"phrase": f"{noun}, {phrase}", "material": material}


def diet(codes: dict) -> list[str] | None:
    items = []
    if crop := EA029_CROP.get(codes.get("EA029")):
        items.append(crop)
    if animals := EA040_ANIMALS.get(codes.get("EA040")):
        items.append(f"meat from {animals}")
        if codes.get("EA041") == 2:
            items.append("milk")
    return items or None


def way_class(codes: dict) -> str | None:
    dep = {"foraging": codes.get("EA001", -1) + codes.get("EA002", -1) + 1,
           "fishing": codes.get("EA003", -1), "herding": codes.get("EA004", -1),
           "farming": codes.get("EA005", -1)}
    best = max(dep, key=dep.get)
    if dep[best] < 0:
        return EA042_CLASS.get(codes.get("EA042"))
    if sorted(dep.values())[-2] == dep[best]:  # a tie: the coder's dominant activity decides
        return EA042_CLASS.get(codes.get("EA042"), best)
    return best


def decode_societies(ea_zip: Path, teow_zip: Path) -> dict[str, dict]:
    societies = {r["ID"]: r for r in read_csv(ea_zip, "cldf/societies.csv")}
    codes: dict[str, dict] = {sid: {} for sid in societies}
    for row in read_csv(ea_zip, "cldf/data.csv"):
        m = re.fullmatch(r"(EA\d+)-(\d+)", row["Code_ID"] or "")
        if m and row["Soc_ID"] in codes:
            codes[row["Soc_ID"]].setdefault(m.group(1), int(m.group(2)))
    biomes = {r["Soc_ID"]: r["Value"] for r in read_csv(teow_zip, "cldf/data.csv")
              if r["Var_ID"] == "Biome" and r["Code_ID"] != "Biome-NA"}
    out = {}
    for sid, s in societies.items():
        c = codes[sid]
        out[sid] = {
            "name": s["Name"], "lat": float(s["Latitude"]), "lon": float(s["Longitude"]),
            "year": int(s["main_focal_year"]) if s["main_focal_year"] else None,
            "region": s["region"], "class": way_class(c),
            "settlement": EA030_SETTLEMENT.get(c.get("EA030")),
            "dwelling": dwelling(c), "diet": diet(c), "biome": biomes.get(sid),
        }
    return out


def distances_km(lat: np.ndarray, lon: np.ndarray, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Great-circle km, (cells, societies)."""
    p1, p2 = np.radians(lat)[:, None], np.radians(lat2)[None, :]
    dl = np.radians(lon2)[None, :] - np.radians(lon)[:, None]
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * grid_image.EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def nearest(cell_keys: list[str], societies: dict[str, dict], max_km: float, keep) -> list:
    """Per cell: [society id, km] of the nearest society passing `keep`, or None."""
    ids = [sid for sid, s in societies.items() if keep(s)]
    if not ids:
        return [None] * len(cell_keys)
    centre = np.array([[int(v) + anth.CELL_DEG / 2 for v in k.split(",")] for k in cell_keys])
    slat = np.array([societies[i]["lat"] for i in ids])
    slon = np.array([societies[i]["lon"] for i in ids])
    d = distances_km(centre[:, 0], centre[:, 1], slat, slon)
    best = d.argmin(axis=1)
    return [[ids[b], round(float(d[i, b]))] if d[i, b] <= max_km else None for i, b in enumerate(best)]


# --- Seshat ---------------------------------------------------------------------------------

def xlsx_sheet(path: Path, sheet: str) -> list[dict]:
    """Rows of one sheet as dicts keyed by the header row (stdlib; enough for Seshat's xlsx)."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    with zipfile.ZipFile(path) as outer:
        inner = zipfile.ZipFile(io.BytesIO(outer.read(zip_member(outer, ".xlsx"))))
    shared = [("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
              for si in ElementTree.fromstring(inner.read("xl/sharedStrings.xml")).findall("m:si", ns)]
    book = ElementTree.fromstring(inner.read("xl/workbook.xml"))
    rid = next(s.get(f"{{{ns['r']}}}id") for s in book.find("m:sheets", ns) if s.get("name") == sheet)
    rels = ElementTree.fromstring(inner.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == rid).lstrip("/")
    root = ElementTree.fromstring(inner.read(target if target.startswith("xl/") else f"xl/{target}"))

    def col(ref: str) -> int:
        n = 0
        for ch in re.match(r"[A-Z]+", ref).group():
            n = n * 26 + ord(ch) - 64
        return n - 1

    rows = []
    for row in root.iter(f"{{{ns['m']}}}row"):
        values = {}
        for c in row.findall("m:c", ns):
            v = c.find("m:v", ns)
            if c.get("t") == "s":
                values[col(c.get("r"))] = shared[int(v.text)]
            elif c.get("t") == "inlineStr":
                values[col(c.get("r"))] = "".join(t.text or "" for t in c.iter(f"{{{ns['m']}}}t"))
            elif v is not None:
                values[col(c.get("r"))] = v.text
        rows.append(values)
    header = rows[0]
    return [{header[i]: r.get(i) for i in header} for r in rows[1:]]


def number(v) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x >= 0 else None  # Seshat codes missing as -999


METALS = ("Copper", "Bronze", "Iron", "Steel")


def seshat_snapshots(zip_path: Path) -> dict[str, dict[str, dict]]:
    """CellKey -> era -> {site, polity, technology} from the Seshat sites in that cell."""
    ngas = {r["NGA"]: r for r in xlsx_sheet(zip_path, "NGAs") if r.get("NGA")}
    polities = {r["PolID"]: r for r in xlsx_sheet(zip_path, "Polities") if r.get("PolID")}
    by_bucket: dict[tuple[str, int], list[dict]] = {}
    for r in xlsx_sheet(zip_path, "TSDat123"):
        time = float(r["Time"]) if r.get("Time") else None
        if r.get("NGA") not in ngas or time is None or not anth.FIRST_YEAR <= time <= anth.LAST_YEAR + 99:
            continue
        by_bucket.setdefault((r["NGA"], anth.era_of(min(int(time), anth.LAST_YEAR))), []).append(r)
    out: dict[str, dict[str, dict]] = {}
    for (nga, era), rows in sorted(by_bucket.items(), key=lambda kv: kv[0][1]):
        site = ngas[nga]
        names = list(dict.fromkeys(polities[r["PolID"]]["PolName"] for r in rows if r["PolID"] in polities))
        langs = list(dict.fromkeys(polities[r["PolID"]].get("Family") for r in rows if r["PolID"] in polities))

        def top(var: str) -> float | None:
            vals = [x for r in rows if (x := number(r.get(var))) is not None]
            return max(vals) if vals else None

        tech = [m.lower() for m in METALS if (top(m) or 0) >= 0.5]
        tech += [label for var, label in (("Script", "writing"), ("Market", "markets"),
                                          ("Irrigation", "irrigation systems"), ("Calendar", "calendar"))
                 if (top(var) or 0) >= 0.5]
        polity = {"names": names[:3], "language_family": next((l for l in langs if l), None),
                  "settlement_hierarchy_levels": top("SettlHier"),
                  "largest_settlement_people": top("CapPop")}
        key = anth.cell_of(float(site["Latitude"]), float(site["Longitude"]))
        out.setdefault(key, {})[str(era)] = {
            "site": f"Seshat site: {nga} ({site.get('City') or site.get('Subregion')}).",
            "polity": polity, "technology": tech or None,
        }
    return out


# --- assemble -------------------------------------------------------------------------------

def build() -> dict:
    cells = hyde_cells()
    societies = decode_societies(RAW / "dplace" / "dplace-dataset-ea.zip", RAW / "dplace" / "dplace-dataset-teow.zip")
    keys = sorted(cells)
    analogues = {cls: nearest(keys, societies, 2500, lambda s, cls=cls: s["class"] == cls)
                 for cls in ("foraging", "fishing", "herding", "farming")}
    biome = nearest(keys, societies, 1000, lambda s: bool(s["biome"]))
    seshat = seshat_snapshots(RAW / "seshat" / "equinox.zip")
    used: set[str] = set()
    out_cells = {}
    for i, key in enumerate(keys):
        entry = {"hyde": cells[key], "analogues": {c: v[i] for c, v in analogues.items() if v[i]}}
        if biome[i]:
            entry["biome"] = [societies[biome[i][0]]["biome"], biome[i][1]]
        if key in seshat:
            entry["seshat"] = seshat[key]
        used.update(v[0] for v in entry["analogues"].values())
        out_cells[key] = entry
    return {
        "version": VERSION, "built": date.today().isoformat(), "cell_deg": anth.CELL_DEG,
        "eras": anth.ERAS, "licence": "CC BY-NC-SA 4.0 (derived from the sources below)",
        "sources": SOURCES,
        "societies": {sid: s for sid, s in societies.items() if sid in used},
        "cells": out_cells,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", choices=["fetch", "build"], default="build")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    if args.command == "fetch":
        return fetch()
    atlas = build()
    args.out.write_bytes(gzip.compress(json.dumps(atlas, separators=(",", ":")).encode(), mtime=0))
    print(f"{len(atlas['cells'])} land cells, {len(atlas['societies'])} societies, "
          f"{sum('seshat' in c for c in atlas['cells'].values())} Seshat cells -> "
          f"{args.out.relative_to(ROOT)} ({args.out.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
