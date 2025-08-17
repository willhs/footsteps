#!/usr/bin/env python3
"""
Export tiles from an MBTiles file into a z/x/y .pbf directory tree.

- Reads from the 'tiles' table using sqlite3 (no tippecanoe dependency)
- Writes raw tile_data bytes to {out_dir}/{year}/single/{z}/{x}/{y}.pbf
- Converts MBTiles TMS y to XYZ y via: y_xyz = (1 << z) - 1 - tile_row
- Leaves tile_data gzip-compressed (as produced by tippecanoe), so set
  Content-Type: application/x-protobuf and Content-Encoding: gzip when uploading.

Usage:
  python export_mbtiles_to_pbf.py --mbtiles path/to/humans_0.mbtiles --out-dir ./data/tiles/humans/zxy

Optional:
  --year can be provided; otherwise parsed from filename like humans_{year}.mbtiles
"""
from __future__ import annotations

import argparse
import os
import re
import sqlite3
from pathlib import Path
from typing import Optional


def parse_year_from_filename(path: str) -> Optional[int]:
    m = re.search(r"humans_(-?\d+)\.mbtiles$", os.path.basename(path))
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def export_mbtiles_to_pbf(
    mbtiles_path: str,
    out_dir: str,
    year: Optional[int] = None,
    overwrite: bool = False,
) -> int:
    mb = Path(mbtiles_path)
    if not mb.exists():
        raise FileNotFoundError(f"MBTiles not found: {mbtiles_path}")

    y = year if year is not None else parse_year_from_filename(mbtiles_path)
    if y is None:
        raise ValueError("Year not provided and could not be parsed from filename (expected humans_{year}.mbtiles)")

    base = Path(out_dir) / str(y) / "single"
    ensure_dir(base)

    con = sqlite3.connect(str(mb))
    cur = con.cursor()
    # Optimise for large sequential reads
    cur.execute("PRAGMA journal_mode=OFF")
    cur.execute("PRAGMA synchronous=OFF")
    cur.execute("PRAGMA temp_store=MEMORY")

    # Read all tiles
    cur.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles")

    count = 0
    for row in cur:
        z, x, y_tms, data = int(row[0]), int(row[1]), int(row[2]), row[3]
        # Convert TMS y to XYZ y
        y_xyz = (1 << z) - 1 - y_tms
        # Create output path
        out_path = base / str(z) / str(x) / f"{y_xyz}.pbf"
        # Resume-friendly: skip if tile already exported (unless overwrite)
        if out_path.exists() and not overwrite:
            count += 1
            continue
        ensure_dir(out_path.parent)
        # Write raw bytes (already gzipped by tippecanoe)
        with open(out_path, "wb") as f:
            # Some MBTiles may store NULL; guard against it
            if data is not None:
                f.write(data)
        count += 1

    con.close()
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description="Export MBTiles to z/x/y .pbf tree")
    ap.add_argument("--mbtiles", required=True, help="Path to humans_{year}.mbtiles")
    ap.add_argument("--out-dir", required=True, help="Base output directory (will write {year}/single/{z}/{x}/{y}.pbf)")
    ap.add_argument("--year", type=int, help="Year (optional; parsed from filename if omitted)")
    ap.add_argument("--overwrite", action="store_true", help="Overwrite existing .pbf tiles if present")
    args = ap.parse_args()

    count = export_mbtiles_to_pbf(args.mbtiles, args.out_dir, year=args.year, overwrite=args.overwrite)
    print(f"✓ Exported {count} tiles from {args.mbtiles} to {args.out_dir}")


if __name__ == "__main__":
    main()
