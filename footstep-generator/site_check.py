"""Count group positions that fall in the sea or on a lake, against Natural Earth's own polygons.

An independent check on `?settlements=1` placement (docs/ops/site-terrain.md "Measure"): the app's own mask is the baked 2.5'
image, so a count made with that image grades its own homework. This reads the positions the real builder wrote
(`settlementSites.real.test.ts` writes `positions_1900_before.bin` and `_after.bin`, float32 lon,lat pairs) and tests each
against the exact 10m land and lake polygons. 1900 CE has today's sea level, so the polygons are the right coast.

    poetry run python footstep-generator/site_check.py DIR [--raw NATURAL_EARTH_DIR]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

import site_terrain as st


def _union(path: Path):
    return unary_union([shape(f["geometry"]) for f in json.loads(path.read_text())["features"] if f.get("geometry")])


def count(positions: np.ndarray, land, lakes, no_dry: np.ndarray | None = None) -> dict:
    lon, lat = positions[0::2].astype(np.float64), positions[1::2].astype(np.float64)
    on_land = shapely.contains_xy(land, lon, lat)
    on_lake = shapely.contains_xy(lakes, lon, lat)
    sea = ~on_land & ~on_lake
    out = {"groups": int(lon.size), "inSea": int(sea.sum()), "onLake": int(on_lake.sum())}
    if no_dry is not None:  # cells where the baked coast leaves no surely dry spot
        out["inSeaInCellsWithNoDrySpot"] = int((sea & (no_dry > 0)).sum())
        out["inSeaElsewhere"] = int((sea & (no_dry == 0)).sum())
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dir", type=Path)
    ap.add_argument("--raw", type=Path, default=st.NATURAL_EARTH)
    args = ap.parse_args(argv)
    paths = st.fetch_natural_earth(args.raw)
    land, lakes = _union(paths["ne_10m_land"]), _union(paths["ne_10m_lakes"])
    shapely.prepare(land)
    shapely.prepare(lakes)
    out = {}
    for mode in ("before", "after"):
        f = args.dir / f"positions_1900_{mode}.bin"
        if f.exists():
            flags = args.dir / f"positions_1900_{mode}_nodry.bin"
            out[mode] = count(np.fromfile(f, dtype="<f4"), land, lakes, np.fromfile(flags, dtype=np.uint8) if flags.exists() else None)
    print(json.dumps(out, indent=2))
    (args.dir / "natural_earth_check.json").write_text(json.dumps(out, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
