"""Count group positions inside modelled past water, from the scenarios' own files and sources, not from the app's ranker.

An independent check on `?pastwater=1` placement (docs/ops/past-water.md "Measure"): `pastWater.real.test.ts` writes the positions the real
builder produced (`positions_{year}_off.bin` without the scenarios, `_on.bin` with them; float32 lon,lat pairs). For every file this takes
the epochs that hold at its year (every scenario: Mega-Chad, the European LGM, the Mesopotamian stages) and asks, with plain index
arithmetic, whether each position is in the epoch's committed mask; and, independently of the mask, in a fresh flood fill of the DEM
(Mega-Chad, when the Terrarium tiles are cached) or inside the source polygons themselves (the LGM, when the CRC806 zips are cached).
The ranker interpolates the masks bilinearly, so a count made with its own code would grade its own homework.

    poetry run python footstep-generator/past_water_check.py DIR [--tiles DIR]

Exit status 1 when any flag-on file has a group in modelled water.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

import past_water as pw


def in_mask(positions: np.ndarray, patch: pw.Patch, mask: np.ndarray) -> np.ndarray:
    """True for each position whose 2.5' pixel is wet in a committed mask."""
    lon, lat = positions[0::2].astype(np.float64), positions[1::2].astype(np.float64)
    col = np.floor((lon + 180) / pw.PIXEL_DEG).astype(int) - patch.x0
    row = np.floor((90 - lat) / pw.PIXEL_DEG).astype(int) - patch.y0
    ok = (col >= 0) & (row >= 0) & (col < patch.width) & (row < patch.height)
    out = np.zeros(lon.shape, dtype=bool)
    out[ok] = mask[row[ok], col[ok]]
    return out


def in_dem_lake(positions: np.ndarray, tiles: Path) -> np.ndarray:
    """True for each position in a fresh flood fill of the Terrarium DEM at the Mega-Chad level (no use of the committed mask)."""
    elev = pw.window_elevation(tiles)
    lake = pw.highstand_lake(elev)
    r0, r1, c0, c1 = pw.window_pixels()
    return in_mask(positions, pw.Patch(c0, r0, c1 - c0, r1 - r0), lake)


def in_lgm_polygons(positions: np.ndarray) -> np.ndarray | None:
    """True for each position whose 2.5' pixel centre is inside a CRC806 lake polygon (the source, not the mask); None without the zips."""
    import past_water_lgm as lgm
    if not all((lgm.SRC / name).exists() for name in lgm.FILES):
        return None
    import shapely
    lakes, _ = lgm.read(lgm.fetch())
    lon, lat = positions[0::2].astype(np.float64), positions[1::2].astype(np.float64)
    # the pixel's centre: the mask's rule (a lake is wet where its polygon holds the pixel centre)
    clon = -180 + (np.floor((lon + 180) / pw.PIXEL_DEG) + 0.5) * pw.PIXEL_DEG
    clat = 90 - (np.floor((90 - lat) / pw.PIXEL_DEG) + 0.5) * pw.PIXEL_DEG
    out = np.zeros(lon.shape, bool)
    for geom in lakes.geometry:
        a, b, c, d = geom.bounds
        sel = (clon >= a) & (clon <= c) & (clat >= b) & (clat <= d)
        if sel.any():
            out[np.nonzero(sel)[0][shapely.contains_xy(geom, clon[sel], clat[sel])]] = True
    return out


def check_file(path: Path, tiles: Path | None) -> dict:
    year = int(re.match(r"positions_(-?\d+)_", path.name).group(1))
    pos = np.fromfile(path, dtype="<f4")
    row: dict = {"year": year, "groups": int(pos.size // 2), "epochs": {}}
    for manifest, epoch in pw.active_epochs(year):
        patch, wet, _ = pw.load_mask(epoch)
        counts = {"scenario": manifest["id"], "inMask": int(in_mask(pos, patch, wet).sum())}
        if manifest["id"] == pw.NAME and tiles:
            counts["inDemLake"] = int(in_dem_lake(pos, tiles).sum())
        if manifest["id"] == "lgm_europe":
            source = in_lgm_polygons(pos)
            if source is not None:
                counts["inSourcePolygons"] = int(source.sum())
        row["epochs"][str(epoch["id"])] = counts
    row["inWater"] = sum(c["inMask"] for c in row["epochs"].values())
    return row


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir", type=Path, help="the directory pastWater.real.test.ts wrote positions_*.bin into")
    ap.add_argument("--tiles", type=Path, default=None, help="cached Terrarium tiles, to also test Mega-Chad against a fresh DEM flood fill")
    args = ap.parse_args(argv)
    report = {}
    failed = []
    for path in sorted(args.dir.glob("positions_*.bin")):
        row = check_file(path, args.tiles)
        report[path.stem] = row
        print(path.stem, json.dumps(row))
        if path.stem.endswith("_on") and any(v for c in row["epochs"].values() for k, v in c.items() if k != "scenario"):
            failed.append(path.stem)
    (args.dir / "past_water_check.json").write_text(json.dumps(report, indent=2) + "\n")
    if failed:
        print("groups in modelled water with the flag on:", ", ".join(failed))
        return 1
    print("pass: no flag-on group in modelled water")
    return 0


if __name__ == "__main__":
    sys.exit(main())
