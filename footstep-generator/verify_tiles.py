#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sqlite3
import math
from typing import Tuple, List


def xyz(lon: float, lat: float, z: int) -> Tuple[int, int]:
    x = int((lon + 180.0) / 360.0 * (1 << z))
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * (1 << z))
    return x, y


def tile_len(conn: sqlite3.Connection, z: int, x: int, y_xyz: int) -> int:
    tms_y = (1 << z) - 1 - y_xyz
    cur = conn.cursor()
    cur.execute(
        "SELECT length(tile_data) FROM tiles "
        "WHERE zoom_level=? AND tile_column=? AND tile_row=?",
        (z, x, tms_y),
    )
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def counts_by_zoom(path: str) -> List[Tuple[int, int]]:
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute(
        "SELECT zoom_level, count(*) FROM tiles "
        "GROUP BY zoom_level ORDER BY zoom_level"
    )
    rows = [(int(z), int(c)) for z, c in cur.fetchall()]
    con.close()
    return rows


def verify_single_layer(path: str, strict: bool = False) -> bool:
    print(f"Verifying single-layer tiles: {path}")
    if not os.path.exists(path):
        print("  ✗ File not found")
        return not strict
    rows = counts_by_zoom(path)
    print("  Zoom counts:")
    for z, c in rows:
        print(f"    z{z}: {c} tiles")
    z2 = next((c for z, c in rows if z == 2), 0)
    z3 = next((c for z, c in rows if z == 3), 0)
    ok = True
    if strict and z2 < 8:
        print("  ✗ z=2 has fewer than 8 tiles")
        ok = False
    if strict and z3 < 16:
        print("  ✗ z=3 has fewer than 16 tiles")
        ok = False

    regions = {
        "Europe": (10.0, 50.0),
        "MiddleEast": (40.0, 30.0),
        "EastAsia": (120.0, 35.0),
        "NorthAmerica": (-95.0, 40.0),
    }
    con = sqlite3.connect(path)
    nonzero_regions = 0
    for name, (lon, lat) in regions.items():
        x, y = xyz(lon, lat, 6)
        lens = [
            tile_len(con, 6, x + dx, y + dy)
            for dx in (-1, 0, 1)
            for dy in (-1, 0, 1)
        ]
        nz = sum(1 for length in lens if length > 0)
        total = sum(lens)
        print(f"  z6 {name}: nonzero {nz}/9, total bytes ~{total}")
        if nz > 0:
            nonzero_regions += 1
    con.close()
    if strict and nonzero_regions < 2:
        print("  ✗ z=6 appears empty in most sampled regions")
        ok = False
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify MBTiles coverage and density")
    ap.add_argument(
        "--tiles-dir",
        required=True,
        help="Directory with humans_{year}.mbtiles",
    )
    ap.add_argument("--year", type=int, required=True, help="Year to verify")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="Fail on basic coverage/density regressions",
    )
    args = ap.parse_args()

    single_path = os.path.join(args.tiles_dir, f"humans_{args.year}.mbtiles")
    ok = verify_single_layer(single_path, strict=args.strict)
    if args.strict and not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
