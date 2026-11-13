#!/usr/bin/env python3
"""
Paint one natural-colour "Earth from space" image per terrain step.

Inputs (all under data/raw/, gitignored; see docs/ops/terrain-images.md):
- Krapp et al. 2021 biomes (pastclim, Zenodo 8415273, CC-BY 4.0): BIOME4 class per
  0.5 deg cell every 1,000 years; sea = no data, 28 = land ice. Time is years BP
  (0 = 1950 CE).
- NASA Blue Marble Next Generation, July 2004, 5400x2700 (NASA Earth Observatory):
  the colours and the fine detail.
- ETOPO1 elevation, 4 arc-min (NOAA, public domain): sharp coastlines.
- HYDE 3.5 land use, the published landuse_{year}.png (grid_image.py --landuse).
- Spratt & Lisiecki 2016 v2 sea level (PANGAEA 979830, CC BY 3.0), via climate_series.py.

How a frame is painted (all grids north-up, column 0 = 180W):
1. Palette: the median Blue Marble colour of each present-day biome, taken from
   cells with little 1900 land use (Blue Marble shows 2004 farms).
2. Per Krapp step, a low-frequency colour per cell: the step's biome palette colour,
   plus today's regional deviation from its own biome (the modern farm tint removed).
3. A frame year interpolates the two bracketing steps (colour, land, ice),
   adds the Green Sahara overlay and the HYDE farmland of that year, then multiplies
   in Blue Marble's own detail (its brightness relative to its local mean).
4. Coastlines: ETOPO1 above the year's global sea level (Spratt & Lisiecki v2,
   capped at today's, from climate_series.py), where Krapp's 0.5 deg land fraction
   is uncertain. The slider's sea-level readout shows the same number.

Images are undimmed; the client dims and tints them.

Usage: python footstep-generator/terrain_image.py [--quality Q] [years ...]
       (no years: every TERRAIN_YEAR)
"""
import argparse
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from climate_series import sea_level_at

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
KRAPP = RAW / "krapp2021" / "Krapp2021_biome_v1.2.2.nc"
BLUE_MARBLE = RAW / "bluemarble" / "world.200407.3x5400x2700.jpg"
ETOPO = RAW / "etopo" / "etopo_4min.nc"
LANDUSE = ROOT / "data" / "tiles" / "grid"
OUT = ROOT / "data" / "tiles" / "terrain"

W, H = 2048, 1024  # output image
CW, CH = 720, 360  # Krapp cells
STEP_YEARS = 1000
BP_ZERO = 1950  # calendar year of 0 BP
ICE = 28
DESERTISH = (13, 14, 21, 27)  # xerophytic shrubland, desert, barren
MAX_BYTES = 400_000

# Same years as footsteps-web/lib/constants.ts TERRAIN_YEARS.
TERRAIN_YEARS = list(range(-100_000, 0, 1000)) + list(range(0, 2000, 100))
# HYDE slider years (TARGET_YEARS): farmland is drawn for these.
HYDE_YEARS = list(range(-10_000, 0, 1000)) + list(range(0, 2000, 100))

# Biomes absent from today's map borrow a present-day look.
FALLBACK = {16: (15, 20), 18: (11, 22), 2: (1, 3), 3: (2, 12), 19: (12, 20)}

# Farmland is calibrated to reality: Blue Marble (July 2004) is a photo of farmed
# Earth, so a cell as farmed as in 1900 shows its real photo colour and less
# farmed eras blend back toward natural cover. No invented field colour.
CROP_WEIGHT, GRAZING_WEIGHT = 1.0, 0.35


# --- pure helpers (tested) ---------------------------------------------------

def year_to_bp(year: float) -> float:
    return BP_ZERO - year


