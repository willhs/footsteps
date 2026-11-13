#!/usr/bin/env python3
"""
A MODELLED world population per 0.5 degree cell, every 1,000 years, 100,000-11,000 BCE.

Nothing here is measured. It is a best guess in five steps (method, sources and limits:
docs/ops/prehistory-population.md; recipe: docs/research/0002-pre-hyde-population-model):

1. Productivity -> density. Miami-model NPP from Beyer et al. 2020 annual temperature and
   precipitation, then the NPP-only forager fit of Tallavaara et al. 2018 (PNAS 115:1232,
   Zenodo 1167852, CC BY 4.0): ln(people per 100 km2) is linear in NPP up to 1,372 g/m2/yr
   and about flat above it.
2. Habitat. Multipliers from arrivals.yaml `habitat_rules`: too cold, too dry, coast,
   river, lake, ecotone. Ice and sea hold nobody; shelf exposed by low sea level counts as land.
3. Who was there. Each cell belongs to a region in arrivals.yaml; its density ramps from 0
   to full over `ramp_ka` after that region's arrival date.
4. Scale. One multiplier per step so the world total follows a documented curve
   (`WORLD_CURVE`: low / central / high from the literature, central anchored at HYDE's
   4.6 M at 10,000 BCE). The images show the central curve; low and high are totals only.
5. Hand-over. Between 12,000 and 10,000 BCE each cell blends linearly toward HYDE 3.5's
   10,000 BCE grid summed to 0.5 degrees, so the join does not jump.

Output (data/tiles/prehistory/): humans_{year}.webp, 720x360 RGB lossless, the SAME
encoding as grid_image.py (LEVELS, MAX_PEOPLE, row 0 = 90N, column 0 = 180W; the app takes
the cell size from the image width), and totals.json (low / central / high per year).

Usage: python footstep-generator/prehistory_population.py [--dates central|early|late]
           [--verify] [years ...]      (no years: every 1,000 years, -100000 to -11000)
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import NamedTuple

import numpy as np
import yaml
from PIL import Image, ImageDraw

import grid_image
import terrain_image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BEYER = RAW / "beyer2020" / "LateQuaternary_Environment.nc"
NATURAL_EARTH = RAW / "naturalearth"
ARRIVALS = Path(__file__).resolve().parent / "prehistory" / "arrivals.yaml"
OUT = ROOT / "data" / "tiles" / "prehistory"
# The app imports the totals at build time (lib/time.ts), as it does climate_series.json.
WEB_TOTALS = ROOT / "footsteps-web" / "public" / "prehistory_totals.json"

NX, NY, CELL_DEG = 720, 360, 0.5  # same grid as Krapp and Beyer; row 0 = north
BP_ZERO = 1950
FIRST_YEAR, LAST_YEAR, STEP = -100_000, -11_000, 1000
HYDE_YEAR = -10_000
BLEND_START = -14_000  # model weight 1 here, 0 at HYDE_YEAR; 4 ka long so people move at most ~50% a step between images, not ~70%
EDGE_BLUR_CELLS = 1.5  # softens the straight region edges of arrivals.yaml (~80 km)

# Tallavaara et al. 2018, Data_analyses.pdf section 4.1: segmented fit of ln(people / 100 km2)
# on Miami NPP (g/m2/yr), n=299 ethnographic groups, R2 = 0.45. Slope above the break is
# npp + U1.npp = 0.0028623 - 0.0030745.
TALLAVAARA = {"intercept": -0.1352714, "slope": 0.0028623, "break": 1371.664,
              "slope_above": 0.0028623 - 0.0030745}


class Totals(NamedTuple):
    low: float
    central: float
    high: float


# World population anchors, millions: (age ka BP, low, central, high). Log-interpolated in
# age; held flat outside. Sources and which ends are choices: docs/ops/prehistory-population.md.
# The three columns come from different studies, so low/high are NOT one family of curves.
WORLD_CURVE = [
    (11.95, Totals(4.0, 4.6, 6.0)),   # HYDE 3.5 at 10,000 BCE = 4.6 M; ~12 ka literature 4-6 M
    (21.0, Totals(2.1, 4.0, 8.3)),    # LGM Old World: carnivore densities / forager densities
    (30.0, Totals(1.4, 2.8, 5.0)),    # choice: between the LGM and 40 ka
    (40.0, Totals(1.0, 1.8, 3.0)),    # 1-3 M synthesis
    (70.0, Totals(0.3, 0.55, 1.0)),   # 0.3-1 M synthesis
    (100.0, Totals(0.10, 0.20, 0.40)),  # 130 ka census 0.1-0.3 M, rising
]


# --- pure helpers (tested) ----------------------------------------------------

def age_ka(year: float) -> float:
    """Thousands of years before 1950."""
    return (BP_ZERO - year) / 1000.0


def world_totals(year: float) -> Totals:
    """People in the world (not millions) on the documented curve at a calendar year."""
    ages = [a for a, _ in WORLD_CURVE]
    out = []
    for i in range(3):
        logs = [np.log(t[i] * 1e6) for _, t in WORLD_CURVE]
        out.append(float(np.exp(np.interp(age_ka(year), ages, logs))))
    return Totals(*out)


def hyde_weight(year: float) -> float:
    """Share of HYDE in the blend: 0 at 14,000 BCE, 1 at 10,000 BCE."""
    return float(np.clip((year - BLEND_START) / (HYDE_YEAR - BLEND_START), 0.0, 1.0))


def miami_npp(temp_c, precip_mm):
    """Lieth's Miami model, g dry matter / m2 / yr: the lesser of a temperature and a
    precipitation limit. Depends on neither CO2 nor seasonality."""
    t = 3000.0 / (1.0 + np.exp(1.315 - 0.119 * np.asarray(temp_c, dtype=np.float64)))
    p = 3000.0 * (1.0 - np.exp(-0.000664 * np.asarray(precip_mm, dtype=np.float64)))
    return np.minimum(t, np.maximum(p, 0.0))


def forager_density(npp):
    """Tallavaara 2018 NPP-only fit: people per 100 km2 (the fit's median, not its mean)."""
    c = TALLAVAARA
    npp = np.asarray(npp, dtype=np.float64)
    ln = np.where(npp <= c["break"],
                  c["intercept"] + c["slope"] * npp,
                  c["intercept"] + c["slope"] * c["break"] + c["slope_above"] * (npp - c["break"]))
    return np.exp(ln)


def ramp(value, zero_at, full_at):
    """0 at `zero_at`, 1 at `full_at`, linear between (either direction), clipped."""
    return np.clip((np.asarray(value, dtype=np.float64) - zero_at) / (full_at - zero_at), 0.0, 1.0)


def occupancy(age: float, arrival_ka, ramp_ka):
    """How much of its potential density a cell has `age` ka BP: 0 before its region's
    arrival, then linear to 1 over `ramp_ka`; a zero ramp is a step."""
    elapsed = np.asarray(arrival_ka, dtype=np.float64) - age
    ramp_ka = np.asarray(ramp_ka, dtype=np.float64)
    return np.where(ramp_ka > 0, np.clip(elapsed / np.where(ramp_ka > 0, ramp_ka, 1.0), 0, 1),
                    (elapsed >= 0).astype(np.float64))


def neighbours(a: np.ndarray, fill):
    """The eight shifted copies of `a`: wraps east-west, `fill` beyond the poles."""
    padded = np.pad(a, ((1, 1), (0, 0)), constant_values=fill)
    padded = np.concatenate([padded[:, -1:], padded, padded[:, :1]], axis=1)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                yield padded[1 + dy:1 + dy + a.shape[0], 1 + dx:1 + dx + a.shape[1]]


def coastal(land: np.ndarray) -> np.ndarray:
    """Land cells that touch sea: partly sea themselves or with a sea neighbour."""
    sea_next_door = np.any([n < 0.5 for n in neighbours(land, 0.0)], axis=0)
    return (land > 0) & ((land < 1) | sea_next_door)


def ecotone(biome: np.ndarray) -> np.ndarray:
    """Cells whose 3x3 neighbourhood holds a second biome (sea and ice are not biomes)."""
    is_biome = (biome > 0) & (biome != terrain_image.ICE)
    differs = np.any([(n != biome) & (n > 0) & (n != terrain_image.ICE)
                      for n in neighbours(biome, 0)], axis=0)
    return is_biome & differs


def grid_lats() -> np.ndarray:
    return 90 - CELL_DEG * (np.arange(NY) + 0.5)


def grid_lons() -> np.ndarray:
    return -180 + CELL_DEG * (np.arange(NX) + 0.5)


def assign_regions(bboxes: list[list[float]]) -> np.ndarray:
    """Region index per cell: the first bbox containing the cell centre, else the nearest
    bbox (so coasts and gaps between the coarse boxes are never left undefined)."""
    lon, lat = np.meshgrid(grid_lons(), grid_lats())
    dist = []
    for west, south, east, north in bboxes:
        dx = np.maximum(np.maximum(west - lon, lon - east), 0.0)
        dy = np.maximum(np.maximum(south - lat, lat - north), 0.0)
        dist.append(dx * dx + dy * dy)
    return np.argmin(np.stack(dist), axis=0)  # ties (distance 0) go to the first region


def blend_with_hyde(model, hyde, weight: float):
    """Linear hand-over, per cell or per total."""
    return (1 - weight) * model + weight * hyde


def sum_blocks(a: np.ndarray, k: int) -> np.ndarray:
    """Sum k x k blocks (HYDE 5 arc-min people -> 0.5 degree people)."""
    h, w = a.shape
    return a.reshape(h // k, k, w // k, k).sum(axis=(1, 3))


# --- sources ------------------------------------------------------------------

@dataclass(frozen=True)
class Climate:
    bio1: np.ndarray      # annual mean temperature, deg C
    bio12: np.ndarray     # annual precipitation, mm
    coldest: np.ndarray   # mean temperature of the coldest month, deg C


class BeyerSteps:
    """Beyer et al. 2020 (Figshare 12293345 v4, CC BY 4.0), 0.5 degree, 1-2 ka steps.
    Cells are NaN where Beyer has no land (sea, and south of 60S)."""

    def __init__(self, path: Path = BEYER):
        import xarray as xr
        self.ds = xr.open_dataset(path, decode_times=False)
        self.bp = -self.ds["time"].values.astype(float)  # years BP (0 = 1950)
        self.lat = self.ds["latitude"].values

    def _north_up(self, a: np.ndarray) -> np.ndarray:
        full = np.full((NY, NX), np.nan, dtype=np.float32)
        row0 = int(round((self.lat.min() + 89.75) / CELL_DEG))  # first south-up row
        full[row0:row0 + a.shape[0]] = a
        return full[::-1].copy()

    @lru_cache(maxsize=8)
    def step(self, index: int) -> Climate:
        ds = self.ds
        monthly = ds["temperature"].isel(time=index).values  # (month, lat, lon)
        return Climate(self._north_up(ds["BIO1"].isel(time=index).values),
                       self._north_up(ds["BIO12"].isel(time=index).values),
                       self._north_up(monthly.min(axis=0)))

    def at(self, bp: float) -> Climate:
        """Linear interpolation between the two steps around `bp` years BP."""
        bp = float(np.clip(bp, self.bp.min(), self.bp.max()))
        order = np.argsort(self.bp)
        hi = int(np.searchsorted(self.bp[order], bp, side="left"))
        hi = min(max(hi, 1), len(order) - 1)
        i0, i1 = int(order[hi - 1]), int(order[hi])
        w = (bp - self.bp[i0]) / (self.bp[i1] - self.bp[i0])
        a, b = self.step(i0), self.step(i1)
        mix = lambda x, y: ((1 - w) * x + w * y).astype(np.float32)  # noqa: E731
        return Climate(mix(a.bio1, b.bio1), mix(a.bio12, b.bio12), mix(a.coldest, b.coldest))


@dataclass(frozen=True)
class Land:
    """Krapp et al. 2021 via terrain_image: the same land, sea and ice as the terrain images."""
    land: np.ndarray       # fraction of the cell that is land (ice counts), 0..1
    habitable: np.ndarray  # fraction that is ice-free land, 0..1
    biome: np.ndarray      # BIOME4 class at the nearer 1 ka step; 0 = sea, 28 = ice


def land_at(year: float) -> Land:
    young, old, w = terrain_image.step_bracket(year)
    a, b = terrain_image.biome(young), terrain_image.biome(old)
    mix = lambda x, y: (1 - w) * x.astype(np.float64) + w * y.astype(np.float64)  # noqa: E731
    land = mix(a > 0, b > 0)
    ice = mix(a == terrain_image.ICE, b == terrain_image.ICE)
    return Land(land, np.clip(land - ice, 0, 1), a if w < 0.5 else b)


@lru_cache(maxsize=1)
def water_cells(root: Path = NATURAL_EARTH) -> tuple[np.ndarray, np.ndarray]:
    """(river, lake) flags per cell from Natural Earth 10m (public domain, v5.1.2): cells a
    present-day major river runs through or that hold a lake. Present-day courses stand in
    for the past; there is no palaeo hydrography at this scale."""
    s = 4  # draw at 4x, then any-pixel per cell
    rivers = Image.new("1", (NX * s, NY * s))
    lakes = Image.new("1", (NX * s, NY * s))
    px = lambda c: ((c[0] + 180) / CELL_DEG * s, (90 - c[1]) / CELL_DEG * s)  # noqa: E731

    def draw(path: Path, image: Image.Image, keep=lambda _: True):
        d = ImageDraw.Draw(image)
        for f in json.loads(path.read_text())["features"]:
            if not keep(f["properties"]) or not f.get("geometry"):
                continue
            g = f["geometry"]
            lines = {"LineString": [g["coordinates"]], "MultiLineString": g["coordinates"],
                     "Polygon": [r for r in g["coordinates"][:1]],
                     "MultiPolygon": [p[0] for p in g["coordinates"]]}[g["type"]]
            for line in lines:
                pts = [px(c) for c in line]
                if g["type"].endswith("Polygon"):
                    d.polygon(pts, fill=1)
                else:
                    d.line(pts, fill=1, width=1)

    draw(root / "ne_10m_rivers_lake_centerlines.geojson", rivers,
         lambda p: p.get("featurecla") == "River")
    draw(root / "ne_10m_lakes.geojson", lakes)
    cells = lambda im: np.asarray(im).reshape(NY, s, NX, s).any(axis=(1, 3))  # noqa: E731
    return cells(rivers), cells(lakes)


@lru_cache(maxsize=1)
def hyde_half_degree() -> np.ndarray:
    """HYDE 3.5 people at 10,000 BCE summed to 0.5 degree cells."""
    return sum_blocks(grid_image.source_people(HYDE_YEAR), 6)


# --- the model ----------------------------------------------------------------

@dataclass(frozen=True)
class Step:
    year: int
    people: np.ndarray    # central curve, after the HYDE blend
    totals: Totals        # low / central / high, after the same blend
    hyde_weight: float
    potential: float      # people if every habitable cell held Tallavaara density, all regions occupied
    occupied_cells: int


class Model:
    def __init__(self, table: dict, dates: str = "central", climate: BeyerSteps | None = None,
                 hyde: np.ndarray | None = None, water=None, land_fn=land_at):
        self.land_fn = land_fn
        self.rules = table["habitat_rules"]
        regions = table["regions"]
        self.dates = dates
        self.region_index = assign_regions([r["bbox"] for r in regions])
        self.arrival = np.array([r["arrival_ka_bp"][dates] for r in regions], dtype=np.float64)
        self.ramp_ka = np.array([r["ramp_ka"] for r in regions], dtype=np.float64)
        self.area = grid_image.cell_areas_km2(NY, CELL_DEG, -90.0)[:, None]
        self._climate, self._hyde, self._water = climate, hyde, water

    @cached_property
    def climate(self) -> BeyerSteps:
        return self._climate or BeyerSteps()

    @cached_property
    def hyde(self) -> np.ndarray:
        return self._hyde if self._hyde is not None else hyde_half_degree()

    @cached_property
    def water(self) -> tuple[np.ndarray, np.ndarray]:
        return self._water or water_cells()

    def habitat(self, npp, coldest, land: Land) -> np.ndarray:
        """Product of the habitat rules (arrivals.yaml): a multiplier on NPP density."""
        r = self.rules
        cold, dry = r["cold_limit"]["coldest_month_mean_c"], r["aridity"]
        river, lake = self.water
        m = ramp(coldest, cold["zero_below"], cold["full_above"])
        m = m * ramp(npp, dry["npp_floor_g_m2_yr"], dry["npp_ramp_to"])
        for name, flag in (("coast", coastal(land.land)), ("river", river),
                           ("lake", lake), ("ecotone", ecotone(land.biome))):
            m = m * np.where(flag, r[name]["bonus"], 1.0)
        return m

    def climate_npp(self, year: float) -> tuple[np.ndarray, np.ndarray]:
        """(Miami NPP, coldest-month temperature) per cell from Beyer's climate."""
        c = self.climate.at(BP_ZERO - year)
        # Cells Beyer has no data for (shelf, south of 60S) borrow their neighbours' climate.
        stack = np.stack([c.bio1, c.bio12, c.coldest], axis=-1)
        t, p, cold = np.moveaxis(
            terrain_image.fill_unknown(stack, np.isfinite(c.bio1) & np.isfinite(c.bio12)), -1, 0)
        return miami_npp(t, p), cold

    def adjust_npp(self, npp: np.ndarray, year: float) -> np.ndarray:
        """Hook for a subclass to correct the climate's NPP (none here)."""
        return npp

    def potential_and_climate(self, year: float) -> tuple[np.ndarray, Land]:
        land = self.land_fn(year)
        npp, cold = self.climate_npp(year)
        npp = self.adjust_npp(npp, year)
        density_km2 = forager_density(npp) / 100.0 * self.habitat(npp, cold, land)
        return density_km2 * land.habitable * self.area, land

    def step(self, year: int) -> Step:
        potential, _ = self.potential_and_climate(year)
        occ = occupancy(age_ka(year), self.arrival[self.region_index], self.ramp_ka[self.region_index])
        occ = np.clip(terrain_image.blur(occ, EDGE_BLUR_CELLS), 0.0, 1.0)
        raw = potential * occ
        if raw.sum() <= 0:
            raise ValueError(f"{year}: nobody can live anywhere in the model")
        totals = world_totals(year)
        w = hyde_weight(year)
        hyde_total = float(self.hyde.sum())
        people = blend_with_hyde(raw * (totals.central / raw.sum()), self.hyde, w)
        blended = Totals(*(float(blend_with_hyde(t, hyde_total, w)) for t in totals))
        return Step(year, people, blended, w, float(potential.sum()), int((people > 0).sum()))


def load_table(path: Path = ARRIVALS) -> dict:
    return yaml.safe_load(path.read_text())


# --- output ------------------------------------------------------------------

def encode_people(people: np.ndarray, path: Path) -> None:
    """Write people per cell with grid_image's encoding (R = high byte, G = low byte)."""
    q = grid_image.quantise(people)
    rgb = np.zeros((*q.shape, 3), dtype=np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(path, lossless=True, quality=100, method=6)


def sources_note() -> dict:
    return {
        "climate": "Beyer, Krapp & Manica 2020, Figshare 12293345 v4 (CC BY 4.0), "
                   "LateQuaternary_Environment.nc md5 d23abb7ce8671433ea36a2cae814ebab",
        "density": "Tallavaara, Eronen & Luoto 2018 PNAS 115:1232, NPP-only segmented fit, "
                   "Zenodo 1167852 Data_analyses.pdf md5 84e487576cf03b9668311267e8ae1a1d (CC BY 4.0)",
        "land_sea_ice": "Krapp et al. 2021 biomes (CC BY 4.0), as in terrain_image.py",
        "handover": "HYDE 3.5 population density at 10,000 BCE, summed to 0.5 degrees",
        "water": "Natural Earth 10m rivers and lakes v5.1.2 (public domain), present-day courses",
    }


def run(years: list[int], dates: str, out: Path, verify: bool) -> dict:
    model = Model(load_table(), dates)
    rows = []
    for year in years:
        s = model.step(year)
        path = out / f"humans_{year}.webp"
        encode_people(s.people, path)
        decoded = grid_image.decode(path).sum()
        if verify and abs(decoded - s.people.sum()) / s.people.sum() > 0.01:
            raise ValueError(f"{year}: decoded total {decoded:,.0f} vs {s.people.sum():,.0f}")
        rows.append(s)
        print(f"{year}: {s.totals.central:,.0f} people (range {s.totals.low:,.0f}-{s.totals.high:,.0f}), "
              f"{s.occupied_cells:,} cells, {s.people.sum() / s.potential:.1%} of potential, "
              f"hyde {s.hyde_weight:.0%}, {path.stat().st_size / 1e3:.0f} KB", flush=True)
    data = {
        "description": "MODELLED world population per slider year, not measured. Totals are "
                       "low / central / high people; the images show the central curve.",
        "dates": dates,
        "grid": {"width": NX, "height": NY, "cell_deg": CELL_DEG, "encoding": "grid_image.py"},
        "sources": sources_note(),
        "curve_anchors_m": [{"age_ka_bp": a, "low": t.low, "central": t.central, "high": t.high}
                            for a, t in WORLD_CURVE],
        "years": [s.year for s in rows],
        "low": [round(s.totals.low) for s in rows],
        "central": [round(s.totals.central) for s in rows],
        "high": [round(s.totals.high) for s in rows],
        "hyde_weight": [round(s.hyde_weight, 3) for s in rows],
    }
    text = json.dumps(data, separators=(",", ":")) + "\n"
    (out / "totals.json").write_text(text)
    if out == OUT and years == list(range(FIRST_YEAR, LAST_YEAR + 1, STEP)):
        WEB_TOTALS.write_text(text)  # only a full default run: a partial one would drop years
    return data


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or '').strip().splitlines()[0])
    p.add_argument("years", type=int, nargs="*",
                   default=list(range(FIRST_YEAR, LAST_YEAR + 1, STEP)))
    p.add_argument("--dates", choices=["central", "early", "late"], default="central",
                   help="which arrival-date column of arrivals.yaml to use")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--verify", action="store_true", help="decode each image and check its total")
    a = p.parse_args()
    run(a.years, a.dates, a.out, a.verify)


if __name__ == "__main__":
    main()
