"""The lakes of the Basin of Mexico before the colonial drainage, modelled, for `?pastwater=1` (docs/ops/past-water.md).

Without this scenario the app's water is today's (Natural Earth): the Basin of Mexico is dry land, so at 1400 CE the groups of the
Valley's towns stand on the bed of Lake Texcoco and the nearest fresh water is a river. Five shallow lakes (Zumpango, Xaltocan,
Texcoco, Xochimilco, Chalco) filled the basin floor until the Spanish drainage that began in 1607 (the Desagüe of Huehuetoca).

What is modelled
  * LAKE: every 2.5' pixel joined, through pixels at or below LEVEL_M, to a seed in the middle of Lake Texcoco (SEED), inside
    FILL_WINDOW; the same 4-connected flood of the same Terrarium zoom-6 relief (mean of 3 x 3 samples per pixel) as Mega-Chad
    (past_water.py). The basin is closed (endorheic until the drainage), so a contour fill is the right shape of model.
  * LEVEL: 2270 m on this smoothed DEM, CALIBRATED, not a surveyed shoreline. The lakes stood at about 2236-2240 m, but the
    zoom-6 relief averaged to 2.5' lifts the narrow lake floor by tens of metres near the hills, and at 2240 m the fill holds
    only a few pixels. 2270 m is the lowest level at which the fill reaches all five lakes; it gives ~1,600 km2, inside the
    ~1,000-2,000 km2 the lake system is usually given at contact (it varied with the season and the year). AREA_RANGE asserts it.
  * ISLANDS: Tenochtitlan and Tlatelolco stood on islands in the western lake. Their pixels (ISLANDS) are carved out of the mask,
    so the city keeps its people and its mark; the causeways and chinampas are not modelled.
  * DATES: one epoch, 4,000 BP to 350 BP (-2050 .. 1600 CE): Formative villages on the shore to the eve of the drainage. The
    lakes are older; levels before ~4 ka are not claimed. After 1600 the lakes shrank over three centuries (largely drained by
    the Gran Canal, 1900); that is not modelled, so the scenario is inactive then, which is not the same as dry.
  * WATER: Texcoco, the lowest lake, was saline; Xochimilco and Chalco, spring-fed in the south, were fresh, as Zumpango and
    Xaltocan were brackish. The freshwater-distance patch counts only the lake pixels south of FRESH_SOUTH_OF (Xochimilco and
    Chalco); the whole mask keeps groups out.

  * SHORE (close-up only): the 2.5' mask is ~4.6 km a pixel, so in the close-up its edge read as straight diagonal bands, and the
    plane clipped to a modern DEM left Mexico City's buildings and fill standing in the water as fragments. The close-up draws a
    finer shore instead: Terrarium zoom 11 sampled on a 7.5" grid, smoothed (~0.5 km), flooded from SEED at SHORE_LEVEL_M
    (calibrated to reach all five lakes, SHORE_AREA_RANGE), the islands carved as discs of their size, kept within a pixel of
    the coarse mask. Its water is flat at SHORE_LEVEL_M, not clipped to the DEM.

Outputs (public/pastwater/)
  texcoco.json         manifest (version 2): one epoch, its mask, the distance patch, sources, uncertainty
  texcoco_mask.webp    lake mask on the 2.5' world grid, cropped to the lakes' box; red 255 = lake
  texcoco_shore.webp   the close-up's shore on the 7.5" world grid (SHORE_SCALE x the 2.5' grid); red 255 = lake
  texcoco_water.webp   distance to fresh water on the HYDE 5' grid: min(static image, distance to the southern lakes)

    poetry run python footstep-generator/past_water_texcoco.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

import past_water as pw
import water_distance as wd

NAME = "texcoco"
FILL_WINDOW = (18.8, 20.6, -99.8, -98.2)  # south, north, west, east (degrees): round the Basin of Mexico, clear of its rim
SEED = (19.45, -99.0)  # lat, lon: the middle of Lake Texcoco (the Texcoco bed is the basin's floor today)
LEVEL_M = 2270.0
AREA_RANGE = (1_000, 2_000)  # km2 the fill must give: the lake system's usual range at contact
ISLANDS = ((19.4326, -99.1332, "Tenochtitlan"), (19.4515, -99.1370, "Tlatelolco"))  # lat, lon, name: carved out of the lake
FRESH_SOUTH_OF = 19.34  # lake pixels south of this latitude (Xochimilco, Chalco) are fresh; the rest brackish or saline
MARGIN = 2  # pixels of margin round the lakes in the mask patch
EPOCH = pw.Epoch(6, "before the drainage", 4_000, 350)

SHORE_ZOOM = 11  # Terrarium zoom of the close-up shore (~75 m pixels here)
SHORE_SCALE = 20  # shore grid pixels per 2.5' pixel: 7.5" (~230 m)
SHORE_WINDOW = (18.95, 20.0, -99.45, -98.70)  # south, north, west, east: the basin floor
SHORE_FLOOR_M = 2225.0  # pits below this (quarries, DEM holes) are raised to it before smoothing
SHORE_SMOOTH_PX = 2  # box radius, three passes: ~0.5 km, enough to flatten the city's buildings and fill
SHORE_LEVEL_M = 2250.0  # lowest level at which the smoothed fill reaches all five lakes (2245 m misses Zumpango); calibrated
SHORE_AREA_RANGE = (1_000, 1_600)
SHORE_ISLAND_KM = {"Tenochtitlan": 1.6, "Tlatelolco": 1.0}  # disc radii: together ~11 km2, near the island's ~13 km2 by 1519
SHORE_LAKES = {"Zumpango": (19.80, -99.12), "Xaltocan": (19.70, -99.05), "Texcoco": (19.45, -99.0), "Xochimilco": (19.27, -99.09), "Chalco": (19.25, -98.95)}


def lake(elev: np.ndarray) -> np.ndarray:
    """The lakes inside FILL_WINDOW (bool), islands carved out. Raises if the flood reaches the window's edge or the area leaves AREA_RANGE."""
    r0, _, c0, _ = pw.window_pixels(FILL_WINDOW)
    seed = (int((90 - SEED[0]) / pw.PIXEL_DEG) - r0, int((SEED[1] + 180) / pw.PIXEL_DEG) - c0)
    wet = pw.connected_below(elev, LEVEL_M, seed)
    if wet[0].any() or wet[-1].any() or wet[:, 0].any() or wet[:, -1].any():
        raise ValueError("the flood reaches the fill window's edge: the lake leaked out of the basin")
    for lat, lon, _ in ISLANDS:
        wet[int((90 - lat) / pw.PIXEL_DEG) - r0, int((lon + 180) / pw.PIXEL_DEG) - c0] = False
    area = float(pw.pixel_area_km2(np.nonzero(wet)[0] + r0).sum())
    if not AREA_RANGE[0] <= area <= AREA_RANGE[1]:
        raise ValueError(f"the lakes cover {area:.0f} km2, outside {AREA_RANGE}")
    return wet