def step_bracket(year: float) -> tuple[int, int, float]:
    """The two Krapp steps (in years BP) around a calendar year, and the weight of
    the older one (0 = all the younger step)."""
    bp = max(0.0, year_to_bp(year))
    young = int(bp // STEP_YEARS) * STEP_YEARS
    return young, young + STEP_YEARS, (bp - young) / STEP_YEARS


def smoothstep(e0: float, e1: float, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def sahara_weight(year: float) -> float:
    """African Humid Period strength: eases in around 9000 BCE and out around
    3500 BCE (each over ~1,500 years)."""
    return float(smoothstep(-9750, -8250, year) * (1 - smoothstep(-4250, -2750, year)))


def farmed_fraction(crop: np.ndarray, grazing: np.ndarray) -> np.ndarray:
    """Share of a cell that is farmed, rangeland counting for less (it is mostly
    open land that already looks like itself). 0..1."""
    return np.clip(CROP_WEIGHT * crop + GRAZING_WEIGHT * grazing, 0.0, 1.0)


def farm_weight(farmed_then: np.ndarray, farmed_today: np.ndarray) -> np.ndarray:
    """How much of today's farmed look a cell has in an era (0..1): its farmed
    fraction then over its fraction in 1900, the latest HYDE year (closest to the
    2004 photo). Cells hardly farmed today have no farm look to restore."""
    return np.clip(farmed_then / np.maximum(farmed_today, 0.02), 0.0, 1.0) * (farmed_today > 0.01)


# --- grids -------------------------------------------------------------------

def resize(a: np.ndarray, w: int, h: int, method=Image.BILINEAR) -> np.ndarray:
    """Resample a 2-D or 3-D float array with PIL (per channel, float32)."""
    if a.ndim == 3:
        return np.stack([resize(a[..., i], w, h, method) for i in range(a.shape[2])], -1)
    return np.asarray(Image.fromarray(a.astype(np.float32)).resize((w, h), method))


def fill_unknown(a: np.ndarray, known: np.ndarray, iterations: int = 60) -> np.ndarray:
    """Spread known cell values into unknown ones (so sea colour never bleeds into
    land when upsampling)."""
    a = np.where(known[..., None], a, 0.0).astype(np.float32)
    k = known.astype(np.float32)
    for _ in range(iterations):
        if k.min() > 0:
            break
        s = np.zeros_like(a)
        n = np.zeros_like(k)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s += np.roll(np.roll(a * k[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(k, dy, 0), dx, 1)
        grow = (k == 0) & (n > 0)
        a[grow] = s[grow] / n[grow][:, None]
        k = np.where(grow, 1.0, k)
    if k.min() == 0:
        a[k == 0] = a[k > 0].mean(0)
    return a


def value_noise(seed: int, cells: tuple[int, int], w: int = W, h: int = H) -> np.ndarray:
    """Smooth deterministic noise in [-1, 1]."""
    rng = np.random.default_rng(seed)
    return resize(rng.uniform(-1, 1, (cells[1], cells[0])).astype(np.float32), w, h, Image.BICUBIC)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur in cells; wraps east-west, clamps at the poles."""
    r = int(3 * sigma + 0.5)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.zeros_like(a, dtype=np.float32)
    for i, w in enumerate(k):
        out += w * np.roll(a, i - r, axis=1)
    padded = np.concatenate([out[:1].repeat(r, 0), out, out[-1:].repeat(r, 0)], 0)
    res = np.zeros_like(out)
    for i, w in enumerate(k):
        res += w * padded[i:i + out.shape[0]]
    return res


def row_lats(h: int) -> np.ndarray:
    return 90 - (np.arange(h) + 0.5) * 180 / h


def col_lons(w: int) -> np.ndarray:
    return -180 + (np.arange(w) + 0.5) * 360 / w


def lum(rgb: np.ndarray) -> np.ndarray:
    return rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


# --- sources -----------------------------------------------------------------

@lru_cache(maxsize=1)
def krapp():
    import xarray as xr
    return xr.open_dataset(KRAPP, decode_times=False)["biome"]


@lru_cache(maxsize=None)
def biome(bp: int) -> np.ndarray:
    """Biome per cell, north-up; 0 = sea."""
    b = krapp().sel(time=-float(bp)).values[::-1].copy()
    b[b < 0] = 0
    return b.astype(np.int16)


@lru_cache(maxsize=1)
def blue_marble() -> tuple[np.ndarray, np.ndarray]:
    """(output-resolution image, Krapp-cell mean image), float32 0..255."""
    with Image.open(BLUE_MARBLE) as im:
        im = im.convert("RGB")
        hi = np.asarray(im.resize((W, H), Image.BOX), dtype=np.float32)
        lo = np.asarray(im.resize((CW, CH), Image.BOX), dtype=np.float32)
    return hi, lo


@lru_cache(maxsize=1)
def elevation() -> np.ndarray:
    """ETOPO1 metres at 2x output resolution (for antialiased coasts)."""
    import xarray as xr
    a = xr.open_dataset(ETOPO)["altitude"].values[::-1][:-1, :-1].astype(np.float32)
    return resize(a, 2 * W, 2 * H)


def landuse(year: int, w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    """(crop, grazing) shares 0..1 for a HYDE year."""
    with Image.open(LANDUSE / f"landuse_{year}.png") as im:
        rgb = np.asarray(im.convert("RGB").resize((w, h), Image.BOX), dtype=np.float32) / 255
    return rgb[..., 0], rgb[..., 1]


# --- palette and steps -------------------------------------------------------

@dataclass
class Palette:
    biome: np.ndarray  # (29, 3): colour per biome id
    ice: np.ndarray
    sea: np.ndarray
    farm_delta: np.ndarray  # (CH, CW, 3): today's photo minus its natural colour (the farm look)
    farmed_today: np.ndarray  # (CH, CW): farmed fraction in 1900
    lake: np.ndarray
    residual: np.ndarray  # (CH, CW, 3): today's natural colour minus its biome colour


@lru_cache(maxsize=1)
def palette() -> Palette:
    _, bm = blue_marble()
    now = biome(0)
    crop, grazing = landuse(1900, CW, CH)
    farmed = farmed_fraction(crop, grazing)
    land = now > 0
    pal = np.zeros((29, 3), np.float32)
    have = np.zeros(29, bool)
    for b in range(1, 29):
        cells = (now == b) & (farmed < 0.15)
        if cells.sum() < 5:
            cells = now == b
        if cells.sum() >= 5:
            pal[b] = np.median(bm[cells], axis=0)
            have[b] = True
    for b, (a, c) in FALLBACK.items():
        if not have[b]:
            pal[b] = (pal[a] + pal[c]) / 2
    ice = np.maximum(pal[ICE], 225)
    sea = np.median(bm[~land], axis=0)
    # Today's natural colour: the modern farm tint pulled back toward the biome.
    natural = bm - farmed[..., None] * (bm - pal[now])
    real = (land & (now != ICE))[..., None]
    residual = np.where(real, natural - pal[now], 0.0)
    farm_delta = np.where(real, bm - natural, 0.0)
    lake = sea * 1.3 + np.array([2, 10, 14], np.float32)
    return Palette(pal, ice, sea, farm_delta.astype(np.float32), farmed.astype(np.float32),
                   lake, residual.astype(np.float32))


@dataclass
class Step:
    bp: int
    colour: np.ndarray  # (CH, CW, 3) natural colour, land cells filled into the sea
    land: np.ndarray  # (CH, CW) float 0/1
    ice: np.ndarray  # (CH, CW) float 0/1
    desertish: np.ndarray  # (CH, CW) float 0/1


@lru_cache(maxsize=4)
def step(bp: int) -> Step:
    p = palette()
    b = biome(bp)
    now = biome(0)
    land = b > 0
    # Today's regional character carries over fully where the biome is unchanged.
    keep = np.where(b == now, 1.0, 0.5)[..., None]
    colour = p.biome[b] + p.residual * keep
    colour = fill_unknown(colour, land & (b != ICE))
    return Step(bp, colour, land.astype(np.float32), (b == ICE).astype(np.float32),
                np.isin(b, DESERTISH).astype(np.float32))


# --- frame -------------------------------------------------------------------

def sea_level(year: int) -> float:
    """Global sea level (m) for a frame year: the same series as the readout."""
    return float(sea_level_at([year])[0])


def green_sahara(colour: np.ndarray, desertish: np.ndarray, year: float) -> np.ndarray:
    """Paint the Sahara as savanna and grassland during the African Humid Period
    (a literature-based overlay: the climate model under-greens it)."""
    w = sahara_weight(year)
    if w <= 0:
        return colour
    p = palette().biome
    lat = row_lats(CH)[:, None]
    lon = col_lons(CW)[None, :]
    # Savanna in the south grading to grassland/steppe, gone by ~31N.
    south = smoothstep(24, 18, lat)[..., None]
    target = p[12] * south + (p[19] + p[20]) / 2 * (1 - south)
    spatial = (1 - smoothstep(25, 31, lat)) * smoothstep(9, 13, lat)
    spatial = spatial * smoothstep(-19, -15, lon) * (1 - smoothstep(31, 36, lon))
    strength = (w * spatial * blur(desertish, 2.0))[..., None]
    return colour + (target - colour) * strength * 0.9


def mega_chad(year: float) -> np.ndarray:
    """Lake Mega-Chad at output resolution (0..1): Chad-basin land below its ~329 m
    highstand shoreline (Drake & Bristow 2006), scaled by the humid-period weight."""
    w = sahara_weight(year)
    if w <= 0:
        return np.zeros((H, W), np.float32)
    elev = elevation()
    lat = row_lats(2 * H)[:, None]
    lon = col_lons(2 * W)[None, :]
    basin = (lat > 10.5) & (lat < 19.5) & (lon > 12.5) & (lon < 20.5)
    lake = (basin & (elev < 329) & (elev > 150)).astype(np.float32)
    return resize(lake, W, H, Image.BOX) * w


@lru_cache(maxsize=1)
def today() -> dict:
    """Present-day fields shared by every frame."""
    bm_hi, bm_lo = blue_marble()
    now = biome(0)
    land = now > 0
    return {
        "bm_lo": blur(fill_unknown(bm_lo, land & (now != ICE)), 1.2),
        "land": resize(land.astype(np.float32), W, H),
        "ice": resize((now == ICE).astype(np.float32), W, H)[..., None],
        "sea": 1 - resize(land.astype(np.float32), W, H, Image.BOX),
        "grain": (1 + 0.07 * value_noise(7, (720, 360)) + 0.05 * value_noise(8, (2048, 1024)))[..., None],
        "ice_noise": 0.12 * value_noise(3, (360, 180)) + 0.08 * value_noise(5, (1440, 720)),
    }


def frame(year: int) -> np.ndarray:
    young_bp, old_bp, f = step_bracket(year)
    a, b = step(young_bp), step(old_bp)
    mix = lambda x, y: x * (1 - f) + y * f  # noqa: E731
    colour = mix(a.colour, b.colour)
    colour = green_sahara(colour, mix(a.desertish, b.desertish), year)
    land_c, ice_c = mix(a.land, b.land), mix(a.ice, b.ice)
    p, t = palette(), today()
    bm_hi, _ = blue_marble()

    # Land colour: Blue Marble times the (smoothed) change in colour since today, so
    # today's detail and real colours stay and only the broad colour moves.
    era = blur(colour, 1.2)
    # Farmland for HYDE years: put back the share of today's farm look this era had.
    if year in HYDE_YEARS:
        crop, grazing = landuse(year, CW, CH)
        k = farm_weight(farmed_fraction(crop, grazing), p.farmed_today)
        era = era + blur(p.farm_delta * k[..., None] * land_c[..., None], 1.2)
    # (+20 keeps dark cells such as lakes from blowing the ratio up)
    ratio = np.clip(resize((era + 20) / (t["bm_lo"] + 20), W, H), 0.25, 2.5)
    land_rgb = bm_hi * ratio
    # Land that is sea (or ice) today has no Blue Marble land: era colour + grain.
    painted = resize(era, W, H) * t["grain"]
    has_bm = np.clip((t["land"] - t["ice"][..., 0]) * 2 - 0.5, 0, 1)[..., None]
    land_rgb = painted + (land_rgb - painted) * has_bm

    # Ice: Blue Marble's own ice where it is ice today, soft-edged white elsewhere.
    ice_a = smoothstep(0.42, 0.58, resize(blur(ice_c, 1.3), W, H) + t["ice_noise"])[..., None]
    ice_rgb = p.ice * (0.95 + 0.12 * t["ice_noise"][..., None]) * t["grain"] ** 0.5
    ice_rgb = t["ice"] * np.maximum(bm_hi, ice_rgb * 0.92) + (1 - t["ice"]) * ice_rgb
    land_rgb = land_rgb + (ice_rgb - land_rgb) * ice_a

    # Sea: ETOPO above the year's sea level where Krapp is unsure; ice is land.
    land_2x = resize(land_c, 2 * W, 2 * H)
    sl = sea_level(year)
    is_land = (land_2x >= 0.98) | ((land_2x > 0.02) & (elevation() > sl))
    is_land |= resize(blur(ice_c, 1.3), 2 * W, 2 * H) > 0.5
    land_a = resize(is_land.astype(np.float32), W, H, Image.BOX)[..., None]
    sea_rgb = np.where(t["sea"][..., None] > 0.5, bm_hi, p.sea)
    out = sea_rgb + (land_rgb - sea_rgb) * land_a

    lake = mega_chad(year)[..., None] * land_a
    out = out + (p.lake - out) * lake
    return np.clip(out, 0, 255).astype(np.uint8)


def encode(year: int, quality: int = 90) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"earth_{year}.webp"
    img = Image.fromarray(frame(year))
    q = quality
    while True:
        img.save(path, "WEBP", quality=q, method=6)
        if path.stat().st_size <= MAX_BYTES or q <= 40:
            break
        q -= 5
    print(f"{year}: {path.stat().st_size / 1e3:.0f} KB (q{q}) -> {path.name}", flush=True)
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quality", type=int, default=90)
    parser.add_argument("years", type=int, nargs="*")
    args = parser.parse_args()
    for y in args.years or TERRAIN_YEARS:
        encode(y, args.quality)
