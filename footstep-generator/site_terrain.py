"""Terrain for placing groups: how far below today's sea each 2.5' pixel is, how steep it is, whether it is a lake.

A year-independent model input for `?settlements=1` (research 0012, part 2). The app picks a year's sea level and asks, for any
point, "is this sea?" (depth below today's sea > the year's drop) and "is this flat?" (slope class). See docs/ops/site-terrain.md.

Inputs
  * AWS Terrarium elevation tiles at zoom 6 (about 2.4 km a pixel at the equator; Mapzen/AWS terrain tiles, public data
    from SRTM, GMTED and ETOPO1 among others, https://registry.opendata.aws/terrain-tiles/): relief and slope.
  * Natural Earth 10m land and lakes v5.1.2 (public domain, pinned sha256): which pixels are land today, which are lake.

Why this and not the Terrarium tiles at run time: the grid worker builds groups for every populated cell in the world each
year (about 100,000 cells in 1900 CE), so it cannot fetch a tile per cell. One baked, coarser image is read once.

Grid: 2.5' (8640 x 4320), row 0 = north (90 N), column 0 = 180 W, value at the pixel centre; each HYDE 5' cell is 2 x 2 pixels.
Pixel: lossless WebP, RGB; the browser reads red and green.
  R  depth of the pixel's sea: 0 when the pixel is all land (today's coast, Natural Earth 10m). Otherwise metres below today's
     sea level rounded UP to a multiple of DEPTH_STEP (4, 8, ... 132), 255 = DEEP_FROM (136 m) or more. At a year's sea level
     `drop` m below today's, a pixel's sea is dry land when depth <= drop; otherwise the sea share below applies.
  G  bits 4-7: share of the pixel that is sea today, 0..15 (0 = land, 15 = all sea; Natural Earth land drawn at 4x and counted);
     bit 3: lake (Natural Earth 10m lakes, every one including saline; half the pixel or more);
     bits 0-2: slope class 0..7 (SLOPE_UPPER_DEG below; mean slope of the Terrarium pixels inside it, then a 3 x 3 median)
  B  0 (kept so the file stays an ordinary RGB image)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
NATURAL_EARTH = Path(os.environ.get("NATURAL_EARTH_DIR", RAW / "naturalearth"))
TERRARIUM = Path(os.environ.get("TERRARIUM_DIR", RAW / "terrarium"))
OUT = ROOT / "footsteps-web" / "public" / "sites"
NAME = "site_terrain"

NE_VERSION = "v5.1.2"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/" + NE_VERSION + "/geojson/{name}.geojson"
NE_FILES = {
    "ne_10m_land": "1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416",
    "ne_10m_lakes": "2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9",
}
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

NX, NY = 8640, 4320  # 2.5'
PIXEL_DEG = 360 / NX
ZOOM = 6
TILES = 1 << ZOOM
MOSAIC = TILES * 256  # 16384
MAX_LAT = 85.0511287798  # Web Mercator's edge
SAMPLES = 3  # SAMPLES x SAMPLES Terrarium pixels averaged per output pixel
DEPTH_STEP = 4  # metres; rounding up keeps a shore pixel sea a little longer, never shorter
DEEP_FROM = 136  # deeper than the lowest sea level in the climate series (-134 m); codes 255
DEEP = 255
# Upper bound (degrees, inclusive) of slope classes 0..6; class 7 is steeper than the last. Mean slope over ~2.4 km Terrarium
# pixels: a river plain reads under 0.5, rolling country 1-4, mountains over 7. Eight classes and a median filter keep the image
# near 2.3 MB: sixteen unfiltered classes were 4.6 MB, nearly all of it speckle.
SLOPE_UPPER_DEG = [0.2, 0.5, 1.0, 2.0, 4.0, 7.5, 14.0]
LAND_SS = 4  # land is drawn at 0.625' and counted per 2.5' pixel, so a coast pixel knows how much of it is sea
SEA_LEVELS = 15  # sea share is stored in 4 bits, 0..15


# --- encoding -------------------------------------------------------------------------------------------------------

def slope_class(deg: np.ndarray) -> np.ndarray:
    return np.searchsorted(np.asarray(SLOPE_UPPER_DEG), np.asarray(deg), side="left").astype(np.uint8)


def depth_code(elev_m: np.ndarray, land: np.ndarray) -> np.ndarray:
    """0 on land; on sea, metres below today's sea level rounded up to DEPTH_STEP (at least one step), 255 from DEEP_FROM down."""
    metres = np.maximum(np.rint(-np.asarray(elev_m, dtype=np.float64)), 1)
    stepped = np.ceil(metres / DEPTH_STEP) * DEPTH_STEP
    return np.where(land, 0, np.where(stepped >= DEEP_FROM, DEEP, stepped)).astype(np.uint8)