def crop(wet: np.ndarray) -> tuple[pw.Patch, np.ndarray]:
    """The lakes cropped to their box plus MARGIN, in 2.5' world coordinates."""
    r0, _, c0, _ = pw.window_pixels(FILL_WINDOW)
    rows, cols = np.nonzero(wet)
    top, bottom, left, right = rows.min() - MARGIN, rows.max() + MARGIN + 1, cols.min() - MARGIN, cols.max() + MARGIN + 1
    return pw.Patch(c0 + int(left), r0 + int(top), int(right - left), int(bottom - top)), wet[top:bottom, left:right]


def fresh_part(patch: pw.Patch, wet: np.ndarray) -> np.ndarray:
    """The mask's fresh lakes: its pixels south of FRESH_SOUTH_OF."""
    lat = 90 - (patch.y0 + np.arange(patch.height) + 0.5) * pw.PIXEL_DEG
    return wet & (lat < FRESH_SOUTH_OF)[:, None]


def _shore_tile(folder: Path, x: int, y: int) -> np.ndarray:
    path = folder / f"z{SHORE_ZOOM}" / f"{x}_{y}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(pw.st.TILE_URL.format(z=SHORE_ZOOM, x=x, y=y), timeout=60) as r:
            path.write_bytes(r.read())
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB")).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def shore_elevation(folder: Path) -> tuple[np.ndarray, int, int]:
    """Terrarium zoom-SHORE_ZOOM metres sampled at the centres of the shore grid inside SHORE_WINDOW, and the grid's column, row origin."""
    south, north, west, east = SHORE_WINDOW
    step = pw.PIXEL_DEG / SHORE_SCALE
    c0, c1 = math.floor((west + 180) / step), math.ceil((east + 180) / step)
    r0, r1 = math.floor((90 - north) / step), math.ceil((90 - south) / step)
    lon = (np.arange(c0, c1) + 0.5) * step - 180
    lat = 90 - (np.arange(r0, r1) + 0.5) * step
    n = 2**SHORE_ZOOM
    fx = (lon + 180) / 360 * n
    fy = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    tx0, tx1, ty0, ty1 = int(fx.min()), int(fx.max()), int(fy.min()), int(fy.max())
    mosaic = np.zeros((256 * (ty1 - ty0 + 1), 256 * (tx1 - tx0 + 1)))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = _shore_tile(folder, tx, ty)
    rows = ((fy - ty0) * 256).astype(int)
    cols = ((fx - tx0) * 256).astype(int)
    return mosaic[rows[:, None], cols[None, :]], c0, r0


