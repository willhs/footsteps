"""Nearest known ethnographic analogs for a place, year and way of life (D-PLACE societies).

Runtime half of footstep-generator/anthropology/ethnography.py, which builds the export this reads
(`ethnography.json.gz`, beside this file). It lives in the API directory so the day API image can ship
it without the D-PLACE build code; the generator imports it back, so there is one ranking.
Method, weights and limits: docs/ops/ethnography.md. Every result carries `CAVEAT`.
"""
from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path

OUT = Path(__file__).with_name("ethnography.json.gz")

# --- the ethnographic present --------------------------------------------------------------

ETHNOGRAPHIC_PRESENT = (1850, 1950)
HISTORICAL_BEFORE = 1800  # earlier records (Aztec, Inca, Babylonians...) are histories, not fieldwork
CAVEAT = (
    "The ethnographic present (about 1850-1950) is not the past. These societies were described "
    "by outsiders, often under colonial pressure and with trade goods, missions and guns already "
    "in play. They show one way a kind of life has worked somewhere, not what happened here."
)

# --- datasets -------------------------------------------------------------------------------


SUBSISTENCE_KEYS = ("gathering", "hunting", "fishing", "herding", "agriculture")
WAYS = ("foraging", "fishing", "herding", "farming", "urban")
WAY_ALIASES = {"forager": "foraging", "fisher": "fishing", "herder": "herding", "pastoralist": "herding",
               "farmer": "farming", "mixed": "farming", "city": "urban"}
# Share of the subsistence mix that makes a society a good example of each way of life.
WAY_SHARE = {"foraging": ("gathering", "hunting"), "fishing": ("fishing",), "herding": ("herding",),
             "farming": ("agriculture",), "urban": ("agriculture",)}

# Earliest dates a way of life is attested anywhere (negative = BCE). Asking for an analog
# earlier than this still works but carries a warning.
EARLIEST_ATTESTED = {
    "farming": (-9500, "farming began in the Levant around 9500 BCE"),
    "herding": (-8500, "sheep and goat herding began in southwest Asia around 8500 BCE"),
    "urban": (-3500, "the first cities (Uruk) date to about 3500 BCE"),
}




# Coarse biome families so TEOW (societies) and BIOME4 (Krapp, the app's map) names compare.
BIOME_FAMILIES = {
    "Tropical & Subtropical Moist Broadleaf Forests": "tropical forest",
    "Tropical & Subtropical Dry Broadleaf Forests": "tropical forest",
    "Tropical & Subtropical Coniferous Forests": "tropical forest",
    "Mangroves": "tropical forest",
    "Tropical & Subtropical Grasslands, Savannas & Shrublands": "tropical savanna",
    "Flooded Grasslands & Savannas": "tropical savanna",
    "Deserts & Xeric Shrublands": "desert",
    "Temperate Conifer Forests": "temperate forest",
    "Temperate Broadleaf & Mixed Forests": "temperate forest",
    "Temperate Grasslands, Savannas & Shrublands": "temperate grassland",
    "Montane Grasslands & Shrublands": "temperate grassland",
    "Mediterranean Forests, Woodlands & Scrub": "mediterranean",
    "Boreal Forests/Taiga": "boreal forest",
    "Tundra": "tundra",
    "Ice": "tundra",
    # Krapp et al. 2021 BIOME4 classes (footsteps-web/public/habitat_meta.json)
    "Tropical evergreen forest": "tropical forest",
    "Tropical semi-deciduous forest": "tropical forest",
    "Tropical deciduous forest/woodland": "tropical forest",
    "Tropical savanna": "tropical savanna",
    "Tropical grassland": "tropical savanna",
    "Tropical xerophytic shrubland": "desert",
    "Temperate xerophytic shrubland": "desert",
    "Desert": "desert",
    "Barren": "desert",
    "Temperate deciduous forest": "temperate forest",
    "Temperate conifer forest": "temperate forest",
    "Warm mixed forest": "temperate forest",
    "Cool mixed forest": "temperate forest",
    "Cool conifer forest": "temperate forest",
    "Temperate broadleaved savanna": "temperate grassland",
    "Temperate grassland": "temperate grassland",
    "Temperate sclerophyll woodland": "mediterranean",
    "Cold mixed forest": "boreal forest",
    "Evergreen taiga/montane forest": "boreal forest",
    "Deciduous taiga/montane forest": "boreal forest",
    "Open conifer woodland": "boreal forest",
    "Boreal parkland": "boreal forest",
    "Steppe tundra": "tundra",
    "Shrub tundra": "tundra",
    "Dwarf shrub tundra": "tundra",
    "Prostrate shrub tundra": "tundra",
    "Cushion forb lichen moss tundra": "tundra",
    "Land ice": "tundra",
}
# Neighbouring families score half: the same people could live in either.
RELATED_FAMILIES = {frozenset(p) for p in (
    ("tropical forest", "tropical savanna"), ("tropical savanna", "desert"), ("temperate forest", "mediterranean"),
    ("temperate forest", "boreal forest"), ("temperate forest", "temperate grassland"),
    ("temperate grassland", "desert"), ("mediterranean", "desert"), ("boreal forest", "tundra"),
    ("mediterranean", "temperate grassland"),
)}

