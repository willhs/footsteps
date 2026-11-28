"""Counterfactual: how would people split by continent if every ice-free cell held foragers at the Tallavaara et al. 2018
NPP density? (research 0016, Method). No coast, river or Green Sahara bonus; annual temperature stands in for the
coldest-month rule.

Usage: python forager_capacity.py [HABITAT_DIR]
    HABITAT_DIR  folder of habitat_lookup.py's bp_{ka}.webp images (default /tmp/claude-0/hab; published at /habitat/)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "footstep-generator"))
from prehistory_population import forager_density, miami_npp  # noqa: E402

DEFAULT_HABITAT_DIR = "/tmp/claude-0/hab"
KA_STEPS = [12, 10, 8, 6]

# habitat_lookup.py's encoding (footsteps-web/public/habitat_meta.json): R = BIOME4 class (0 sea, 28 land ice),
# G = annual mean temperature in 0.5 C steps from -50 C, B = log1p precipitation up to 10,000 mm; 0 = no data.
ICE_BIOME = 28
TEMP_MIN_C, TEMP_STEP_C = -50.0, 0.5
PRECIP_MAX_MM = 10000.0

# Rough habitability ramps (stand-ins for prehistory_population.py's rules).
ARID_NPP_ZERO, ARID_NPP_SPAN = 100, 200  # no people below NPP 100 g/m2/yr, full at 300
COLD_TEMP_ZERO_C, COLD_TEMP_SPAN_C = -25, 15  # no people below -25 C annual mean, full at -10 C

PER_100_KM2_TO_PER_KM2 = 1 / 100
KM_PER_HALF_DEGREE = 55.6  # at the equator
GRID_HEIGHT, GRID_WIDTH, CELL_DEG = 360, 720, 0.5

# [west, south, east, north] degrees; the first listed wins. Coarser than footstep-generator/holocene_shares.py's.
CONTINENTS = [
    ("west_asia", (35, 12, 63, 42)),
    ("africa", (-20, -36, 52, 37)),
    ("europe", (-25, 35, 35, 75)),
    ("south_asia", (60, 5, 92, 36)),
    ("southeast_asia", (92, -12, 119, 24)),
    ("sahul", (119, -45, 160, 0)),
    ("east_asia", (92, 24, 150, 60)),
    ("north_asia", (35, 42, 180, 82)),
    ("north_america", (-170, 15, -50, 84)),
    ("south_america", (-82, -56, -34, 15)),
]


def continent_map(height, width):
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    lon = -180 + (np.arange(width) + 0.5) * 360 / width
    lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")

    out = np.full((height, width), -1)
    for index, (_, (west, south, east, north)) in reversed(list(enumerate(CONTINENTS))):
        out[(lon_grid >= west) & (lon_grid < east) & (lat_grid >= south) & (lat_grid < north)] = index
    return out


def capacity(ka, habitat_dir):
    """People per cell at the forager density, for the habitat image `ka` thousand years BP."""
    rgb = np.asarray(Image.open(Path(habitat_dir) / f"bp_{ka}.webp").convert("RGB")).astype(float)
    biome, temp_level, precip_level = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    temp_c = TEMP_MIN_C + (temp_level - 1) * TEMP_STEP_C
    precip_mm = np.expm1((precip_level - 1) / 254 * np.log1p(PRECIP_MAX_MM))
    ice_free_land = (biome > 0) & (biome < ICE_BIOME) & (temp_level > 0)

    npp = miami_npp(temp_c, precip_mm)
    density = forager_density(npp) * PER_100_KM2_TO_PER_KM2

    arid = np.clip((npp - ARID_NPP_ZERO) / ARID_NPP_SPAN, 0, 1)
    cold = np.clip((temp_c - COLD_TEMP_ZERO_C) / COLD_TEMP_SPAN_C, 0, 1)

    lat = 90 - (np.arange(GRID_HEIGHT) + 0.5) * CELL_DEG
    area_km2 = KM_PER_HALF_DEGREE ** 2 * np.cos(np.radians(lat))[:, None] * np.ones((1, GRID_WIDTH))
    return np.where(ice_free_land, density * arid * cold * area_km2, 0)


def main():
    habitat_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HABITAT_DIR
    cmap = continent_map(GRID_HEIGHT, GRID_WIDTH)

    for ka in KA_STEPS:
        people = capacity(ka, habitat_dir)
        world = people.sum()
        shares = " ".join(f"{name[:6]} {100 * people[cmap == i].sum() / world:.1f}" for i, (name, _) in enumerate(CONTINENTS))
        print(ka, "ka total %.1fM" % (world / 1e6), shares)


if __name__ == "__main__":
    main()
