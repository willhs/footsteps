#!/usr/bin/env python3
"""
Tile the 500 m Blue Marble photo into a Web Mercator zoom pyramid for close terrain views.

The era images (terrain_image.py) are one 2048 x 1024 picture per terrain year, ~19.6 km per pixel.
They paint land as `photo x smooth era ratio`, so the ratio `era / photo-at-2048` is a smooth field and
`finer photo x ratio` is the same era picture with finer detail. This script writes the year-independent
half of that product; the browser multiplies in the year (footsteps-web/lib/terrainDetail.ts and
layers/TerrainDetailLayer.ts). One pyramid serves every terrain year, so scrubbing fetches no tiles.

Inputs (gitignored, see docs/ops/terrain-images.md):
- NASA Blue Marble Next Generation, July 2004, 500 m: eight 21600 x 21600 JPEGs
  world.200407.3x21600x21600.{A1..D2}.jpg (A = 180-90W, B = 90W-0, C = 0-90E, D = 90-180E; 1 = north).
- The 5400 x 2700 Blue Marble terrain_image.py reads, for ref.webp.
- Natural Earth 10m land and lakes v5.1.2 (public domain, pinned in site_terrain.py): today's land, for the alpha.

Output (OUT, default data/tiles/terrain/detail/):
- {z}/{x}/{y}.webp: 256 px lossy WebP tiles, z3..z8, XYZ (y down). RGB is the photo; alpha is today's land
  (Natural Earth 10m land minus lakes) ramped to 0 over ~8 z8 pixels (~4 km) inland of today's shore, so a past
  era's exposed shelf never shows today's sea or a hard modern coastline. Tiles that are all open ocean
  in the photo are not written (the era image is drawn there anyway).
- manifest.png: 256 x 256 greyscale, 255 where the z8 tile (x = column, y = row) exists. A lower tile
  exists when any z8 tile under it does.
- ref.webp: the 5400 x 2700 photo BOX-resized to 2048 x 1024, exactly terrain_image.blue_marble()'s
  `bm_hi`, so the browser's `era / ref` is the script's ratio.
- meta.json: zooms, tile counts and bytes per zoom.

Usage: python footstep-generator/terrain_tiles.py [--source DIR] [--out DIR] [--quality Q] [--workers N]
"""
import argparse
import json
import math
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "raw" / "bluemarble" / "500m"
BLUE_MARBLE_5400 = ROOT / "data" / "raw" / "bluemarble" / "world.200407.3x5400x2700.jpg"
OUT = ROOT / "data" / "tiles" / "terrain" / "detail"
NATURAL_EARTH = Path(os.environ.get("NATURAL_EARTH_DIR", ROOT / "data" / "raw" / "naturalearth"))

MIN_ZOOM, MAX_ZOOM = 3, 8
TILE = 256
BLOCK_ZOOM = 5  # work unit: one z5 tile = 8 x 8 z8 tiles, always inside one source file
SRC = 21600  # source tile size, px
SRC_DEG = 90.0
PX_PER_DEG = SRC / SRC_DEG  # 240
OCEAN = np.array([2, 5, 20], np.int16)  # the photo's flat open-ocean colour
OCEAN_TOLERANCE = 6
REF_W, REF_H = 2048, 1024  # terrain_image.py W, H
SHORE_RAMP_PX = 4.0  # Gaussian sigma (z8 px) of the inland ramp of today's land in the alpha


# --- pure helpers (tested) ---------------------------------------------------

def tile_lat(y: float, z: int) -> float:
    """Latitude (deg) of the top edge of XYZ tile row y (fractional rows give interior latitudes)."""
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))


def tile_lon(x: float, z: int) -> float:
    return x / 2 ** z * 360.0 - 180.0


def source_name(col: int, row: int) -> str:
    """Blue Marble 500 m file for quadrant column 0..3 (from 180W) and row 0 (north) or 1 (south)."""
    return f"world.200407.3x21600x21600.{'ABCD'[col]}{row + 1}.jpg"


