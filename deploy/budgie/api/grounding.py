"""Facts that ground "Imagine their day" beyond the atlas record: the nearest recorded societies
and measured hours of adult time use. Both are compact, sourced and never split by sex.

Data shape (one direction of flow):

    atlas record --setting()--> Setting(way, lat, lon, year, biome, temp_c, precip_mm)
    Setting + ethnography.json.gz (analogs.py) --analog_facts()--> {"caveat", "societies": [<=3], "warnings"}
    Setting.way + time_use.json (from time_use.yaml) --time_use_facts()--> {"hours_per_day", "sources", ...} | None

Either may be None (no analog pool, no measured hours): the prompt then omits the key rather than
inviting the model to invent it. Roles are never assigned by sex here: the ethnography export
carries no sex-difference variables (docs/ops/ethnography.md) and time_use.json has no sex note.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import analogs

TIME_USE_PATH = Path(__file__).with_name("time_use.json")
ANALOGS_SHOWN = 3
# Traits of a recorded society worth telling the model, in order. Each is a key of the export's
# `variables`; at most MAX_TRAITS are shown, skipping the ones a society has no value for.
TRAIT_KEYS = ("settlement_pattern", "community_size", "camp_size_aggregated", "moves_per_year",
              "dominant_activity", "major_crop", "domestic_animals", "house_walls")
MAX_TRAITS = 6
# Time use is measured for these ways of life only; "mixed" is farming (as the analog ranking treats it).
TIME_USE_WAY = {"foraging": "foraging", "farming": "farming", "mixed": "farming"}


@dataclass(frozen=True)
class Setting:
    """Where, when and how people lived: what the analog ranking and time use are looked up by."""
    way: str  # an atlas way of life: foraging, fishing, herding, farming, mixed (urban if ever given)
    lat: float
    lon: float
    year: int
    biome: str | None = None  # TEOW (HYDE years) or Krapp BIOME4 (modelled years) name
    temp_c: float | None = None  # annual mean, modelled years only
    precip_mm: float | None = None  # annual total, modelled years only


def decade_label(year: int | None) -> str:
    """1938 -> '1930s'; -2000 -> '2000 BCE' (the five ancient records are not dated to a decade)."""
    if year is None:
        return "date unknown"
    return f"{year // 10 * 10}s" if year >= 0 else f"{-year} BCE"


def _trait(export: dict, society: dict, key: str) -> str | None:
    value = society["values"].get(key)
    if value is None:
        return None
    var = export["variables"][key]
    name = key.replace("_", " ")
    if var["kind"] == "number":
        return f"{name}: {value:g} {var['unit']}"
    return f"{name}: {var['codes'][str(value)]}"


def analog_facts(export: dict, setting: Setting, k: int = ANALOGS_SHOWN) -> dict | None:
    """The `k` nearest recorded societies as prompt facts, or None for a way of life with no pool."""
    result = analogs.nearest_analogs(export, setting.lat, setting.lon, setting.year, setting.way,
                                     biome=setting.biome, temp_c=setting.temp_c,
                                     precip_mm=setting.precip_mm, k=k)
    if not result.analogs:
        return None
    societies = []
    for a in result.analogs:
        s = a.society
        traits = [t for key in TRAIT_KEYS if (t := _trait(export, s, key))][:MAX_TRAITS]
        societies.append({
            "cite_as": f"like the {s['name']} (recorded {decade_label(s.get('year'))})",
            "region": s["region"],
            "km_away": a.distance_km,
            "similarity_0_to_1": a.score,
            **({"years_after_this_day": a.gap_years} if a.gap_years is not None and a.gap_years > 0 else {}),
            **({"kind_of_record": a.record} if a.record != "ethnographic present" else {}),
            "recorded_traits": traits,
        })
    return {"caveat": result.caveat, "societies": societies, "warnings": list(result.warnings)}


def load_time_use(path: Path = TIME_USE_PATH) -> dict:
    return json.loads(path.read_text())


def _hours(figure: dict) -> str:
    lo, hi = figure["range"]
    scope = f"; {figure['scope']}" if figure.get("scope") else ""
    return f"about {figure['value']:g} (studies range {lo:g}-{hi:g}{scope})"


def time_use_facts(time_use: dict, way: str) -> dict | None:
    """Measured adult hours per day for a way of life, or None when no study gives a figure."""
    entry = time_use["ways_of_life"].get(TIME_USE_WAY.get(way, ""))
    if not entry:
        return None
    sources = list(dict.fromkeys(c for f in entry["figures"].values() for c in f["cite"]))
    return {
        "measured_among": entry["measured_among"],
        "hours_per_day_adult": {name: _hours(f) for name, f in entry["figures"].items()},
        "sources": sources,
        **({"caution": entry["caution"]} if entry.get("caution") else {}),
    }
