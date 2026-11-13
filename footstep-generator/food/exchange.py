"""Arrival fronts after 1492 CE, shared by crops and animals (the Columbian exchange).

Old World domesticates reach the Americas and Australia with colonists; a few New World crops go
the other way. These are written records, so Basis.HISTORIC, but the dates are the first
documented arrival in a coarse region, not when the thing was common. Recalled from Crosby 1972
(The Columbian Exchange) and general histories; not checked against a source this session.
"""

from __future__ import annotations

from food import regions as R
from food.model import Basis, Claim, claim

CROSBY = "Crosby 1972 The Columbian Exchange (recalled)"


def old_world_to_americas(*, latin: float = 0.43, na_east: float = 0.34, na_west: float = 0.2, australia: float | None = 0.16,
                          what: str = "") -> tuple[Claim, ...]:
    """Spread claims for an Old World domesticate: Spanish colonies ~1520 CE, English/French North America
    ~1610, western North America ~1750, Australia 1788."""
    out = [
        claim(latin, R.LATIN_AMERICA, Basis.HISTORIC, f"{what} to Spanish/Portuguese America by ~{1950 - round(latin * 1000)} CE; {CROSBY}"),
        claim(na_east, R.NA_EAST, Basis.HISTORIC, f"{what} to eastern North America by ~{1950 - round(na_east * 1000)} CE; {CROSBY}"),
        claim(na_west, R.NA_WEST, Basis.HISTORIC, f"{what} to western North America by ~{1950 - round(na_west * 1000)} CE; {CROSBY}"),
    ]
    if australia is not None:
        out.append(claim(australia, R.AUSTRALIA, Basis.HISTORIC, f"{what} to Australia with the First Fleet, 1788 CE"))
    return tuple(out)
