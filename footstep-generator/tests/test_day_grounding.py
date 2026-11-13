"""The day API prompt builder: nearest recorded societies and measured hours in the facts, the token
budget, no work assigned by sex, and the deploy image shipping every file the prompt needs."""
import json
import random
import re
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "deploy" / "budgie" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT / "footstep-generator" / "anthropology"))
import analogs  # noqa: E402
import atlas  # noqa: E402
import day_api  # noqa: E402
import grounding  # noqa: E402
import time_use as time_use_build  # noqa: E402

SEX_WORDS = re.compile(r"\b(men|women|man|woman|male|female|sex|sexes|girls|boys)\b", re.I)


def request(lat: float, lon: float, year: int, **person) -> dict:
    return {"lat": lat, "lon": lon, "year": year, "cellPeople": 900, "neighbourhoodPeople": 5000,
            "densityClass": "sparse",
            "person": {"age": 30, "female": True, "role": "gatherer", "groupKind": 0, "groupPeople": 40, **person}}


def facts_of(f: dict) -> dict:
    record = day_api.ATLAS.record(f["lat"], f["lon"], f["year"])
    return json.loads(day_api.prompt(f, record).split("\n\n", 1)[1])


KALAHARI = grounding.Setting("foraging", -17.5, 22.5, -6000, "Tropical xerophytic shrubland", 22.0, 250.0)


# --- decade labels ---------------------------------------------------------------------------

@pytest.mark.parametrize("year, label", [(1938, "1930s"), (1950, "1950s"), (1800, "1800s"), (-2000, "2000 BCE"),
                                         (None, "date unknown")])
def test_decade_label(year, label):
    assert grounding.decade_label(year) == label


# --- nearest recorded societies --------------------------------------------------------------

def test_analog_facts_cite_each_society_with_its_record_decade_and_carry_the_caveat():
    out = grounding.analog_facts(day_api.ETHNOGRAPHY, KALAHARI)
    assert out["caveat"] == analogs.CAVEAT
    assert len(out["societies"]) == grounding.ANALOGS_SHOWN
    scores = [s["similarity_0_to_1"] for s in out["societies"]]
    assert scores == sorted(scores, reverse=True)
    for s in out["societies"]:
        assert re.fullmatch(r"like the .+ \(recorded \d{4}s\)", s["cite_as"])
        assert s["years_after_this_day"] > 1000  # recorded millennia after this day: the prompt says so
        assert 0 < len(s["recorded_traits"]) <= grounding.MAX_TRAITS


def test_analog_facts_are_none_when_no_society_has_the_way_of_life():
    assert grounding.analog_facts({"societies": [], "variables": {}}, KALAHARI) is None


def test_historical_accounts_are_marked_and_not_called_ethnographic_present():
    city = grounding.Setting("urban", 31.5, 46.5, -2500, "Desert", 24.0, 170.0)
    out = grounding.analog_facts(day_api.ETHNOGRAPHY, city)
    assert any(s.get("kind_of_record") == "historical account" for s in out["societies"])


def test_no_sex_difference_reaches_the_analog_facts():
    for way in ("foraging", "farming", "herding", "fishing"):
        out = grounding.analog_facts(day_api.ETHNOGRAPHY, grounding.Setting(way, 5, 20, 1500))
        text = json.dumps({k: v for k, v in out.items() if k != "caveat"})
        assert not SEX_WORDS.search(text), (way, SEX_WORDS.search(text))


# --- measured hours --------------------------------------------------------------------------

def test_time_use_for_foragers_gives_ranged_hours_and_sources():
    out = grounding.time_use_facts(day_api.TIME_USE, "foraging")
    assert set(out["hours_per_day_adult"]) == {"food_getting", "domestic_chores", "social_leisure"}
    assert out["hours_per_day_adult"]["food_getting"].startswith("about 4 (studies range 2.2-6")
    assert any("Lee 1979" in c for c in out["sources"])
    assert "not Palaeolithic people" in out["measured_among"]


