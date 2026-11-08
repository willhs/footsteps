#!/usr/bin/env python3
"""
Encode one HYDE population-density grid as a small PNG the browser draws directly.

Each pixel is one HYDE cell (5 arc-min, ~10 km). The value is people in that
cell, log-scaled into 16 bits: R = high byte, G = low byte, B unused, opaque.
    v = round(log1p(people) / log1p(MAX_PEOPLE) * 65535)
    people = expm1(v / 65535 * log1p(MAX_PEOPLE))
Row 0 is the north edge (90N), column 0 is 180W, matching the ASC file.

Usage: poetry run python footstep-generator/grid_image.py 1900 [-1000 ...]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hyde-3.5"
OUT = ROOT / "data" / "tiles" / "grid"

# Upper bound for people in one ~85 km^2 cell (decode needs the same constant).
MAX_PEOPLE = 5_000_000
EARTH_R_KM = 6371.0088


def asc_name(year: int) -> str:
    return f"popd_{abs(year)}{'BC' if year < 0 else 'AD'}.asc"


def read_asc(path: Path) -> tuple[np.ndarray, dict]:
    header = {}
    with open(path) as f:
        for _ in range(6):
            k, v = f.readline().split()
            header[k.lower()] = float(v)
        data = np.fromstring(
            f.read(), dtype=np.float32, sep=" "
        )
    data = data.reshape(int(header["nrows"]), int(header["ncols"]))
    return data, header


def cell_areas_km2(nrows: int, cellsize: float, ymin: float) -> np.ndarray:
    """Area of one cell per row (spherical), rows ordered north to south."""
    lat_n = ymin + (np.arange(nrows, 0, -1)) * cellsize
    lat_s = lat_n - cellsize
    dlon = np.radians(cellsize)
    return (EARTH_R_KM**2) * dlon * (np.sin(np.radians(lat_n)) - np.sin(np.radians(lat_s)))


def encode(year: int) -> Path:
    density, h = read_asc(RAW / asc_name(year))
    density = np.where(density < 0, 0, density)  # nodata -> 0
    area = cell_areas_km2(density.shape[0], h["cellsize"], h["yllcorner"])[:, None]
    people = density * area
    total = float(people.sum())

    v = np.round(np.log1p(people) / np.log1p(MAX_PEOPLE) * 65535)
    v = np.clip(v, 0, 65535).astype(np.uint16)
    rgb = np.zeros((*v.shape, 3), dtype=np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 0xFF

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"humans_{year}.png"
    Image.fromarray(rgb, "RGB").save(out, optimize=True)
    populated = int((people > 0).sum())
    print(f"{year}: {total:,.0f} people, {populated:,} populated cells, "
          f"max cell {people.max():,.0f}, {out.stat().st_size / 1e6:.1f} MB -> {out.name}")
    return out


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        encode(int(arg))
