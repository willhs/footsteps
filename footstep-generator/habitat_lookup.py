#!/usr/bin/env python3
"""Pack habitat and climate per 0.5 deg cell for the web map's hover card.

Writes, under data/tiles/habitat/ (gitignored; see docs/ops/habitat-lookup.md):

  bp_{ka}.webp   one per 1,000-year Krapp step, ka = 0..102 (years BP, 0 = 1950 CE).
                 720 x 360 RGB lossless WebP, north up, column 0 = 180W. Per cell:
                   R  Krapp et al. 2021 BIOME4 class (1..27); 0 = sea, 28 = land ice
                      (the same numbers `terrain_image.biome` paints from)
                   G  annual mean temperature, Beyer et al. 2020 BIO1 (0 = no data)
                   B  annual precipitation, Beyer et al. 2020 BIO12 (0 = no data)
  use_{year}.webp  one per HYDE 3.5 year (`TARGET_YEARS`). 720 x 360 RGB lossless WebP.
                   R cropland share, G grazing share of the cell (0..255 = 0..1), B 0.
                   Means over HYDE's 6 x 6 five-arc-minute cells.

and `footsteps-web/public/habitat_meta.json` (committed, ~2 KB): the encoding constants and
biome names, which the client imports so both ends stay in step.

Beyer steps are 2 kyr before 22 ka BP and 1 kyr after, Krapp's are 1 kyr, so each Krapp
step takes the nearest Beyer step (the younger one when two are equally near).

Usage: python footstep-generator/habitat_lookup.py [--out DIR] [--only-meta]
       (inputs are under data/raw/, see docs/ops/habitat-lookup.md)
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
KRAPP = RAW / "krapp2021" / "Krapp2021_biome_v1.2.2.nc"
BEYER = RAW / "beyer2020" / "LateQuaternary_Environment.nc"
LANDUSE = ROOT / "data" / "tiles" / "grid"
OUT = ROOT / "data" / "tiles" / "habitat"
META = ROOT / "footsteps-web" / "public" / "habitat_meta.json"

CW, CH = 720, 360  # 0.5 deg cells, same grid as terrain_image
BP_ZERO = 1950  # calendar year of 0 BP
STEP_YEARS = 1000
# Oldest step: terrain_image's oldest year is -100000 = 101,950 BP, nearest step 102 ka.
MAX_KA = 102
ICE = 28

# Encoding of the G and B channels (byte 0 = no data). Mirrored in habitat_meta.json.
TEMP_MIN = -50.0  # deg C at byte 1
TEMP_STEP = 0.5  # deg C per byte
PRECIP_MAX = 10_000.0  # mm per year at byte 255 (log scale)

# Same years as footsteps-web/lib/constants.ts TARGET_YEARS (HYDE).
HYDE_YEARS = list(range(-10_000, 0, 1000)) + list(range(0, 2000, 100))
MAX_BYTES = 120_000  # per file; a step is loaded the first time the cursor rests on its year


# --- pure helpers (tested) ---------------------------------------------------

def year_to_ka(year: float) -> int:
    """The Krapp step (thousands of years BP) nearest a calendar year, clamped to the series."""
    bp = BP_ZERO - year
    return int(min(MAX_KA, max(0, math.floor(bp / STEP_YEARS + 0.5))))


def nearest_index(values: np.ndarray, target: float) -> int:
    """Index of the value closest to target; the first (smallest) on a tie."""
    return int(np.argmin(np.abs(np.asarray(values, dtype=float) - target)))


def encode_temp(t: np.ndarray) -> np.ndarray:
    """deg C -> byte 1..255 (0 for NaN). Clips at both ends."""
    t = np.asarray(t, dtype=np.float64)
    b = np.rint((np.nan_to_num(t, nan=TEMP_MIN) - TEMP_MIN) / TEMP_STEP) + 1
    return np.where(np.isfinite(t), np.clip(b, 1, 255), 0).astype(np.uint8)


def decode_temp(b: np.ndarray) -> np.ndarray:
    return TEMP_MIN + (np.asarray(b, dtype=np.float64) - 1) * TEMP_STEP


def encode_precip(p: np.ndarray) -> np.ndarray:
    """mm/yr -> byte 1..255 on a log1p scale (0 for NaN)."""
    p = np.asarray(p, dtype=np.float64)
    q = np.log1p(np.clip(np.nan_to_num(p, nan=0.0), 0, PRECIP_MAX)) / math.log1p(PRECIP_MAX)
    return np.where(np.isfinite(p), 1 + np.rint(q * 254), 0).astype(np.uint8)


def decode_precip(b: np.ndarray) -> np.ndarray:
    return np.expm1((np.asarray(b, dtype=np.float64) - 1) / 254 * math.log1p(PRECIP_MAX))


def parse_biome_names(attr: str) -> dict[int, str]:
    """'1  Tropical evergreen forest; 2  ...; 28 Land ice; ' -> {1: ..., 28: ...}."""
    names = {}
    for part in attr.split(";"):
        m = re.match(r"\s*(\d+)\s+(.+?)\s*$", part)
        if m:
            names[int(m.group(1))] = m.group(2)
    return names


def pack_step(biome: np.ndarray, temp: np.ndarray, precip: np.ndarray) -> np.ndarray:
    """(CH, CW, 3) uint8: biome class (0 = sea), temperature byte, precipitation byte."""
    return np.stack([biome.astype(np.uint8), encode_temp(temp), encode_precip(precip)], -1)


def pack_landuse(crop: np.ndarray, grazing: np.ndarray, block: int) -> np.ndarray:
    """Mean-pool two share arrays (bytes 0..255) by `block` and pack as (CH, CW, 3) uint8."""
    def pool(a: np.ndarray) -> np.ndarray:
        h, w = a.shape
        return a.reshape(h // block, block, w // block, block).mean(axis=(1, 3))
    return np.stack([np.rint(pool(crop)), np.rint(pool(grazing)), np.zeros((CH, CW))], -1).astype(np.uint8)


# --- sources -----------------------------------------------------------------

def load_krapp(path: Path = KRAPP):
    import xarray as xr
    return xr.open_dataset(path, decode_times=False)


def krapp_biome(ds, ka: int) -> np.ndarray:
    """Biome per cell, north up; 0 = sea (the same reading as terrain_image.biome)."""
    b = ds["biome"].sel(time=-float(ka * STEP_YEARS)).values[::-1].copy()
    b[b < 0] = 0
    return b.astype(np.int16)


def load_beyer(path: Path = BEYER):
    """(ages BP ascending, BIO1 and BIO12 as north-up (n, CH, CW) float32, NaN where there is no data).
    Beyer covers 60S-90N, so the southernmost 60 rows are NaN."""
    import xarray as xr
    ds = xr.open_dataset(path, decode_times=False)
    bp = -ds["time"].values.astype(float)
    order = np.argsort(bp)
    lat = np.arange(CH) * 0.5 - 89.75  # south to north, like Krapp's file
    lon = np.arange(CW) * 0.5 - 179.75

    def grid(name: str) -> np.ndarray:
        da = ds[name].isel(time=order).reindex(latitude=lat, longitude=lon, method="nearest", tolerance=0.01)
        return da.values[:, ::-1].astype(np.float32)

    return bp[order], grid("BIO1"), grid("BIO12")


def hyde_landuse(year: int, path: Path | None = None) -> tuple[np.ndarray, np.ndarray]:
    """(crop, grazing) bytes of the published land-use image (4320 x 2160)."""
    path = path or LANDUSE / f"landuse_{year}.png"
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB"))
    return a[..., 0].astype(np.float32), a[..., 1].astype(np.float32)


# --- output ------------------------------------------------------------------

def save_webp(img: np.ndarray, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(path, "WEBP", lossless=True, quality=100, method=6)
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise RuntimeError(f"{path.name} is {size} bytes, over the {MAX_BYTES} byte cap")
    return size


def meta(biome_names: dict[int, str]) -> dict:
    return {
        "description": "Encoding of the habitat lookup images (habitat_lookup.py). BP = 1950 - year.",
        "maxKa": MAX_KA,
        "stepYears": STEP_YEARS,
        "iceBiome": ICE,
        "width": CW,
        "height": CH,
        "temperature": {"min": TEMP_MIN, "step": TEMP_STEP, "unit": "deg C, annual mean (BIO1)"},
        "precipitation": {"max": PRECIP_MAX, "unit": "mm per year (BIO12), log1p scale"},
        "biomes": {str(k): v for k, v in sorted(biome_names.items())},
        "sources": {
            "biome": {"name": "Krapp, Beyer, Manica et al. 2021, via pastclim (BIOME4)",
                      "url": "https://doi.org/10.5281/zenodo.8415273", "licence": "CC BY 4.0"},
            "climate": {"name": "Beyer, Krapp & Manica 2020, Late Quaternary Environment",
                        "url": "https://doi.org/10.6084/m9.figshare.12293345.v4", "licence": "CC BY 4.0"},
            "landUse": {"name": "HYDE 3.5 (Klein Goldewijk et al. 2017)", "licence": "CC BY 4.0"},
        },
    }


def build_steps(out: Path, ks: list[int]) -> None:
    ds = load_krapp()
    bp_b, bio1, bio12 = load_beyer()
    for ka in ks:
        i = nearest_index(bp_b, ka * STEP_YEARS)
        img = pack_step(krapp_biome(ds, ka), bio1[i], bio12[i])
        size = save_webp(img, out / f"bp_{ka}.webp")
        print(f"bp_{ka}: {size / 1e3:.0f} KB (Beyer {bp_b[i] / 1e3:.0f} ka)", flush=True)


def build_landuse(out: Path, years: list[int]) -> None:
    for y in years:
        crop, grazing = hyde_landuse(y)
        block = crop.shape[1] // CW
        size = save_webp(pack_landuse(crop, grazing, block), out / f"use_{y}.webp")
        print(f"use_{y}: {size / 1e3:.0f} KB", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--meta", type=Path, default=META)
    p.add_argument("--ka", type=int, nargs="*", help="only these steps (default 0..102)")
    p.add_argument("--no-landuse", action="store_true")
    a = p.parse_args()
    ds = load_krapp()
    a.meta.write_text(json.dumps(meta(parse_biome_names(ds["biome"].attrs["biomes"])), indent=1) + "\n")
    print(f"wrote {a.meta}")
    build_steps(a.out, a.ka if a.ka else list(range(MAX_KA + 1)))
    if not a.no_landuse:
        build_landuse(a.out, HYDE_YEARS)


if __name__ == "__main__":
    main()
