"""Continental shares across the hand-over to HYDE, 13,000-4,000 BCE: a cited correction table.

HYDE 3.5 builds its 10,000 BCE map from present-day country series (McEvedy & Jones 1978, Livi-Bacci 2007,
Maddison 2001; Klein Goldewijk et al. 2017, ESSD 9:927, sect. 2.1), so its continental split at the start of the
Holocene looks like a shrunken modern one: Africa 5% of the world, the Americas (settled only a few thousand years
before) 49%, north and central Asia 8%. The pre-HYDE model (prehistory_population.py: Tallavaara et al. 2018 forager
density from NPP, arrival table) has Africa 28-43% and the Americas 0-30% over 14,000-11,000 BCE. Because the model
blends into HYDE's 10,000 BCE image cell by cell, Africa lost ~1.6 million people and the Americas gained ~2.2 million
in 4,000 years on the map. Nothing in the archaeology or genetics supports that lurch (docs/research/0016).

This script writes one small table, `footsteps-web/lib/holoceneShares.json`: a multiplier per continent per year that
the app applies to each cell of the population image (`lib/holoceneShares.ts`, in `gridDataFrom`). Cells keep their
pattern inside a continent; only continental totals move, and the world total stays HYDE's (or the model's).

Target share of each continent, by year (world = the image's people in the ten continents):

    13,000-11,000 BCE  the pure model's share. The image is a blend, image = (1 - w) * model + w * HYDE(10,000 BCE),
                       with w the HYDE weight (0 at 14,000 BCE, 1 at 10,000 BCE), so model = (image - w * HYDE) / (1 - w).
    10,000 BCE         the pure model's share at 11,000 BCE, the last year the model gives.
    9000-4000 BCE      a linear fade from that share to the image's (HYDE's) share, reaching HYDE at 3000 BCE.
    3000 BCE on        HYDE as it is (no row).

West Asia keeps its image share (KEPT_AS_IMAGE); the other continents share the rest in proportion to the target.
multiplier = target share * world / continent's people in the image. Cells outside the ten boxes (remote Pacific)
keep multiplier 1.

Inputs: the published population images, from `data/tiles/grid/` and `data/tiles/prehistory/` or from a URL
(`--base https://footsteps.willhs.me`). Re-run after prehistory_population.py or grid_image.py changes them.

Usage: python footstep-generator/holocene_shares.py [--base URL] [--check]
"""
from __future__ import annotations

import argparse
import io
import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

from grid_image import dequantise

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "footsteps-web" / "lib" / "holoceneShares.json"
IMAGE_DIRS = [ROOT / "data" / "tiles" / "grid", ROOT / "data" / "tiles" / "prehistory"]
USER_AGENT = "footsteps-holocene-shares"

# Continents as [west, south, east, north] boxes in degrees; a cell takes the FIRST continent with a box holding its
# centre. The JSON carries these to footsteps-web/lib/holoceneShares.ts, so the app and this script agree.
CONTINENTS: list[tuple[str, list[list[float]]]] = [
    # Two boxes so Hawaii (west of -140 below 50 N) stays out.
    ("north_america", [[-170, 50, -50, 84], [-140, 13, -50, 50]]),
    ("south_america", [[-120, -60, -30, 13]]),
    # Anatolia, the Levant, Mesopotamia, Iran; Arabia without the African Red Sea coast.
    ("west_asia", [[26, 36, 45, 42], [34, 29, 63, 42], [35, 25, 39, 29], [39, 16, 60, 29], [43, 12, 60, 16]]),
    ("africa", [[-20, -36, 52, 37]]),
    ("europe", [[-25, 35, 45, 72]]),
    ("south_asia", [[60, 5, 92, 37]]),
    ("southeast_asia", [[92, -11, 130, 22]]),
    ("east_asia", [[92, 22, 150, 55]]),
    ("north_central_asia", [[45, 37, 180, 80]]),
    ("sahul", [[110, -50, 180, -11]]),
]
NO_CONTINENT = -1

# Continents whose image share is kept as it is. West Asia: Natufian and Pre-Pottery Neolithic villages make it a
# population centre exactly here (the Neolithic demographic transition, Bocquet-Appel 2011, Science 333:560), which a
# forager-density model cannot see; HYDE's share there is the better guess.
KEPT_AS_IMAGE = {"west_asia"}

# Years, CE (negative = BCE). The first two are prehistory_population.py's BLEND_START and HYDE_YEAR.
MODEL_ONLY_YEAR = -14000  # the image is the pure model; HYDE's weight in the blend rises from 0 here...
HYDE_START_YEAR = -10000  # ...to 1 here, HYDE 3.5's first year
FADE_END_YEAR = -3000  # HYDE's own continental split from here on
BLEND_YEARS = [-13000, -12000, -11000]  # model and HYDE blended in the image
FADE_YEARS = [-10000, -9000, -8000, -7000, -6000, -5000, -4000]  # HYDE's image, shares fading back to it
YEARS = BLEND_YEARS + FADE_YEARS

# Output precision: multipliers to 4 decimals (0.01% of a continent), the shares report to 0.1 percentage point.
MULTIPLIER_DECIMALS = 4
PERCENT_DECIMALS = 1


def decode_bytes(data: bytes) -> np.ndarray:
    """People per cell from a population WebP's bytes (grid_image.py's encoding: level = R << 8 | G)."""
    with Image.open(io.BytesIO(data)) as image:
        rgb = np.asarray(image.convert("RGB")).astype(np.int64)
    levels = (rgb[..., 0] << 8) | rgb[..., 1]
    return dequantise(levels)


