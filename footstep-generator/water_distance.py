"""Distance to fresh water (rivers and lakes) on the HYDE 5' grid, as one small lossless WebP.

A year-independent model input for placing groups: the Units view (part 2, not built here) ranks candidate sites in a
cell by flat ground x water proximity. See docs/ops/water-distance.md and docs/research/0012-group-structure.

Inputs: Natural Earth 10m rivers + lake centerlines and 10m lakes, v5.1.2 (public domain), pinned by sha256 below
(the same files `prehistory_population.py` reads). Present-day courses stand in for the past; the Green Sahara
(today's dry wadis held water about 11-5 ka) is NOT modelled here. `extra_water` is the hook: GeoJSON the caller
supplies is added to the water set. Nothing palaeo is invented.

Grid: HYDE's 5' (4320 x 2160), row 0 = north, column 0 = 180 W, value at the cell centre. 2.5' was tried and is
~4x the bytes for a smoother edge near water; see the doc for the sizes. Encoding: 8-bit, code = round(255 *
sqrt(metres / MAX_METRES)), so steps are fine near water (31 m at code 1, 0.8 km at code 5, 4 km at code 50) and coarse
far away. Code 0 means "water in this cell" (under ~8 m).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
NATURAL_EARTH = Path(os.environ.get("NATURAL_EARTH_DIR", RAW / "naturalearth"))  # env: a job workspace that cannot write data/raw
OUT = ROOT / "footsteps-web" / "public" / "water"
NAME = "water_distance"

NE_VERSION = "v5.1.2"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/" + NE_VERSION + "/geojson/{name}.geojson"
# name -> sha256 of the .geojson at the tag above (same pins as docs/ops/prehistory-population.md)
NE_FILES = {
    "ne_10m_rivers_lake_centerlines": "bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a",
    "ne_10m_lakes": "2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9",
}

# Salt, soda or hypersaline lakes: no drinking water. Their feeder rivers stay. By Natural Earth name.
SALINE_LAKES = frozenset({
    "Lake Eyre North", "Lake Eyre South", "Lake Gairdner", "Lake Torrens", "Great Salt Lake", "Laguna Madre",
    "Salton Sea", "Syvash", "Uvs Nuur", "Qinghai Hu", "Lake Razazah", "Dead Sea", "Lake Urmia", "Mar Chiquita",
    "Lake Tuz", "Lake Van", "Lake Assal", "Tengiz Köli", "Lake Natron", "South Aral Sea", "North Aral Sea",
    "Ebinur Hu",
})

NX, NY = 4320, 2160  # HYDE 5'
CELL_DEG = 360 / NX
EARTH_RADIUS_M = 6_371_008.8
MAX_METRES = 2_000_000.0  # codes saturate here: 99.9% of land cells (Natural Earth 110m, north of 60 S) are within 1,455 km
LEVELS = 255
DRAW_PX = (17280, 8640)  # water is drawn at 1.25' (about 2.3 km) and any-pixel per cell, so thin rivers count
JFA_ROUNDS = 2  # halving ladders run back to back; the 2nd repairs the near-miss seeds of the 1st (0.2% -> 0 of 4,000 sampled cells)


# --- encoding -------------------------------------------------------------------------------------------------------

def quantise(metres: np.ndarray) -> np.ndarray:
    """Metres -> 0..255 codes (square-root scale)."""
    m = np.clip(np.asarray(metres, dtype=np.float64), 0.0, MAX_METRES)
    return np.rint(LEVELS * np.sqrt(m / MAX_METRES)).astype(np.uint8)


def dequantise(codes) -> np.ndarray:
    """Codes -> metres (the centre of each code's range)."""
    return MAX_METRES * (np.asarray(codes, dtype=np.float64) / LEVELS) ** 2


def code_step_metres(code: int) -> float:
    """How coarse the scale is at `code`: the metres between it and the next code."""
    return float(dequantise(code + 1) - dequantise(code))


def decode(path: Path) -> np.ndarray:
    """Read the WebP back to metres, as the browser does (red channel)."""
    with Image.open(path) as im:
        return dequantise(np.asarray(im.convert("RGB"))[:, :, 0])


# --- inputs ---------------------------------------------------------------------------------------------------------

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(raw: Path = NATURAL_EARTH) -> dict[str, Path]:
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


def _lines_and_polygons(geometry: dict) -> tuple[list, list]:
    """(lines, polygon outer rings) of a GeoJSON geometry, as lists of [lon, lat] points."""
    t, c = geometry["type"], geometry["coordinates"]
    if t == "LineString":
        return [c], []
    if t == "MultiLineString":
        return list(c), []
    if t == "Polygon":
        return [], [c[0]]
    if t == "MultiPolygon":
        return [], [p[0] for p in c]
    if t == "GeometryCollection":
        lines, polys = [], []
        for g in geometry["geometries"]:
            a, b = _lines_and_polygons(g)
            lines += a
            polys += b
        return lines, polys
    return [], []


def water_features(
    raw: Path = NATURAL_EARTH, extra_water: Iterable[Path] = (), saline: frozenset[str] = SALINE_LAKES
) -> tuple[list, list]:
    """(lines, polygons) of fresh water: every river and lake-centerline line, every non-saline lake,
    plus any `extra_water` GeoJSON (the Green Sahara hook; empty by default)."""
    lines, polys = [], []

    def add(path: Path, keep=lambda _: True):
        for f in json.loads(Path(path).read_text())["features"]:
            if f.get("geometry") and keep(f["properties"] or {}):
                a, b = _lines_and_polygons(f["geometry"])
                lines.extend(a)
                polys.extend(b)

    add(raw / "ne_10m_rivers_lake_centerlines.geojson")
    add(raw / "ne_10m_lakes.geojson", lambda p: p.get("name") not in saline)
    for path in extra_water:
        add(path)
    return lines, polys


def water_cells(lines: list, polys: list, nx: int = NX, ny: int = NY) -> np.ndarray:
    """True where any river line or lake touches the cell (drawn at 1.25', any-pixel per cell)."""
    w, h = DRAW_PX
    s_x, s_y = w // nx, h // ny
    image = Image.new("1", (w, h))
    draw = ImageDraw.Draw(image)
    px = lambda c: ((c[0] + 180) / 360 * w, (90 - c[1]) / 180 * h)  # noqa: E731
    for ring in polys:
        draw.polygon([px(c) for c in ring], fill=1)
    for line in lines:
        draw.line([px(c) for c in line], fill=1, width=1)
    return np.asarray(image).reshape(ny, s_y, nx, s_x).any(axis=(1, 3))


# --- distance -------------------------------------------------------------------------------------------------------

def _shift(a: np.ndarray, dy: int, dx: int, fill) -> np.ndarray:
    """out[r, c] = a[r + dy, (c + dx) mod nx]; rows past either pole are `fill` (columns wrap around the globe)."""
    out = np.full_like(a, fill)
    rolled = np.roll(a, -dx, axis=1) if dx else a
    if dy >= 0:
        out[: a.shape[0] - dy] = rolled[dy:]
    else:
        out[-dy:] = rolled[: a.shape[0] + dy]
    return out


def nearest_water(water: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(row, col) of the nearest water cell for every cell, by jump flooding on the lat/lon grid.

    Cells are ranked by the haversine term (exact on the sphere, so no pole distortion); the winner is measured in
    `distance_metres`. Jump flooding is approximate: a few cells keep a near-miss seed (tests/test_water_distance.py
    measures the error against brute force)."""
    ny, nx = water.shape
    rows = np.arange(ny, dtype=np.int32)[:, None]
    cols = np.arange(nx, dtype=np.int32)[None, :]
    # haversine terms from tables: sin^2(dlat/2) depends only on |row gap|, sin^2(dlon/2) only on |column gap|
    sin2_lat = (np.sin(np.arange(ny + 1) * np.radians(180 / ny) / 2) ** 2).astype(np.float32)
    sin2_lon = (np.sin(np.arange(nx // 2 + 1) * np.radians(360 / nx) / 2) ** 2).astype(np.float32)
    cos_lat = np.cos(np.radians(centre_lat(np.arange(ny), ny))).astype(np.float32)
    sr = np.where(water, rows, -1).astype(np.int16)
    sc = np.where(water, cols, -1).astype(np.int16)
    best = np.where(water, np.float32(0), np.float32(np.inf)).astype(np.float32)
    k0 = 1 << (max(ny, nx).bit_length() - 2)
    ladder = []
    k = k0
    while k >= 1:
        ladder.append(k)
        k //= 2
    steps = ladder * JFA_ROUNDS
    for k in steps:
        for dy in (-k, 0, k):
            for dx in (-k, 0, k):
                if not dy and not dx:
                    continue
                csr = _shift(sr, dy, dx, -1)
                csc = _shift(sc, dy, dx, -1)
                valid = csr >= 0
                gap = np.abs(cols - csc)
                gap = np.minimum(gap, nx - gap)  # the short way round the globe
                key = sin2_lat[np.abs(rows - csr)] + cos_lat[rows] * cos_lat[csr] * sin2_lon[gap]  # haversine "a"
                key = np.where(valid, key, np.float32(np.inf))
                better = key < best
                best = np.where(better, key, best)
                sr = np.where(better, csr, sr)
                sc = np.where(better, csc, sc)
    return sr, sc


def haversine_m(lat1, lon1, lat2, lon2) -> np.ndarray:
    """Great-circle metres between points given in degrees."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def centre_lat(rows: np.ndarray, ny: int = NY) -> np.ndarray:
    return 90 - (np.asarray(rows) + 0.5) * (180 / ny)


def centre_lon(cols: np.ndarray, nx: int = NX) -> np.ndarray:
    return -180 + (np.asarray(cols) + 0.5) * (360 / nx)


def distance_metres(water: np.ndarray) -> np.ndarray:
    """Great-circle metres from each cell's centre to the nearest water cell's centre; 0 where the cell holds water.
    Measured to cell centres, so it is good to about half a cell (4.6 km at 5') from the water itself."""
    ny, nx = water.shape
    if not water.any():
        return np.full(water.shape, np.inf)
    sr, sc = nearest_water(water)
    rows = np.arange(ny)[:, None]
    cols = np.arange(nx)[None, :]
    d = haversine_m(centre_lat(rows, ny), centre_lon(cols, nx), centre_lat(sr, ny), centre_lon(sc, nx))
    return np.where(water, 0.0, d)


# --- run ------------------------------------------------------------------------------------------------------------

def sources_note() -> dict:
    return {
        "water": f"Natural Earth 10m rivers + lake centerlines and lakes {NE_VERSION} (public domain), present-day courses",
        "sha256": NE_FILES,
        "saline_lakes_left_out": sorted(SALINE_LAKES),
    }


def write(distance: np.ndarray, out: Path = OUT, extra: list[str] | None = None) -> Path:
    """Write the WebP and its sidecar JSON (the scale the reader needs) to `out`."""
    out.mkdir(parents=True, exist_ok=True)
    codes = quantise(distance)
    ny, nx = codes.shape
    rgb = np.repeat(codes[:, :, None], 3, axis=2)
    path = out / f"{NAME}.webp"
    Image.fromarray(rgb).save(path, lossless=True, quality=100, method=6)
    meta = {
        "file": path.name,
        "width": nx,
        "height": ny,
        "cell_degrees": 360 / nx,
        "row0": "north (90N)",
        "col0": "west (180W)",
        "channel": "red; green and blue repeat it",
        "metres": f"{MAX_METRES:g} * (code / {LEVELS}) ** 2",
        "max_metres": MAX_METRES,
        "levels": LEVELS,
        "code0": "water in the cell",
        "measured_to": "cell centres, good to about half a cell",
        "extra_water": extra or [],
        "sources": sources_note(),
    }
    (out / f"{NAME}.json").write_text(json.dumps(meta, indent=2) + "\n")
    return path


def run(raw: Path, out: Path, extra_water: list[Path]) -> Path:
    paths = fetch(raw)
    print(f"inputs ok: {', '.join(p.name for p in paths.values())}")
    lines, polys = water_features(raw, extra_water)
    water = water_cells(lines, polys)
    print(f"{len(lines)} lines, {len(polys)} lake rings -> {int(water.sum())} water cells of {water.size}")
    distance = distance_metres(water)
    print(f"{int((distance > MAX_METRES).sum())} cells are beyond {MAX_METRES / 1000:.0f} km and read as {MAX_METRES / 1000:.0f} km"
          " (open ocean, Antarctica, islands with no Natural Earth river)")
    path = write(distance, out, [str(p) for p in extra_water])
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")
    return path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the distance-to-fresh-water image")
    ap.add_argument("--raw", type=Path, default=NATURAL_EARTH, help="where the Natural Earth files live or are fetched to")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--extra-water", type=Path, action="append", default=[],
                    help="GeoJSON of extra rivers/lakes to count as water (the Green Sahara hook); repeatable")
    args = ap.parse_args(argv)
    run(args.raw, args.out, args.extra_water)


if __name__ == "__main__":
    sys.exit(main())
