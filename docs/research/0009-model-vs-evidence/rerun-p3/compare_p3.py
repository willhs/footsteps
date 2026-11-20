#!/usr/bin/env python3
"""Before/after for research 0009 P3 (south China split from mainland Southeast Asia).

Usage: python compare_p3.py BEFORE_DIR AFTER_DIR
Each dir holds humans_{year}.webp (prehistory_population.py output) and totals.json.
Prints, per year: people in the new south_china box and in the capped Southeast Asia box, old and new,
how much the rest of the world moved (it moves only because the world total is held to the curve),
and the first year each checkpoint place (the 0.5 degree cell and its 3x3 neighbourhood) has people.
Run it from the repo root so `footstep-generator/` is importable.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "footstep-generator"))
import grid_image  # noqa: E402

BOXES = {  # west, south, east, north: the two halves of the old southeast_asia_mainland box [92, -2, 112, 28]
    "south_china (92-112E, 22-28N)": (92, 22, 112, 28),
    "SE Asia mainland S of 22N (92-112E, -2-22N)": (92, -2, 112, 22),
}
PLACES = {"Kunming": (102.7, 25.0), "Guilin": (110.3, 25.3), "Yuchanyan": (111.4, 25.5),
          "Tam Pa Ling, Laos": (103.4, 20.2), "Hanoi": (105.8, 21.0)}
CELL = 0.5


def grid(d: Path, year: int) -> np.ndarray:
    return grid_image.decode(d / f"humans_{year}.webp")


def box_mask(box):
    w, s, e, n = box
    lon = -180 + (np.arange(720) + 0.5) * CELL
    lat = 90 - (np.arange(360) + 0.5) * CELL
    return (lat[:, None] >= s) & (lat[:, None] < n) & (lon[None, :] >= w) & (lon[None, :] < e)


def cell(lon, lat, pad=0):
    c, r = int((lon + 180) / CELL), int((90 - lat) / CELL)
    return slice(r - pad, r + pad + 1), slice(c - pad, c + pad + 1)


def main(before: Path, after: Path) -> None:
    years = json.loads((after / "totals.json").read_text())["years"]
    masks = {k: box_mask(b) for k, b in BOXES.items()}
    union = np.logical_or.reduce(list(masks.values()))
    first = {p: {"old": None, "new": None} for p in PLACES}
    ident = changed = 0
    print("year      " + "".join(f"{k.split(' (')[0]:>30}" for k in BOXES) + "   rest-of-world L1%  S-of-22N max cell change%")
    for y in years:
        o, n = grid(before, y), grid(after, y)
        same = np.array_equal(o, n)
        ident += same
        changed += not same
        for p, (lon, lat) in PLACES.items():
            for tag, g in (("old", o), ("new", n)):
                if first[p][tag] is None and g[cell(lon, lat, 1)].sum() > 0:
                    first[p][tag] = y
        if same and y not in (-100000, -60000, -20000):  # print every changed year, plus three unchanged ones
            continue
        row = ""
        for m in masks.values():
            row +=f"{o[m].sum():>14,.0f} ->{n[m].sum():>11,.0f}"
        rest = ~union
        l1 = np.abs(n[rest] - o[rest]).sum() / max(o[rest].sum(), 1) * 100
        s = masks["SE Asia mainland S of 22N (92-112E, -2-22N)"]
        occ = s & (o > 5)
        mx = (np.abs(n[occ] - o[occ]) / o[occ]).max() * 100 if occ.any() else 0.0
        print(f"{y:>8}{row}{l1:>14.3f}{mx:>18.2f}")
    print(f"\nimages byte-identical in pixels: {ident}, changed: {changed} (of {len(years)})")
    print("\nfirst year with any people in the 3x3 cells around each place (old -> new):")
    for p, v in first.items():
        print(f"  {p:<20} {v['old']} -> {v['new']}")
    # The world total is held to the curve, so every step has one rescale factor. If the mainland south of the
    # line is "unchanged", each of its cells more than the blur reach (3 cells) from 22N moves by just that factor.
    print("\nSE Asia mainland cells S of 20N (2 degrees clear of the 22N line): new/old people per cell, vs the world rescale")
    far = box_mask((92, -2, 112, 20))
    for y in (-66000, -60000, -50000, -45000, -41000, -38000, -34000):
        o, n = grid(before, y), grid(after, y)
        occ = far & (o > 5)
        ratio = n[occ] / o[occ]
        outside = ~masks["south_china (92-112E, 22-28N)"]
        print(f"  {y:>8}  cells {occ.sum():>4}  ratio min {ratio.min():.4f} median {np.median(ratio):.4f} max {ratio.max():.4f}"
              f"   world rescale (all cells outside south_china) {n[outside].sum() / o[outside].sum():.4f}")
    print("\nlargest single-cell people in the south_china box, new, by year:")
    for y in (-48000, -44000, -42000, -40000, -38000, -34000, -30000, -26000, -22000, -20000, -14000):
        o, n = grid(before, y), grid(after, y)
        m = masks["south_china (92-112E, 22-28N)"]
        print(f"  {y:>8}  old max {o[m].max():8.1f}  new max {n[m].max():8.1f}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