def block_quadrant(bx: int, by: int, z: int = BLOCK_ZOOM) -> tuple[int, int]:
    """Which source quadrant a tile at zoom z (>= 2) lies in."""
    n = 2 ** z
    return bx * 4 // n, by * 2 // n


def is_uniform_ocean(tile: np.ndarray) -> bool:
    """True when every pixel is the photo's open-ocean colour (within a few levels of JPEG noise) and, for an
    RGBA tile, none of it is today's land."""
    if tile.shape[-1] == 4 and tile[..., 3].any():
        return False
    return bool(np.abs(tile[..., :3].astype(np.int16) - OCEAN).max() <= OCEAN_TOLERANCE)


def shore_ramp(land: np.ndarray, sigma: float = SHORE_RAMP_PX) -> np.ndarray:
    """Today's land (uint8 0/255) as 0 at and beyond the shore rising to 255 a few sigma inland."""
    blurred = np.asarray(Image.fromarray(land).filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float32) / 255
    return np.clip((2 * blurred - 1) * 255 + 0.5, 0, 255).astype(np.uint8)


def halve(a: np.ndarray) -> np.ndarray:
    """2 x 2 mean of an (H, W, C) uint8 image."""
    f = a.astype(np.uint16)
    s = f[0::2, 0::2] + f[1::2, 0::2] + f[0::2, 1::2] + f[1::2, 1::2]
    return ((s + 2) // 4).astype(np.uint8)


def has_tile(manifest: np.ndarray, z: int, x: int, y: int) -> bool:
    """manifest: (256, 256) bool of z8 tiles. A tile at zoom z exists if any z8 tile under it does."""
    k = 2 ** (MAX_ZOOM - z)
    return bool(manifest[y * k:(y + 1) * k, x * k:(x + 1) * k].any())


# --- reprojection ------------------------------------------------------------

def land_mask(paths: dict[str, Path], qcol: int, qrow: int) -> np.ndarray:
    """Today's land (Natural Earth 10m land minus lakes) on one source quadrant's 21600 x 21600 grid, uint8 0/255."""
    lon0, lat_top = -180.0 + qcol * SRC_DEG, 90.0 - qrow * SRC_DEG
    image = Image.new("L", (SRC, SRC), 0)
    draw = ImageDraw.Draw(image)

    def rings(name: str):
        for f in json.loads(paths[name].read_text())["features"]:
            g = f.get("geometry")
            if not g:
                continue
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
            for poly in polys:
                lons = [c[0] for c in poly[0]]
                lats = [c[1] for c in poly[0]]
                if max(lons) < lon0 or min(lons) > lon0 + SRC_DEG or max(lats) < lat_top - SRC_DEG or min(lats) > lat_top:
                    continue
                yield [[((c[0] - lon0) * PX_PER_DEG, (lat_top - c[1]) * PX_PER_DEG) for c in ring] for ring in poly]

    for name, fill in (("ne_10m_land", 255), ("ne_10m_lakes", 0)):
        for poly in rings(name):
            draw.polygon(poly[0], fill=fill)
            for hole in poly[1:]:
                draw.polygon(hole, fill=255 - fill)
    return np.asarray(image)


def block_pixels(src: np.ndarray, qcol: int, qrow: int, bx: int, by: int) -> np.ndarray:
    """The z5 block (bx, by) as a 2048 x 2048 Mercator image at z8 resolution, from its source quadrant
    (H, W, 3) RGB or (H, W) one channel."""
    n = 2 ** MAX_ZOOM * TILE  # z8 world size in px
    size = 2 ** (MAX_ZOOM - BLOCK_ZOOM) * TILE  # 2048
    # Rows: the latitude of each output pixel centre, then the source row (linear interpolation).
    y = by * size + np.arange(size) + 0.5
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y / n))))
    lat_top = 90.0 - qrow * SRC_DEG
    r = np.clip((lat_top - lat) * PX_PER_DEG - 0.5, 0, SRC - 1)
    r0 = int(np.floor(r.min()))
    r1 = min(SRC - 1, int(np.floor(r.max())) + 1)
    # Columns: longitude is linear in x, so one BOX resize of the block's 2700 source columns to 2048.
    lon0 = tile_lon(bx, BLOCK_ZOOM)
    c0 = int(round((lon0 - (-180.0 + qcol * SRC_DEG)) * PX_PER_DEG))
    width = int(round(360.0 / 2 ** BLOCK_ZOOM * PX_PER_DEG))  # 2700
    strip = Image.fromarray(src[r0:r1 + 1, c0:c0 + width])
    strip = np.asarray(strip.resize((size, r1 - r0 + 1), Image.BOX), dtype=np.float32)
    rr = r - r0
    i0 = np.floor(rr).astype(int)
    i1 = np.minimum(i0 + 1, strip.shape[0] - 1)
    t = (rr - i0).reshape((-1,) + (1,) * (strip.ndim - 1))
    out = strip[i0] * (1 - t) + strip[i1] * t
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def save_tile(out: Path, z: int, x: int, y: int, a: np.ndarray, quality: int) -> int:
    path = out / str(z) / str(x) / f"{y}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    # exact: keep the photo's colour under alpha 0 (today's sea), which the browser uses on a modern-level sea.
    Image.fromarray(a).save(path, "WEBP", quality=quality, alpha_quality=60, method=4, exact=True)
    return path.stat().st_size


