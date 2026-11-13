#!/usr/bin/env python3
"""
HYDE 3.5 people, moved within each region by how habitable the land was then vs today.

HYDE spreads early population with present-day land suitability. So it keeps the Sahara
nearly empty through the African Humid Period and puts no one on land that is now under
the sea (Doggerland, Sundaland, Beringia). This writes an ADJUSTED copy; HYDE itself is
untouched. Method, choices and limits: docs/ops/hyde-climate-spread.md.

Per HYDE year, per macro-region R (continent-scale boxes, `REGIONS`), on the 0.5 degree grid:
    Q          = HYDE people in R (kept: the adjusted spread has the same regional total)
    then, now  = habitable capacity of each cell then and at 1950 (prehistory_population's
                 NPP-based density x habitat rules x ice-free land, with exposed shelf as land
                 and a Green Sahara correction, `SpreadModel`)
    shift_i    = Q * then_i / sum(then) - Q * now_i / sum(now)     (people the climate moved)
    new_i      = max(0, hyde_i + STRENGTH * shift_i), rescaled so sum(new) = Q
At HYDE's 5 arc-minute grid a block that lost people loses them in proportion everywhere in it;
a block that gained them gets the gain spread over its land cells at that year's sea level.

Output (data/tiles/grid_adjusted/): humans_{year}.webp in grid_image.py's encoding at HYDE's
4320 x 2160, and spread_report.json (per-region totals and the named places below).

Usage: python footstep-generator/hyde_climate_spread.py [--strength S] [--verify] [years ...]
       (no years: every HYDE millennium 10,000-2,000 BCE)
"""
from __future__ import annotations

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

import grid_image
import prehistory_population as pp
import terrain_image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "tiles" / "grid_adjusted"

# Share of the climate-implied shift that is applied. 1 would trust the capacity model fully;
# 0 is HYDE. A choice, not a fit (docs/ops/hyde-climate-spread.md, "How strong").
STRENGTH = 1.0
# Past ~4,000 BCE the humid period and the shelves are gone and what moves is the capacity
# model's own noise (docs/ops/hyde-climate-spread.md, "Which years"), so later years are not made.
YEARS = list(range(-10_000, -3_000, 1000))
BLOCK = 6  # HYDE 5' cells per 0.5 degree cell, each way

# African Humid Period: Beyer's climate (HadCM3) and Krapp's biomes leave the Sahara a desert,
# so terrain_image paints it green by hand (`sahara_weight`, `sahara_extent`). The spread uses
# the same weight and extent, and moves the present-day rain belt north by this many degrees at
# full strength (rain reached ~23N in the mid-Holocene, ~15N today; Kuper & Kropelin 2006,
# Science 313:803 -- from memory, not checked against the paper).
SAHARA_SHIFT_DEG = 8.0

