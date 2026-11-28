"""Share of the world's people per continent in every published population image (research 0016, Method).

Usage: python continent_shares.py [EVERY]
    EVERY   print only years divisible by EVERY (all years from 11,000 BCE back are always printed)
    GRID_GLOB  comma-separated globs of humans_{year}.webp images (default: /tmp/claude-0/grid/humans_*.webp)

These boxes are coarser than footstep-generator/holocene_shares.py's; this script only reads the images.
"""
import glob
import os
import re
import sys

import numpy as np
from PIL import Image

# grid_image.py's encoding: people = expm1(level * STEP), level = R << 8 | G.
MAX_PEOPLE = 5_000_000
LEVELS = 1023
STEP = np.log1p(MAX_PEOPLE) / LEVELS

ALWAYS_PRINT_BEFORE = -11000  # the pre-HYDE model's years, printed whatever EVERY is
DEFAULT_GLOB = "/tmp/claude-0/grid/humans_*.webp"
YEAR_IN_NAME = re.compile(r"_(-?\d+)")

ORDER = ["Africa", "W Asia", "Europe", "S Asia", "E Asia", "SE Asia", "N+C Asia", "Sahul+Pac",
         "N America", "C+S America", "other"]


def decode(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int64)
    levels = rgb[..., 0] * 256 + rgb[..., 1]
    return np.where(levels > 0, np.expm1(levels * STEP), 0.0)


def continent_names(lat, lon):
    """Continent name per cell. Later assignments overwrite earlier ones, so the order matters."""
    names = np.full(lat.shape, "other", dtype=object)

    americas = (lon < -25) | ((lon > 170) & (lat > 50))  # with the far east of Chukotka's longitudes
    names[americas & (lat >= 13)] = "N America"
    names[americas & (lat < 13)] = "C+S America"

    names[(lon >= -25) & (lon < 52) & (lat < 37) & (lat > -40)] = "Africa"
    names[(lon >= -25) & (lon < 45) & (lat >= 37)] = "Europe"
    sinai_and_egypt = (lon < 35) & (lat < 31.5)
    names[(lon >= 25) & (lon < 62) & (lat < 37) & (lat >= 12) & ~sinai_and_egypt] = "W Asia"  # Levant, Arabia, Iran
    names[(lon >= 62) & (lon < 92) & (lat < 37) & (lat > 5)] = "S Asia"
    names[(lon >= 92) & (lon < 150) & (lat >= 22) & (lat < 55)] = "E Asia"
    names[(lon >= 92) & (lon < 160) & (lat < 22) & (lat >= -10)] = "SE Asia"
    names[(lon >= 110) & (lon < 180) & (lat < -10)] = "Sahul+Pac"

    siberia = (lon >= 45) & (lon <= 180) & (lat >= 55)
    central_asia = (lon >= 45) & (lon < 92) & (lat >= 37) & (lat < 55)
    names[siberia | central_asia] = "N+C Asia"
    return names


def year_of(path):
    return int(YEAR_IN_NAME.search(path).group(1))


def main():
    every = int(sys.argv[1]) if len(sys.argv) > 1 else None
    globs = os.environ.get("GRID_GLOB", DEFAULT_GLOB).split(",")
    paths = sorted((path for pattern in globs for path in glob.glob(pattern)), key=year_of)

    print("year     total_M  " + "  ".join(f"{name[:9]:>9}" for name in ORDER))

    names_by_shape = {}
    for path in paths:
        year = year_of(path)
        if every and year % every and year > ALWAYS_PRINT_BEFORE:
            continue

        people = decode(path)
        height, width = people.shape
        if (height, width) not in names_by_shape:
            lat = 90 - (np.arange(height) + 0.5) * 180 / height
            lon = -180 + (np.arange(width) + 0.5) * 360 / width
            lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")
            names_by_shape[(height, width)] = continent_names(lat_grid, lon_grid)

        names = names_by_shape[(height, width)]
        world = people.sum()
        shares = "  ".join(f"{100 * people[names == name].sum() / world:9.1f}" for name in ORDER)
        print(f"{year:>7} {world / 1e6:8.2f}  {shares}")


if __name__ == "__main__":
    main()