def _box_blur(a: np.ndarray, r: int) -> np.ndarray:
    k = 2 * r + 1
    p = np.pad(a, r, mode="edge")
    c = np.vstack([np.zeros((1, p.shape[1])), p.cumsum(0)])
    a = (c[k:] - c[:-k]) / k
    c = np.hstack([np.zeros((a.shape[0], 1)), a.cumsum(1)])
    return (c[:, k:] - c[:, :-k]) / k


def shore(elev: np.ndarray, c0: int, r0: int, coarse: pw.Patch, coarse_wet: np.ndarray) -> tuple[np.ndarray, float]:
    """The close-up's lakes on the shore grid (bool) and their area (km2). Raises if a lake is missed or the area leaves SHORE_AREA_RANGE."""
    step = pw.PIXEL_DEG / SHORE_SCALE
    smooth = np.maximum(elev, SHORE_FLOOR_M)
    for _ in range(3):
        smooth = _box_blur(smooth, SHORE_SMOOTH_PX)
    lat = 90 - (np.arange(r0, r0 + elev.shape[0]) + 0.5) * step
    lon = (np.arange(c0, c0 + elev.shape[1]) + 0.5) * step - 180
    at = lambda la, lo: (int((90 - la) / step) - r0, int((lo + 180) / step) - c0)  # noqa: E731
    below = smooth <= SHORE_LEVEL_M
    wet = np.zeros_like(below)
    queue = deque([at(*SEED)])
    wet[queue[0]] = True
    while queue:
        r, c = queue.popleft()
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < wet.shape[0] and 0 <= cc < wet.shape[1] and below[rr, cc] and not wet[rr, cc]:
                wet[rr, cc] = True
                queue.append((rr, cc))
    if wet[0].any() or wet[-1].any() or wet[:, 0].any() or wet[:, -1].any():
        raise ValueError("the shore flood reaches its window's edge")
    missed = [name for name, (la, lo) in SHORE_LAKES.items() if not wet[at(la, lo)]]
    if missed:
        raise ValueError(f"the shore flood misses {missed}")
    # Within a pixel of the coarse mask, so the close-up never draws water where groups are placed as on dry land far from it.
    cr = (r0 + np.arange(elev.shape[0])) // SHORE_SCALE - coarse.y0
    cc = (c0 + np.arange(elev.shape[1])) // SHORE_SCALE - coarse.x0
    near = np.zeros((coarse.height + 2, coarse.width + 2), dtype=bool)
    for dy in range(3):
        for dx in range(3):
            near[dy:dy + coarse.height, dx:dx + coarse.width] |= coarse_wet
    inside = (cr[:, None] >= -1) & (cr[:, None] <= coarse.height) & (cc[None, :] >= -1) & (cc[None, :] <= coarse.width)
    wet &= inside & near[np.clip(cr + 1, 0, coarse.height + 1)[:, None], np.clip(cc + 1, 0, coarse.width + 1)[None, :]]
    km_lat = 6371.0 * math.pi / 180
    for la, lo, name in ISLANDS:
        d = np.hypot((lat[:, None] - la) * km_lat, (lon[None, :] - lo) * km_lat * math.cos(math.radians(la)))
        wet &= d > SHORE_ISLAND_KM[name]
    area = float(((math.radians(step) * 6371.0) ** 2 * np.cos(np.radians(lat)))[:, None].repeat(wet.shape[1], 1)[wet].sum())
    if not SHORE_AREA_RANGE[0] <= area <= SHORE_AREA_RANGE[1]:
        raise ValueError(f"the shore lakes cover {area:.0f} km2, outside {SHORE_AREA_RANGE}")
    return wet, area


