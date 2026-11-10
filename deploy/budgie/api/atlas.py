"""Anthropology atlas: one record per 5-degree cell x era: real data first, model gap-fill second.

The atlas (anthropology.json.gz, built by footstep-generator/anthropology/build.py) holds
per-cell numbers from HYDE 3.5, decoded D-PLACE societies and Seshat snapshots. This module
turns one cell x era of it into a record. Every field is

    {"value": <json or null>, "source": <str>, "note": <str, optional>}

where source is a dataset name (several joined with "; "), "model" (gap-filled by Claude),
"derived" (confidence only) or "none" (unknown; value is null). Standard library only.
"""
from __future__ import annotations

import gzip
import json
import math
import re
from pathlib import Path

CELL_DEG = 5
ERAS = [*range(-10000, 0, 1000), *range(0, 2000, 100)]  # the 30 HYDE years
FIRST_YEAR, LAST_YEAR = ERAS[0], ERAS[-1]

HYDE = "HYDE 3.5"
EA = "D-PLACE EA"
TEOW = "D-PLACE TEOW"
SESHAT = "Seshat Equinox 2020"
MODEL = "model"
NONE = "none"

SUBSISTENCE = ("foraging", "fishing", "herding", "farming", "mixed", "urban", "uninhabited")
SETTLEMENT = ("mobile camp", "seasonal camp", "hamlet", "village", "town", "city", "uninhabited")
FIELDS = (
    "subsistence", "settlement", "dwelling", "clothing", "hair_adornment", "tools_by_role",
    "diet", "skin_hair", "climate", "technology", "polity",
)
# Fields the model may fill when no dataset does. Subsistence and settlement always come
# from HYDE; polity only from Seshat (a guessed polity name would be fiction).
MODEL_FIELDS = (
    "dwelling", "clothing", "hair_adornment", "tools_by_role", "diet", "skin_hair",
    "climate", "technology",
)

ETHNOGRAPHIC_FROM = 1800  # D-PLACE's "ethnographic present" is ~1850-1950
NEAR_KM = 500  # a society this close counts as describing the place itself
# Farming: at least 0.1 ha of cropland per person (a 5-degree cell's share is diluted by desert
# and mountain). Herding: at least 5% of the cell's land grazed.
CROP_KM2_PER_PERSON, GRAZE_MIN = 0.001, 0.05
HERD_OVER_CROP = 20  # grazing land this many times the cropland: herders who also farm a little


def field(value, source: str, note: str | None = None) -> dict:
    f = {"value": value, "source": source if value is not None else NONE}
    if note:
        f["note"] = note
    return f


def unknown() -> dict:
    return field(None, NONE)