def test_mixed_farming_uses_the_farming_row_with_its_caution():
    farming = grounding.time_use_facts(day_api.TIME_USE, "farming")
    assert grounding.time_use_facts(day_api.TIME_USE, "mixed") == farming
    assert "not long-established farmers" in farming["measured_among"]
    assert "Do not generalise to ancient farmers" in farming["caution"]


@pytest.mark.parametrize("way", ["herding", "fishing", "urban", "uninhabited"])
def test_no_hours_for_a_way_of_life_no_study_measured(way):
    assert grounding.time_use_facts(day_api.TIME_USE, way) is None


def test_time_use_facts_never_mention_sex():
    for way in ("foraging", "farming"):
        assert not SEX_WORDS.search(json.dumps(grounding.time_use_facts(day_api.TIME_USE, way)))


def test_time_use_export_keeps_only_read_figures_and_drops_sex_notes():
    table = {"version": 1, "units": "hours_per_day_adult", "ways_of_life": {
        "foraging": {"summary": "s", "measured_among": "m", "sex_note": "women do more", "figures": {
            "food_getting": {"value": 4.0, "range": [2, 6], "cite": ["Lee"], "check": "secondary"},
            "sleep": {"value": 7.0, "range": [6, 8], "cite": [], "check": "recalled"},
            "travel": {"value": None, "range": None, "cite": [], "check": "none"}}},
        "herding": {"summary": "s", "measured_among": "m", "figures": {}}}}
    out = time_use_build.export(table)
    assert list(out["ways_of_life"]) == ["foraging"]  # herding has no figure: left out, not filled
    assert list(out["ways_of_life"]["foraging"]["figures"]) == ["food_getting"]
    assert "women" not in json.dumps(out)


def test_committed_time_use_json_matches_the_yaml():
    """Edit time_use.yaml, then rerun footstep-generator/anthropology/time_use.py."""
    table = yaml.safe_load(time_use_build.SOURCE.read_text())
    assert json.loads((API / "time_use.json").read_text()) == time_use_build.export(table)


# --- the prompt ------------------------------------------------------------------------------

def test_prompt_for_foragers_carries_analogs_and_hours_beside_the_atlas_record():
    facts = facts_of(request(-17.5, 22.5, 1900))
    assert "what_we_know_about_this_region_and_era" in facts
    assert facts["nearest_recorded_societies"]["societies"][0]["cite_as"].startswith("like the ")
    assert "food_getting" in facts["typical_adult_time_use"]["hours_per_day_adult"]


def test_prompt_for_herders_has_analogs_but_no_hours():
    f = request(-12.5, 127.5, 1900)  # HYDE grazing land: herding
    record = day_api.ATLAS.record(f["lat"], f["lon"], f["year"])
    assert record["fields"]["subsistence"]["value"]["way"] == "herding"
    facts = facts_of(f)
    assert facts["nearest_recorded_societies"]["societies"]
    assert "typical_adult_time_use" not in facts


def test_prompt_without_an_atlas_record_has_no_grounding():
    facts = json.loads(day_api.prompt(request(0, -160, 1900), None).split("\n\n", 1)[1])
    assert not {"nearest_recorded_societies", "typical_adult_time_use"} & set(facts)


def test_modelled_years_rank_analogs_on_the_ice_age_climate():
    record = day_api.ATLAS.record(47.5, 2.5, -30000)
    setting = day_api.setting_of(record)
    assert setting.way == "foraging" and setting.biome and setting.temp_c is not None and setting.precip_mm
    assert (setting.lat, setting.lon) == analogs.cell_centre(record["cell"]["key"])
    result = analogs.nearest_analogs(day_api.ETHNOGRAPHY, setting.lat, setting.lon, setting.year, setting.way,
                                     biome=setting.biome, temp_c=setting.temp_c, precip_mm=setting.precip_mm)
    assert {"temperature", "precipitation", "biome"} <= set(result.basis)


