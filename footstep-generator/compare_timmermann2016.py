#!/usr/bin/env python3
"""
Compare the modelled pre-HYDE population with Timmermann & Friedrich (2016, Nature 538:92).

Inputs (gitignored, data/raw/timmermann2016/, NOT redistributable: the portal says CC BY-NC):
  human_density_a.txt / human_density_b.txt / mtime.txt  OPeNDAP .ascii dumps of
  http://climatedata.ibs.re.kr:9090/dods/public-data/human-dispersal-simulation/human-density
  (a = early exit, b = late exit; individuals per 100 km2, 1 degree, 120 x 180 x 360).
  `time` is not a calendar: index i holds mtime == i + 1 kyr BP (checked below).
  Longitudes run -19.5..339.5 and are rolled to -180..180.

Writes (committed): docs/research/0002-pre-hyde-population-model/timmermann2016/
  metrics.json and map_{age}ka.png (our model vs both T&F scenarios, 1 degree).
Our model is read from Model.step(), so Beyer 2020, Krapp 2021, HYDE 3.5 and Natural Earth
must be in data/raw/ (see docs/ops/prehistory-population.md).

Usage: python footstep-generator/compare_timmermann2016.py [age_ka ...]   (default 60 40 21 14 12)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

import grid_image
import prehistory_population as pp

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "timmermann2016"
OUT = ROOT / "docs" / "research" / "0002-pre-hyde-population-model" / "timmermann2016"
CELL_KM2_100 = 1 / 100.0

# Coarse boxes (lat_min, lat_max, lon_min, lon_max) for "where are people".
REGIONS = {
    "Africa": (-35, 37, -18, 52),
    "W Eurasia (Europe, Near East)": (12, 72, -12, 60),
    "S Asia": (5, 35, 60, 95),
    "E and SE Asia": (-11, 60, 95, 150),
    "Sahul": (-45, -5, 110, 155),
    "Americas": (-56, 72, -170, -34),
}


def read_ascii(path: Path) -> np.ndarray:
    """OPeNDAP .ascii dump -> (120, 180, 360) float32, NaN where the server says missing."""
    out = np.full((120, 180, 360), np.nan, dtype=np.float32)
    for line in path.read_text().splitlines():
        m = re.match(r"\[(\d+)\]\[(\d+)\], (.*)", line)
        if not m:
            continue
        row = np.array(m.group(3).split(","), dtype=np.float64)
        row[row < -1e30] = np.nan
        out[int(m.group(1)), int(m.group(2))] = row
    return out


def to_north_up(a: np.ndarray) -> np.ndarray:
    """(..., 180 south-up, 360 from -19.5E) -> north-up, -179.5..179.5."""
    lon = -19.5 + np.arange(360)
    lon = np.where(lon >= 180, lon - 360, lon)
    return a[..., ::-1, :][..., :, np.argsort(lon)]


def load_tf() -> dict[str, np.ndarray]:
    mt = read_ascii(RAW / "mtime.txt")
    for i in (0, 59, 119):
        assert np.nanmax(mt[i]) == i + 1, f"mtime check failed at index {i}"
    return {k: to_north_up(np.nan_to_num(read_ascii(RAW / f"human_density_{k}.txt")))
            for k in ("a", "b")}


def area_1deg() -> np.ndarray:
    return grid_image.cell_areas_km2(180, 1.0, -90.0)[:, None]


def rank_corr(x: np.ndarray, y: np.ndarray) -> float:
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def region_shares(people: np.ndarray) -> dict[str, float]:
    lat = 89.5 - np.arange(180)[:, None]
    lon = -179.5 + np.arange(360)[None, :]
    total = people.sum()
    out = {}
    for name, (a, b, c, d) in REGIONS.items():
        mask = (lat >= a) & (lat <= b) & (lon >= c) & (lon <= d)
        out[name] = float(people[mask].sum() / total) if total else 0.0
    return out


def compare(ours: np.ndarray, theirs: np.ndarray) -> dict:
    both = (ours > 0) & (theirs > 0)
    either = (ours > 0) | (theirs > 0)
    # Density in people per 100 km2 so cell area does not drive the correlation.
    a = area_1deg()
    d_o, d_t = ours / a * 100, theirs / a * 100
    return {
        "people": float(theirs.sum()),
        "occupied_cells": int((theirs > 0).sum()),
        "overlap_jaccard": float(both.sum() / either.sum()) if either.any() else 0.0,
        "share_of_theirs_people_in_our_occupied": float(theirs[ours > 0].sum() / theirs.sum()) if theirs.sum() else 0.0,
        "share_of_our_people_in_their_occupied": float(ours[theirs > 0].sum() / ours.sum()),
        "spearman_density_where_both": rank_corr(d_o[both], d_t[both]) if both.sum() > 2 else None,
        "regions": region_shares(theirs),
    }


def draw(path: Path, age: float, maps: list[tuple[str, np.ndarray]]) -> None:
    """Top row: people per 100 km2. Bottom row: the same, divided by each map's mean over its own
    occupied cells, so the SHAPE can be compared although the totals differ ~3-10x."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    a = area_1deg()
    fig, axes = plt.subplots(2, len(maps), figsize=(4.2 * len(maps), 5), dpi=110)
    for col, (title, people) in enumerate(maps):
        dens = np.where(people > 0, people / a * 100, np.nan)  # people per 100 km2
        rel = dens / np.nanmean(dens)
        for row, (field, lo, hi, label) in enumerate(
                ((dens, -3, 1.5, "log10 people per 100 km²"), (rel, -2, 1, "log10 density / own mean"))):
            ax = axes[row, col]
            im = ax.imshow(np.log10(field), extent=(-180, 180, -90, 90), cmap="viridis", vmin=lo, vmax=hi,
                           interpolation="nearest")
            if row == 0:
                ax.set_title(f"{title}\n{people.sum() / 1e6:.2f} M people", fontsize=8)
            ax.set_xticks([]); ax.set_yticks([]); ax.set_facecolor("#dde")
            if col == len(maps) - 1:
                fig.colorbar(im, ax=axes[row, :], shrink=0.8, pad=0.01).set_label(label, fontsize=7)
    fig.suptitle(f"{age:g} ka BP (modelled vs Timmermann & Friedrich 2016)", fontsize=9)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    ages = [float(x) for x in sys.argv[1:]] or [60, 40, 21, 14, 12]
    tf = load_tf()
    a = area_1deg()
    model = pp.Model(pp.load_table())
    OUT.mkdir(parents=True, exist_ok=True)
    result = {"ages_ka": {}, "note": "T&F index i = i+1 ka BP; our year = 1950 - age"}
    for age in ages:
        year = int(round(pp.BP_ZERO - age * 1000))
        step = model.step(year)
        ours = pp.sum_blocks(step.people, 2)
        entry = {"year": year, "hyde_weight": step.hyde_weight,
                 "ours": {"low": step.totals.low, "central": step.totals.central, "high": step.totals.high,
                          "occupied_cells": int((ours > 0).sum()), "regions": region_shares(ours)},
                 }
        maps = [("ours (central)", ours)]
        for k, label in (("a", "T&F early exit"), ("b", "T&F late exit")):
            theirs = tf[k][int(age) - 1] * a * CELL_KM2_100
            entry[k] = compare(ours, theirs)
            maps.append((label, theirs))
        result["ages_ka"][str(age)] = entry
        draw(OUT / f"map_{age:g}ka.png", age, maps)
        print(f"{age:g} ka: ours {step.totals.central / 1e6:.2f} M, T&F a {entry['a']['people'] / 1e6:.2f} M, "
              f"b {entry['b']['people'] / 1e6:.2f} M", flush=True)
    (OUT / "metrics.json").write_text(json.dumps(result, indent=1) + "\n")


if __name__ == "__main__":
    main()
