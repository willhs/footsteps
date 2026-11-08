#!/usr/bin/env python3
"""
Encode one HYDE population-density grid as a small lossless WebP the browser decodes.

Each pixel is one HYDE cell (5 arc-min, ~10 km). The value is people in that
cell, log-scaled into LEVELS+1 steps: R = high byte, G = low byte, B unused.
    q = max(1, round(log1p(people) / log1p(MAX_PEOPLE) * LEVELS))   (people > 0)
    people = expm1(q / LEVELS * log1p(MAX_PEOPLE))                  (q > 0; q = 0: none)
Row 0 is the north edge (90N), column 0 is 180W, matching the ASC file.
Each cell is within +-0.76% of its HYDE value (cells under ~0.01 people are
rounded up to the first level), and a year's total within TOTAL_RTOL: the
extra precision of the old 16-bit PNGs was ~2/3 of their bytes and invisible.

Land use: landuse_{year}.png has R=cropland, G=grazing (pasture+rangeland),
B=irrigation. Each byte = round(clip(area_km2 / cell_km2, 0, 1) * 255).
Decode a byte as byte / 255; error <= 0.5/255 of cell area. NODATA is zero.
Irrigation overlaps cropland; channels are not a partition of the cell.

Usage: python footstep-generator/grid_image.py [--landuse] [--verify] 1900 [-1000 ...]
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hyde-3.5"
OUT = ROOT / "data" / "tiles" / "grid"

# Upper bound for people in one ~85 km^2 cell, and the top quantisation level
# (decode needs both constants: gridData.ts).
MAX_PEOPLE = 5_000_000
LEVELS = 1023
STEP = np.log1p(MAX_PEOPLE) / LEVELS  # log-space width of one level
TOTAL_RTOL = 3e-4  # worst year's decoded total vs the HYDE total
EARTH_R_KM = 6371.0088
LANDUSE_CHANNELS = ("cropland", "grazing", "tot_irri")
GLOBAL_GRID = {
    "ncols": 4320, "nrows": 2160, "xllcorner": -180,
    "yllcorner": -90, "cellsize": 1 / 12,
}


def asc_name(year: int) -> str:
    return f"popd_{abs(year)}{'BC' if year < 0 else 'AD'}.asc"


def read_asc(path: Path) -> tuple[np.ndarray, dict]:
    header = {}
    with open(path) as f:
        for _ in range(6):
            k, v = f.readline().split()
            header[k.lower()] = float(v)
        data = np.fromstring(
            f.read(), dtype=np.float32, sep=" "
        )
    data = data.reshape(int(header["nrows"]), int(header["ncols"]))
    return data, header


def cell_areas_km2(nrows: int, cellsize: float, ymin: float) -> np.ndarray:
    """Area of one cell per row (spherical), rows ordered north to south."""
    lat_n = ymin + (np.arange(nrows, 0, -1)) * cellsize
    lat_s = lat_n - cellsize
    dlon = np.radians(cellsize)
    return (EARTH_R_KM**2) * dlon * (np.sin(np.radians(lat_n)) - np.sin(np.radians(lat_s)))


def quantise(people: np.ndarray) -> np.ndarray:
    """Levels 0..LEVELS; zero only where there are no people."""
    q = np.clip(np.rint(np.log1p(people) / STEP), 1, LEVELS)
    return np.where(people > 0, q, 0).astype(np.uint16)


def dequantise(levels: np.ndarray) -> np.ndarray:
    return np.where(levels > 0, np.expm1(levels * STEP), 0.0)


def source_people(year: int) -> np.ndarray:
    density, h = read_asc(RAW / asc_name(year))
    density = np.where(density < 0, 0, density)  # nodata -> 0
    area = cell_areas_km2(density.shape[0], h["cellsize"], h["yllcorner"])[:, None]
    return (density * area).astype(np.float64)


def encode(year: int) -> Path:
    people = source_people(year)
    q = quantise(people)
    rgb = np.zeros((*q.shape, 3), dtype=np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"humans_{year}.webp"
    Image.fromarray(rgb, "RGB").save(out, lossless=True, quality=100, method=6)
    print(f"{year}: {people.sum():,.0f} people, {int((people > 0).sum()):,} populated cells, "
          f"max cell {people.max():,.0f}, {out.stat().st_size / 1e6:.2f} MB -> {out.name}")
    return out


def decode(path: Path) -> np.ndarray:
    """Read a population WebP back to people per cell, as the browser does."""
    with Image.open(path) as image:
        if image.mode != "RGB":
            raise ValueError(f"{path}: expected RGB, got {image.mode}")
        rgb = np.array(image)
    return dequantise((rgb[..., 0].astype(np.uint16) << 8) | rgb[..., 1])


def verify(year: int, rtol: float = TOTAL_RTOL) -> None:
    """Check a published image against its ASC: same populated cells, every cell
    within one half step, and the total within `rtol`."""
    people = source_people(year)
    decoded = decode(OUT / f"humans_{year}.webp")
    if decoded.shape != people.shape:
        raise ValueError(f"{year}: image is {decoded.shape}, source is {people.shape}")
    if np.any((decoded > 0) != (people > 0)):
        raise ValueError(f"{year}: populated cells differ from the source")
    # Half a step in log space, plus the first level standing in for tiny cells.
    allowed = (1 + people) * np.expm1(STEP / 2) * (1 + 1e-9)
    allowed = np.where(people < np.expm1(STEP / 2), np.expm1(STEP), allowed)
    allowed = np.where(people > MAX_PEOPLE, np.inf, allowed)  # clipped at the top level
    if np.any(np.abs(decoded - people) > allowed):
        raise ValueError(f"{year}: a cell is off by more than half a level")
    error = abs(decoded.sum() - people.sum()) / people.sum()
    if error > rtol:
        raise ValueError(f"{year}: total off by {error:.2e} (limit {rtol:.0e})")
    print(f"{year}: total {decoded.sum():,.0f} vs {people.sum():,.0f} (error {error:.1e})")


def landuse_shares(year: int):
    """Yield aligned source fractions in RGB order, one full grid at a time."""
    suffix = f"{abs(year)}{'BC' if year < 0 else 'AD'}.asc"
    for channel in LANDUSE_CHANNELS:
        path = RAW / f"{channel}{suffix}"
        values, header = read_asc(path)
        if any(not np.isclose(header[key], value, rtol=0, atol=1e-7)
               for key, value in GLOBAL_GRID.items()):
            raise ValueError(f"{path}: expected global 5 arc-min grid")
        nodata = values == header["nodata_value"]
        if np.any(~np.isfinite(values)) or np.any((values < 0) & ~nodata):
            raise ValueError(f"{path}: invalid land-use area")
        values[nodata] = 0
        area = cell_areas_km2(
            values.shape[0], header["cellsize"], header["yllcorner"]
        )[:, None]
        shares = values / area
        # Permit only overshoot smaller than half a quantisation step.
        if np.any(shares > 1 + 0.5 / 255):
            raise ValueError(f"{path}: land-use area exceeds cell area")
        yield np.clip(shares, 0, 1)


def encode_landuse(year: int) -> Path:
    """Write three land-use shares as a lossless RGB PNG."""
    rgb = np.empty((GLOBAL_GRID["nrows"], GLOBAL_GRID["ncols"], 3), dtype=np.uint8)
    for index, shares in enumerate(landuse_shares(year)):
        rgb[..., index] = np.rint(shares * 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"landuse_{year}.png"
    Image.fromarray(rgb, "RGB").save(out, optimize=True)
    print(f"{year}: {out.stat().st_size / 1e6:.2f} MB -> {out.name}", flush=True)
    return out


def verify_landuse(year: int) -> None:
    """Compare every decoded pixel against its source, including zero/NODATA."""
    path = OUT / f"landuse_{year}.png"
    with Image.open(path) as image:
        if image.mode != "RGB" or image.size != (GLOBAL_GRID["ncols"], GLOBAL_GRID["nrows"]):
            raise ValueError(f"{path}: expected 4320 x 2160 RGB")
        rgb = np.array(image)
    if path.stat().st_size > 5_000_000:
        raise ValueError(f"{path}: exceeds 5 MB")
    for index, shares in enumerate(landuse_shares(year)):
        error = float(np.max(np.abs(rgb[..., index] / 255 - shares)))
        if error > 0.5 / 255 + 1e-12:
            raise ValueError(f"{path}: {LANDUSE_CHANNELS[index]} error {error}")
        print(f"{year} {LANDUSE_CHANNELS[index]}: max fraction error {error:.9f}",
              flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--landuse", action="store_true", help="encode land use instead of population")
    parser.add_argument("--verify", action="store_true", help="verify existing images against ASCs")
    parser.add_argument("years", type=int, nargs="+")
    args = parser.parse_args()
    for year in args.years:
        if args.verify:
            (verify_landuse if args.landuse else verify)(year)
        else:
            (encode_landuse if args.landuse else encode)(year)
