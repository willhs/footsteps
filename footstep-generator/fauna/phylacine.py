#!/usr/bin/env python3
"""Ingest PHYLACINE 1.2.1 present-natural ranges and say which big animals lived where, per ka.

    python footstep-generator/fauna/phylacine.py fetch   # sparse git clone -> data/raw/phylacine/src (CC0)
    python footstep-generator/fauna/phylacine.py build   # -> data/fauna/fauna.json.gz + species.csv
    python footstep-generator/fauna/phylacine.py check   # sanity checks on the built file

See docs/ops/fauna.md for the method and the limits. Not wired into the app.

Data shape, one direction of flow:

    Trait_data.csv row --taxa.keep/role_of--> Species (name, mass, role, status)
    Present_natural/<species>.tif (0/1, 96.5 km equal-area) --sample--> range on a 1 degree grid
    range cell + losses.LOSSES / timing.REGIONAL_DEFAULT --timing.resolve--> first step shown (0..102)
    Krapp biome 28 (land ice) at each step --ice--> cells where nothing can live that step

    present(species, cell, step k) = in range  and  k >= first step  and  cell not ice at k
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

from fauna import losses as lo  # noqa: E402
from fauna import taxa  # noqa: E402
from fauna import timing as tm  # noqa: E402

RAW = ROOT / "data" / "raw" / "phylacine"
REPO = RAW / "src"
OUT = ROOT / "data" / "fauna"
KRAPP = ROOT / "data" / "raw" / "krapp2021" / "Krapp2021_biome_v1.2.2.nc"
GIT_URL = "https://github.com/MegaPast2Future/PHYLACINE_1.2.git"
SPARSE = ("Data/Traits", "Data/Ranges/Present_natural", "Data/PHYLACINE_1.2.1_Release_notes.pdf")

# PHYLACINE range raster: 360 x 142 cells, Behrmann equal-area (standard parallel 30), north at the
# top, 90N to about 60S. Tiepoint y and pixel size are read from the TIFF tags (research 0004).
RH, RW = 142, 360
Y0, PX, PY = 7348382.0, 96486.27222222222, 96514.95774647887

# Output grid: 1 degree, north up, row 0 = 90N..89N, column 0 = 180W. cell id = row * 360 + col.
GW, GH = 360, 180
ICE = 28  # Krapp BIOME4 class for land ice


def cell_lat(row: int) -> float:
    return 89.5 - row


def cell_lon(col: int) -> float:
    return -179.5 + col


def cell_id(lat: float, lon: float) -> int:
    row = min(GH - 1, max(0, int(math.floor(90.0 - lat))))
    col = min(GW - 1, max(0, int(math.floor(lon + 180.0))))
    return row * GW + col


# --- sources ---------------------------------------------------------------------

def fetch() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if not REPO.exists():
        subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", GIT_URL, str(REPO)], check=True)
    subprocess.run(["git", "-C", str(REPO), "sparse-checkout", "set", "--no-cone", *SPARSE], check=True)
    sha = subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    print(f"PHYLACINE at {sha}")


def read_traits(repo: Path = REPO) -> list[taxa.Traits]:
    with open(repo / "Data" / "Traits" / "Trait_data.csv", newline="") as f:
        return [taxa.from_row(r) for r in csv.DictReader(f)]


def raster_index() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(row, col, inside) in the range raster for every output cell centre; inside False south of ~60S."""
    lat = np.array([cell_lat(r) for r in range(GH)])
    lon = np.array([cell_lon(c) for c in range(GW)])
    rr = np.floor((Y0 - Y0 * np.sin(np.radians(lat))) / PY).astype(int)  # sphere scaled to the tiepoint
    cc = np.floor((lon + 180.0) / 360.0 * RW).astype(int)
    rows, cols = np.meshgrid(rr, cc, indexing="ij")
    return np.clip(rows, 0, RH - 1), cols, (rows >= 0) & (rows < RH)


def read_range(repo: Path, binomial: str) -> np.ndarray:
    import tifffile

    with tifffile.TiffFile(repo / "Data" / "Ranges" / "Present_natural" / f"{binomial}.tif") as t:
        return t.pages[0].asarray() == 1


def range_on_grid(raster: np.ndarray, idx: tuple[np.ndarray, np.ndarray, np.ndarray]) -> np.ndarray:
    rr, cc, inside = idx
    return raster[rr, cc] & inside


# --- timing per species ----------------------------------------------------------

@dataclass
class Built:
    traits: taxa.Traits
    cells: dict[int, int]  # cell id -> first step shown (0 = always)
    bases: dict[int, str]  # cell id -> basis of that cell's date ('' when never lost)


