#!/usr/bin/env python3
"""
Rough people images after 1900: HYDE's 1900 grid, scaled up region by region to
UN World Population Prospects 2024 totals for 1950, 2000 and 2025.

This is an APPROXIMATION, not data. Every cell in a region grows by the same factor,
so it misses where growth really went (cities, new farmland, migration). It keeps
the timeline going to today; precision is spent on the past, not here.

Regions are crude lon/lat boxes for the six UN regions (region_of below). Same
encoding as grid_image.py, so the app reads humans_<year>.webp unchanged. The
land-use images are copies of 1900's, for the same reason.

Usage: python footstep-generator/modern_population.py [--grid DIR] [--habitat DIR]
  --grid    folder holding humans_1900.webp and landuse_1900.png (default data/tiles/grid)
  --habitat folder holding use_1900.webp (default data/tiles/habitat); skipped if absent
"""
import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from grid_image import MAX_PEOPLE, decode, quantise

ROOT = Path(__file__).resolve().parent.parent

REGIONS = ("africa", "asia", "europe", "latin_america", "north_america", "oceania")
# UN WPP 2024, millions, by UN region (Europe includes all of Russia).
UN_TOTALS = {
    1950: {"africa": 227, "asia": 1379, "europe": 549, "latin_america": 168, "north_america": 172, "oceania": 13},
    2000: {"africa": 819, "asia": 3741, "europe": 726, "latin_america": 523, "north_america": 312, "oceania": 31},
    2025: {"africa": 1549, "asia": 4836, "europe": 744, "latin_america": 667, "north_america": 383, "oceania": 46},
}


def region_of(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Index into REGIONS per cell, from rough boxes. Good enough for regional totals."""
    r = np.full(lon.shape, REGIONS.index("asia"), dtype=np.int8)
    europe = ((lon >= -30) & (lon <= 60) & (lat >= 36)
              & ~((lon > 26) & (lat < 41.5)) & ~((lon > 45) & (lat < 47))) \
        | ((lon > 60) & (lat >= 52.5))
    r[europe] = REGIONS.index("europe")
    africa = ((lon >= -30) & (lon <= 52) & (lat < 37.5)
              & ~((lat >= 12) & (lon > 32.5 + (30 - lat) * 0.6))  # east of the Red Sea
              & ~((lat >= 29.5) & (lon > 34.2)))  # Levant
    r[africa] = REGIONS.index("africa")
    americas = lon < -30
    north = americas & ((lat >= 29) | ((lat >= 24.5) & (lon > -98) & (lon < -79)))
    r[americas] = REGIONS.index("latin_america")
    r[north] = REGIONS.index("north_america")
    oceania = (((lat < -10) & (lon >= 112)) | ((lon >= 141) & (lat < 20))
               | ((lon < -120) & (lat < 25))) & (lat > -60)
    r[oceania] = REGIONS.index("oceania")
    return r


def cell_regions(shape: tuple[int, int]) -> np.ndarray:
    rows, cols = shape
    lat = 90 - (np.arange(rows) + 0.5) * 180 / rows
    lon = -180 + (np.arange(cols) + 0.5) * 360 / cols
    return region_of(*np.meshgrid(lon, lat))


def encode(people: np.ndarray, out: Path) -> None:
    q = quantise(np.minimum(people, MAX_PEOPLE))
    rgb = np.zeros((*q.shape, 3), dtype=np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF
    Image.fromarray(rgb, "RGB").save(out, lossless=True, quality=100, method=6)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=Path, default=ROOT / "data" / "tiles" / "grid")
    ap.add_argument("--habitat", type=Path, default=ROOT / "data" / "tiles" / "habitat")
    args = ap.parse_args()

    base = decode(args.grid / "humans_1900.webp")
    regions = cell_regions(base.shape)
    base_totals = np.bincount(regions.ravel(), weights=base.ravel(), minlength=len(REGIONS))
    print("1900 by region (M):", {k: round(v / 1e6) for k, v in zip(REGIONS, base_totals)})

    for year, targets in UN_TOTALS.items():
        factors = np.array([targets[k] * 1e6 / base_totals[i] for i, k in enumerate(REGIONS)])
        people = base * factors[regions]
        out = args.grid / f"humans_{year}.webp"
        encode(people, out)
        total = decode(out).sum()
        print(f"{year}: {total / 1e6:,.0f} M people, x{np.round(factors, 1).tolist()}, "
              f"{out.stat().st_size / 1e6:.2f} MB -> {out.name}")
        landuse = args.grid / "landuse_1900.png"
        if landuse.exists():
            shutil.copyfile(landuse, args.grid / f"landuse_{year}.png")
        use = args.habitat / "use_1900.webp"
        if use.exists():
            shutil.copyfile(use, args.habitat / f"use_{year}.webp")


if __name__ == "__main__":
    main()