# Macro-regions, [west, south, east, north]. A cell belongs to the first box holding its
# centre, else the nearest. Coarse on purpose: they only say "people may move within this
# land system". Sundaland sits with mainland Southeast Asia, Sahul with Wallacea, Doggerland
# with Europe and Beringia with North America, so shelf joins the continent it was part of.
REGIONS: list[tuple[str, tuple[float, float, float, float]]] = [
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

# Places the report tracks: ([west, south, east, north], shelf_only). `shelf_only` keeps cells
# that are mostly sea today, so Doggerland is the North Sea floor, not the Netherlands.
# Not used by the method.
PLACES = {
    "sahara": ((-17, 15, 35, 30), False),
    "doggerland": ((-4, 51, 9, 62), True),
    "sundaland": ((97, -9, 118, 8), True),
    "beringia": ((165, 58, -160, 72), True),
    "sahul_shelf": ((125, -20, 145, -8), True),
    "all_shelf": ((-180, -90, 180, 90), True),
}


# --- pure helpers (tested) ----------------------------------------------------

def green_sahara_npp(npp, npp_now, lat, lon, year: float):
    """Raise the Sahara's NPP toward that of the present-day rain belt moved north by
    SAHARA_SHIFT_DEG, scaled by the humid period's strength and the terrain's extent.
    Only ever raises NPP. Grids are Krapp's 0.5 degree, row 0 = north; `lat` is a column,
    `lon` a row."""
    w = terrain_image.sahara_weight(year)
    if w <= 0:
        return npp
    rows = int(round(SAHARA_SHIFT_DEG / pp.CELL_DEG))
    # The value 8 degrees south of a row is `rows` rows further down the grid.
    moved = np.concatenate([npp_now[rows:], np.repeat(npp_now[-1:], rows, axis=0)])
    reach = w * terrain_image.sahara_extent(lat, lon)
    return npp + reach * np.maximum(moved - npp, 0.0)


def climate_shift(then, now, hyde, region, strength: float) -> np.ndarray:
    """People per cell after moving each region's HYDE people toward where it was more
    habitable then than now. Every region keeps its HYDE total. A region with no people or
    no capacity then or now is left as HYDE has it."""
    out = np.array(hyde, dtype=np.float64)
    for r in np.unique(region):
        m = region == r
        total, cap_then, cap_now = hyde[m].sum(), then[m].sum(), now[m].sum()
        if total <= 0 or cap_then <= 0 or cap_now <= 0:
            continue
        moved = total * (then[m] / cap_then - now[m] / cap_now)
        new = np.maximum(hyde[m] + strength * moved, 0.0)
        out[m] = new * (total / new.sum())
    return out


def spread_to_cells(hyde5, old05, new05, land5) -> np.ndarray:
    """Apply per-block changes to HYDE's finer cells. Where a block lost people every cell in
    it loses the same share; where it gained, the gain is spread evenly over the block's
    cells flagged in `land5` (all of them if none are). Block totals become `new05`."""
    h, w = old05.shape
    cells = hyde5.reshape(h, BLOCK, w, BLOCK).astype(np.float64)
    land = land5.reshape(h, BLOCK, w, BLOCK).astype(np.float64)
    land = np.where(land.sum(axis=(1, 3), keepdims=True) > 0, land, 1.0)
    delta = (new05 - old05)[:, None, :, None]
    keep = np.where(old05 > 0, np.minimum(new05, old05) / np.where(old05 > 0, old05, 1.0), 0.0)
    gain = np.maximum(delta, 0.0) * land / land.sum(axis=(1, 3), keepdims=True)
    return (cells * keep[:, None, :, None] + gain).reshape(h * BLOCK, w * BLOCK)


def region_index() -> np.ndarray:
    return pp.assign_regions([list(box) for _, box in REGIONS])


@lru_cache(maxsize=1)
def shelf05() -> np.ndarray:
    """0.5 degree cells that are mostly below today's sea level (ETOPO1)."""
    return (elevation5().reshape(pp.NY, BLOCK, pp.NX, BLOCK) < 0).mean(axis=(1, 3)) > 0.5


def place_mask(box, shelf_only: bool) -> np.ndarray:
    """Cells in `box`; west > east means the box crosses the antimeridian."""
    west, south, east, north = box
    lon, lat = np.meshgrid(pp.grid_lons(), pp.grid_lats())
    across = (lon >= west) & (lon < east) if west <= east else (lon >= west) | (lon < east)
    inside = across & (lat >= south) & (lat < north)
    return inside & shelf05() if shelf_only else inside


# --- model --------------------------------------------------------------------

class SpreadModel(pp.Model):
    """prehistory_population's capacity model, with the Green Sahara."""

    @lru_cache(maxsize=1)
    def npp_now(self) -> np.ndarray:
        return self.climate_npp(pp.BP_ZERO)[0]

    def adjust_npp(self, npp, year):
        lat = pp.grid_lats()[:, None]
        lon = pp.grid_lons()[None, :]
        return green_sahara_npp(npp, self.npp_now(), lat, lon, year)


@lru_cache(maxsize=1)
def elevation5() -> np.ndarray:
    """ETOPO1 metres on HYDE's 5' grid."""
    return terrain_image.resize(terrain_image.elevation(), grid_image.GLOBAL_GRID["ncols"],
                                grid_image.GLOBAL_GRID["nrows"], Image.BOX)


def mapped_capacity(model: SpreadModel, year: float, land5: np.ndarray) -> np.ndarray:
    """People the land could hold, with the coast the map draws. Krapp's coast and the map's
    (ETOPO at Spratt sea level) differ by a cell or two; where the map shows less dry land
    than Krapp the capacity is scaled down, so no one is put on the sea."""
    capacity, land = model.potential_and_climate(year)
    dry = land5.reshape(pp.NY, BLOCK, pp.NX, BLOCK).mean(axis=(1, 3))
    return capacity * np.minimum(1.0, dry / np.maximum(land.land, 1e-6))


def adjusted_people(model: SpreadModel, year: int, strength: float) -> tuple[np.ndarray, np.ndarray, dict]:
    """(HYDE people, adjusted people, report) on HYDE's 5' grid for one HYDE year."""
    hyde5 = grid_image.source_people(year)
    hyde05 = pp.sum_blocks(hyde5, BLOCK)
    land5 = elevation5() > terrain_image.sea_level(year)
    then = mapped_capacity(model, year, land5)
    now = mapped_capacity(model, pp.BP_ZERO, elevation5() > terrain_image.sea_level(pp.BP_ZERO))
    region = region_index()
    new05 = climate_shift(then, now, hyde05, region, strength)
    adj5 = spread_to_cells(hyde5, hyde05, new05, land5)
    return hyde5, adj5, report(year, hyde05, new05, region)


def report(year: int, hyde05, new05, region) -> dict:
    share = lambda a, place: float(a[place_mask(*place)].sum())  # noqa: E731
    total = float(hyde05.sum())
    return {
        "year": year,
        "world": round(total),
        "moved": round(float(np.abs(new05 - hyde05).sum() / 2)),
        "regions": {name: {"hyde": round(float(hyde05[region == i].sum())),
                           "adjusted": round(float(new05[region == i].sum()))}
                    for i, (name, _) in enumerate(REGIONS)},
        "places": {name: {"hyde": round(share(hyde05, place)), "adjusted": round(share(new05, place))}
                   for name, place in PLACES.items()},
    }


def encode(year: int, strength: float, model: SpreadModel, out: Path = OUT, verify: bool = False) -> dict:
    hyde5, adj5, rep = adjusted_people(model, year, strength)
    q = grid_image.quantise(adj5)
    rgb = np.zeros((*q.shape, 3), dtype=np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"humans_{year}.webp"
    Image.fromarray(rgb, "RGB").save(path, lossless=True, quality=100, method=6)
    decoded = grid_image.decode(path).sum()
    if verify and abs(decoded - hyde5.sum()) / hyde5.sum() > grid_image.TOTAL_RTOL * 3:
        raise ValueError(f"{year}: adjusted total {decoded:,.0f} vs HYDE {hyde5.sum():,.0f}")
    s = rep["places"]
    print(f"{year}: {hyde5.sum():,.0f} people, {rep['moved']:,} moved; Sahara {s['sahara']['hyde']:,} -> "
          f"{s['sahara']['adjusted']:,}, Doggerland {s['doggerland']['hyde']:,} -> "
          f"{s['doggerland']['adjusted']:,}, {path.stat().st_size / 1e6:.2f} MB", flush=True)
    return rep


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").strip().splitlines()[0])
    p.add_argument("years", type=int, nargs="*", default=YEARS)
    p.add_argument("--strength", type=float, default=STRENGTH,
                   help="share of the climate-implied shift to apply, 0 (HYDE) to 1")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--verify", action="store_true", help="check each decoded total against HYDE's")
    a = p.parse_args()
    model = SpreadModel(pp.load_table())
    reports = [encode(y, a.strength, model, a.out, a.verify) for y in a.years]
    (a.out / "spread_report.json").write_text(
        json.dumps({"strength": a.strength, "sahara_shift_deg": SAHARA_SHIFT_DEG, "years": reports},
                   separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
