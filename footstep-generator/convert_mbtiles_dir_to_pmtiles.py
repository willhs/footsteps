#!/usr/bin/env python3
from __future__ import annotations

import argparse
import glob
import os
from typing import List

from pmtiles_utils import convert_mbtiles_to_pmtiles


def main() -> None:
    ap = argparse.ArgumentParser(description="Convert humans_{year}.mbtiles → humans_{year}.pmtiles in a directory")
    ap.add_argument("--tiles-dir", required=True, help="Directory containing humans_{year}.mbtiles")
    ap.add_argument("--years", nargs="*", type=int, help="Specific years to convert (default: all found)")
    args = ap.parse_args()

    tiles_dir = args.tiles_dir
    years: List[int]
    if args.years:
        years = args.years
    else:
        years = []
        for p in glob.glob(os.path.join(tiles_dir, "humans_*.mbtiles")):
            base = os.path.basename(p)
            try:
                y = int(base.replace("humans_", "").replace(".mbtiles", ""))
                years.append(y)
            except Exception:
                continue
        years.sort()

    if not years:
        print("✗ No humans_{year}.mbtiles files found to convert.")
        return

    print(f"Converting {len(years)} MBTiles → PMTiles under {tiles_dir}…")
    ok_all = True
    for y in years:
        mb = os.path.join(tiles_dir, f"humans_{y}.mbtiles")
        pm = os.path.join(tiles_dir, f"humans_{y}.pmtiles")
        if not os.path.exists(mb):
            print(f"  ✗ Skip {y}: missing {mb}")
            ok_all = False
            continue
        if os.path.exists(pm):
            print(f"  ↪ Skip {y}: {pm} already exists")
            continue
        print(f"  → {os.path.basename(mb)} → {os.path.basename(pm)}")
        ok = convert_mbtiles_to_pmtiles(mb, pm)
        if ok:
            print(f"  ✓ {os.path.basename(pm)}")
        else:
            print("  ✗ Conversion failed. Install `pmtiles` CLI or `pip install pmtiles`.")
            ok_all = False

    if ok_all:
        print("✓ All requested conversions succeeded")
    else:
        print("⚠ Some conversions failed; see messages above")


if __name__ == "__main__":
    main()