# Weights of the parts of the score; parts a place or society lacks are dropped and the rest rescaled.
WEIGHTS = {"temperature": 0.15, "precipitation": 0.15, "biome": 0.15, "subsistence": 0.30, "proximity": 0.25}
TEMP_SCALE_C = 10.0  # a 10 C difference scores 0
PRECIP_OFFSET_MM, PRECIP_SCALE = 100.0, math.log(10)  # a 10x difference in (mm + 100) scores 0
PROXIMITY_KM = 4000.0  # the distance at which proximity has fallen to 1/e
EARTH_R_KM = 6371.0088


def biome_family(name: str | None) -> str | None:
    return BIOME_FAMILIES.get(name) if name else None


def canonical_way(way: str) -> str:
    w = WAY_ALIASES.get(way.lower(), way.lower())
    if w not in WAYS:
        raise ValueError(f"way of life must be one of {sorted({*WAYS, *WAY_ALIASES})}, got {way!r}")
    return w


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(min(1.0, a)))


def cell_centre(key: str, cell_deg: int = 5) -> tuple[float, float]:
    """'-20,20' (the atlas's south-west corner key) -> the cell's centre (lat, lon)."""
    south, west = (int(v) for v in key.split(","))
    return south + cell_deg / 2, west + cell_deg / 2


def year_label(year: int) -> str:
    return f"{-year} BCE" if year < 0 else f"{year} CE"


@dataclass(frozen=True)
class Place:
    """The place and time being asked about. Environment is optional; what is missing is not scored."""
    lat: float
    lon: float
    year: int
    way: str
    biome: str | None = None
    temp_c: float | None = None
    precip_mm: float | None = None


@dataclass(frozen=True)
class Analog:
    society: dict
    score: float  # 0..1, a weighted mean of `parts`
    parts: dict[str, float]  # temperature, precipitation, biome, subsistence, proximity (those that applied)
    distance_km: float
    gap_years: int | None  # the society's record year minus the asked year (positive: recorded later)

    @property
    def record(self) -> str:
        """What kind of account this is: most are the ethnographic present, a few are older histories."""
        year = self.society.get("year")
        if year is None:
            return "record year unknown"
        return "historical account" if year < HISTORICAL_BEFORE else "ethnographic present"


@dataclass(frozen=True)
class AnalogResult:
    place: Place
    analogs: tuple[Analog, ...]
    caveat: str
    warnings: tuple[str, ...]
    basis: tuple[str, ...]  # the score parts that applied to the place
    pool: int  # societies of this way of life that were ranked


def _subsistence_share(society: dict, way: str) -> float:
    v = society["values"]
    total = sum(v.get(k, 0) for k in SUBSISTENCE_KEYS)
    if total <= 0:
        return 0.5  # the way of life is known but not the mix
    return min(1.0, sum(v.get(k, 0) for k in WAY_SHARE[way]) / total)


def _parts(society: dict, place: Place, way: str, km: float) -> dict[str, float]:
    parts = {"subsistence": _subsistence_share(society, way),
             "proximity": math.exp(-km / PROXIMITY_KM)}
    if place.temp_c is not None and society.get("temp_c") is not None:
        parts["temperature"] = max(0.0, 1 - abs(place.temp_c - society["temp_c"]) / TEMP_SCALE_C)
    if place.precip_mm is not None and society.get("precip_mm") is not None:
        ratio = abs(math.log((place.precip_mm + PRECIP_OFFSET_MM) / (society["precip_mm"] + PRECIP_OFFSET_MM)))
        parts["precipitation"] = max(0.0, 1 - ratio / PRECIP_SCALE)
    mine, theirs = biome_family(place.biome), biome_family(society.get("biome"))
    if mine and theirs:
        parts["biome"] = 1.0 if mine == theirs else 0.5 if frozenset((mine, theirs)) in RELATED_FAMILIES else 0.0
    return parts