def read_year(year: int, base_url: str | None) -> np.ndarray:
    name = f"humans_{year}.webp"

    if base_url:
        # A plain urllib request is refused (403) by the site's front end; a named client is not.
        request = urllib.request.Request(f"{base_url.rstrip('/')}/grid/{name}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request) as response:
            return decode_bytes(response.read())

    for folder in IMAGE_DIRS:
        path = folder / name
        if path.exists():
            return decode_bytes(path.read_bytes())

    raise FileNotFoundError(f"{name} not in {IMAGE_DIRS}; pass --base")


def continent_map(height: int, width: int) -> np.ndarray:
    """Index into CONTINENTS for each cell of a whole-world grid, NO_CONTINENT where no box holds the cell's centre."""
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    lon = -180 + (np.arange(width) + 0.5) * 360 / width
    lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")

    out = np.full((height, width), NO_CONTINENT, dtype=np.int8)
    # Paint in reverse so the first continent listed wins where boxes overlap.
    for index in reversed(range(len(CONTINENTS))):
        for west, south, east, north in CONTINENTS[index][1]:
            inside = (lon_grid >= west) & (lon_grid < east) & (lat_grid >= south) & (lat_grid < north)
            out[inside] = index
    return out


def continent_totals(people: np.ndarray) -> np.ndarray:
    """People per continent, in CONTINENTS order."""
    cmap = continent_map(*people.shape)
    return np.array([people[cmap == index].sum() for index in range(len(CONTINENTS))])


def hyde_weight(year: int) -> float:
    """HYDE's weight in the image's blend: 0 at MODEL_ONLY_YEAR, 1 at HYDE_START_YEAR."""
    return (year - MODEL_ONLY_YEAR) / (HYDE_START_YEAR - MODEL_ONLY_YEAR)


def fade_weight(year: int) -> float:
    """How far the shares have faded back to HYDE's: 0 at HYDE_START_YEAR, 1 at FADE_END_YEAR."""
    return (year - HYDE_START_YEAR) / (FADE_END_YEAR - HYDE_START_YEAR)


def model_shares(image_totals: np.ndarray, hyde_totals: np.ndarray, year: int) -> np.ndarray:
    """The pure model's continental shares, recovered from a blended image (see the module docstring)."""
    weight = hyde_weight(year)
    model = (image_totals - weight * hyde_totals) / (1 - weight)
    model = np.clip(model, 0, None)  # rounding in the images can leave a small negative remainder
    return model / model.sum()


def build(base_url: str | None) -> dict:
    hyde_totals = continent_totals(read_year(HYDE_START_YEAR, base_url))
    image_totals = {year: continent_totals(read_year(year, base_url)) for year in YEARS}

    model_by_year = {year: model_shares(image_totals[year], hyde_totals, year) for year in BLEND_YEARS}
    last_model_shares = model_by_year[BLEND_YEARS[-1]]

    kept = np.array([name in KEPT_AS_IMAGE for name, _ in CONTINENTS])
    free = ~kept

    multipliers: dict[str, dict[str, float]] = {}
    shares_percent: dict[str, dict] = {}

    for year in YEARS:
        people = image_totals[year]
        world = people.sum()
        image_shares = people / world

        if year in model_by_year:
            target = model_by_year[year]
        else:
            fade = fade_weight(year)
            target = (1 - fade) * last_model_shares + fade * image_shares

        # Kept continents hold their image share; the free ones split what is left in proportion to the target.
        left_for_free = 1 - image_shares[kept].sum()
        target = np.where(kept, image_shares, target * left_for_free / target[free].sum())

        multiplier = np.where(people > 0, target * world / np.maximum(people, 1e-9), 1.0)

        multipliers[str(year)] = {
            name: round(float(m), MULTIPLIER_DECIMALS) for (name, _), m in zip(CONTINENTS, multiplier)
        }
        shares_percent[str(year)] = {
            name: {
                "before": round(100 * float(before), PERCENT_DECIMALS),
                "after": round(100 * float(after), PERCENT_DECIMALS),
            }
            for (name, _), before, after in zip(CONTINENTS, image_shares, target)
        }

    return {
        "about": "Continental multipliers over the population images, 13,000-4,000 BCE (footstep-generator/holocene_shares.py, "
                 "docs/research/0016-holocene-hand-over). Modelled: HYDE 3.5's early-Holocene continental split replaced by the "
                 "pre-HYDE forager model's, fading back to HYDE by 3000 BCE.",
        "continents": [{"id": name, "boxes": boxes} for name, boxes in CONTINENTS],
        "factors": multipliers,
        "shares_percent": shares_percent,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base", help="read images from this site instead of data/tiles (e.g. https://footsteps.willhs.me)")
    parser.add_argument("--check", action="store_true", help="fail if the committed table differs from a fresh build")
    args = parser.parse_args()

    table = build(args.base)
    text = json.dumps(table, indent=1) + "\n"

    if args.check:
        if OUT.read_text() != text:
            raise SystemExit(f"{OUT} is stale: re-run holocene_shares.py")
        print("holoceneShares.json is current")
        return

    OUT.write_text(text)
    for year, row in table["shares_percent"].items():
        print(year, " ".join(f"{name}:{share['before']}->{share['after']}" for name, share in row.items()))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
