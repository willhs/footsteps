#!/usr/bin/env python3
"""
GUESSED bands of the other kinds of human (Neanderthals, Denisovans, H. floresiensis, H. luzonensis),
one point per band of about 15 people, every 1,000 years from 100 to 30 ka BP.

Nothing here is measured. Per species and step:

1. How many bands: the species' guessed people (other_humans/bands.yaml) / the band size.
2. Where: the pre-HYDE habitat model (prehistory_population.Model.potential_and_climate: Beyer climate ->
   Miami NPP -> Tallavaara forager density x habitat rules, on Krapp land and ice at that time), a
   modern-forager yardstick used here only to say which places were richer, times the species' hand-drawn
   range (softened by about a cell, except the islands; a 'hinted' range counts at its `weight`).
3. Each 0.5 degree cell has a fixed list of candidate spots and a fixed random number u. It holds
   floor(e) bands, plus one more when u < the fraction, where e is its share of the bands. So a cell that
   stays good keeps its bands from step to step; spots in the year's sea or a lake (site_terrain.webp at
   the year's sea level) are skipped.

Output: footsteps-web/public/other_humans/bands.json
  {"band_people": 15, "first_ka": 100, "last_ka": 30,
   "species": {id: {"people": N, "bands": [[lon, lat, hinted 0|1, from_ka, to_ka, from_ka, to_ka, ...], ...]}}}
Each band is occupied from from_ka down to to_ka (inclusive, in 1 ka steps). Bands are in a stable random
order, so the app can thin a species out as it fades by drawing only the first share of them.
See docs/ops/other-humans.md.

Usage: python footstep-generator/other_humans_bands.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageDraw

import prehistory_population as pp
import site_terrain
import terrain_image

ROOT = Path(__file__).resolve().parent.parent
TABLE = Path(__file__).resolve().parent / "other_humans" / "bands.yaml"
OUT = ROOT / "footsteps-web" / "public" / "other_humans" / "bands.json"
TERRAIN = ROOT / "footsteps-web" / "public" / "sites" / "site_terrain.webp"
FIRST_KA, LAST_KA = 100, 30
SPOTS_PER_CELL = 8
SEED = 20261120


def range_mask(ranges: list[dict], s: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """(weight 0..1, hinted flag) per 0.5 degree cell, from the polygons drawn at s x s per cell."""
    weight = np.zeros((pp.NY, pp.NX))
    hinted = np.zeros((pp.NY, pp.NX), dtype=bool)
    for r in ranges:
        im = Image.new("L", (pp.NX * s, pp.NY * s))
        pts = [((lon + 180) / pp.CELL_DEG * s, (90 - lat) / pp.CELL_DEG * s) for lon, lat in r["polygon"]]
        ImageDraw.Draw(im).polygon(pts, fill=255)
        cover = np.asarray(im, dtype=np.float64).reshape(pp.NY, s, pp.NX, s).mean(axis=(1, 3)) / 255
        if r.get("soften", 1.0) > 0:                       # island species stay on their island: soften 0
            cover = np.clip(terrain_image.blur(cover, r.get("soften", 1.0)), 0, 1)
        w = cover * r.get("weight", 1.0)
        if r["confidence"] == "hinted":
            hinted |= w > weight
        weight = np.maximum(weight, w)
    return weight, hinted


class Dry:
    """Is a point dry land at a sea level? The same baked 2.5' terrain the app's site ranking reads."""

    def __init__(self, path: Path = TERRAIN):
        self.depth, self.share, _, self.lake = site_terrain.decode(path)
        self.h, self.w = self.depth.shape

    def __call__(self, lon: np.ndarray, lat: np.ndarray, drop_m: float) -> np.ndarray:
        col = np.clip(((lon + 180) / 360 * self.w).astype(int), 0, self.w - 1)
        row = np.clip(((90 - lat) / 180 * self.h).astype(int), 0, self.h - 1)
        sea = (self.depth[row, col] > drop_m) & (self.share[row, col] >= 0.5)
        return ~sea & ~self.lake[row, col]


def cell_counts(expected: np.ndarray, u: np.ndarray) -> np.ndarray:
    """Stochastic rounding with a fixed random number per cell: stable where `expected` barely moves."""
    whole = np.floor(expected)
    return (whole + (u < expected - whole)).astype(int)


def run(table: dict, model: pp.Model, dry: Dry, kas: list[int]) -> dict:
    band_people = table["band"]["people"]
    out = {"band_people": band_people, "first_ka": kas[0], "last_ka": kas[-1], "species": {}}
    potentials = {}
    for ka in kas:
        year = pp.BP_ZERO - ka * 1000
        potentials[ka] = (model.potential_and_climate(year)[0], -terrain_image.sea_level(year))
    for n, sp in enumerate(table["species"]):
        rng = np.random.default_rng(SEED + n)
        mask, hinted = range_mask(sp["ranges"])
        cells = np.argwhere(mask > 0)                         # (row, col) inside the range
        u = rng.random(len(cells))
        spot = rng.random((len(cells), SPOTS_PER_CELL, 2))
        lon = -180 + (cells[:, 1, None] + spot[..., 0]) * pp.CELL_DEG
        lat = 90 - (cells[:, 0, None] + spot[..., 1]) * pp.CELL_DEG
        n_bands = round(sp["people"] / band_people)
        occupied: dict[tuple[int, int], list[int]] = {}       # (cell, spot) -> kas held
        for ka in kas:
            potential, drop = potentials[ka]
            ok = dry(lon, lat, drop)                          # (cells, spots)
            w = potential[cells[:, 0], cells[:, 1]] * mask[cells[:, 0], cells[:, 1]] * ok.any(axis=1)
            if w.sum() <= 0:                                  # habitat says nowhere: spread over the dry range
                w = mask[cells[:, 0], cells[:, 1]] * ok.any(axis=1)
            counts = cell_counts(n_bands * w / w.sum(), u)
            for c in np.nonzero(counts)[0]:
                for k in np.nonzero(ok[c])[0][: counts[c]]:
                    occupied.setdefault((int(c), int(k)), []).append(ka)
        keys = list(occupied)
        rng.shuffle(keys)                                     # stable random order: the fade thins from the end
        bands = []
        for c, k in keys:
            runs: list[int] = []
            for ka in occupied[(c, k)]:                       # kas arrive old -> young
                if runs and runs[-1] == ka + 1:
                    runs[-1] = ka
                else:
                    runs += [ka, ka]
            r, col = cells[c]
            bands.append([round(float(lon[c, k]), 3), round(float(lat[c, k]), 3), int(hinted[r, col]), *runs])
        out["species"][sp["id"]] = {"people": sp["people"], "bands": bands}
        per_step = [sum(1 for b in bands if any(b[i] >= ka >= b[i + 1] for i in range(3, len(b), 2))) for ka in kas]
        print(f"{sp['id']}: {len(bands)} spots, {min(per_step)}-{max(per_step)} bands a step (target {n_bands})")
    return out


def main() -> None:
    table = yaml.safe_load(TABLE.read_text())
    kas = list(range(FIRST_KA, LAST_KA - 1, -1))
    out = run(table, pp.Model(pp.load_table()), Dry(), kas)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
