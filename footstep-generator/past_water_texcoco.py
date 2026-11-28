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

Outputs (public/pastwater/)
  texcoco.json         manifest (version 2): one epoch, its mask, the distance patch, sources, uncertainty
  texcoco_mask.webp    lake mask on the 2.5' world grid, cropped to the lakes' box; red 255 = lake
  texcoco_water.webp   distance to fresh water on the HYDE 5' grid: min(static image, distance to the southern lakes)

    poetry run python footstep-generator/past_water_texcoco.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
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
        "digest": pw.sha256_bytes(json.dumps([LEVEL_M, vars(EPOCH), vars(patch), hashlib.sha256(mask_file.read_bytes()).hexdigest()]).encode())[:16],
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
