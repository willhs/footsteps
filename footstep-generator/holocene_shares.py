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

Target share of continent r in year y (T = the image's people in the ten continents):
    blend years -13,000..-11,000:  the pure model's share, recovered from the image as
                                   (image_r - w * HYDE10k_r) / (1 - w), w = (y + 14000) / 4000
    -10,000:                       the pure model's share at -11,000 (the last one it gives)
    -9,000..-4,000:                (1 - v) * share(-10,000) + v * HYDE_r(y) / T,  v = (y + 10000) / 7000
    -3,000 on:                     HYDE (no row)
West Asia keeps its image share (KEEP); the others share the rest in proportion to the target.
factor_r(y) = target_r * T / image_r.  Cells outside the ten boxes (remote Pacific) keep factor 1.

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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "footsteps-web" / "lib" / "holoceneShares.json"
LOCAL = [ROOT / "data" / "tiles" / "grid", ROOT / "data" / "tiles" / "prehistory"]

MAX_PEOPLE = 5_000_000  # grid_image.py's encoding
LEVELS = 1023

# Continents as [west, south, east, north] boxes; a cell takes the FIRST continent with a box holding its centre.
# Mirrored in footsteps-web/lib/holoceneShares.ts (the JSON carries them; the TS reads them from there).
CONTINENTS: list[tuple[str, list[list[float]]]] = [
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

# Continents whose image share is kept as it is. West Asia: Natufian and Pre-Pottery Neolithic villages make it a
# population centre exactly here (the Neolithic demographic transition, Bocquet-Appel 2011, Science 333:560), which a
# forager-density model cannot see; HYDE's share there is the better guess.
KEEP = {"west_asia"}

BLEND_START, HYDE_MIN, FADE_END = -14000, -10000, -3000
YEARS = [-13000, -12000, -11000, -10000, -9000, -8000, -7000, -6000, -5000, -4000]


def decode_bytes(data: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(data)) as image:
        rgb = np.asarray(image.convert("RGB")).astype(np.int64)
    q = (rgb[..., 0] << 8) | rgb[..., 1]
    return np.where(q > 0, np.expm1(q / LEVELS * np.log1p(MAX_PEOPLE)), 0.0)


def read_year(year: int, base: str | None) -> np.ndarray:
    name = f"humans_{year}.webp"
    if base:
        with urllib.request.urlopen(f"{base.rstrip('/')}/grid/{name}") as r:
            return decode_bytes(r.read())
    for d in LOCAL:
        if (d / name).exists():
            return decode_bytes((d / name).read_bytes())
    raise FileNotFoundError(f"{name} not in {LOCAL}; pass --base")


def continent_map(height: int, width: int) -> np.ndarray:
    """Index into CONTINENTS per cell, -1 where no box holds the centre."""
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    lon = -180 + (np.arange(width) + 0.5) * 360 / width
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    out = np.full((height, width), -1, dtype=np.int8)
    for i in reversed(range(len(CONTINENTS))):  # reversed so the first listed wins
        for w, s, e, n in CONTINENTS[i][1]:
            out[(lo >= w) & (lo < e) & (la >= s) & (la < n)] = i
    return out


def totals(people: np.ndarray) -> np.ndarray:
    cmap = continent_map(*people.shape)
    return np.array([people[cmap == i].sum() for i in range(len(CONTINENTS))])


def build(base: str | None) -> dict:
    hyde10 = totals(read_year(HYDE_MIN, base))
    images = {y: totals(read_year(y, base)) for y in YEARS}
    pure: dict[int, np.ndarray] = {}
    for y in (-13000, -12000, -11000):
        w = (y - BLEND_START) / (HYDE_MIN - BLEND_START)
        m = np.clip((images[y] - w * hyde10) / (1 - w), 0, None)
        pure[y] = m / m.sum()
    start = pure[-11000]
    rows: dict[str, dict[str, float]] = {}
    report: dict[str, dict] = {}
    for y in YEARS:
        image = images[y]
        share_before = image / image.sum()
        if y in pure:
            target = pure[y]
        else:
            v = (y - HYDE_MIN) / (FADE_END - HYDE_MIN)
            target = (1 - v) * start + v * share_before
        keep = np.array([CONTINENTS[i][0] in KEEP for i in range(len(CONTINENTS))])
        free = ~keep
        target = np.where(keep, share_before, target * (1 - share_before[keep].sum()) / target[free].sum())
        factor = np.where(image > 0, target * image.sum() / np.maximum(image, 1e-9), 1.0)
        rows[str(y)] = {CONTINENTS[i][0]: round(float(f), 4) for i, f in enumerate(factor)}
        report[str(y)] = {
            CONTINENTS[i][0]: {"before": round(100 * float(share_before[i]), 1), "after": round(100 * float(target[i]), 1)}
            for i in range(len(CONTINENTS))
        }
    return {
        "about": "Continental multipliers over the population images, 13,000-4,000 BCE (footstep-generator/holocene_shares.py, "
                 "docs/research/0016-holocene-hand-over). Modelled: HYDE 3.5's early-Holocene continental split replaced by the "
                 "pre-HYDE forager model's, fading back to HYDE by 3000 BCE.",
        "continents": [{"id": n, "boxes": b} for n, b in CONTINENTS],
        "factors": rows,
        "shares_percent": report,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--base", help="read images from this site instead of data/tiles (e.g. https://footsteps.willhs.me)")
    p.add_argument("--check", action="store_true", help="fail if the committed table differs from a fresh build")
    a = p.parse_args()
    table = build(a.base)
    text = json.dumps(table, indent=1) + "\n"
    if a.check:
        if OUT.read_text() != text:
            raise SystemExit(f"{OUT} is stale: re-run holocene_shares.py")
        print("holoceneShares.json is current")
        return
    OUT.write_text(text)
    for y, row in table["shares_percent"].items():
        print(y, " ".join(f"{k}:{v['before']}->{v['after']}" for k, v in row.items()))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