def _score(parts: dict[str, float]) -> float:
    weight = sum(WEIGHTS[k] for k in parts)
    return sum(WEIGHTS[k] * v for k, v in parts.items()) / weight


def nearest_analogs(export: dict, lat: float, lon: float, year: int, way: str, *, biome: str | None = None,
                    temp_c: float | None = None, precip_mm: float | None = None, k: int = 3) -> AnalogResult:
    """The `k` societies most like this place and way of life, best first, with a 0..1 score.

    `way` is foraging, fishing, herding, farming or urban (aliases forager, herder, farmer, mixed,
    city). `biome` is a TEOW or Krapp BIOME4 name; `temp_c` and `precip_mm` are the annual mean
    and annual total for the place in that year (for the app, from the habitat lookup). Only
    societies of that way of life are ranked. Ties break on distance, then name.
    """
    way = canonical_way(way)
    place = Place(lat, lon, year, way, biome, temp_c, precip_mm)
    pool = [s for s in export["societies"] if s["way"] == way]
    ranked = []
    for s in pool:
        km = haversine_km(lat, lon, s["lat"], s["lon"])
        parts = _parts(s, place, way, km)
        gap = s["year"] - year if s.get("year") is not None else None
        ranked.append(Analog(s, round(_score(parts), 3), {p: round(v, 3) for p, v in parts.items()}, round(km), gap))
    ranked.sort(key=lambda a: (-a.score, a.distance_km, a.society["name"]))

    warnings = []
    if way in EARLIEST_ATTESTED and year < EARLIEST_ATTESTED[way][0]:
        warnings.append(f"No {way} life is known this early anywhere: {EARLIEST_ATTESTED[way][1]}. "
                        "These analogs show what it looked like later, not that it existed here.")
    if biome is not None and biome_family(biome) is None:
        warnings.append(f"Biome {biome!r} is not recognised and was not scored.")
    basis = tuple(p for p in WEIGHTS if p in {"subsistence", "proximity"}
                  or (p == "temperature" and temp_c is not None) or (p == "precipitation" and precip_mm is not None)
                  or (p == "biome" and biome_family(biome)))
    if not {"temperature", "precipitation", "biome"} & set(basis):
        warnings.append("No climate or biome was given, so the ranking uses way of life and distance only.")
    if not ranked:
        warnings.append(f"No ethnographic society has the way of life {way!r}.")
    elif ranked[0].score < 0.5:
        warnings.append("Even the best match is a weak one: no recorded society lived in a place like this.")
    return AnalogResult(place, tuple(ranked[:k]), CAVEAT, tuple(warnings), basis, len(pool))


def describe(export: dict, result: AnalogResult) -> str:
    """The result as readable text, caveat first: what the sanity checks in docs/ops/ethnography.md print."""
    p = result.place
    env = ", ".join(x for x in (p.biome, f"{p.temp_c:g} C" if p.temp_c is not None else None,
                                f"{p.precip_mm:g} mm/yr" if p.precip_mm is not None else None) if x) or "no environment given"
    lines = [f"{p.way} at {p.lat:g},{p.lon:g}, {year_label(p.year)} ({env}); ranked {result.pool} societies",
             f"  ! {result.caveat}", *[f"  ! {w}" for w in result.warnings]]
    for a in result.analogs:
        s = a.society
        gap = f"recorded {year_label(s['year'])}, {abs(a.gap_years)} years {'after' if a.gap_years > 0 else 'before'}" \
            if a.gap_years is not None else "record year unknown"
        lines.append(f"  {a.score:.2f}  {s['name']} ({s['region']}), {a.distance_km} km away, {gap} [{a.record}]")
        lines.append("        " + ", ".join(f"{k} {v:.2f}" for k, v in a.parts.items())
                     + f"; {s.get('biome') or 'biome unknown'}, {s.get('temp_c', '?')} C, {s.get('precip_mm', '?')} mm/yr")
        facts = []
        for key in ("settlement_pattern", "community_size", "levels_beyond_local", "high_gods", "marital_residence",
                    "internal_war", "trade_in_subsistence", "mobility", "camp_size_aggregated", "moves_per_year"):
            value = s["values"].get(key)
            if value is None:
                continue
            var = export["variables"][key]
            facts.append(f"{key.replace('_', ' ')}: " + (f"{value:g} {var['unit']}" if var["kind"] == "number"
                                                      else var["codes"][str(value)]))
        lines.append("        " + ("; ".join(facts) or "no coded facts"))
    return "\n".join(lines)




def load(path: Path = OUT) -> dict:
    with gzip.open(path, "rt") as f:
        return json.load(f)
