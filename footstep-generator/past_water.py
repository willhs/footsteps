"""A dated, basin-connected Mega-Chad highstand, shared by every consumer of past water (`?pastwater=1`).

One scenario, one mask, one epoch function. The terrain paint (`terrain_image.py --pastwater`), the wet exclusion that keeps groups
out of the lake (`siteRanking.ts`), the freshwater-distance patch (`siteRanking.ts` reads it instead of the static image) and the
close-up lake plane (`lib/close3d.ts`) all read what this script writes to `footsteps-web/public/pastwater/`. See docs/ops/past-water.md.

What is modelled
  * LAKE: every 2.5' pixel that is connected, through pixels at or below LEVEL_M, to a seed in today's Lake Chad, inside the
    FILL_WINDOW box (a lid on the flood, not a mask: the lake is asserted to stay clear of the window's edge). Heights are Terrarium
    zoom 6 (SRTM/GMTED/ETOPO1; mean of 3 x 3 samples per pixel, the same relief `site_terrain.py` bakes), metres above the geoid
    (mean sea level datum) Terrarium and ETOPO1 share. It is NOT relative to the year's global ocean level: the lake plane is at
    329 m on this datum whatever the ocean does.
  * LEVEL: 329 m, the height `terrain_image.py` already used for the Mega-Chad highstand shoreline (Drake & Bristow 2006, The Holocene 16: 901-911, who
    put the lake's spill into the Benue at ~330 m). The area this gives is checked against the 361,000 km2 of Armitage et al. 2015.
  * DATES: a highstand reached by ~11.5 ka BP and kept until ~5 ka BP (Armitage, Bristow & Drake 2015, PNAS 112: 8543). Calendar BP
    from 1950: 11,500 BP = app year -9550, 5,000 BP = -3050. Inside the window the lake is the highstand, full stop (no fade, no
    partial stage); outside it the scenario is INACTIVE: the geography is unknown, which is not the same as a dry lakebed.
  * WATER: fresh, assumed. A basin that overflowed to the Benue was open, so its water is taken as drinkable at the highstand. This
    is an assumption, not a measurement; shore salinity, the stage during interruptions (the lake is known to have fallen and risen
    inside the window) and sediment since are not modelled.

Outputs (public/pastwater/)
  mega_chad.json         manifest: scenario, epochs, datum, patches (window, sha256, bytes), area, assumptions
  mega_chad_mask.webp    lake mask on the 2.5' world grid (8640 x 4320, row 0 north, column 0 180 W), cropped to the lake's box; red 255 = lake
  mega_chad_water.webp   distance to fresh water on the HYDE 5' grid (water_distance.py's encoding), cropped to the box where the lake
                         is the nearest water; min(static image, distance to the lake). Cells outside the box are the static image's.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

import site_terrain as st
import water_distance as wd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "footsteps-web" / "public" / "pastwater"
TERRARIUM = Path(st.TERRARIUM)
NAME = "mega_chad"

BP_ZERO = 1950  # calendar year of 0 BP
LEVEL_M = 329.0
SEED = (13.0, 14.3)  # lat, lon: inside today's Lake Chad, so the fill starts in the basin's own floor
FILL_WINDOW = (5.0, 26.0, 6.0, 27.0)  # south, north, west, east (degrees): the lid on the flood
FILL_MARGIN = 2  # pixels of margin kept round the lake in its patch
SAMPLES = st.SAMPLES

NX, NY = st.NX, st.NY  # the 2.5' world grid
PIXEL_DEG = st.PIXEL_DEG
CELL = 2  # 2.5' pixels per HYDE 5' cell, across


@dataclass(frozen=True)
class Epoch:
    """A span of years in which the scenario holds. `id` 0 is reserved for "scenario inactive"."""
    id: int
    name: str
    from_bp: int  # calendar years BP (from 1950), the older end
    to_bp: int  # the younger end

    @property
    def from_year(self) -> int:
        return BP_ZERO - self.from_bp

    @property
    def to_year(self) -> int:
        return BP_ZERO - self.to_bp


EPOCHS = (Epoch(1, "highstand", 11_500, 5_000),)
INACTIVE = 0


def epoch_at(year: float) -> int:
    """The epoch a calendar year falls in (both ends inclusive), or INACTIVE (0): the scenario says nothing about that date."""
    for e in EPOCHS:
        if e.from_year <= year <= e.to_year:
            return e.id
    return INACTIVE


# --- the lake ---------------------------------------------------------------------------------------------------------

def window_pixels() -> tuple[int, int, int, int]:
    """FILL_WINDOW as (row0, row1, col0, col1) on the 2.5' world grid."""
    south, north, west, east = FILL_WINDOW
    return int((90 - north) / PIXEL_DEG), int((90 - south) / PIXEL_DEG), int((west + 180) / PIXEL_DEG), int((east + 180) / PIXEL_DEG)


