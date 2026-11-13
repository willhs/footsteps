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
HYDE_FIRST = ERAS[0]
# The modelled pre-HYDE years: one era per 1,000-year step of the population images, 100,000-11,000 BCE.
DEEP_ERAS = list(range(-100000, HYDE_FIRST, 1000))
FIRST_YEAR, LAST_YEAR = DEEP_ERAS[0], ERAS[-1]
BP_ZERO = 1950

HYDE = "HYDE 3.5"
EA = "D-PLACE EA"
TEOW = "D-PLACE TEOW"
SESHAT = "Seshat Equinox 2020"
# Deep-past sources (built by footstep-generator/anthropology/deep.py; see the README).
PREHISTORY = "Footsteps prehistory model"      # arrivals.yaml + the modelled population (research 0002)
CULTURES = "Footsteps technocomplex table"     # footstep-generator/anthropology/deep_past.yaml
BIOME_PREY = "Footsteps biome-prey table"
KRAPP = "Krapp 2021"
BEYER = "Beyer 2020"
PHYLACINE = "PHYLACINE 1.2"
MODEL = "model"
NONE = "none"

SUBSISTENCE = ("foraging", "fishing", "herding", "farming", "mixed", "urban", "uninhabited")
SETTLEMENT = ("mobile camp", "seasonal camp", "hamlet", "village", "town", "city", "uninhabited")
FIELDS = (
    "subsistence", "settlement", "dwelling", "clothing", "hair_adornment", "tools_by_role",
    "diet", "skin_hair", "climate", "technology", "polity",
    # Deep past only (HYDE-era records leave them unknown): who else lived there, big game, art.
    "hominins", "prey", "art",
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
    """1000-year buckets before 1 CE, 100-year after, floored; e.g. -2500 -> -3000, 1850 -> 1800.
    Before 10,000 BCE the buckets are the modelled population's, back to 100,000 BCE."""
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


# --- rules for the modelled deep past: one cell x era (100,000-11,000 BCE) -------------------
# Data shape. The atlas's `deep` section holds, per 5-degree cell, one value per deep era for
# climate (Beyer temperature and rain, Krapp biome, ice and land share) and the modelled head
# count; per cell the large mammals whose ranges hold it; and, for all cells, the arrival table,
# hominins and technocomplexes (deep_past.yaml). A record is those facts at one era. Everyone
# is a forager; the only question per place and time is *which* hominins and *which* toolkit.

def era_window_ka(era: int) -> tuple[float, float]:
    """(young, old) edges of an era in thousands of years before 1950; the era holds years era..era+999."""
    return (BP_ZERO - era - 999) / 1000, (BP_ZERO - era) / 1000


def ka_of_era(era: int) -> int:
    """The 1 ka climate step inside an era (the step nearest its middle)."""
    return int((BP_ZERO - era - 500) / 1000 + 0.5)


def in_box(box: list[float], lat: float, lon: float) -> bool:
    west, south, east, north = box
    return west <= lon <= east and south <= lat <= north


def box_area(box: list[float]) -> float:
    return (box[2] - box[0]) * (box[3] - box[1])


def sapiens_status(arrival: dict, window: tuple[float, float]) -> str:
    """'absent' before the region's central arrival date, 'arriving' while the era spans it,
    else 'established'. Ages are ka BP, so older means larger."""
    young, old = window
    if arrival["central"] < young:
        return "absent"
    return "established" if old <= arrival["central"] else "arriving"


def hominins_here(deep: dict, region: dict, lat: float, lon: float, window: tuple[float, float]) -> dict:
    young, old = window
    sapiens = {
        "status": sapiens_status(region["arrival_ka_bp"], window),
        "region": region["name"],
        "arrival_ka_bp": region["arrival_ka_bp"],
    }
    others = []
    for h in deep["other_hominins"]:
        # Present while the age is older than their last date: all of the era if it ends before that.
        if in_box(h["bbox"], lat, lon) and old >= h["last_ka_bp"]["central"]:
            others.append({
                "name": h["short"],
                "species": h["name"],
                "status": "present" if young >= h["last_ka_bp"]["central"] else "dying out",
                "last_ka_bp": h["last_ka_bp"],
                "verification": h["verification"],
            })
    return {"sapiens": sapiens, "others": others}


def rank_cultures(cultures: list[dict], lat: float, lon: float, window: tuple[float, float],
                  maker: str) -> list[dict]:
    """Technocomplexes made by `maker` that hold this place and overlap this era, best first: most
    overlap, then the smaller region box, then the earlier entry."""
    young, old = window
    found = []
    for i, c in enumerate(cultures):
        if maker not in c["makers"]:
            continue
        boxes = [b for b in c["bbox"] if in_box(b, lat, lon)]
        overlap = min(old, c["from_ka_bp"]) - max(young, c["to_ka_bp"])
        if boxes and overlap > 0:
            found.append(((-overlap, min(box_area(b) for b in boxes), i), c))
    return [c for _, c in sorted(found, key=lambda x: x[0])]


def pick_culture(cultures: list[dict], lat: float, lon: float, window: tuple[float, float],
                 maker: str) -> dict | None:
    ranked = rank_cultures(cultures, lat, lon, window, maker)
    return ranked[0] if ranked else None


def culture_note(c: dict) -> str:
    check = ("Key claim checked against its source." if c["verification"] == "checked"
             else "Citations written from memory and not yet checked against the papers.")
    makers = " and ".join(c["makers"])
    return (f"{c['name']}, made by {makers}, c. {c['from_ka_bp']:g}-{c['to_ka_bp']:g} thousand years ago. "
            f"A regional pattern, not a record of this place. {check} Sources: {c['source']}")


def climate_text(biomes: dict, biome: int, temp: float | None, rain: float | None, ice: int) -> str | None:
    name = biomes.get(str(biome)) if biome else None
    if ice >= 50:
        return "Mostly under an ice sheet" + (f" ({name} where it was clear)" if name else "")
    parts = [name] if name else []
    if temp is not None:
        parts.append(f"annual mean {temp:.0f} °C" + (f", about {rain:.0f} mm of rain a year" if rain is not None else ""))
    return ", ".join(parts) or None


def prey_value(deep: dict, cell: dict, k: int, biome: int) -> dict | None:
    """Large mammals whose modelled natural range holds the cell at step k (ka BP), most widespread
    first; plus the biome's typical game. None if the data holds neither."""
    species = deep["species"]
    present = [(sid, n) for sid, last_ka, n in cell.get("fauna", ()) if k >= last_ka]
    present.sort(key=lambda p: (-p[1], -species[p[0]][2]))

    def entry(sid: int) -> dict:
        common, latin, kg, _, extinct = species[sid]
        return {"name": common, "latin": latin, "kg": kg, "extinct": bool(extinct)}

    game = [entry(s) for s, _ in present if species[s][3] in ("prey", "herd")][:8]
    predators = [entry(s) for s, _ in present if species[s][3] == "predator"][:4]
    group = next((g for g in deep["biome_prey"]["groups"] if biome in g["biomes"]), None)
    if not game and not predators and not group:
        return None
    return {"large_game": game, "large_predators": predators,
            "biome_game": group["game"] if group else [], "biome_group": group["name"] if group else None}


class Atlas:
    def __init__(self, data: dict):
        self.data = data
        self.version = data["version"]
        self.sources = data["sources"]
        self.cells = data["cells"]
        self.societies = data["societies"]
        self.deep = data.get("deep")  # absent in an atlas built before the deep past was added

    def record_deep(self, key: str, era: int) -> dict | None:
        """Record for a modelled era: foragers only, with the hominins, toolkit, climate and big
        game the deep-past tables give for this 5-degree cell. None if the cell has no land then."""
        deep = self.deep
        if deep is None:
            return None
        cell = deep["cells"].get(key)
        if cell is None:
            return None
        i = DEEP_ERAS.index(era)
        south, west = (int(v) for v in key.split(","))
        lat, lon = south + CELL_DEG / 2, west + CELL_DEG / 2
        window, k = era_window_ka(era), ka_of_era(era)
        fields = {name: unknown() for name in FIELDS}

        region = deep["regions"][cell["region"]]
        hom = hominins_here(deep, region, lat, lon, window)
        sapiens_here = hom["sapiens"]["status"] != "absent"
        s_note = (f"Arrival date for {region['name']}: {region['arrival_ka_bp']['central']:g} thousand years ago "
                  f"(credible range {region['arrival_ka_bp']['late']:g}-{region['arrival_ka_bp']['early']:g}). "
                  f"{'Checked against the paper.' if region['verification'] == 'checked' else 'Citation written from memory.'} "
                  f"{region['source']}")
        people = cell["people"][i]
        if people > 0 and not sapiens_here:
            s_note += (" The population model still draws people here (its regions blur at their edges "
                       "and in places the catch-all region leaks onto islands), so read this cell as a model artefact.")
        fields["hominins"] = field(hom, PREHISTORY, s_note)

        land = cell["land_km2"]
        way = "foraging" if sapiens_here or people > 0 else "uninhabited"
        fields["subsistence"] = field(
            {"way": way, "cropland_share": 0, "grazing_share": 0, "irrigated_share": 0}, PREHISTORY,
            "Before farming (c. 10,000 BCE in the Near East) everyone lived by hunting and gathering. "
            "This is the population model's assumption, not an observation at this place.")
        density = people / land if land else 0.0
        fields["settlement"] = field(
            {"type": typical_settlement(way, density), "people_in_cell": round(people),
             "people_per_km2": round(density, 4), "lived_density_per_km2": None},
            PREHISTORY,
            f"Modelled head count for this cell at the start of the era (research 0002); camps are assumed, "
            f"not found. Typical home from way of life and {density:.3f} people per km2.")

        temp, rain, biome, ice = cell["temp"][i], cell["rain"][i], cell["biome"][i], cell["ice"][i]
        if text := climate_text(deep["biomes"], biome, temp, rain, ice):
            fields["climate"] = field(
                text, f"{KRAPP}; {BEYER}",
                f"Climate model for the {k:,} thousand years ago step (Beyer, Krapp & Manica 2020), averaged "
                f"over the cell's land; biome from Krapp et al. 2021.")

        ranked = rank_cultures(deep["cultures"], lat, lon, window, "H. sapiens") if sapiens_here else []
        if ranked:
            culture = ranked[0]
            note = culture_note(culture)
            # The best fit speaks for the person; others that overlap the era are named, not used.
            tech = [f"{culture['name']}: {culture['summary']}"]
            tech += [f"Also in this period: {c['name']}" for c in ranked[1:3]]
            fields["technology"] = field(tech, CULTURES, note)
            if culture["shelter"]:
                fields["dwelling"] = field(culture["shelter"], CULTURES, note)
            if culture["tools"]:
                fields["tools_by_role"] = field(culture["tools"], CULTURES, note)
            if culture["ornaments"]:
                fields["hair_adornment"] = field(
                    {"styles": [], "ornaments": culture["ornaments"], "body_paint": None}, CULTURES, note)
            if culture["art"]:
                fields["art"] = field(culture["art"], CULTURES, note)
        # Another hominin's toolkit is named in the hominins field, never as this person's.
        for other in hom["others"]:
            other_culture = pick_culture(deep["cultures"], lat, lon, window, other["name"])
            if other_culture:
                other["culture"] = other_culture["name"]

        if prey := prey_value(deep, {} if ice >= 50 else cell, k, biome):  # nothing lives under an ice sheet
            sources = [BIOME_PREY] if prey["biome_game"] else []
            if prey["large_game"] or prey["large_predators"]:
                sources.insert(0, PHYLACINE)
            fields["prey"] = field(
                prey, "; ".join(sources),
                "Modelled, not found: animals whose natural range (today's climate, not the Ice Age's) holds "
                "this cell and which were not yet extinct there by a mostly regional date (PHYLACINE 1.2, "
                "Faurby et al. 2018). The biome's typical game is a general table (Kelly 2013, Binford 2001).")

        return {
            "cell": {"key": key, "south": south, "west": west, "size_deg": CELL_DEG},
            "era": {"start": era, "label": era_label(era)},
            "fields": fields,
            "confidence": field(
                "low", "derived",
                "Modelled people in a modelled climate, with a regional toolkit table: nobody has seen "
                "these people. Treat everything here as an informed sketch."),
            "evidence": "modelled",
            "atlas_version": f"{self.version}.d{deep['version']}",
        }

    def environment(self, record: dict) -> tuple[str | None, float | None, float | None]:
        """(biome name, annual mean C, annual rain mm) of a record, None where unknown. Modelled years
        have Krapp's biome and Beyer's climate for the era; HYDE years only the present-day TEOW biome."""
        if record.get("evidence") == "modelled":
            cell, i = self.deep["cells"][record["cell"]["key"]], DEEP_ERAS.index(record["era"]["start"])
            return self.deep["biomes"].get(str(cell["biome"][i])), cell["temp"][i], cell["rain"][i]
        climate = record["fields"]["climate"]
        return (climate["value"] if climate["source"] == TEOW else None), None, None

    @classmethod
    def load(cls, path: str | Path) -> "Atlas":
        with gzip.open(path, "rt") as f:
            return cls(json.load(f))

    def record(self, lat: float, lon: float, year: int) -> dict | None:
        """The real-data record, or None when the cell has no land in HYDE."""
        key, era = cell_of(lat, lon), era_of(year)
        if era < HYDE_FIRST:
            return self.record_deep(key, era)
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
            "evidence": "measured",
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
    if record.get("evidence") == "modelled":
        facts["evidence"] = ("MODELLED: the people, climate and toolkit here are a model and a regional table; "
                             "nothing was found at this place")
    for name, f in record["fields"].items():
        if f["source"] != NONE and (include_model or f["source"] != MODEL):
            facts[name] = {"value": f["value"], "source": f["source"]}
    facts["confidence"] = f"{record['confidence']['value']}: {record['confidence']['note']}"
    return facts


DEEP_GAPFILL_NOTE = """This is the Palaeolithic or Ice Age, before farming. Everyone is a hunter-gatherer: no crops, \
herds, pottery, weaving looms or metal unless the facts give them. Clothing is of hide, fur, plant fibre and \
sinew, shaped to the climate given. The facts are a model and a regional table, so keep every answer general."""


def gapfill_prompt(record: dict) -> str:
    missing = [n for n in MODEL_FIELDS if record["fields"][n]["source"] == NONE]
    note = f"\n\n{DEEP_GAPFILL_NOTE}" if record.get("evidence") == "modelled" else ""
    return ("Real facts for this region and era:\n" + json.dumps(known_facts(record, False), indent=2)
            + note + "\n\nFill every field of the schema. The ones nobody has data for here are: "
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
