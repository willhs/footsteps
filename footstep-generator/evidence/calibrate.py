"""Radiocarbon calibration against IntCal20 / SHCal20 / Marine20.

Pure functions: a curve and arrays of (14C age BP, 1-sigma error) in, calibrated
ranges out. No file or network access except `load_curve`.

Each date becomes a probability distribution over calendar years (the standard
Bayesian-free calibration: a Gaussian date against a Gaussian curve), summarised as
the 95.4% highest-probability-density (HPD) region. The HPD can be several
disjoint intervals; we keep every interval and also its hull (oldest to youngest
edge), which is what a map label needs.

All calendar ages are cal BP (years before 1950); year CE = 1950 - cal BP.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import numpy as np

GRID_STEP = 5  # cal-year step of the working grid (curves are 5-20 yr; dates are >= 15 yr)
GRID_MAX = 55_000  # IntCal20/SHCal20/Marine20 all end at 55 cal kBP
HPD_MASS = 0.954  # 2 sigma
OFF_CURVE_Z = 3.0  # no cal age within this many sigma => the date is off the curve

CAL_GRID = np.arange(0, GRID_MAX + 1, GRID_STEP, dtype=np.float64)


class CalStatus(str, Enum):
    OK = "ok"
    # The 14C age is older than anything on the curve (a cal age beyond ~55 ka).
    # The date is real but only a minimum age can be given.
    OLDER_THAN_CURVE = "older_than_curve"
    # Younger than the curve at 0 cal BP (only happens with Marine20, whose 0 BP is ~400 14C yr).
    YOUNGER_THAN_CURVE = "younger_than_curve"


@dataclass(frozen=True)
class Curve:
    """A calibration curve resampled onto CAL_GRID."""

    name: str
    c14: np.ndarray  # 14C age BP at each grid point
    sigma: np.ndarray  # curve 1-sigma at each grid point


@dataclass(frozen=True)
class Calibrated:
    """Calibration result for one date. `intervals` are (old, young) cal BP pairs, old first."""

    status: CalStatus
    intervals: tuple[tuple[int, int], ...]  # empty unless status is OK
    median: int | None
    # Hull of the intervals; for OLDER_THAN_CURVE, `young` is the curve's end (a minimum age).
    old: int | None
    young: int | None


def load_curve(path: Path, name: str) -> Curve:
    """Parse an intcal.org `.14c` file (comment lines '#', columns calBP,14C,sigma,...)."""
    rows = []
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split(",")
        rows.append((float(parts[0]), float(parts[1]), float(parts[2])))
    if not rows:
        raise ValueError(f"no curve rows in {path}")
    arr = np.array(sorted(rows))  # ascending cal BP (files are descending)
    return Curve(
        name=name,
        c14=np.interp(CAL_GRID, arr[:, 0], arr[:, 1]),
        sigma=np.interp(CAL_GRID, arr[:, 0], arr[:, 2]),
    )


def _window(curve: Curve, a_min: float, a_max: float, s_max: float) -> slice:
    """Grid columns that can hold any mass for dates in [a_min, a_max] with errors <= s_max."""
    reach = 6.0 * (s_max + curve.sigma)
    hit = np.flatnonzero((curve.c14 + reach >= a_min) & (curve.c14 - reach <= a_max))
    if hit.size == 0:
        return slice(0, 0)
    return slice(int(hit[0]), int(hit[-1]) + 1)


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Index pairs (first, last) of each run of True in `mask`."""
    padded = np.concatenate(([False], mask, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return [(int(s), int(e) - 1) for s, e in zip(edges[::2], edges[1::2])]


def _summarise(prob: np.ndarray, cal: np.ndarray) -> Calibrated:
    """HPD intervals and median of one normalised distribution over ascending `cal`."""
    order = np.argsort(prob)[::-1]
    cum = np.cumsum(prob[order])
    k = int(np.searchsorted(cum, HPD_MASS)) + 1
    threshold = prob[order[min(k, len(order)) - 1]]
    runs = _runs(prob >= threshold)
    intervals = tuple(sorted(((int(cal[b]), int(cal[a])) for a, b in runs), reverse=True))
    median = int(cal[int(np.searchsorted(np.cumsum(prob), 0.5))])
    return Calibrated(
        status=CalStatus.OK,
        intervals=intervals,
        median=median,
        old=intervals[0][0],
        young=intervals[-1][1],
    )


def calibrate(
    ages: np.ndarray, errors: np.ndarray, curve: Curve, chunk: int = 1000
) -> list[Calibrated]:
    """Calibrate many dates. Result i belongs to (ages[i], errors[i])."""
    ages = np.asarray(ages, dtype=np.float64)
    errors = np.maximum(np.asarray(errors, dtype=np.float64), 1.0)
    out: list[Calibrated | None] = [None] * len(ages)
    # Sorting by age keeps each chunk's calendar window narrow, which is what makes 174k dates fast.
    order = np.argsort(ages)
    for start in range(0, len(order), chunk):
        idx = order[start : start + chunk]
        a, s = ages[idx], errors[idx]
        win = _window(curve, a.min(), a.max(), s.max())
        cal = CAL_GRID[win]
        mu, sc = curve.c14[win], curve.sigma[win]
        if cal.size == 0:
            z_min = np.full(len(idx), np.inf)
            lik = np.zeros((len(idx), 0))
        else:
            var = s[:, None] ** 2 + sc[None, :] ** 2
            dz = (a[:, None] - mu[None, :]) / np.sqrt(var)
            z_min = np.abs(dz).min(axis=1)
            lik = np.exp(-0.5 * dz**2) / np.sqrt(var)
        for row, i in enumerate(idx):
            if z_min[row] > OFF_CURVE_Z:
                older = ages[i] > curve.c14.max()
                out[i] = Calibrated(
                    status=CalStatus.OLDER_THAN_CURVE if older else CalStatus.YOUNGER_THAN_CURVE,
                    intervals=(),
                    median=None,
                    old=None,
                    young=GRID_MAX if older else 0,
                )
                continue
            total = lik[row].sum()
            out[i] = _summarise(lik[row] / total, cal)
    return out  # type: ignore[return-value]
