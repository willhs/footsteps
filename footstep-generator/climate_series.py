#!/usr/bin/env python3
"""Global climate series for the deep-time map: sea level and a temperature anomaly.

Writes one small JSON (`footsteps-web/public/climate_series.json`, ~15 KB) with a value
per slider year: every 1,000 years from 100,000 BCE to 1000 BCE, then every 100 years
from 0 to 1900 CE (the same years as `TERRAIN_YEARS` in `footsteps-web/lib/constants.ts`).

Sea level: Spratt & Lisiecki (2016), version 2 (2025), PANGAEA 979830, CC BY 3.0.
  Global mean sea level in metres relative to today (the 0-430 ka "short" stack),
  with the one-sigma bootstrap uncertainty. Source rows are every 1,000 years.
Temperature: Beyer, Krapp & Manica (2020), Figshare 12293345 v4, CC BY 4.0.
  Land-mean annual temperature change (deg C) against the 0 BP field, area-weighted over
  a FIXED mask (cells with data in the 0 BP field), so shelves that emerge at low sea
  level do not change the average. It is land-only and covers 60S-90N. It is NOT global
  mean surface temperature (land swings more than the ocean) and has no uncertainty.
  Source steps are 2 kyr before 22 ka BP and 1 kyr after.

Time: BP counts back from 1950, matching `terrain_image.year_to_bp`, so year 1900 is
50 BP and -10000 is 11,950 BP. Values between source rows are linearly interpolated;
years after 1950 hold the 0 BP value. Nothing here is measured at a finer step than
the source rows, so do not read centennial detail into the 0-1900 CE entries.

Usage (inputs are gitignored under data/raw/, see docs/ops/climate-series.md):
    poetry run python footstep-generator/climate_series.py
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPRATT = ROOT / "data/raw/spratt2025/spratt2025_pangaea979830.tsv"
BEYER = ROOT / "data/raw/beyer2020/LateQuaternary_Environment.nc"
OUT = ROOT / "footsteps-web/public/climate_series.json"

BP_ZERO = 1950  # calendar year of 0 BP

SOURCES = {
    "seaLevel": {
        "name": "Spratt & Lisiecki, A Late Pleistocene sea level stack, v2 (2025)",
        "url": "https://doi.org/10.1594/PANGAEA.979830",
        "licence": "CC BY 3.0",
        "unit": "m relative to today",
    },
    "temperature": {
        "name": "Beyer, Krapp & Manica, high-resolution palaeoclimate 120 ka (2020)",
        "url": "https://doi.org/10.6084/m9.figshare.12293345.v4",
        "licence": "CC BY 4.0",
        "unit": "deg C change in land-mean annual temperature vs 0 BP (land only, 60S-90N)",
    },
}


def slider_years() -> list[int]:
    """Same years as TERRAIN_YEARS in footsteps-web/lib/constants.ts."""
    return [*range(-100_000, 0, 1000), *range(0, 2000, 100)]


def year_to_bp(year: float) -> float:
    return BP_ZERO - year


def interp_bp(bp_src: np.ndarray, values: np.ndarray, years: list[int]) -> np.ndarray:
    """Linear interpolation at calendar years; ages after 1950 clamp to 0 BP.
    Years older than the source raise rather than extrapolate."""
    bp = np.maximum([year_to_bp(y) for y in years], 0.0)
    if bp.max() > bp_src.max():
        raise ValueError(f"source ends at {bp_src.max():.0f} BP, need {bp.max():.0f}")
    order = np.argsort(bp_src)
    return np.interp(bp, bp_src[order], values[order])


def load_sea_level(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(age ka BP * 1000, sea level m, 1-sigma m) from the PANGAEA TSV."""
    rows = []
    for line in path.read_text().split("*/", 1)[1].strip().splitlines()[1:]:
        c = line.split("\t")
        rows.append((float(c[0]), float(c[1]), float(c[2])))
    a = np.array(rows)
    return a[:, 0] * 1000.0, a[:, 1], a[:, 2]


def land_mean(field: np.ndarray, lat: np.ndarray, mask: np.ndarray) -> float:
    """cos(latitude)-weighted mean of field over a fixed mask [lat, lon]."""
    w = np.broadcast_to(np.cos(np.deg2rad(lat))[:, None], field.shape)
    use = mask & np.isfinite(field)
    return float((field * w)[use].sum() / w[use].sum())


def load_temperature(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """(age BP, land-mean annual temperature anomaly vs 0 BP) from Beyer 2020 BIO1."""
    import xarray as xr

    ds = xr.open_dataset(path, decode_times=False)
    bp = -ds["time"].values.astype(float)  # file stores negative years since present
    bio1 = ds["BIO1"]
    lat = ds["latitude"].values
    mask = np.isfinite(bio1.isel(time=int(np.argmin(bp))).values)
    means = np.array([land_mean(bio1.isel(time=i).values, lat, mask) for i in range(len(bp))])
    return bp, means - means[int(np.argmin(bp))]


def build(spratt: Path, beyer: Path) -> dict:
    years = slider_years()
    bp_sl, sl, sig = load_sea_level(spratt)
    bp_t, anom = load_temperature(beyer)
    sea = interp_bp(bp_sl, sl, years)
    err = interp_bp(bp_sl, sig, years)
    temp = interp_bp(bp_t, anom, years)
    return {
        "description": "Global climate series per slider year. BP = 1950 - year.",
        "years": years,
        "seaLevel": {**SOURCES["seaLevel"], "values": np.round(sea, 1).tolist(),
                     "sigma": np.round(err, 1).tolist()},
        "temperature": {**SOURCES["temperature"], "values": np.round(temp, 2).tolist()},
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--spratt", type=Path, default=SPRATT)
    p.add_argument("--beyer", type=Path, default=BEYER)
    p.add_argument("--out", type=Path, default=OUT)
    a = p.parse_args()
    data = build(a.spratt, a.beyer)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {a.out} ({a.out.stat().st_size} bytes, {len(data['years'])} years)")


if __name__ == "__main__":
    main()