def test_hyde_years_know_only_the_present_day_biome():
    record = day_api.ATLAS.record(-17.5, 22.5, 1900)
    biome, temp, rain = day_api.ATLAS.environment(record)
    assert biome and temp is None and rain is None


def test_system_prompt_asks_for_the_citation_and_forbids_work_by_sex():
    system = day_api.SYSTEM + day_api.GROUNDING_SYSTEM
    assert "cite_as" in system and "grounded_in" in system and "recorded 1910s" in system
    assert "later record" in system
    assert "Never assign tasks by sex" in system


def test_generate_sends_the_grounding_system_and_facts_to_the_model(monkeypatch):
    sent = {}
    monkeypatch.setattr(day_api, "call_model", lambda system, user, schema, name: sent.update(
        system=system, user=user) or ({}, "m"))
    f = request(-17.5, 22.5, 1900)
    day_api.generate(f, day_api.ATLAS.record(f["lat"], f["lon"], f["year"]))
    assert day_api.GROUNDING_SYSTEM in sent["system"]
    assert "nearest_recorded_societies" in sent["user"]


def test_prompt_version_was_bumped_so_old_days_are_not_served():
    assert day_api.PROMPT_VERSION >= 3


# --- token budget ----------------------------------------------------------------------------

def sample_requests(n: int = 300):
    rng = random.Random(7)
    keys = [*day_api.ATLAS.cells, *day_api.ATLAS.deep["cells"]]
    out = []
    while len(out) < n:
        lat, lon = analogs.cell_centre(rng.choice(keys))
        year = rng.choice([*atlas.DEEP_ERAS, *atlas.ERAS])
        if day_api.ATLAS.record(lat, lon, year):
            out.append(request(lat, lon, year))
    return out


def test_every_sampled_prompt_fits_the_token_budget():
    for f in sample_requests():
        record = day_api.ATLAS.record(f["lat"], f["lon"], f["year"])
        text = day_api.prompt(f, record)
        facts = json.loads(text.split("\n\n", 1)[1])
        kept = len(facts.get("nearest_recorded_societies", {}).get("societies", []))
        assert len(text) <= day_api.PROMPT_TOKEN_BUDGET * day_api.CHARS_PER_TOKEN or kept == 1, (f, len(text))


def test_over_budget_prompts_drop_the_lowest_ranked_societies_but_keep_one(monkeypatch):
    f = request(-17.5, 22.5, 1900)
    record = day_api.ATLAS.record(f["lat"], f["lon"], f["year"])
    full = json.loads(day_api.prompt(f, record).split("\n\n", 1)[1])["nearest_recorded_societies"]["societies"]
    assert len(full) == 3
    monkeypatch.setattr(day_api, "PROMPT_TOKEN_BUDGET", 1)
    kept = json.loads(day_api.prompt(f, record).split("\n\n", 1)[1])["nearest_recorded_societies"]["societies"]
    assert kept == full[:1]


# --- the deploy image --------------------------------------------------------------------------

def test_dockerfile_ships_every_module_and_data_file_the_api_reads():
    copied = {name for line in (API / "Dockerfile").read_text().splitlines() if line.startswith("COPY")
              for name in line.split()[1:-1]}
    assert all((API / name).exists() for name in copied), copied
    imported = {f"{m}.py" for m in re.findall(r"^import (\w+)$", (API / "day_api.py").read_text(), re.M)
                if (API / f"{m}.py").exists()}
    imported |= {f"{m}.py" for m in re.findall(r"^import (\w+)$", (API / "grounding.py").read_text(), re.M)
                 if (API / f"{m}.py").exists()}
    assert imported <= copied, imported - copied
    assert {"anthropology.json.gz", "ethnography.json.gz", "time_use.json"} <= copied
