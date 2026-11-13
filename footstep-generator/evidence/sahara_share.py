#!/usr/bin/env python3
"""Share of dated African sites that lie in the Sahara, per millennium (the check on
hyde_climate_spread.py's Green Sahara; docs/ops/hyde-climate-spread.md, "How strong").

Needs data/evidence/p3k14c_dates.csv.gz (`python footstep-generator/evidence/p3k14c.py build`).
A site counts once per millennium it has a date in. Dated sites are not people: research effort,
preservation and deflation all bend the share. It says which way and roughly how far HYDE is off.

Usage: python footstep-generator/evidence/sahara_share.py
"""
from pathlib import Path

import pandas as pd

DATES = Path(__file__).resolve().parents[2] / "data" / "evidence" / "p3k14c_dates.csv.gz"
AFRICA = (-20, -36, 52, 37)   # hyde_climate_spread.REGIONS["africa"]
SAHARA = (-17, 15, 35, 30)    # hyde_climate_spread.PLACES["sahara"]


def inside(d: pd.DataFrame, box) -> pd.Series:
    west, south, east, north = box
    return d.lon.between(west, east, inclusive="left") & d.lat.between(south, north, inclusive="left")


def main() -> None:
    d = pd.read_csv(DATES)
    d = d[(d.status == "ok") & (d.carbon_source != "uncertain") & (d.acc >= 1)]
    d = d[inside(d, AFRICA)].assign(year=lambda x: 1950 - x.cal_median)
    print("millennium  African sites  in Sahara box")
    for start in range(-10_000, 1000, 1000):
        sites = d[(d.year >= start) & (d.year < start + 1000)].drop_duplicates("site_id")
        print(f"{start:>9}  {len(sites):>13}  {inside(sites, SAHARA).mean():>12.1%}")


if __name__ == "__main__":
    main()