def median3(a: np.ndarray) -> np.ndarray:
    """3 x 3 median (edge-padded; longitude is not wrapped, one column does not matter)."""
    p = np.pad(a, 1, mode="edge")
    stack = np.stack([p[i:i + a.shape[0], j:j + a.shape[1]] for i in range(3) for j in range(3)])
    return np.median(stack, axis=0).astype(a.dtype)


def decode(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """(depth_m, sea share 0..1, slope class, lake) as the browser reads them (red, green)."""
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB"))
    green = a[:, :, 1]
    return a[:, :, 0], (green >> 4) / SEA_LEVELS, green & 7, (green & 8) > 0


# --- inputs ---------------------------------------------------------------------------------------------------------

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch_natural_earth(raw: Path = NATURAL_EARTH) -> dict[str, Path]:
    """Download the pinned Natural Earth files into `raw` (not committed), check each sha256. Idempotent."""
    raw.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, want in NE_FILES.items():
        path = raw / f"{name}.geojson"
        if not path.exists() or sha256(path) != want:
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(NE_URL.format(name=name), tmp)
            got = sha256(tmp)
            if got != want:
                tmp.unlink()
                raise ValueError(f"{name}: sha256 {got} is not the pinned {want}")
            tmp.replace(path)
        paths[name] = path
    return paths


def _get_tile(args: tuple[int, int, Path]) -> Path:
    x, y, folder = args
    path = folder / f"{ZOOM}_{x}_{y}.png"
    if path.exists() and path.stat().st_size > 0:
        return path
    for attempt in range(4):
        try:
            with urllib.request.urlopen(TILE_URL.format(z=ZOOM, x=x, y=y), timeout=60) as r:
                data = r.read()
            tmp = path.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(path)
            return path
        except Exception:  # noqa: BLE001 - retry any network error, then fail loudly
            if attempt == 3:
                raise
    raise AssertionError("unreachable")


def fetch_tiles(folder: Path = TERRARIUM, workers: int = 16) -> list[Path]:
    """All 4,096 zoom-6 Terrarium tiles into `folder` (not committed). Idempotent."""
    folder.mkdir(parents=True, exist_ok=True)
    jobs = [(x, y, folder) for y in range(TILES) for x in range(TILES)]
    with ThreadPoolExecutor(workers) as pool:
        return list(pool.map(_get_tile, jobs))


def mosaic(folder: Path = TERRARIUM) -> np.ndarray:
    """Terrarium metres for the whole world at zoom 6, int16, 16384 x 16384."""
    out = np.empty((MOSAIC, MOSAIC), dtype=np.int16)
    for y in range(TILES):
        for x in range(TILES):
            with Image.open(folder / f"{ZOOM}_{x}_{y}.png") as im:
                a = np.asarray(im.convert("RGB")).astype(np.float32)
            h = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
            out[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = np.rint(h).astype(np.int16)
    return out


# --- derived --------------------------------------------------------------------------------------------------------

def mercator_row(lat: np.ndarray) -> np.ndarray:
    """Fractional Terrarium row (0 = 85.05 N) of a latitude, clamped to the tiles."""
    lat = np.clip(np.asarray(lat, dtype=np.float64), -MAX_LAT, MAX_LAT)
    y = 0.5 - np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) / (2 * np.pi)
    return y * MOSAIC


def mosaic_slope_deg(z: np.ndarray, chunk: int = 1024) -> np.ndarray:
    """Slope in degrees (0.125 steps, capped at 31.9) of every mosaic pixel, as uint8 = deg * 8. Central differences; the
    ground size of a Terrarium pixel is EQUATOR_PIXEL_M * cos(lat) in both directions (Web Mercator). `z` is square
    (MOSAIC pixels across for the real thing)."""
    n = z.shape[0]
    metres_at_equator = 40_075_016.686 / n
    out = np.empty(z.shape, dtype=np.uint8)
    for r0 in range(0, n, chunk):
        r1 = min(n, r0 + chunk)
        lo, hi = max(0, r0 - 1), min(n, r1 + 1)
        block = z[lo:hi].astype(np.float32)
        gx = (np.roll(block, -1, axis=1) - np.roll(block, 1, axis=1)) / 2
        gy = np.gradient(block, axis=0)
        rows = np.arange(r0, r1)
        lat = np.degrees(2 * np.arctan(np.exp(np.pi * (1 - 2 * (rows + 0.5) / n))) - np.pi / 2)
        metres = (metres_at_equator * np.cos(np.radians(lat))).astype(np.float32)[:, None]
        sel = slice(r0 - lo, r0 - lo + (r1 - r0))
        deg = np.degrees(np.arctan(np.hypot(gx[sel], gy[sel]) / metres))
        out[r0:r1] = np.clip(np.rint(deg * 8), 0, 255).astype(np.uint8)
    return out


def resample(z: np.ndarray, slope8: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(mean metres, mean slope degrees) on the 2.5' grid: SAMPLES x SAMPLES nearest Terrarium pixels inside each pixel."""
    elev = np.empty((NY, NX), dtype=np.float32)
    slope = np.empty((NY, NX), dtype=np.float32)
    s = (np.arange(SAMPLES) + 0.5) / SAMPLES  # positions inside a pixel
    col_f = ((np.arange(NX)[:, None] + s[None, :]) / NX).ravel() * MOSAIC  # longitude is linear in x
    cols = np.minimum(col_f.astype(np.int64), MOSAIC - 1)
    for j in range(NY):
        lat = 90 - (j + s) * PIXEL_DEG
        rows = np.minimum(mercator_row(lat).astype(np.int64), MOSAIC - 1)
        e = z[rows][:, cols].astype(np.float32).reshape(SAMPLES, NX, SAMPLES)
        d = slope8[rows][:, cols].astype(np.float32).reshape(SAMPLES, NX, SAMPLES)
        elev[j] = e.mean(axis=(0, 2))
        slope[j] = d.mean(axis=(0, 2)) / 8
    return elev, slope


def _draw_polygons(geojson: Path, width: int, height: int) -> np.ndarray:
    """Boolean raster of the polygons' area (holes cut out), pixel-edge exact at width x height."""
    image = Image.new("1", (width, height))
    draw = ImageDraw.Draw(image)
    px = lambda c: ((c[0] + 180) / 360 * width, (90 - c[1]) / 180 * height)  # noqa: E731
    for f in json.loads(geojson.read_text())["features"]:
        g = f.get("geometry")
        if not g:
            continue
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for rings in polys:
            draw.polygon([px(c) for c in rings[0]], fill=1)
            for hole in rings[1:]:
                draw.polygon([px(c) for c in hole], fill=0)
    return np.asarray(image)


def sea_share(raw: Path = NATURAL_EARTH) -> np.ndarray:
    """Share of each 2.5' pixel that is NOT Natural Earth 10m land, 0..1."""
    big = _draw_polygons(raw / "ne_10m_land.geojson", NX * LAND_SS, NY * LAND_SS)
    land = big.reshape(NY, LAND_SS, NX, LAND_SS).sum(axis=(1, 3), dtype=np.uint16)
    return 1.0 - land / (LAND_SS * LAND_SS)


def lake_mask(raw: Path = NATURAL_EARTH) -> np.ndarray:
    """True where at least half of the 2.5' pixel is a Natural Earth 10m lake."""
    big = _draw_polygons(raw / "ne_10m_lakes.geojson", NX * LAND_SS, NY * LAND_SS)
    return big.reshape(NY, LAND_SS, NX, LAND_SS).sum(axis=(1, 3), dtype=np.uint16) * 2 >= LAND_SS * LAND_SS


def pack(sea: np.ndarray, lake: np.ndarray, slope: np.ndarray) -> np.ndarray:
    """The green byte: sea share (4 bits) | lake | slope class (3 bits)."""
    share = np.rint(np.clip(sea, 0, 1) * SEA_LEVELS).astype(np.uint8)
    return ((share << 4) | (lake.astype(np.uint8) << 3) | slope.astype(np.uint8)).astype(np.uint8)


def build(elev: np.ndarray, slope_deg: np.ndarray, sea: np.ndarray, lake: np.ndarray) -> np.ndarray:
    """The RGB array (NY, NX, 3), uint8. `sea` is the share of each pixel that is sea (0..1)."""
    is_sea = np.rint(np.clip(sea, 0, 1) * SEA_LEVELS) > 0
    land_slope = median3(slope_class(np.where(is_sea, 0.0, slope_deg)))
    return np.stack([depth_code(elev, ~is_sea), pack(sea, lake, land_slope), np.zeros(elev.shape, dtype=np.uint8)], axis=2)


def write(rgb: np.ndarray, out: Path = OUT) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{NAME}.webp"
    Image.fromarray(rgb).save(path, lossless=True, quality=100, method=6)
    meta = {
        "file": path.name,
        "width": NX,
        "height": NY,
        "pixel_degrees": PIXEL_DEG,
        "row0": "north (90N)",
        "col0": "west (180W)",
        "red": f"0 when the pixel is all land (Natural Earth 10m); else metres below today's sea level rounded up to a multiple of {DEPTH_STEP}, 255 = {DEEP_FROM} m or more",
        "green": "bits 4-7 sea share of the pixel today 0..15; bit 3 lake; bits 0-2 slope class 0..7 (3x3 median); upper bound in degrees of classes 0..6 is slope_upper_deg, class 7 is steeper",
        "sea_levels": SEA_LEVELS,
        "slope_upper_deg": SLOPE_UPPER_DEG,
        "blue": "0",
        "sources": {
            "relief": f"AWS Terrarium elevation tiles, zoom {ZOOM}, mean of {SAMPLES}x{SAMPLES} samples per pixel, central-difference slope",
            "land_and_lakes": f"Natural Earth 10m land and lakes {NE_VERSION} (public domain)",
            "sha256": NE_FILES,
        },
    }
    (out / f"{NAME}.json").write_text(json.dumps(meta, indent=2) + "\n")
    return path


def run(raw: Path, tiles: Path, out: Path) -> Path:
    fetch_natural_earth(raw)
    print("natural earth ok")
    fetch_tiles(tiles)
    print(f"{TILES * TILES} tiles ok")
    z = mosaic(tiles)
    slope8 = mosaic_slope_deg(z)
    elev, slope = resample(z, slope8)
    del z, slope8
    sea, lake = sea_share(raw), lake_mask(raw)
    rgb = build(elev, slope, sea, lake)
    print(f"land pixels {int((rgb[..., 0] == 0).sum())}, lake pixels {int(lake.sum())}, shelf pixels (depth 4..132) {int(((rgb[..., 0] > 0) & (rgb[..., 0] < 135)).sum())}")
    path = write(rgb, out)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")
    return path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the terrain-for-placing-groups image")
    ap.add_argument("--raw", type=Path, default=NATURAL_EARTH)
    ap.add_argument("--tiles", type=Path, default=TERRARIUM, help="where the Terrarium tiles are cached")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    run(args.raw, args.tiles, args.out)


if __name__ == "__main__":
    sys.exit(main())
