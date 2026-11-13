"""When a species stopped being present in a place: the timing logic, pure functions only.

Data shape (principle: name the domain, then code against it):

    Species fate = an ordered tuple of `Loss` entries, most specific first.
    Loss         = "from `last_ka` on, this species is gone from these boxes" (boxes None = anywhere).
    last_ka      = age of the last record in ka BP (thousands of years before 1950). SMALLER = YOUNGER.
    Step k       = the 1,000-year step k ka BP (k = 0..102, same steps as habitat_lookup.py).

Invariants:

    * Step k stands for the span k +/- 0.5 ka. A species is present at step k in a cell iff the cell is
      in its present-natural range AND it was alive at some moment of that span, i.e.
      k >= last_ka - 0.5 for the first Loss whose boxes hold the cell (no Loss = never lost).
      So a species is shown through the step that holds its last record: last_ka = 4.0 shows at the
      4 ka step and not the 3 ka step; last_ka = 0.3 (aurochs, 1627 CE) still shows at step 0.
    * A species with no matching Loss and status EP (prehistorically extinct) takes the regional
      default; one with status EX/EW or alive and no matching Loss is simply present to the end.
    * `Basis` records how good a date is. It travels with the date into the export and the UI.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

BP_ZERO = 1950  # calendar year of 0 BP
STEP_YEARS = 1000
MAX_KA = 102  # oldest step: 100,000 BCE = 101,950 BP -> nearest 1,000-year step
LAST_APP_YEAR = 1900  # the app's last year; step 0 stands for it (and for 1950)

NEVER_KA = 1000.0  # a last_ka older than the series (102 ka): the species is never shown there

# (min_lon, max_lon, min_lat, max_lat), degrees; a box never crosses the antimeridian
Box = tuple[float, float, float, float]


class Basis(str, Enum):
    """How much to trust a `last_ka`."""

    DATED = "dated"  # a published last-appearance estimate for this species (or its genus), recalled from the source
    HISTORIC = "historic"  # a written record
    REGIONAL = "regional"  # no species date: the typical window for the region. A guess, wide.
    RANGE_CUT = "range_cut"  # PHYLACINE's counterfactual range reaches a place the species never lived: cut it


@dataclass(frozen=True)
class Loss:
    last_ka: float
    basis: Basis
    source: str
    boxes: tuple[Box, ...] | None = None  # None: anywhere not matched by an earlier Loss
    refugium: bool = False  # also place the species in these boxes even if its raster range misses them

    def __post_init__(self) -> None:
        if self.last_ka < 0:
            raise ValueError("last_ka is ka BP and cannot be negative")
        if self.refugium and not self.boxes:
            raise ValueError("a refugium needs boxes")

    def covers(self, lat: float, lon: float) -> bool:
        return self.boxes is None or any(in_box(lat, lon, b) for b in self.boxes)


def in_box(lat: float, lon: float, box: Box) -> bool:
    return box[0] <= lon <= box[1] and box[2] <= lat <= box[3]


# --- time ---------------------------------------------------------------------

def year_to_ka(year: float) -> int:
    """The 1,000-year step nearest a calendar year, clamped to 0..MAX_KA (same rule as habitat_lookup)."""
    bp = BP_ZERO - year
    return int(min(MAX_KA, max(0, math.floor(bp / STEP_YEARS + 0.5))))


def ka_to_year(ka: float) -> float:
    return BP_ZERO - ka * STEP_YEARS


def year_to_last_ka(year: float) -> float:
    """last_ka for a written-record loss in calendar `year`. Anything after the app's last year (1900)
    counts as alive through it, so the step that stands for 1900 still shows the species."""
    if year >= LAST_APP_YEAR:
        return 0.0
    return (BP_ZERO - year) / STEP_YEARS


# --- the rule -------------------------------------------------------------------

def first_present_step(last_ka: float | None) -> int:
    """Youngest step at which a species with this last_ka is shown: ceil(last_ka - 0.5); 0 when never
    lost. Present at step k iff k >= this (the step's span k +/- 0.5 reaches back to the last record)."""
    return 0 if last_ka is None else max(0, int(math.ceil(last_ka - 0.5 - 1e-9)))


def is_present(last_ka: float | None, ka_step: int) -> bool:
    """The one presence rule. `last_ka` None = no loss before the end of the series."""
    return ka_step >= first_present_step(last_ka)


def matching_loss(losses: tuple[Loss, ...], lat: float, lon: float) -> Loss | None:
    """The first Loss whose boxes hold the point (list order is specificity order)."""
    for loss in losses:
        if loss.covers(lat, lon):
            return loss
    return None


# --- regional defaults ------------------------------------------------------------

# Coarse boxes, first match wins; everything else is Eurasia. Like evidence/regions.py they are for
# choosing a default window, not for drawing borders.
REGION_BOXES: tuple[tuple[str, tuple[Box, ...]], ...] = (
    ("sahul", ((112.0, 155.0, -45.0, -9.0), (130.0, 152.0, -11.0, 1.0))),
    ("africa", ((-20.0, 34.0, -35.0, 37.5), (34.0, 52.0, -35.0, 13.0))),
    ("north_america", ((-170.0, -50.0, 7.0, 84.0),)),
    ("south_america", ((-92.0, -30.0, -57.0, 7.0),)),
)

# last_ka, source. Only for species that are EP (extinct before written history) and have no
# species-level entry. Every one is a guess at the middle of a window, never a date for a species.
REGIONAL_DEFAULT: dict[str, tuple[float, str]] = {
    "north_america": (12.5, "Faith & Surovell 2009 PNAS: 16 of 35 genera have secure last dates inside 13.8-11.4 cal ka; midpoint"),
    "south_america": (11.0, "Barnosky & Lindsey 2010 / Prado et al. 2015: last South American megafauna mostly 13-8 ka; recalled, not re-checked"),
    "sahul": (42.0, "Saltre et al. 2016 Nat Commun 7:10511: Australian megafauna extinction peak 42.1 ka (36.7-48.1)"),
    "africa": (12.0, "Faith 2014 Earth-Sci Rev: African losses scattered over the Late Pleistocene and Holocene; a guess"),
    "eurasia": (20.0, "Eurasian last dates run from about 40 ka to the Holocene (Stuart & Lister); a guess at the middle"),
}


def region_of(lat: float, lon: float) -> str:
    for name, boxes in REGION_BOXES:
        if any(in_box(lat, lon, b) for b in boxes):
            return name
    return "eurasia"


def resolve(losses: tuple[Loss, ...], status: str, lat: float, lon: float) -> tuple[float | None, Basis | None, str | None]:
    """(last_ka, basis, source) for a species at a point. last_ka None = present to the end of the series.

    An explicit Loss wins. Otherwise EP species take the regional default; every other status is
    present to the end (the species table gives EX species an explicit Loss).
    """
    loss = matching_loss(losses, lat, lon)
    if loss is not None:
        return loss.last_ka, loss.basis, loss.source
    if status == "EP":
        ka, src = REGIONAL_DEFAULT[region_of(lat, lon)]
        return ka, Basis.REGIONAL, src
    return None, None, None
