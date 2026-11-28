#!/usr/bin/env python3
"""Rivers for the close-up 3D (footsteps-web/public/water/rivers.json): Natural Earth 10m river centrelines, present-day courses.

The web app had no river geometry, only the freshwater-distance grid (water_distance.py, ~9 km cells), so at close-up zooms no
river showed, not even the Nile. This writes the same Natural Earth 10m rivers that grid is drawn from (v5.1.2, public domain,
pinned in water_distance.py) as compact polylines the close-up drapes on its ground (lib/rivers.ts).

Kept: features of class "River" (lake centrelines are skipped: the lakes are drawn as water). Lines are simplified (Douglas-Peucker, ~500 m; the app smooths the corners) and coordinates rounded to 1e-4
degrees (~11 m) and stored as integer deltas. Each river carries Natural Earth's scalerank (0 largest ... 10 smallest), which the
app maps to a drawn width. Courses are today's: rivers that moved (the Yellow River, the Indus's tributaries, the Nile's
branches in the delta) are drawn where they run now.

    poetry run python footstep-generator/rivers_asset.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import water_distance as wd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "footsteps-web" / "public" / "water" / "rivers.json"
SCALE = 10_000  # 1e-4 degree units
TOLERANCE_DEG = 0.005  # Douglas-Peucker tolerance (~500 m): Natural Earth 10m is drawn for 1:10 million, finer bends are not real


def simplify(coords: list[list[float]], tol: float = TOLERANCE_DEG) -> list[list[float]]:
    """Douglas-Peucker on lon/lat (iterative), keeping both ends."""
    n = len(coords)
    if n < 3:
        return coords
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = coords[a][0], coords[a][1]
        bx, by = coords[b][0], coords[b][1]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        far, worst = -1.0, -1
        for i in range(a + 1, b):
            px, py = coords[i][0] - ax, coords[i][1] - ay
            dist = abs(dx * py - dy * px) / norm if norm else (px * px + py * py) ** 0.5
            if dist > far:
                far, worst = dist, i
        if worst > 0 and far > tol:
            keep[worst] = True
            stack += [(a, worst), (worst, b)]
    return [c for c, k in zip(coords, keep) if k]


def lines(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    return []


def encode(coords: list[list[float]]) -> list[int]:
    """[x0, y0, dx1, dy1, ...] in 1e-4 degrees, repeated points dropped."""
    out: list[int] = []
    px = py = None
    for lon, lat, *_ in coords:
        x, y = round(lon * SCALE), round(lat * SCALE)
        if px is None:
            out += [x, y]
        elif (x, y) != (px, py):
            out += [x - px, y - py]
        else:
            continue
        px, py = x, y
    return out


def build(raw: Path = wd.NATURAL_EARTH) -> dict:
    paths = wd.fetch(raw)
    data = json.loads(paths["ne_10m_rivers_lake_centerlines"].read_text())
    rivers = []
    for f in data["features"]:
        p = f["properties"]
        if p.get("featurecla") != "River" or f.get("geometry") is None:
            continue
        rank = int(p.get("scalerank") or 0)
        for line in lines(f["geometry"]):
            enc = encode(simplify(line))
            if len(enc) >= 4:
                rivers.append([rank, *enc])
    rivers.sort(key=lambda r: r[0])
    return {
        "version": 1,
        "scale": SCALE,
        "source": f"Natural Earth 10m rivers ({wd.NE_VERSION}, public domain), present-day courses; class River only",
        "format": "rivers: [scalerank, x0, y0, dx1, dy1, ...] in 1/scale degrees (x = lon, y = lat); scalerank 0 largest, 10 smallest",
        "rivers": rivers,
    }


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(data['rivers'])} lines)")


if __name__ == "__main__":
    sys.exit(main())