def fetch_window_tiles(folder: Path = TERRARIUM) -> None:
    """Only the zoom-6 Terrarium tiles the fill window needs (about 20), into `folder`. Idempotent."""
    south, north, west, east = FILL_WINDOW
    xs = range(int((west + 180) / 360 * st.TILES), int((east + 180) / 360 * st.TILES) + 1)
    top, bottom = st.mercator_row(np.array([north, south]))
    ys = range(int(top / 256), int(bottom / 256) + 1)
    folder.mkdir(parents=True, exist_ok=True)
    for y in ys:
        for x in xs:
            st._get_tile((x, y, folder))


def window_elevation(folder: Path = TERRARIUM) -> np.ndarray:
    """Terrarium metres on the 2.5' grid inside FILL_WINDOW: the mean of SAMPLES x SAMPLES zoom-6 pixels per output pixel, the
    same resampling as `site_terrain.resample`. Shape is (rows, cols) of `window_pixels()`."""
    r0, r1, c0, c1 = window_pixels()
    s = (np.arange(SAMPLES) + 0.5) / SAMPLES
    col_f = ((np.arange(c0, c1)[:, None] + s[None, :]) / NX).ravel() * st.MOSAIC
    cols = np.minimum(col_f.astype(np.int64), st.MOSAIC - 1)
    tile_rows = np.minimum(st.mercator_row(np.array([90 - r0 * PIXEL_DEG, 90 - r1 * PIXEL_DEG])).astype(np.int64), st.MOSAIC - 1)
    y0, y1 = int(tile_rows[0] // 256), int(tile_rows[1] // 256)
    x0, x1 = int(cols.min() // 256), int(cols.max() // 256)
    z = np.empty(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.int16)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            with Image.open(folder / f"{st.ZOOM}_{x}_{y}.png") as im:
                a = np.asarray(im.convert("RGB")).astype(np.float32)
            z[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = np.rint(a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768)
    elev = np.empty((r1 - r0, c1 - c0), dtype=np.float32)
    for j in range(r1 - r0):
        lat = 90 - (r0 + j + s) * PIXEL_DEG
        rows = np.minimum(st.mercator_row(lat).astype(np.int64), st.MOSAIC - 1) - y0 * 256
        e = z[rows][:, cols - x0 * 256].astype(np.float32).reshape(SAMPLES, c1 - c0, SAMPLES)
        elev[j] = e.mean(axis=(0, 2))
    return elev


def connected_below(elev: np.ndarray, level: float, seed: tuple[int, int]) -> np.ndarray:
    """Pixels at or below `level` joined to `seed` by a 4-connected path of such pixels (the basin's own floor, not every dip)."""
    below = elev <= level
    sr, sc = seed
    if not below[sr, sc]:
        raise ValueError(f"the seed is {elev[sr, sc]:.0f} m, above the {level:.0f} m level")
    seen = np.zeros(below.shape, dtype=bool)
    seen[sr, sc] = True
    queue = deque([(sr, sc)])
    rows, cols = below.shape
    while queue:
        r, c = queue.popleft()
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < rows and 0 <= cc < cols and below[rr, cc] and not seen[rr, cc]:
                seen[rr, cc] = True
                queue.append((rr, cc))
    return seen


def highstand_lake(elev: np.ndarray) -> np.ndarray:
    """The Mega-Chad highstand inside the fill window (bool). Raises if the flood reaches the window's edge: it would have leaked."""
    r0, _, c0, _ = window_pixels()
    seed = (int((90 - SEED[0]) / PIXEL_DEG) - r0, int((SEED[1] + 180) / PIXEL_DEG) - c0)
    lake = connected_below(elev, LEVEL_M, seed)
    if lake[0].any() or lake[-1].any() or lake[:, 0].any() or lake[:, -1].any():
        raise ValueError("the flood reaches the fill window's edge: the lake leaked out of its basin")
    return lake


def pixel_area_km2(row: np.ndarray) -> np.ndarray:
    """Area (km2) of a 2.5' pixel in each world row index `row`."""
    lat = np.radians(90 - (row + 0.5) * PIXEL_DEG)
    return (np.radians(PIXEL_DEG) * wd.EARTH_RADIUS_M / 1000) ** 2 * np.cos(lat)


@dataclass(frozen=True)
class Patch:
    """A rectangle of a grid: `x0`, `y0` = column and row of its north-west pixel in the full grid, then its size."""
    x0: int
    y0: int
    width: int
    height: int


def lake_patch(lake: np.ndarray) -> tuple[Patch, np.ndarray]:
    """The lake cropped to its bounding box plus FILL_MARGIN pixels, in 2.5' world coordinates: (patch, uint8 0/255)."""
    r0, _, c0, _ = window_pixels()
    rows, cols = np.nonzero(lake)
    top, bottom = rows.min() - FILL_MARGIN, rows.max() + FILL_MARGIN + 1
    left, right = cols.min() - FILL_MARGIN, cols.max() + FILL_MARGIN + 1
    return Patch(c0 + int(left), r0 + int(top), int(right - left), int(bottom - top)), (lake[top:bottom, left:right] * 255).astype(np.uint8)


def place_on_world(patch: Patch, values: np.ndarray, width: int = NX, height: int = NY) -> np.ndarray:
    """The patch's values dropped onto an otherwise-zero world grid of (height, width)."""
    out = np.zeros((height, width), dtype=values.dtype)
    out[patch.y0:patch.y0 + patch.height, patch.x0:patch.x0 + patch.width] = values
    return out


def read_gray(path: Path) -> np.ndarray:
    """Red channel of a patch image, as the browser reads it."""
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"))[:, :, 0].copy()


def write_gray(path: Path, values: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.repeat(values[:, :, None], 3, axis=2)).save(path, lossless=True, quality=100, method=6)


def load_lake(out: Path = OUT) -> tuple[Patch, np.ndarray, dict]:
    """The committed mask: (patch, bool mask of the patch, manifest). What every flag-on consumer reads."""
    manifest = json.loads((out / f"{NAME}.json").read_text())
    p = manifest["mask"]
    patch = Patch(p["x0"], p["y0"], p["width"], p["height"])
    return patch, read_gray(out / p["file"]) > 127, manifest


# --- fresh water distance ---------------------------------------------------------------------------------------------

def lake_cells(patch: Patch, mask: np.ndarray) -> np.ndarray:
    """The HYDE 5' cells (2160 x 4320) that hold any lake: a cell with any of its 2 x 2 pixels wet is water (distance code 0)."""
    world = place_on_world(patch, mask.astype(np.uint8)).astype(bool)
    return world.reshape(NY // CELL, CELL, NX // CELL, CELL).any(axis=(1, 3))


def distance_patch(cells: np.ndarray, baseline: np.ndarray) -> tuple[Patch, np.ndarray, int]:
    """The distance image where the lake is the nearest fresh water: min(static code, code of the distance to the lake) over the box
    of cells that change (plus one cell round it). `cells` are the lake's 5' cells; `baseline` the static image's codes (2160 x 4320).
    Returns (patch, codes, cells changed). Cells outside the patch are exactly the static image's."""
    lake_codes = wd.quantise(wd.distance_metres(cells))
    new = np.minimum(baseline, lake_codes)
    changed = new != baseline
    rows, cols = np.nonzero(changed)
    r0, r1 = max(0, rows.min() - 1), min(new.shape[0], rows.max() + 2)
    c0, c1 = max(0, cols.min() - 1), min(new.shape[1], cols.max() + 2)
    return Patch(int(c0), int(r0), int(c1 - c0), int(r1 - r0)), new[r0:r1, c0:c1].astype(np.uint8), int(changed.sum())


# --- run --------------------------------------------------------------------------------------------------------------

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def manifest_for(
    lake: np.ndarray, mask_patch: Patch, mask_file: Path, dist_patch: Patch, dist_file: Path, changed: int, elev: np.ndarray,
) -> dict:
    r0, _, _, _ = window_pixels()
    rows = np.nonzero(lake)[0]
    area = float(pixel_area_km2(rows + r0).sum())
    return {
        "id": NAME,
        "version": 1,
        "label": "Mega-Chad highstand (modelled, experimental)",
        "evidence": "modelled",
        "flag": "?pastwater=1",
        "level_m": LEVEL_M,
        "datum": "metres above the geoid (mean sea level) as in Terrarium and ETOPO1 heights; not relative to the year's global ocean level",
        "epochs": [
            {"id": e.id, "name": e.name, "from_bp": e.from_bp, "to_bp": e.to_bp, "from_year": e.from_year, "to_year": e.to_year,
             "state": "highstand at level_m, no fade or partial stage", "water": "fresh (assumed)"}
            for e in EPOCHS
        ],
        "outside_epochs": "scenario inactive: the geography is unknown at that date, which is not the same as a dry lakebed; "
                          "the app draws and places as it does without the flag",
        "mask": {
            "file": mask_file.name, **vars(mask_patch), "grid": f"{NX} x {NY} world pixels of {PIXEL_DEG * 60:g}'; x0, y0 = column, row of the patch's "
            "north-west pixel (row 0 north, column 0 180 W)", "red": "255 = lake, 0 = not", "bytes": mask_file.stat().st_size,
            "sha256": hashlib.sha256(mask_file.read_bytes()).hexdigest(), "lake_pixels": int(lake.sum()),
        },
        "distance": {
            "file": dist_file.name, **vars(dist_patch), "grid": f"{NX // CELL} x {NY // CELL} HYDE 5' cells; x0, y0 = column, row of the patch's north-west cell",
            "encoding": "water_distance.json: metres = max_metres * (code / 255) ** 2, code 0 = water in the cell",
            "rule": "min(static distance image, distance to the lake's cells); outside the patch the static image is exact",
            "bytes": dist_file.stat().st_size, "sha256": hashlib.sha256(dist_file.read_bytes()).hexdigest(), "cells_changed": changed,
        },
        "area_km2": round(area),
        "area_reference_km2": {"value": 361_000, "source": "Armitage, Bristow & Drake 2015 (early to mid-Holocene Mega-Chad area)"},
        "digest": sha256_bytes(json.dumps([LEVEL_M, [vars(e) for e in EPOCHS], vars(mask_patch), hashlib.sha256(mask_file.read_bytes()).hexdigest()]).encode())[:16],
        "sources": {
            "height": f"AWS Terrarium elevation tiles, zoom {st.ZOOM}, mean of {SAMPLES} x {SAMPLES} samples per 2.5' pixel (as site_terrain.py)",
            "level": "Drake & Bristow 2006, The Holocene 16: 901-911 (shorelines of palaeolake Chad; spill to the Benue at ~330 m); 329 m is the level terrain_image.py already used",
            "chronology": "Armitage, Bristow & Drake 2015, PNAS 112 (28): highstand by ~11.5 ka BP, held to ~5 ka BP; calendar BP from 1950",
            "freshwater": "assumed: the overflowing highstand lake is counted as fresh water (Natural Earth rivers and lakes stay as they are)",
            "static_water": "footsteps-web/public/water/water_distance.webp (Natural Earth 10m v5.1.2)",
        },
        "uncertainty": [
            "The shoreline is the 329 m contour of a modern 2.4 km DEM connected to Lake Chad: sediment, tectonics and DEM error since move it by km on flat ground.",
            "The highstand was not constant between ~11.5 and ~5 ka BP; fluctuations inside the window are not modelled.",
            "Dates are the published highstand window, not dated shorelines at every year.",
            "Whether the shore water was fresh, brackish or seasonal is assumed, not measured.",
            "Nothing is said outside the window: not dry, not wet.",
        ],
        "build": {"fill_window": list(FILL_WINDOW), "seed": list(SEED), "window_min_m": float(elev.min()), "window_max_m": float(elev.max())},
    }


def run(tiles: Path, out: Path, baseline_image: Path) -> dict:
    fetch_window_tiles(tiles)
    elev = window_elevation(tiles)
    lake = highstand_lake(elev)
    patch, mask = lake_patch(lake)
    mask_file = out / f"{NAME}_mask.webp"
    write_gray(mask_file, mask)
    # Distances come from the written mask (what the browser reads), against the committed static image.
    cells = lake_cells(patch, read_gray(mask_file) > 127)
    with Image.open(baseline_image) as im:
        baseline = np.asarray(im.convert("RGB"))[:, :, 0]
    dpatch, dcodes, changed = distance_patch(cells, baseline)
    dist_file = out / f"{NAME}_water.webp"
    write_gray(dist_file, dcodes)
    manifest = manifest_for(lake, patch, mask_file, dpatch, dist_file, changed, elev)
    (out / f"{NAME}.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"lake {int(lake.sum())} pixels, {manifest['area_km2']:,} km2; mask patch {patch} {mask_file.stat().st_size} B; "
          f"distance patch {dpatch} {dist_file.stat().st_size} B, {changed} cells nearer than the static image")
    return manifest


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the Mega-Chad highstand scenario (mask, distance patch, manifest)")
    ap.add_argument("--tiles", type=Path, default=TERRARIUM, help="where the Terrarium tiles are cached")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--baseline", type=Path, default=wd.OUT / "water_distance.webp", help="the static distance image the patch improves on")
    args = ap.parse_args(argv)
    run(args.tiles, args.out, args.baseline)


if __name__ == "__main__":
    sys.exit(main())
