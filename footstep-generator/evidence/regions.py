"""Regions for the Homo sapiens arrival table (docs/research/0002-pre-hyde-population-model §3).

There is no arrivals.yaml yet. This module is the one place the region names, their
coarse extents and the table's current values live, so the arrival table and the
evidence report agree on both. The extents are deliberately coarse boxes (they are
for grouping dated sites, not for drawing borders) and are applied in order, first
match wins.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# (min_lon, max_lon, min_lat, max_lat)
Box = tuple[float, float, float, float]


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    # p3k14c `Continent` values the region may draw from; None = any.
    continents: tuple[str, ...] | None
    boxes: tuple[Box, ...] | None  # None = whole continent(s)
    # Arrival in ka BP from the research 0002 table, (young, old) of the stated range; None when
    # the table gives no date. `table_note` keeps the table's words, including its doubts.
    table_ka: tuple[float, float] | None
    table_note: str


# Order matters: the specific boxes come first so they take their dates out of the big ones.
REGIONS: tuple[Region, ...] = (
    Region("japan", "Japan", ("Asia",), ((129.5, 146.5, 30.0, 46.0),), (38, 38),
           "~38 ka (memory, unverified)"),
    Region("tibetan_plateau", "Tibetan plateau", ("Asia",), ((79.0, 103.0, 28.0, 37.0),), (30, 40),
           "40-30 ka, possibly Denisovans (medium)"),
    Region("levant_arabia", "Levant and Arabia", ("Asia",),
           ((32.5, 42.5, 29.0, 38.0), (35.0, 60.0, 12.0, 29.0)), (80, 120),
           "120-80 ka early, non-lasting exits (medium); main exit ~50 ka"),
    Region("sahul", "Sahul (Australia, New Guinea)", ("Asia", "Australia"),
           ((112.0, 155.0, -44.0, -10.5), (130.0, 165.0, -12.0, 2.0)), (47, 50),
           "50-47 ka, or 65 ka at Madjedbebe (disputed)"),
    Region("siberia_arctic", "Siberia and the Arctic", ("Asia",), ((60.0, 190.0, 50.0, 90.0),), (32, 45),
           "~45 ka Ust'-Ishim / ~32 ka Yana (memory, unverified)"),
    Region("east_asia", "East Asia", ("Asia",), ((98.0, 135.0, 20.0, 50.0),), (40, 40),
           "~40 ka (memory, unverified)"),
    Region("southeast_asia", "Southeast Asia", ("Asia",), ((92.0, 127.0, -11.0, 22.0),), None,
           "not in the table"),
    Region("south_asia", "South Asia", ("Asia",), ((60.0, 98.0, 5.0, 37.0),), (45, 50),
           "~50-45 ka (memory, unverified)"),
    Region("africa", "Africa", ("Africa",), None, None, "throughout (high)"),
    Region("europe", "Europe", ("Europe",), None, (45, 47),
           "~47-45 ka, possibly 54 ka at Mandrin (memory, unverified)"),
    Region("americas", "The Americas", ("North America", "Central America", "South America"), None,
           (21, 23), "White Sands footprints 23-21 ka (debated); widespread after ~16-14 ka"),
)

REGION_IDS: tuple[str, ...] = tuple(r.id for r in REGIONS)
OTHER = "other"  # Central Asia, Anatolia, Iran, Caucasus, Pacific islands: not in the table


def _in_box(lon: np.ndarray, lat: np.ndarray, box: Box) -> np.ndarray:
    return (lon >= box[0]) & (lon <= box[1]) & (lat >= box[2]) & (lat <= box[3])


def assign_regions(lat: np.ndarray, lon: np.ndarray, continent: np.ndarray) -> np.ndarray:
    """Region id for each point (object array of str); first matching region wins, else OTHER."""
    lat, lon, continent = np.asarray(lat), np.asarray(lon), np.asarray(continent)
    out = np.full(len(lat), OTHER, dtype=object)
    free = np.ones(len(lat), dtype=bool)
    for region in REGIONS:
        hit = free.copy()
        if region.continents is not None:
            hit &= np.isin(continent, region.continents)
        if region.boxes is not None:
            hit &= np.logical_or.reduce([_in_box(lon, lat, b) for b in region.boxes])
        out[hit] = region.id
        free &= ~hit
    return out