def refuge_cells(boxes: tuple[tm.Box, ...]) -> list[int]:
    return [r * GW + c for r in range(GH) for c in range(GW)
            if any(tm.in_box(cell_lat(r), cell_lon(c), b) for b in boxes)]


def time_species(t: taxa.Traits, grid_range: np.ndarray) -> Built | None:
    """Resolve the first step shown for every cell of the species' range (plus its refugia)."""
    ls = lo.losses_for(t.binomial)
    present = grid_range.copy()
    for loss in ls:
        if loss.refugium and loss.boxes:
            for cid in refuge_cells(loss.boxes):
                present[cid // GW, cid % GW] = True
    cells: dict[int, int] = {}
    bases: dict[int, str] = {}
    for r, c in zip(*np.nonzero(present)):
        last_ka, basis, _ = tm.resolve(ls, t.status, cell_lat(int(r)), cell_lon(int(c)))
        step = tm.first_present_step(last_ka)
        if step > tm.MAX_KA:
            continue  # gone before the series starts
        cells[int(r) * GW + int(c)] = step
        bases[int(r) * GW + int(c)] = basis.value if basis else ""
    return Built(t, cells, bases) if cells else None


def ice_cells(krapp_path: Path, wanted: set[int]) -> dict[int, list[int]]:
    """Per step, the wanted 1 degree cells whose four 0.5 degree Krapp cells are all land ice."""
    sys.path.insert(0, str(HERE.parent))
    import habitat_lookup as hl

    ds = hl.load_krapp(krapp_path)
    out: dict[int, list[int]] = {}
    for ka in range(tm.MAX_KA + 1):
        b = hl.krapp_biome(ds, ka)  # (360, 720), north up
        full = (b == ICE).reshape(GH, 2, GW, 2).all(axis=(1, 3))
        ids = [int(r) * GW + int(c) for r, c in zip(*np.nonzero(full)) if int(r) * GW + int(c) in wanted]
        if ids:
            out[ka] = ids
    return out


# --- build -----------------------------------------------------------------------

def sources_for(binomial: str) -> list[dict]:
    return [{"where": ("everywhere else" if l.boxes is None else "boxes"), "boxes": l.boxes, "ka": round(l.last_ka, 3),
             "basis": l.basis.value, "source": l.source, "refugium": l.refugium} for l in lo.losses_for(binomial)]


def build(repo: Path = REPO, out: Path = OUT, krapp: Path = KRAPP) -> dict:
    kept = [t for t in read_traits(repo) if taxa.keep(t) and t.binomial not in lo.EXCLUDED_NO_TIMING]
    kept.sort(key=lambda t: (-t.mass_kg, t.binomial))
    idx = raster_index()
    species, cells = [], {}
    dropped_empty = []
    for t in kept:
        b = time_species(t, range_on_grid(read_range(repo, t.binomial), idx))
        if b is None:
            dropped_empty.append(t.binomial)
            continue
        sid = len(species)
        bases = sorted(set(v for v in b.bases.values() if v))
        species.append({
            "id": sid, "name": t.binomial.replace("_", " "), "common": taxa.common_name(t.binomial),
            "kg": round(t.mass_kg), "role": taxa.role_of(t), "status": t.status,
            "extinct": t.status in ("EP", "EX"), "cells": len(b.cells),
            "timing": bases, "losses": sources_for(t.binomial),
        })
        for cid, step in b.cells.items():
            cells.setdefault(cid, []).extend([sid, step])
    ice = ice_cells(krapp, set(cells)) if krapp.exists() else {}
    if not krapp.exists():
        print(f"WARNING: {krapp} missing: no land-ice mask", file=sys.stderr)
    data = {
        "meta": {
            "built": date.today().isoformat(),
            "source": "PHYLACINE 1.2.1 present-natural ranges, Faurby et al. 2018 Ecology 99:2626 (CC0), "
                      "+ losses.py dates (see species[].losses) + Krapp et al. 2021 land ice",
            "licence": "PHYLACINE CC0; Krapp CC BY 4.0",
            "evidence": "modelled: present-natural ranges are today's climate counterfactual, not fossil ranges",
            "fields": {
                "grid": "1 degree, north up; cell id = row * 360 + col; row 0 = 90N..89N; col 0 = 180W; "
                        "centre lat = 89.5 - row, lon = -179.5 + col. No cells south of ~60S.",
                "steps": "k = 0..102 thousand years before 1950 (same steps as habitat_lookup.py). year = 1950 - 1000 k.",
                "cells": "cell id -> [species id, first step shown, ...]. Species is present at step k iff "
                         "k >= first step and the cell is not in ice[k].",
                "ice": "step -> cell ids (holding species) that are land ice that step (Krapp biome 28, all four 0.5 degree cells)",
                "species": "id, name, common, kg, role (prey|predator|herd), status (IUCN code, EP = extinct in "
                           "prehistory), extinct, cells (range cells), timing (bases used), losses (cited dates)",
            },
            "counts": {"species": len(species), "cells": len(cells)},
            "excluded_no_timing": lo.EXCLUDED_NO_TIMING,
            "range_empty_on_grid": dropped_empty,
        },
        "species": species,
        "cells": {str(k): v for k, v in sorted(cells.items())},
        "ice": {str(k): v for k, v in ice.items()},
    }
    out.mkdir(parents=True, exist_ok=True)
    path = out / "fauna.json.gz"
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(data, f, separators=(",", ":"))
    with open(out / "species.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "common", "kg", "role", "status", "cells", "timing"])
        for s in species:
            w.writerow([s["id"], s["name"], s["common"], s["kg"], s["role"], s["status"], s["cells"], "+".join(s["timing"])])
    print(f"wrote {path} ({path.stat().st_size / 1e3:.0f} KB): {len(species)} species, {len(cells)} cells")
    return data


# --- reading ---------------------------------------------------------------------

class Fauna:
    """The built file, queryable by place and year."""

    def __init__(self, data: dict):
        self.data = data
        self.species = data["species"]
        self.cells = {int(k): v for k, v in data["cells"].items()}
        self.ice = {int(k): set(v) for k, v in data["ice"].items()}

    @classmethod
    def load(cls, path: Path = OUT / "fauna.json.gz") -> "Fauna":
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return cls(json.load(f))

    def at(self, lat: float, lon: float, year: float) -> list[dict]:
        """Species likely present in the 1 degree cell holding (lat, lon) at `year` (nearest 1 ka step)."""
        ka = tm.year_to_ka(year)
        cid = cell_id(lat, lon)
        if cid in self.ice.get(ka, ()):
            return []
        flat = self.cells.get(cid, [])
        return [self.species[flat[i]] for i in range(0, len(flat), 2) if ka >= flat[i + 1]]

    def named(self, lat: float, lon: float, year: float) -> set[str]:
        return {s["name"] for s in self.at(lat, lon, year)}


# --- sanity checks -----------------------------------------------------------------

def check(path: Path = OUT / "fauna.json.gz") -> None:
    fa = Fauna.load(path)
    mam, horse = "Mammuthus primigenius", "Equus"
    print("mammoth, Siberia (65N 100E):", {y: mam in fa.named(65, 100, y) for y in (-100_000, -20_000, -12_000, -9_000, -8_000, -1_000)})
    print("mammoth, Wrangel Island (71N 179.5W):", {y: mam in fa.named(71, -179.5, y) for y in (-6_000, -2_050, -1_950, -1_000, 1900)})
    print("mammoth, St Paul Island (57N 170W):", {y: mam in fa.named(57, -170, y) for y in (-4_000, -3_000, -2_000)})
    print("mammoth, Siberia after 4 ka (any cell, mainland):", sorted(
        {cid for cid, v in fa.cells.items() for i in range(0, len(v), 2)
         if fa.species[v[i]]["name"] == mam and v[i + 1] <= 3}))
    for place, (la, lo_) in {"Great Plains (41N 100W)": (41, -100), "Alaska (65N 150W)": (65, -150), "Mexico (20N 100W)": (20, -100),
                             "Argentina (35S 60W)": (-35, -60), "Kazakh steppe (50N 70E)": (50, 70)}.items():
        print(f"horses, {place}:", {y: sorted(n for n in fa.named(la, lo_, y) if n.startswith(horse) or n.startswith("Hippidion"))
                                    for y in (-20_000, -9_000, -6_000, 0)})
    print("Australia (25S 135E) Diprotodon:", {y: "Diprotodon optatum" in fa.named(-25, 135, y) for y in (-60_000, -45_000, -35_000, 0)})
    print("Fennoscandia (65N 20E) under ice, 20 ka:", fa.at(65, 20, -20_000) == [], "| 10 ka:", len(fa.at(65, 20, -10_000)))
    for place, (la, lo_), yrs in (("Serengeti (2S 35E)", (-2.3, 34.8), (-20_000, 0)), ("N France (49N 2E)", (49, 2), (-40_000, -20_000, -5_000, 1500))):
        for y in yrs:
            sp = sorted(fa.at(la, lo_, y), key=lambda s: -s["kg"])
            print(f"{place} {y:>7}: {len(sp):2d} species; biggest: {', '.join(s['common'] for s in sp[:6])}")


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("cmd", choices=["fetch", "build", "check"])
    p.add_argument("--krapp", type=Path, default=KRAPP, help="Krapp biome netCDF (for the land-ice mask)")
    a = p.parse_args()
    if a.cmd == "fetch":
        fetch()
    elif a.cmd == "build":
        build(krapp=a.krapp)
    else:
        check()


if __name__ == "__main__":
    main()