def run(tiles: Path, out: Path, baseline_image: Path) -> dict:
    pw.fetch_window_tiles(tiles, FILL_WINDOW)
    elev = pw.window_elevation(tiles, FILL_WINDOW)
    wet = lake(elev)
    patch, mask = crop(wet)
    mask_file = out / f"{NAME}_mask.webp"
    pw.write_gray(mask_file, (mask * 255).astype(np.uint8))
    written = pw.read_gray(mask_file) > 127
    with Image.open(baseline_image) as im:
        baseline = np.asarray(im.convert("RGB"))[:, :, 0]
    dpatch, dcodes, changed = pw.distance_patch(pw.lake_cells(patch, fresh_part(patch, written)), baseline)
    dist_file = out / f"{NAME}_water.webp"
    pw.write_gray(dist_file, dcodes)
    shore_elev, sc0, sr0 = shore_elevation(tiles)
    shore_wet, shore_area = shore(shore_elev, sc0, sr0, patch, written)
    rows, cols = np.nonzero(shore_wet)
    top, bottom, left, right = rows.min() - 1, rows.max() + 2, cols.min() - 1, cols.max() + 2
    shore_patch = pw.Patch(sc0 + int(left), sr0 + int(top), int(right - left), int(bottom - top))
    shore_file = out / f"{NAME}_shore.webp"
    pw.write_gray(shore_file, (shore_wet[top:bottom, left:right] * 255).astype(np.uint8))
    area = round(float(pw.pixel_area_km2(np.nonzero(written)[0] + patch.y0).sum()))
    fresh_area = round(float(pw.pixel_area_km2(np.nonzero(fresh_part(patch, written))[0] + patch.y0).sum()))
    manifest = {
        "id": NAME,
        "version": pw.SCHEMA_VERSION,
        "label": "Lakes of the Basin of Mexico (modelled, experimental)",
        "short": "Basin of Mexico lakes",
        "summary": "The five lakes of the Basin of Mexico (Zumpango, Xaltocan, Texcoco, Xochimilco, Chalco) before the colonial drainage: "
                   "the basin-connected 2270 m contour of a smoothed modern DEM, calibrated to the lakes' area, 4 ka BP to 1600 CE, modelled; "
                   "Tenochtitlan's island is kept dry; only the southern lakes count as fresh water.",
        "evidence": "modelled",
        "flag": "?pastwater=1",
        "level_m": LEVEL_M,
        "datum": "metres above the geoid on Terrarium zoom 6 averaged to 2.5' (smoothed: the level is calibrated to area on this surface, "
                 "not the lakes' surveyed ~2236-2240 m)",
        "epochs": [{
            **pw.epoch_dates(EPOCH),
            "state": "the lakes at their calibrated level, held through the window; seasonal and yearly swings not modelled",
            "water": "brackish to saline (Texcoco, Xaltocan, Zumpango); fresh (Xochimilco, Chalco): only the southern lakes give fresh water",
            "paint": "lake",
            "level": {"kind": "plane", "m": LEVEL_M, "clip_to_dem": True},
            "mask": {**pw.mask_meta(mask_file, patch), "red": "255 = lake, 0 = not", "lake_pixels": int(written.sum()), "area_km2": area},
            "shore": {"file": shore_file.name, **vars(shore_patch), "scale": SHORE_SCALE, "m": SHORE_LEVEL_M,
                      "grid": f"{pw.NX * SHORE_SCALE} x {pw.NY * SHORE_SCALE} world pixels of 7.5\"; x0, y0 = column, row of the patch's north-west pixel",
                      "bytes": shore_file.stat().st_size, "sha256": hashlib.sha256(shore_file.read_bytes()).hexdigest(),
                      "red": "255 = lake, 0 = not", "area_km2": round(shore_area),
                      "rule": f"close-up only: Terrarium zoom {SHORE_ZOOM}, smoothed ~0.5 km, flooded from the seed at {SHORE_LEVEL_M:g} m, "
                              "islands carved as discs, within a pixel of the mask; flat water at that level, not clipped to the DEM"},
            "distance": {**pw.distance_meta(dist_file, dpatch, changed),
                         "rule": f"min(static distance image, distance to the lake cells south of {FRESH_SOUTH_OF} N); outside the patch the static image is exact",
                         "fresh_area_km2": fresh_area},
        }],
        "outside_epochs": "scenario inactive: the geography is unknown at that date, which is not the same as a dry basin; "
                          "the app draws and places as it does without the flag",
        "area_km2": area,
        "area_reference_km2": {"range": list(AREA_RANGE), "source": "the lake system's area at contact as usually given (about 1,000-2,000 km2, "
                               "varying with season and year; e.g. Sanders, Parsons & Santley 1979, The Basin of Mexico)"},
        "islands": [{"name": n, "lat": la, "lon": lo} for la, lo, n in ISLANDS],
        "digest": pw.sha256_bytes(json.dumps([LEVEL_M, vars(EPOCH), vars(patch), hashlib.sha256(mask_file.read_bytes()).hexdigest(),
                                             SHORE_LEVEL_M, hashlib.sha256(shore_file.read_bytes()).hexdigest()]).encode())[:16],
        "licence": "derived from AWS Terrarium elevation tiles (public-domain and openly licensed DEMs, attribution per the tiles' notice)",
        "sources": {
            "height": f"AWS Terrarium elevation tiles, zoom {pw.st.ZOOM}, mean of {pw.SAMPLES} x {pw.SAMPLES} samples per 2.5' pixel (as site_terrain.py)",
            "level": "calibrated: the lowest level at which the fill reaches all five lakes, checked against the lakes' usual area; "
                     "the surveyed lake surface was ~2236-2240 m",
            "chronology": "lakes present through the Holocene; held from 4 ka BP (Formative shore villages) to 1600 CE, before the Desagüe "
                          "of Huehuetoca begun in 1607",
            "freshwater": "Texcoco saline, Xochimilco and Chalco fresh (spring-fed), Zumpango and Xaltocan brackish; Nezahualcoyotl's dike "
                          "(~1449) separated fresh from salt water in the western lake",
            "static_water": "footsteps-web/public/water/water_distance.webp (Natural Earth 10m v5.1.2)",
        },
        "uncertainty": [
            "The shoreline is a contour of a 2.4 km DEM averaged to 4.6 km, calibrated to area: the shape is the basin floor's, not a mapped shore.",
            "The close-up's shore is a contour of today's smoothed ground at 2250 m: the city has sunk up to ~10 m since 1900 and the lakebed was filled, so it is a sketch of the shore, not a survey.",
            "The lakes rose and fell with the seasons and the years; one level is held for 3,650 years.",
            "Only Tenochtitlan and Tlatelolco are kept dry; other islands (Xaltocan, Mixquic), the causeways and the chinampas are not modelled.",
            "Which parts were fresh is simplified to a latitude line south of the city.",
            "Nothing is said before 4 ka BP or after 1600: not dry, not wet.",
        ],
        "build": {"fill_window": list(FILL_WINDOW), "seed": list(SEED), "window_min_m": float(elev.min()), "window_max_m": float(elev.max())},
        # The Earth picture is not rebaked for this lake (one 1,600 km2 lake is a few pixels of the globe); the close-up draws it.
        "terrain": {"years": [], "path": "/terrain/pastwater/earth_{year}.webp (terrain_image.py --pastwater); other years use the ordinary images"},
    }
    (out / f"{NAME}.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"lakes {int(written.sum())} pixels, {area:,} km2 ({fresh_area:,} fresh); mask {patch} {mask_file.stat().st_size} B; "
          f"distance {dpatch} {dist_file.stat().st_size} B, {changed} cells nearer")
    return manifest


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the Basin of Mexico lakes scenario (mask, distance patch, manifest)")
    ap.add_argument("--tiles", type=Path, default=pw.TERRARIUM, help="where the Terrarium tiles are cached")
    ap.add_argument("--out", type=Path, default=pw.OUT)
    ap.add_argument("--baseline", type=Path, default=wd.OUT / "water_distance.webp", help="the static distance image the patch improves on")
    args = ap.parse_args(argv)
    run(args.tiles, args.out, args.baseline)


if __name__ == "__main__":
    sys.exit(main())
