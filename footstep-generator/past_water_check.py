"""Count group positions inside the modelled Mega-Chad lake, from the lake itself and not from the app's ranker.

An independent check on `?pastwater=1` placement (docs/ops/past-water.md "Measure"): `pastWater.real.test.ts` writes the positions the real
builder produced (`positions_{year}_off.bin` without the epoch, `_on.bin` with it; float32 lon,lat pairs). This reads them and asks, with plain
index arithmetic on the committed mask and, when the Terrarium tiles are cached, on a fresh flood fill of the DEM, whether each is in the lake.
The ranker interpolates the mask bilinearly, so a count made with its own code would grade its own homework.

    poetry run python footstep-generator/past_water_check.py DIR [--tiles DIR]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

import past_water as pw


def in_mask(positions: np.ndarray, patch: pw.Patch, mask: np.ndarray) -> np.ndarray:
    """True for each position whose 2.5' pixel is lake in the committed mask."""
    lon, lat = positions[0::2].astype(np.float64), positions[1::2].astype(np.float64)
    col = np.floor((lon + 180) / pw.PIXEL_DEG).astype(int) - patch.x0
    row = np.floor((90 - lat) / pw.PIXEL_DEG).astype(int) - patch.y0
    ok = (col >= 0) & (row >= 0) & (col < patch.width) & (row < patch.height)
    out = np.zeros(lon.shape, dtype=bool)
    out[ok] = mask[row[ok], col[ok]]
    return out


def in_dem_lake(positions: np.ndarray, tiles: Path) -> np.ndarray:
    """True for each position in a fresh flood fill of the Terrarium DEM at the scenario level (no use of the committed mask)."""
    elev = pw.window_elevation(tiles)
    lake = pw.highstand_lake(elev)
    r0, r1, c0, c1 = pw.window_pixels()
    lon, lat = positions[0::2].astype(np.float64), positions[1::2].astype(np.float64)
    col = np.floor((lon + 180) / pw.PIXEL_DEG).astype(int) - c0
    row = np.floor((90 - lat) / pw.PIXEL_DEG).astype(int) - r0
    ok = (col >= 0) & (row >= 0) & (col < c1 - c0) & (row < r1 - r0)
    out = np.zeros(lon.shape, dtype=bool)
    out[ok] = lake[row[ok], col[ok]]
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir", type=Path, help="the directory pastWater.real.test.ts wrote positions_*.bin into")
    ap.add_argument("--tiles", type=Path, default=None, help="cached Terrarium tiles, to also test against a fresh DEM flood fill")
    args = ap.parse_args(argv)
    patch, mask, _ = pw.load_lake()
    report = {}
    for path in sorted(args.dir.glob("positions_*.bin")):
        pos = np.fromfile(path, dtype="<f4")
        row = {"groups": int(pos.size // 2), "inLakeMask": int(in_mask(pos, patch, mask).sum())}
        if args.tiles:
            row["inLakeDem"] = int(in_dem_lake(pos, args.tiles).sum())
        report[path.stem] = row
        print(path.stem, row)
    (args.dir / "past_water_check.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
