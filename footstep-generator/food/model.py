"""The domain model: a domesticate is a set of dated claims about where it was present.

Data shape (principle: model the domain, then code against it):

    Claim  = "by `ka` thousand years BP (calibrated), this domesticate was present in these boxes".
             kind "origin" = an independent domestication centre; "spread" = arrival by diffusion.
    Taxon  = id, name, kind (crop | animal), group, centre text, and an ordered tuple of Claims.
    Basis  = how good the date is: DATED (a published date for this domesticate in or near the
             place), HISTORIC (a written record, e.g. the horse reaching the Americas), FRONT (an
             estimate for a diffusion front, rounded from a published range; no site date here).
    Era    = a HYDE year (the 30 years the atlas uses). An era is a SNAPSHOT at that calendar year.

Rules (all tested):

    * Presence is the UNION of claims: a domesticate is present in a cell at an era iff some claim
      holds the cell's centre and `ka * 1000 >= 1950 - year`. Order does not matter, and presence
      is monotone in time (once in, never out). Losses are not modelled (see research 0008).
    * `arrival_ka` for a cell is the oldest claim holding it.
    * Every taxon has at least one origin claim, and no spread claim is older than the oldest origin.
    * `checked` means the figure was confirmed against a search summary of the source in this
      session; everything else is recalled from the literature and was not read from the paper.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from enum import Enum
from typing import Literal

from food.regions import Box

BP_ZERO = 1950
CELL_DEG = 5
ERAS: list[int] = [*range(-10000, 0, 1000), *range(0, 2000, 100)]  # the 30 HYDE years; same as the atlas


class Basis(str, Enum):
    DATED = "dated"
    HISTORIC = "historic"
    FRONT = "front"


Confidence = Literal["high", "medium", "low"]


@dataclass(frozen=True)
class Claim:
    ka: float
    boxes: tuple[Box, ...]
    basis: Basis
    source: str
    kind: Literal["origin", "spread"] = "spread"
    checked: bool = False

    def __post_init__(self) -> None:
        if self.ka < 0:
            raise ValueError("ka is thousands of years BP and cannot be negative")
        if not self.boxes:
            raise ValueError("a claim needs at least one box")
        for lo_x, hi_x, lo_y, hi_y in self.boxes:
            if not (-180 <= lo_x < hi_x <= 180 and -90 <= lo_y < hi_y <= 90):
                raise ValueError(f"bad box {(lo_x, hi_x, lo_y, hi_y)}: must be lon/lat degrees, min < max, no antimeridian crossing")

    @property
    def confidence(self) -> Confidence:
        if self.basis is Basis.HISTORIC or (self.basis is Basis.DATED and self.checked):
            return "high"
        return "medium" if self.basis is Basis.DATED else "low"

    def holds(self, lon: float, lat: float) -> bool:
        return any(x0 <= lon <= x1 and y0 <= lat <= y1 for x0, x1, y0, y1 in self.boxes)


def claim(ka: float, boxes: Box | tuple[Box, ...], basis: Basis, source: str, *, origin: bool = False, checked: bool = False) -> Claim:
    """Short constructor for the tables: `boxes` may be one Box or a tuple of them."""
    bs = (boxes,) if boxes and isinstance(boxes[0], (int, float)) else tuple(boxes)  # type: ignore[arg-type]
    return Claim(ka, bs, basis, source, "origin" if origin else "spread", checked)  # type: ignore[arg-type]


@dataclass(frozen=True)
class Taxon:
    id: str
    name: str
    kind: Literal["crop", "animal"]
    group: str
    centre: str
    claims: tuple[Claim, ...]
    note: str = ""

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9_]*", self.id):
            raise ValueError(f"bad taxon id {self.id!r}")
        origins = [c.ka for c in self.claims if c.kind == "origin"]
        if not origins:
            raise ValueError(f"{self.id}: needs an origin claim")
        oldest = max(origins)
        late = [c for c in self.claims if c.kind == "spread" and c.ka > oldest]
        if late:
            raise ValueError(f"{self.id}: spread claim older than the oldest origin ({late[0].ka} > {oldest})")

    @property
    def needs(self) -> Literal["crop", "farm", "none"]:
        """What HYDE land use must show for the cell to count it as grown or kept: crops need cropland,
        livestock need cropland or grazing land ("farm"), companion animals need nothing."""
        return "crop" if self.kind == "crop" else "none" if self.group == "companion" else "farm"

    @property
    def origin_ka(self) -> float:
        return max(c.ka for c in self.claims if c.kind == "origin")

    def arrival_ka(self, lon: float, lat: float) -> float | None:
        """Oldest claim holding the point, or None if no claim does."""
        ks = [c.ka for c in self.claims if c.holds(lon, lat)]
        return max(ks) if ks else None

    def present(self, lon: float, lat: float, year: int) -> bool:
        a = self.arrival_ka(lon, lat)
        return a is not None and a * 1000 >= era_bp(year)

    def confidence_at(self, lon: float, lat: float) -> Confidence | None:
        """Confidence of the claim that sets the arrival date at this point."""
        a = self.arrival_ka(lon, lat)
        if a is None:
            return None
        best = [c for c in self.claims if c.ka == a and c.holds(lon, lat)]
        order = {"high": 2, "medium": 1, "low": 0}
        return max((c.confidence for c in best), key=order.__getitem__)


def era_bp(year: int) -> int:
    return BP_ZERO - year


def era_index(year: float) -> int:
    """The latest era at or before `year` (a snapshot never shows the future); the first era for earlier years."""
    prior = [i for i, e in enumerate(ERAS) if e <= year]
    return prior[-1] if prior else 0


def cell_origin(lat: float, lon: float) -> tuple[int, int]:
    """South-west corner (lat0, lon0) of the 5-degree cell holding a point; same convention as the atlas."""
    lat0 = min(int(math.floor(lat / CELL_DEG)) * CELL_DEG, 90 - CELL_DEG)
    lon0 = min(int(math.floor(lon / CELL_DEG)) * CELL_DEG, 180 - CELL_DEG)
    return lat0, lon0


def cell_centre(lat0: int, lon0: int) -> tuple[float, float]:
    """(lon, lat) of a cell's centre."""
    return lon0 + CELL_DEG / 2, lat0 + CELL_DEG / 2