def era_of(year: int) -> int:
    """1000-year buckets before 1 CE, 100-year after, floored; e.g. -2500 -> -3000, 1850 -> 1800."""
    if not FIRST_YEAR <= year <= LAST_YEAR:
        raise ValueError(f"year must be {FIRST_YEAR}..{LAST_YEAR}")
    return -((-year + 999) // 1000) * 1000 if year < 0 else year // 100 * 100


def era_label(era: int) -> str:
    if era < 0:
        return f"{-era} to {-(era + 1000) or 1} BCE"
    return f"{era or 1} to {era + 99} CE"


def cell_of(lat: float, lon: float) -> str:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("lat must be -90..90 and lon -180..180")
    lat0 = min(int(math.floor(lat / CELL_DEG)) * CELL_DEG, 90 - CELL_DEG)
    lon0 = min(int(math.floor(lon / CELL_DEG)) * CELL_DEG, 180 - CELL_DEG)
    return f"{lat0},{lon0}"


# --- rules: one atlas cell x era -> fields -------------------------------------------------

def way_of_life(people: float, land_km2: float, crop: float, graze: float) -> str:
    if people <= 0:
        return "uninhabited"
    farm, herd = crop * land_km2 / people >= CROP_KM2_PER_PERSON, graze >= GRAZE_MIN
    if herd and (not farm or graze >= HERD_OVER_CROP * crop):
        return "herding"
    return "mixed" if farm and herd else "farming" if farm else "foraging"


def typical_settlement(way: str, lived_density: float) -> str:
    """Typical home from way of life and the density the average person lives at (people per
    km2 around them, so empty desert in the cell does not dilute it)."""
    if way == "uninhabited":
        return "uninhabited"
    if way in ("foraging", "fishing"):
        return "mobile camp" if lived_density < 0.1 else "seasonal camp"
    if way == "herding":
        return "mobile camp" if lived_density < 10 else "hamlet"
    return "hamlet" if lived_density < 5 else "village" if lived_density < 1000 else "town"


def analogue_class(way: str) -> str | None:
    return {"foraging": "foraging", "fishing": "fishing", "herding": "herding",
            "farming": "farming", "mixed": "farming"}.get(way)


def analogue_note(soc: dict, km: float, era: int) -> str:
    where = f"{soc['name']}, recorded c. {soc['year']}, {round(km)} km from the cell centre"
    if era >= ETHNOGRAPHIC_FROM:
        return f"Ethnographic record: {where}."
    return f"Ethnographic analogue from the 19th-20th c. ({where}); this era may have differed."


class Atlas:
    def __init__(self, data: dict):
        self.data = data
        self.version = data["version"]
        self.sources = data["sources"]
        self.cells = data["cells"]
        self.societies = data["societies"]

    @classmethod
    def load(cls, path: str | Path) -> "Atlas":
        with gzip.open(path, "rt") as f:
            return cls(json.load(f))

    def record(self, lat: float, lon: float, year: int) -> dict | None:
        """The real-data record, or None when the cell has no land in HYDE."""
        key, era = cell_of(lat, lon), era_of(year)
        cell = self.cells.get(key)
        if cell is None:
            return None
        people, land_km2, crop, graze, irri, lived = cell["hyde"][ERAS.index(era)]
        density = people / land_km2
        way = way_of_life(people, land_km2, crop, graze)
        fields = {name: unknown() for name in FIELDS}

        analogue = None
        if (cls := analogue_class(way)) and (hit := cell["analogues"].get(cls)):
            analogue = (self.societies[hit[0]], hit[1])
        # Recent foragers by a fishing people: D-PLACE knows better than HYDE's land use.
        fishers = cell["analogues"].get("fishing")
        if way == "foraging" and era >= ETHNOGRAPHIC_FROM and fishers and fishers[1] <= NEAR_KM:
            way, analogue = "fishing", (self.societies[fishers[0]], fishers[1])
            way_source = f"{HYDE}; {EA}"
        else:
            way_source = HYDE

        fields["subsistence"] = field(
            {"way": way, "cropland_share": crop, "grazing_share": graze, "irrigated_share": irri},
            way_source,
            "Shares of the cell's land in cropland, grazing land and irrigation (HYDE 3.5).",
        )

        settlement, s_source, s_note = typical_settlement(way, lived), HYDE, (
            f"Typical home from way of life and the {lived:.2f} people per km2 the average person lives among.")
        if analogue and era >= ETHNOGRAPHIC_FROM and analogue[1] <= NEAR_KM and analogue[0].get("settlement"):
            settlement, s_source = analogue[0]["settlement"], EA
            s_note = analogue_note(*analogue, era)
        fields["settlement"] = field(
            {"type": settlement, "people_in_cell": round(people), "people_per_km2": round(density, 3),
             "lived_density_per_km2": lived},
            s_source, s_note,
        )

        if analogue:
            soc, km = analogue
            note = analogue_note(soc, km, era)
            if soc.get("dwelling"):
                fields["dwelling"] = field(soc["dwelling"], EA, note)
            if soc.get("diet") and way in ("farming", "mixed", "herding"):
                fields["diet"] = field(soc["diet"], EA, note)

        if hit := cell.get("biome"):
            biome, km = hit
            note = "Present-day ecoregion (Olson et al. 2001) at the nearest recorded society."
            if era < -8000:
                note += " The Late Ice Age climate here was colder and drier than today."
            fields["climate"] = field(biome, TEOW, note)

        if snap := cell.get("seshat", {}).get(str(era)):
            if snap.get("technology"):
                fields["technology"] = field(snap["technology"], SESHAT, snap["site"])
            fields["polity"] = field(snap["polity"], SESHAT, snap["site"])

        return {
            "cell": {"key": key, "south": int(key.split(",")[0]), "west": int(key.split(",")[1]),
                     "size_deg": CELL_DEG},
            "era": {"start": era, "label": era_label(era)},
            "fields": fields,
            "confidence": confidence(fields, era, analogue),
            "atlas_version": self.version,
        }


def confidence(fields: dict, era: int, analogue) -> dict:
    near = analogue is not None and analogue[1] <= NEAR_KM
    if fields["polity"]["source"] == SESHAT:
        level, note = "medium", "A Seshat site lies in this cell; other details are general."
        if era >= 0:
            level = "high"
    elif era >= ETHNOGRAPHIC_FROM and near:
        level, note = "high", "Recent era with an ethnographic record nearby."
    elif era >= 0 and analogue is not None:
        level, note = "medium", "Land use is estimated; ways of living come from a later analogue."
    else:
        level, note = "low", "Deep past or sparse records: land use is modelled and details are analogues or guesses."
    return field(level, "derived", note)


# --- model gap-fill -------------------------------------------------------------------------

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_STR_LIST = {"type": "array", "items": {"type": "string"}}
_HEX_LIST = {"type": "array", "items": {"type": "string", "description": "#rrggbb"}}


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


GAPFILL_SCHEMA = _obj({
    "dwelling": _obj({"phrase": {"type": "string"}, "material": {"type": "string"}}),
    "clothing": _obj({"garments": _STR_LIST, "materials": _STR_LIST, "palette": _HEX_LIST}),
    "hair_adornment": _obj({"styles": _STR_LIST, "ornaments": _STR_LIST, "body_paint": {"type": "string"}}),
    "tools_by_role": {"type": "array", "items": _obj({"role": {"type": "string"}, "items": _STR_LIST})},
    "diet": _STR_LIST,
    "skin_hair": _obj({"skin_palette": _HEX_LIST, "hair_palette": _HEX_LIST, "note": {"type": "string"}}),
    "climate": {"type": "string"},
    "technology": _STR_LIST,
})

GAPFILL_SYSTEM = """You are a careful anthropologist filling gaps in a small database for an \
interactive map of human population history. Given the real facts known for one 5-degree \
region and era, give conservative, general answers typical of ordinary people there and then. \
Prefer broad, well-attested descriptions over specifics; never invent named people or events. \
Clothing palette: 2 to 4 #rrggbb colours of natural materials and dyes available then. Skin \
and hair palettes: 3 to 5 #rrggbb colours spanning the broad, realistic range for the region, \
respectful and without caricature. Tools by role: 2 to 4 roles common for this way of life, \
2 to 4 objects each. Keep every string short. If a real fact is given, stay consistent with it."""


def known_facts(record: dict, include_model: bool = True) -> dict:
    """Compact facts for a prompt: place, era, and every field with a value, with its source."""
    facts = {
        "region": f"5-degree cell from {record['cell']['south']} to {record['cell']['south'] + CELL_DEG} lat, "
                  f"{record['cell']['west']} to {record['cell']['west'] + CELL_DEG} lon",
        "era": record["era"]["label"],
    }
    for name, f in record["fields"].items():
        if f["source"] != NONE and (include_model or f["source"] != MODEL):
            facts[name] = {"value": f["value"], "source": f["source"]}
    facts["confidence"] = f"{record['confidence']['value']}: {record['confidence']['note']}"
    return facts


def gapfill_prompt(record: dict) -> str:
    missing = [n for n in MODEL_FIELDS if record["fields"][n]["source"] == NONE]
    return ("Real facts for this region and era:\n" + json.dumps(known_facts(record, False), indent=2)
            + "\n\nFill every field of the schema. The ones nobody has data for here are: "
            + ", ".join(missing) + ".")


def needs_gapfill(record: dict) -> bool:
    return any(record["fields"][n]["source"] == NONE for n in MODEL_FIELDS)


def _clean(name: str, value):
    """Keep model output inside the record's shape: valid colours, short lists."""
    if name == "clothing":
        value = {**value, "palette": [c for c in value["palette"] if HEX.match(c)][:4]}
    if name == "skin_hair":
        value = {**value, "skin_palette": [c for c in value["skin_palette"] if HEX.match(c)][:5],
                 "hair_palette": [c for c in value["hair_palette"] if HEX.match(c)][:5]}
    if isinstance(value, list):
        value = value[:6]
    return value


def merge_gapfill(record: dict, fill: dict | None) -> dict:
    """Fill only the unknown model-eligible fields; data always wins over the model."""
    if not fill:
        return record
    fields = dict(record["fields"])
    for name in MODEL_FIELDS:
        if fields[name]["source"] == NONE and fill.get(name) not in (None, "", [], {}):
            fields[name] = field(_clean(name, fill[name]), MODEL)
    return {**record, "fields": fields}
