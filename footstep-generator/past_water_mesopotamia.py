"""Mesopotamian coast stages at the head of the Gulf, interpreted, for `?pastwater=1` (docs/ops/past-water.md).

Source: Giosan, L. & Goodman, R. C. 2025, "Tidal irrigation and the rise of Sumer" (PLOS ONE 20(8): e0329084,
doi:10.1371/journal.pone.0329084), licence CC BY 4.0. The paper's data (SI tables, DOCX) are geochemistry and radiocarbon
dates, not coastlines; its coast stages exist only as Fig 6, "Sequential historical geography of coastal Mesopotamia", three
map panels on a 2-degree graticule. This script traces the panels' water (blue) at 2.5', so the geometry is ours, traced
from their schematic figure: INTERPRETED, not measured, and attributed to them.

What is modelled
  * STAGES: the three panels, each held for about 500 years either side of its date and never interpolated between them
    (calendar BP from 1950; app year = 1950 - BP):
      a  "~8000 BP" on the panel, "7,000 years ago" in the caption: 8,000-6,501 BP (-6050 .. -4551), covering both readings
      b  ~6,000 BP: 6,500-5,500 BP (-4550 .. -3550). The Mesopotamian Bay is open, reaching past Ur and Lagash.
      c  ~4,000 BP: 4,500-3,500 BP (-2550 .. -1550). The bay is a closed remnant; the Shatt al-Arab delta has formed.
    5,500-4,501 BP falls between stages: no scenario (geography unknown). Before 8,000 and after 3,500 BP: none either.
  * WATER is the panel's blue inside REGION (the head of the Gulf). Elsewhere the panels show today's coast generalised, and
    the app's own sea (Terrarium heights against the year's sea level) is better there. It is SEA, not fresh: it keeps groups
    out but gives no freshwater distance. Its level is the year's sea level ("level": {"kind": "sea"}).
  * NOT MODELLED: the panels' green tidal-freshwater zones (land with channels, not open water; the rivers already count),
    the panels' river arrows, marsh, and anything between the stages.

Georeferencing: the panels are plate carree at 76.17 figure pixels per degree on both axes, fitted to the graticule tick marks
(TICKS_X, TICKS_Y; residuals under a pixel). Black outlines and arrows are filled from the pixels round them before sampling.

Outputs (public/pastwater/)
  mesopotamia.json               manifest (version 2): three epochs, their masks, sources, licence, uncertainty
  mesopotamia_{a,b,c}_mask.webp  the stage's water on the 2.5' world grid: red 255 = water

    poetry run python footstep-generator/past_water_mesopotamia.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

import past_water as pw

NAME = "mesopotamia"
SRC = pw.ROOT / "data" / "pastwater_src"
FIGURE = "journal.pone.0329084.g006.png"
FIGURE_URL = "https://journals.plos.org/plosone/article/figure/image?size=large&id=10.1371/journal.pone.0329084.g006"
FIGURE_SHA256 = "e1794698bcb22c6d6164e859bfa44834a749d8b3e0d56b3cf801d624bfff54cd"
REGION = (29.8, 33.5, 44.0, 49.5)  # south, north, west, east (degrees): the head of the Gulf

# Graticule ticks of the figure (pixel, degrees). x is shared by the three panels; y is panel a's, and panels b and c sit
# PANEL_OFFSET pixels lower (their frames start at rows 1115 and 2191 against panel a's 44).
TICKS_X = [(470, 40), (622, 42), (775, 44), (927, 46), (1232, 50), (1384, 52)]
TICKS_Y = [(82, 40), (235, 38), (387, 36), (692, 32), (996, 28)]
PANEL_OFFSET = {"a": 0, "b": 1071, "c": 2147}

STAGES = (
    (pw.Epoch(3, "~7-8 ka BP (Fig 6a)", 8_000, 6_501), "a"),
    (pw.Epoch(4, "~6 ka BP (Fig 6b)", 6_500, 5_500), "b"),
    (pw.Epoch(5, "~4 ka BP (Fig 6c)", 4_500, 3_500), "c"),
)


def fetch(src: Path = SRC) -> Path:
    src.mkdir(parents=True, exist_ok=True)
    path = src / FIGURE
    if not path.exists():
        urllib.request.urlretrieve(FIGURE_URL, path)
    got = hashlib.sha256(path.read_bytes()).hexdigest()
    if got != FIGURE_SHA256:
        raise ValueError(f"{FIGURE}: sha256 {got}, expected {FIGURE_SHA256} (the figure changed; review it before updating the pin)")
    return path


def fit(ticks: list[tuple[int, int]]) -> tuple[float, float]:
    """(slope, intercept) of pixel = slope * degrees + intercept, least squares over the ticks."""
    px, deg = np.array(ticks, float).T
    slope, intercept = np.polyfit(deg, px, 1)
    return float(slope), float(intercept)


def classify(rgb: np.ndarray) -> np.ndarray:
    """Per figure pixel: 1 water (the panels' blue), 0 anything else, -1 unknown (black outline or arrow)."""
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    water = (b > 140) & (b - r > 70) & (r < 110)
    dark = np.maximum(np.maximum(r, g), b) < 90
    return np.where(water, 1, np.where(dark, -1, 0)).astype(np.int8)


def fill_unknown(c: np.ndarray, rounds: int = 12) -> np.ndarray:
    """Unknown pixels take the majority of their known 4-neighbours, repeated until none is left (or `rounds`); leftovers are land."""
    c = c.copy()
    for _ in range(rounds):
        unknown = c < 0
        if not unknown.any():
            break
        votes = np.zeros(c.shape, np.int32)
        known = np.zeros(c.shape, np.int32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s = np.roll(c, (dy, dx), axis=(0, 1))
            votes += s == 1
            known += s >= 0
        settle = unknown & (known > 0)
        c[settle] = (votes[settle] * 2 > known[settle]).astype(np.int8)
    c[c < 0] = 0
    return c


def stage_mask(figure: np.ndarray, panel: str) -> tuple[pw.Patch, np.ndarray]:
    """The panel's water inside REGION on the 2.5' world grid: a pixel is water when at least half of the figure under it is."""
    sx, ix = fit(TICKS_X)
    sy, iy = fit([(p + PANEL_OFFSET[panel], d) for p, d in TICKS_Y])
    south, north, west, east = REGION
    c0, c1 = int(round((west + 180) / pw.PIXEL_DEG)), int(round((east + 180) / pw.PIXEL_DEG))
    r0, r1 = int(round((90 - north) / pw.PIXEL_DEG)), int(round((90 - south) / pw.PIXEL_DEG))
    # the figure pixels under the region, classified and filled
    fx0, fx1 = int(np.floor(sx * west + ix)), int(np.ceil(sx * east + ix)) + 1
    fy0, fy1 = int(np.floor(sy * north + iy)), int(np.ceil(sy * south + iy)) + 1
    c = fill_unknown(classify(figure[fy0 - 4:fy1 + 4, fx0 - 4:fx1 + 4]))[4:-4, 4:-4]
    out = np.zeros((r1 - r0, c1 - c0), bool)
    sub = 4  # samples per 2.5' pixel, across
    s = (np.arange(sub) + 0.5) / sub
    for j in range(r1 - r0):
        lat = 90 - (r0 + j + s) * pw.PIXEL_DEG
        ys = np.clip(np.floor(sy * lat + iy).astype(int) - fy0, 0, c.shape[0] - 1)
        for i in range(c1 - c0):
            lon = -180 + (c0 + i + s) * pw.PIXEL_DEG
            xs = np.clip(np.floor(sx * lon + ix).astype(int) - fx0, 0, c.shape[1] - 1)
            out[j, i] = c[ys][:, xs].mean() >= 0.5
    return pw.Patch(c0, r0, c1 - c0, r1 - r0), out


def run(src: Path, out: Path) -> dict:
    with Image.open(fetch(src)) as im:
        figure = np.asarray(im.convert("RGB"))
    epochs, areas = [], {}
    for epoch, panel in STAGES:
        patch, wet = stage_mask(figure, panel)
        path = out / f"{NAME}_{panel}_mask.webp"
        pw.write_gray(path, (wet * 255).astype(np.uint8))
        areas[panel] = round(float(pw.pixel_area_km2(np.nonzero(wet)[0] + patch.y0).sum()))
        epochs.append({
            **pw.epoch_dates(epoch),
            "state": f"Fig 6{panel} traced as it is drawn, held through the window; not interpolated to the next stage",
            "water": "sea (the Gulf and its bay): not fresh", "paint": "sea",
            "level": {"kind": "sea", "clip_to_dem": False, "rule": "the year's global sea level, as the app's own sea"},
            "mask": {**pw.mask_meta(path, patch), "red": "255 = water (the panel's blue), 0 = not", "water_pixels": int(wet.sum()), "area_km2": areas[panel]},
            "distance": None,
        })
    manifest = {
        "id": NAME,
        "version": pw.SCHEMA_VERSION,
        "label": "Mesopotamian coast stages (interpreted from a published figure, experimental)",
        "short": "Mesopotamian coast",
        "evidence": "interpreted: traced from Giosan & Goodman 2025 Fig 6, a schematic reconstruction",
        "flag": "?pastwater=1",
        "datum": "outlines traced on the figure's own graticule (plate carree, WGS84 degrees assumed); water at the year's global sea level",
        "summary": "Mesopotamian coast: three stages traced from Giosan & Goodman 2025 (Fig 6, CC BY 4.0), interpreted, head of the Gulf only; "
                   "the sea keeps groups out and is not fresh water.",
        "epochs": epochs,
        "between_epochs": "5,500-4,501 BP falls between the ~6 ka and ~4 ka stages: no scenario, geography unknown",
        "outside_epochs": "scenario inactive: the geography is unknown at that date, which is not the same as dry; the app draws and places as it does without the flag",
        "region": {"south": REGION[0], "north": REGION[1], "west": REGION[2], "east": REGION[3],
                   "why": "the head of the Gulf, where the stages differ from today; elsewhere the figure is today's coast generalised"},
        "georeference": {"ticks_x": TICKS_X, "ticks_y": TICKS_Y, "panel_offset_px": PANEL_OFFSET,
                         "px_per_degree": [round(fit(TICKS_X)[0], 3), round(fit(TICKS_Y)[0], 3)]},
        "area_km2": areas,
        "digest": pw.sha256_bytes(json.dumps([[vars(e) for e, _ in STAGES], [e["mask"]["sha256"] for e in epochs]]).encode())[:16],
        "licence": "CC BY 4.0 (the article and its figures); the traced outlines are a derivative, attributed",
        "sources": {
            "figure": "Giosan, L. & Goodman, R. C. (2025) Tidal irrigation and the rise of Sumer. PLOS ONE 20(8): e0329084, Fig 6 "
                      "(doi:10.1371/journal.pone.0329084.g006)",
            "figure_url": FIGURE_URL,
            "figure_sha256": FIGURE_SHA256,
            "dates": "panel labels ~8000 / ~6000 / ~4000 BP; caption '7,000, 6,000 and 4,000 years ago'; taken as calendar BP from 1950",
        },
        "uncertainty": [
            "A schematic figure, not a survey: the paper states its reconstruction is synoptic; the traced shore is good to a few km at best.",
            "Panel a is labelled ~8000 BP but captioned 7,000 years ago; its window covers both.",
            "Each stage is held about 500 years either side; the coast moved continuously in between and the gaps say nothing.",
            "Modern heights under the bay are later delta sediment; the close-up flattens them to the sea.",
            "Nothing is said outside the stages or outside the region: not dry, not wet.",
        ],
    }
    import terrain_image
    manifest["terrain"] = {"years": terrain_image.scenario_years(manifest),
                           "path": "/terrain/pastwater/earth_{year}.webp (terrain_image.py --pastwater); other years use the ordinary images"}
    (out / f"{NAME}.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"stages {areas} km2; " + ", ".join(f"{e['mask']['file']} {e['mask']['bytes']} B" for e in epochs))
    return manifest


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Bake the Mesopotamian coast stages (masks, manifest) from Giosan & Goodman 2025 Fig 6")
    ap.add_argument("--src", type=Path, default=SRC, help="where the figure is cached (git-ignored)")
    ap.add_argument("--out", type=Path, default=pw.OUT)
    args = ap.parse_args(argv)
    run(args.src, args.out)


if __name__ == "__main__":
    sys.exit(main())