def do_quadrant(args) -> dict:
    """Write z8..z5 tiles for one source quadrant. Returns its z5 mosaic pieces, manifest bits and bytes."""
    source, out, quality, qcol, qrow, ne_paths = args
    with Image.open(Path(source) / source_name(qcol, qrow)) as im:
        src = np.asarray(im.convert("RGB"))
    # Today's land, or (no Natural Earth given, tests only) land wherever the photo is not open ocean.
    land = land_mask(ne_paths, qcol, qrow) if ne_paths else None
    nb = 2 ** BLOCK_ZOOM
    k = 2 ** (MAX_ZOOM - BLOCK_ZOOM)  # z8 tiles per block side
    blocks: dict[tuple[int, int], np.ndarray] = {}
    bits: list[tuple[int, int]] = []
    tiles = {z: 0 for z in range(BLOCK_ZOOM, MAX_ZOOM + 1)}
    nbytes = {z: 0 for z in range(BLOCK_ZOOM, MAX_ZOOM + 1)}
    for by in range(qrow * nb // 2, (qrow + 1) * nb // 2):
        for bx in range(qcol * nb // 4, (qcol + 1) * nb // 4):
            rgb = block_pixels(src, qcol, qrow, bx, by)
            if land is not None:
                alpha = shore_ramp(block_pixels(land, qcol, qrow, bx, by))
            else:
                alpha = np.where(np.abs(rgb.astype(np.int16) - OCEAN).max(-1) > OCEAN_TOLERANCE, 255, 0).astype(np.uint8)
            img = np.dstack([rgb, alpha])
            have = np.zeros((k, k), bool)
            for j in range(k):
                for i in range(k):
                    t = img[j * TILE:(j + 1) * TILE, i * TILE:(i + 1) * TILE]
                    if is_uniform_ocean(t):
                        continue
                    have[j, i] = True
                    bits.append((bx * k + i, by * k + j))
                    nbytes[MAX_ZOOM] += save_tile(out, MAX_ZOOM, bx * k + i, by * k + j, t, quality)
                    tiles[MAX_ZOOM] += 1
            level = img
            for z in range(MAX_ZOOM - 1, BLOCK_ZOOM - 1, -1):
                level = halve(level)
                m = 2 ** (z - BLOCK_ZOOM)
                s = k // m
                for j in range(m):
                    for i in range(m):
                        if not have[j * s:(j + 1) * s, i * s:(i + 1) * s].any():
                            continue
                        t = level[j * TILE:(j + 1) * TILE, i * TILE:(i + 1) * TILE]
                        nbytes[z] += save_tile(out, z, bx * m + i, by * m + j, t, quality)
                        tiles[z] += 1
            blocks[(bx, by)] = level  # the z5 tile
    print(f"quadrant {source_name(qcol, qrow)}: {tiles[MAX_ZOOM]} z8 tiles", flush=True)
    return {"blocks": blocks, "bits": bits, "tiles": tiles, "bytes": nbytes}


def write_ref(out: Path, source_5400: Path) -> int:
    """The photo at the era image's grid, made exactly as terrain_image.blue_marble() makes bm_hi."""
    with Image.open(source_5400) as im:
        ref = im.convert("RGB").resize((REF_W, REF_H), Image.BOX)
    path = out / "ref.webp"
    ref.save(path, "WEBP", quality=95, method=6)
    return path.stat().st_size


def build(source: Path, out: Path, quality: int = 80, workers: int = 4, ref_source: Path | None = None,
          natural_earth: dict[str, Path] | None = None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    jobs = [(str(source), out, quality, c, r, natural_earth) for r in range(2) for c in range(4)]
    n5 = 2 ** BLOCK_ZOOM
    mosaic = np.zeros((n5 * TILE, n5 * TILE, 4), np.uint8)
    manifest = np.zeros((2 ** MAX_ZOOM, 2 ** MAX_ZOOM), bool)
    tiles = {z: 0 for z in range(MIN_ZOOM, MAX_ZOOM + 1)}
    nbytes = {z: 0 for z in range(MIN_ZOOM, MAX_ZOOM + 1)}
    with ProcessPoolExecutor(workers) as pool:
        results = map(do_quadrant, jobs) if workers <= 1 else pool.map(do_quadrant, jobs)
        for res in results:
            for (bx, by), a in res["blocks"].items():
                mosaic[by * TILE:(by + 1) * TILE, bx * TILE:(bx + 1) * TILE] = a
            for x, y in res["bits"]:
                manifest[y, x] = True
            for z in res["tiles"]:
                tiles[z] += res["tiles"][z]
                nbytes[z] += res["bytes"][z]
    level = mosaic
    for z in range(BLOCK_ZOOM - 1, MIN_ZOOM - 1, -1):
        level = halve(level)
        for y in range(2 ** z):
            for x in range(2 ** z):
                if has_tile(manifest, z, x, y):
                    t = level[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE]
                    nbytes[z] += save_tile(out, z, x, y, t, quality)
                    tiles[z] += 1
    Image.fromarray((manifest * 255).astype(np.uint8)).save(out / "manifest.png", optimize=True)
    ref_bytes = write_ref(out, ref_source or BLUE_MARBLE_5400)
    meta = {
        "version": 2,
        "minZoom": MIN_ZOOM,
        "maxZoom": MAX_ZOOM,
        "manifestZoom": MAX_ZOOM,
        "tileSize": TILE,
        "quality": quality,
        "source": "NASA Blue Marble Next Generation, July 2004, 500 m (world.200407.3x21600x21600)",
        "tiles": {str(z): tiles[z] for z in tiles},
        "bytes": {str(z): nbytes[z] for z in nbytes},
        "refBytes": ref_bytes,
        "manifestBytes": (out / "manifest.png").stat().st_size,
        "totalBytes": sum(nbytes.values()) + ref_bytes + (out / "manifest.png").stat().st_size,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    from site_terrain import fetch_natural_earth  # the same pinned files the site ranking uses

    meta = build(args.source, args.out, args.quality, args.workers, natural_earth=fetch_natural_earth(NATURAL_EARTH))
    for z in range(MIN_ZOOM, MAX_ZOOM + 1):
        print(f"z{z}: {meta['tiles'][str(z)]} tiles, {meta['bytes'][str(z)] / 1e6:.1f} MB")
    print(f"total {meta['totalBytes'] / 1e6:.1f} MB")
