"""The anthropology atlas before HYDE (100,000-11,000 BCE): who lived where, which toolkit, the climate,
big game, how every field is sourced, and that the day API grounds modelled years honestly."""
import json
import re
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "deploy" / "budgie" / "api"
sys.path.insert(0, str(API))
import atlas  # noqa: E402
import day_api  # noqa: E402

REAL = atlas.Atlas.load(API / "anthropology.json.gz")
DEEP = REAL.data["deep"]
DEEP_SOURCES = {atlas.PREHISTORY, atlas.CULTURES, atlas.BIOME_PREY, atlas.KRAPP, atlas.BEYER, atlas.PHYLACINE}
TABLE = yaml.safe_load((ROOT / "footstep-generator" / "anthropology" / "deep_past.yaml").read_text())
ARRIVALS = yaml.safe_load((ROOT / "footstep-generator" / "prehistory" / "arrivals.yaml").read_text())


def at(lat: float, lon: float, year: int) -> dict:
    record = REAL.record(lat, lon, year)
    assert record is not None, (lat, lon, year)
    return record


# --- eras -----------------------------------------------------------------------------------

def test_deep_eras_are_the_90_modelled_1000_year_steps_just_before_hyde():
    assert atlas.DEEP_ERAS[0] == -100000 and atlas.DEEP_ERAS[-1] == -11000 and len(atlas.DEEP_ERAS) == 90
    assert atlas.DEEP_ERAS[-1] + 1000 == atlas.HYDE_FIRST == atlas.ERAS[0]
    assert atlas.FIRST_YEAR == -100000 and atlas.LAST_YEAR == 1900


@pytest.mark.parametrize("era, young, old, ka", [(-11000, 11.951, 12.95, 12), (-44000, 44.951, 45.95, 45),
                                                 (-100000, 100.951, 101.95, 101)])
def test_era_window_and_climate_step(era, young, old, ka):
    assert atlas.era_window_ka(era) == pytest.approx((young, old))
    assert atlas.ka_of_era(era) == ka
    assert young < ka < old  # the step lies inside the era


# --- rules ----------------------------------------------------------------------------------

@pytest.mark.parametrize("window, status", [((60.0, 61.0), "absent"), ((44.0, 45.0), "established"),
                                            ((44.5, 45.5), "arriving"), ((30.0, 31.0), "established")])
def test_sapiens_status_follows_the_central_arrival_date(window, status):
    assert atlas.sapiens_status({"central": 45}, window) == status


def test_neanderthals_are_present_in_europe_before_40_ka_and_gone_after():
    region = next(r for r in DEEP["regions"] if r["id"] == "europe_west")
    before = atlas.hominins_here(DEEP, region, 46, 2, atlas.era_window_ka(-60000))
    ending = atlas.hominins_here(DEEP, region, 46, 2, atlas.era_window_ka(-39000))
    after = atlas.hominins_here(DEEP, region, 46, 2, atlas.era_window_ka(-30000))
    assert [o["name"] for o in before["others"]] == ["Neanderthals"] and before["others"][0]["status"] == "present"
    assert before["sapiens"]["status"] == "absent"
    assert ending["others"][0]["status"] == "dying out" and ending["sapiens"]["status"] == "established"
    assert after["others"] == []


def test_culture_choice_prefers_most_overlap_then_the_smaller_box_and_only_the_named_maker():
    window = (30.0, 31.0)
    cultures = [
        {"id": "wide", "makers": ["H. sapiens"], "bbox": [[0, 0, 40, 40]], "from_ka_bp": 40, "to_ka_bp": 20},
        {"id": "small", "makers": ["H. sapiens"], "bbox": [[0, 0, 10, 10]], "from_ka_bp": 40, "to_ka_bp": 20},
        {"id": "short", "makers": ["H. sapiens"], "bbox": [[0, 0, 5, 5]], "from_ka_bp": 30.5, "to_ka_bp": 20},
        {"id": "theirs", "makers": ["Neanderthals"], "bbox": [[0, 0, 5, 5]], "from_ka_bp": 40, "to_ka_bp": 20},
    ]
    assert [c["id"] for c in atlas.rank_cultures(cultures, 3, 3, window, "H. sapiens")] == ["small", "wide", "short"]
    assert atlas.pick_culture(cultures, 3, 3, window, "Neanderthals")["id"] == "theirs"
    assert atlas.pick_culture(cultures, 30, 30, window, "H. sapiens")["id"] == "wide"
    assert atlas.pick_culture(cultures, 50, 50, window, "H. sapiens") is None
    assert atlas.pick_culture(cultures, 3, 3, (10.0, 11.0), "H. sapiens") is None  # ended


# --- the table ------------------------------------------------------------------------------

def test_every_technocomplex_names_its_makers_dates_source_and_how_it_was_checked():
    assert TABLE["cultures"] == DEEP["cultures"]
    ids = [c["id"] for c in TABLE["cultures"]]
    assert len(ids) == len(set(ids))
    for c in TABLE["cultures"]:
        assert c["verification"] in ("checked", "memory"), c["id"]
        assert c["source"].strip() and c["summary"].strip(), c["id"]
        assert set(c["makers"]) <= {"H. sapiens", "Neanderthals", "Denisovans"}, c["id"]
        assert c["from_ka_bp"] > c["to_ka_bp"] >= 10, c["id"]
        for west, south, east, north in c["bbox"]:
            assert -180 <= west < east <= 180 and -90 <= south < north <= 90, c["id"]
        assert c["tools"] or c["shelter"], c["id"]
        assert all(t["role"] and t["items"] for t in c["tools"]), c["id"]


def test_the_table_covers_the_technocomplexes_the_task_names():
    names = " ".join(c["name"] for c in TABLE["cultures"])
    for needed in ("Middle Stone Age", "Later Stone Age", "Mousterian", "Aurignacian", "Gravettian", "Solutrean",
                   "Magdalenian", "Clovis", "Pre-Clovis", "Sahul"):
        assert needed in names, needed
    assert any("East Asian" in c["name"] or "Japanese" in c["name"] for c in TABLE["cultures"])


def test_hominins_and_arrival_dates_are_the_prehistory_tables():
    assert [r["id"] for r in DEEP["regions"]] == [r["id"] for r in ARRIVALS["regions"]]
    assert {h["id"] for h in DEEP["other_hominins"]} == {h["id"] for h in ARRIVALS["other_hominins"]}
    for r, src in zip(DEEP["regions"], ARRIVALS["regions"]):
        assert r["arrival_ka_bp"] == src["arrival_ka_bp"] and r["bbox"] == src["bbox"]


# --- the real atlas -------------------------------------------------------------------------

def test_every_deep_cell_and_era_is_a_sourced_foraging_record_with_no_model_text():
    assert len(DEEP["cells"]) > 1000
    farming = re.compile(r"\b(farm|crop|cattle|sheep|metal|bronze|iron)", re.I)
    for key in DEEP["cells"]:
        south, west = (int(v) for v in key.split(","))
        for era in atlas.DEEP_ERAS[::7] + [atlas.DEEP_ERAS[-1]]:
            record = REAL.record(south + 2.5, west + 2.5, era)
            assert record["evidence"] == "modelled" and record["confidence"]["value"] == "low"
            assert set(record["fields"]) == set(atlas.FIELDS)
            for name, f in [*record["fields"].items(), ("confidence", record["confidence"])]:
                assert (f["value"] is None) == (f["source"] == atlas.NONE), name
                assert f["source"] != atlas.MODEL, name  # model text only ever comes from the gap-fill cache
                if f["source"] not in (atlas.NONE, "derived"):
                    assert set(f["source"].split("; ")) <= DEEP_SOURCES, (name, f["source"])
                    assert f["note"], name
            way = record["fields"]["subsistence"]["value"]["way"]
            assert way in ("foraging", "uninhabited")
            assert record["fields"]["settlement"]["value"]["type"] in atlas.SETTLEMENT
            assert record["fields"]["polity"]["source"] == atlas.NONE
            assert not farming.search(json.dumps(record["fields"]["technology"]["value"] or []))


def test_people_the_model_draws_are_foragers_wherever_the_arrival_table_says_absent():
    for key, cell in DEEP["cells"].items():
        south, west = (int(v) for v in key.split(","))
        for i, era in enumerate(atlas.DEEP_ERAS):
            if cell["people"][i] > 0:
                fields = at(south + 2.5, west + 2.5, era)["fields"]
                assert fields["subsistence"]["value"]["way"] == "foraging", (key, era)
                if fields["hominins"]["value"]["sapiens"]["status"] == "absent":
                    assert "artefact" in fields["hominins"]["note"], (key, era)
    azores = at(37.5, -27.5, -90000)  # the population model leaks a few people onto the Azores
    assert azores["fields"]["hominins"]["value"]["sapiens"]["status"] == "absent"
    assert azores["fields"]["subsistence"]["value"]["way"] == "foraging" and "artefact" in azores["fields"]["hominins"]["note"]


def test_europe_before_and_after_sapiens_arrive():
    before = at(47.5, 2.5, -60000)["fields"]
    assert before["hominins"]["value"]["sapiens"]["status"] == "absent"
    assert [o["name"] for o in before["hominins"]["value"]["others"]] == ["Neanderthals"]
    assert before["hominins"]["value"]["others"][0]["culture"] == "Mousterian (Neanderthal)"
    assert before["technology"]["source"] == atlas.NONE  # no sapiens toolkit for a Neanderthal-only era
    after = at(47.5, 2.5, -30000)["fields"]
    assert after["hominins"]["value"]["sapiens"]["status"] == "established" and after["hominins"]["value"]["others"] == []
    assert after["technology"]["value"][0].startswith("Gravettian") and after["technology"]["source"] == atlas.CULTURES
    assert "memory" in after["technology"]["note"] or "checked" in after["technology"]["note"]


@pytest.mark.parametrize("lat, lon, year, culture", [
    (-32.5, 22.5, -70000, "Middle Stone Age"), (-2.5, 37.5, -20000, "Later Stone Age"),
    (-27.5, 132.5, -40000, "Sahul"), (47.5, 7.5, -38000, "Aurignacian"), (45.5, 0.5, -22000, "Solutrean"),
    (47.5, 2.5, -16000, "Magdalenian"), (37.5, -102.5, -15000, "Pre-Clovis"), (62.5, 107.5, -25000, "Siberian"),
    (35.5, 110.5, -25000, "East Asian"),
])
def test_known_places_get_their_technocomplex(lat, lon, year, culture):
    tech = at(lat, lon, year)["fields"]["technology"]
    assert tech["source"] == atlas.CULTURES and culture in tech["value"][0], tech["value"]


def test_clovis_appears_beside_the_pre_clovis_best_fit_in_its_era():
    tech = at(37.5, -102.5, -12000)["fields"]["technology"]["value"]
    assert any("Clovis (North America)" in t for t in tech[1:]), tech


def test_fields_from_the_toolkit_carry_the_toolkit_shape_the_portrait_reads():
    f = at(-32.5, 22.5, -70000)["fields"]
    assert set(f["dwelling"]["value"]) == {"phrase", "material"}
    assert f["hair_adornment"]["value"]["ornaments"] and f["hair_adornment"]["value"]["styles"] == []
    assert all({"role", "items"} <= set(t) for t in f["tools_by_role"]["value"])
    assert f["clothing"]["source"] == atlas.NONE and f["skin_hair"]["source"] == atlas.NONE  # model gap-fill only


def test_climate_comes_from_beyer_and_krapp_and_is_colder_in_the_ice_age():
    glacial = at(47.5, 2.5, -22000)["fields"]["climate"]
    warm = at(47.5, 2.5, -11000)["fields"]["climate"]
    assert glacial["source"] == f"{atlas.KRAPP}; {atlas.BEYER}"
    def temp(f: dict) -> float:
        m = re.search(r"annual mean (-?\d+) °C", f["value"])
        assert m, f["value"]
        return float(m.group(1))

    assert temp(glacial) < temp(warm)
    ice = at(62.5, 17.5, -20000)["fields"]  # Scandinavia at the glacial maximum
    assert ice["climate"]["value"].startswith("Mostly under an ice sheet")
    assert not (ice["prey"]["value"] or {}).get("large_game")  # nothing lives under an ice sheet


def test_prey_lists_big_game_from_the_fauna_ranges_and_the_biome():
    sib = at(62.5, 107.5, -25000)["fields"]["prey"]
    assert sib["source"] == f"{atlas.PHYLACINE}; {atlas.BIOME_PREY}"
    names = {g["name"] for g in sib["value"]["large_game"]}
    assert "Woolly mammoth" in names and all(g["kg"] > 0 for g in sib["value"]["large_game"])
    assert sib["value"]["biome_game"] and "Modelled" in sib["note"]
    # Mammoths are gone from the Siberian mainland by 8,000 BCE (HYDE era, so no deep record), but not before 11,000 BCE
    assert "Woolly mammoth" in {g["name"] for g in at(62.5, 107.5, -11000)["fields"]["prey"]["value"]["large_game"]}


def test_hyde_era_records_are_unchanged_apart_from_the_evidence_label():
    record = at(32.5, 44.4, -2500)
    assert record["evidence"] == "measured" and record["atlas_version"] == REAL.version
    assert record["fields"]["subsistence"]["source"] == atlas.HYDE
    assert record["fields"]["hominins"]["source"] == atlas.NONE and record["fields"]["prey"]["source"] == atlas.NONE


def test_an_atlas_without_the_deep_section_has_no_deep_records():
    older = atlas.Atlas({k: v for k, v in REAL.data.items() if k != "deep"})
    assert older.record(47.5, 2.5, -30000) is None and older.record(47.5, 2.5, -9000) is not None


# --- model gap-fill and the day API ---------------------------------------------------------

def test_gapfill_prompt_for_a_modelled_era_forbids_farming_and_marks_the_facts_modelled():
    record = at(47.5, 2.5, -30000)
    text = atlas.gapfill_prompt(record)
    assert "hunter-gatherer" in text and "MODELLED" in text
    assert "clothing" in text and "skin_hair" in text and "diet" in text
    assert "hunter-gatherer" not in atlas.gapfill_prompt(at(32.5, 44.4, -2500))


def test_deep_gapfill_cache_key_is_separate_from_hyde_and_versioned():
    assert day_api.gapfill_key(at(47.5, 2.5, -30000)) == f"v{REAL.version}.d{DEEP['version']}:45,0:-30000"
    assert day_api.gapfill_key(at(32.5, 44.4, -2500)) == f"v{REAL.version}:30,40:-3000"


@pytest.fixture
def server(tmp_path, monkeypatch):
    monkeypatch.setattr(day_api, "DB_PATH", str(tmp_path / "days.db"))
    monkeypatch.setattr(day_api, "_ip_hits", {})
    monkeypatch.setenv(day_api.KEY_ENV, "test")
    calls = []

    def fake_model(system, user, _schema, name):
        calls.append({"system": system, "user": user, "name": name})
        if name == "anthropology_gapfill":
            return {"dwelling": {"phrase": "x", "material": "y"}, "clothing": {"garments": ["fur cloak"], "materials": ["fur"], "palette": ["#8b5a2b"]},
                    "hair_adornment": {"styles": ["loose"], "ornaments": [], "body_paint": ""}, "tools_by_role": [],
                    "diet": ["reindeer"], "skin_hair": {"skin_palette": ["#c68642"], "hair_palette": ["#1b1b1b"], "note": ""},
                    "climate": "cold", "technology": []}, "test/haiku"
        return {"summary": "Imagined: s", "schedule": [], "grounded_in": [], "uncertainty": "u"}, "test/haiku"

    monkeypatch.setattr(day_api, "call_model", fake_model)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), day_api.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}", calls
    httpd.shutdown()


def post(base: str, f: dict) -> dict:
    req = urllib.request.Request(f"{base}/api/day", data=json.dumps(f).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)


def request_for(year: int, **over) -> dict:
    return {"lat": 47.5, "lon": 2.5, "year": year, "cellPeople": 900, "neighbourhoodPeople": 5000, "densityClass": "sparse",
            "person": {"age": 30, "female": True, "role": "hunter", "groupKind": 1, "groupPeople": 40}, **over}


def test_anthropology_endpoint_serves_modelled_eras_and_gapfills_them_once(server):
    base, calls = server
    with urllib.request.urlopen(f"{base}/api/anthropology?lat=47.5&lon=2.5&year=-30000") as res:
        first = json.load(res)
    assert first["gapfill"] == "generated" and first["evidence"] == "modelled"
    assert first["fields"]["clothing"]["source"] == atlas.MODEL
    assert first["fields"]["technology"]["source"] == atlas.CULTURES  # data wins over the model
    assert atlas.PREHISTORY in first["sources"] and atlas.CULTURES in first["sources"]
    with urllib.request.urlopen(f"{base}/api/anthropology?lat=46&lon=3&year=-29500") as res:
        again = json.load(res)
    assert again["gapfill"] == "cached" and len(calls) == 1
    assert "hunter-gatherer" in calls[0]["user"]


def test_anthropology_endpoint_still_refuses_dates_before_100000_bce(server):
    base, _ = server
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(f"{base}/api/anthropology?lat=47.5&lon=2.5&year=-100001")
    assert e.value.code == 400


def test_day_before_hyde_is_grounded_in_the_modelled_record_and_labelled_speculative(server):
    base, calls = server
    body = post(base, request_for(-30000))
    assert body["summary"].startswith("Imagined:")
    day = next(c for c in calls if c["name"] == "day_in_the_life")
    assert "Palaeolithic" in day["system"] and 'open with "Imagined:"' in day["system"]
    facts = json.loads(day["user"].split("\n\n", 1)[1])
    assert "MODELLED" in facts["what_we_know_about_this_region_and_era"]["evidence"]
    assert facts["head_counts"].startswith("modelled, not measured")
    assert facts["group"].startswith("a foraging band")  # never "a village" before farming
    assert "people_in_this_~55km_block" in facts and "people_in_this_~10km_cell" not in facts
    assert facts["what_we_know_about_this_region_and_era"]["technology"]["source"] == atlas.CULTURES


def test_day_in_hyde_years_keeps_its_prompt_and_cache_key(server):
    base, calls = server
    post(base, request_for(-2500, lat=32.5, lon=44.4))
    day = next(c for c in calls if c["name"] == "day_in_the_life")
    assert "Palaeolithic" not in day["system"]
    facts = json.loads(day["user"].split("\n\n", 1)[1])
    assert "people_in_this_~10km_cell" in facts and "head_counts" not in facts
    assert day_api.cache_key(request_for(-30000)) != day_api.cache_key(request_for(-31000))


def test_day_cache_keys_for_deep_years_carry_their_own_prompt_version(monkeypatch):
    before = day_api.cache_key(request_for(-30000))
    monkeypatch.setattr(day_api, "DEEP_PROMPT_VERSION", day_api.DEEP_PROMPT_VERSION + 1)
    assert day_api.cache_key(request_for(-30000)) != before
    hyde = day_api.cache_key(request_for(-2500))
    monkeypatch.setattr(day_api, "DEEP_PROMPT_VERSION", day_api.DEEP_PROMPT_VERSION + 1)
    assert day_api.cache_key(request_for(-2500)) == hyde  # HYDE-era days stay cached


# --- builder (deep.py) ----------------------------------------------------------------------

sys.path.insert(0, str(ROOT / "footstep-generator" / "anthropology"))
sys.path.insert(0, str(ROOT / "footstep-generator"))
import gzip  # noqa: E402

import numpy as np  # noqa: E402

import deep  # noqa: E402


def test_blocks_groups_half_degree_pixels_into_5_degree_cells_north_up():
    grid = np.zeros((360, 720), dtype=int)
    grid[0:10, 0:10] = 1          # the north-west cell: 85N, 180W
    grid[350:360, 710:720] = 2    # the south-east cell: -90, 175E
    cells = deep.blocks(grid)
    assert cells.shape == (36, 72, 100)
    assert cells[0, 0].sum() == 100 and cells[35, 71].sum() == 200 and cells.sum() == 300
    assert deep.cell_key(0, 0) == "85,-180" and deep.cell_key(35, 71) == "-90,175"


def test_pixel_areas_sum_to_the_sphere():
    assert deep.pixel_area_km2().sum() == pytest.approx(4 * np.pi * 6371.0088**2, rel=1e-3)


def test_mode_is_the_most_common_valid_value():
    values = np.array([[3, 3, 5, 5, 5, 0]])
    assert deep.mode(values, np.array([[True, True, True, True, True, False]]))[0] == 5
    assert deep.mode(values, np.zeros_like(values, dtype=bool))[0] == 0


def test_fauna_cells_need_three_one_degree_cells_and_use_the_third_youngest_step(tmp_path):
    from fauna import phylacine as ph

    inside = [(46.5, 2.5, 10), (47.5, 2.5, 8), (48.5, 2.5, 5), (46.5, 3.5, 12)]  # one 5 degree cell, 45N 0E
    elsewhere = [(60.5, 100.5, 4), (61.5, 100.5, 4)]  # only two one-degree cells: never counts
    cells = {str(ph.cell_id(lat, lon)): [7, first] for lat, lon, first in [*inside, *elsewhere]}
    species = [{"id": i, "name": f"s{i}", "common": f"S{i}", "kg": 100 + i, "role": "herd", "extinct": i == 7}
               for i in range(8)]
    path = tmp_path / "fauna.json.gz"
    path.write_bytes(gzip.compress(json.dumps({"species": species, "cells": cells, "ice": {}}).encode()))
    table, by_cell = deep.fauna_by_cell(path)
    assert table == [["S7", "s7", 107, "herd", 1]]
    # four one-degree cells hold it; present once three do, i.e. from the third youngest first step (10 ka)
    assert by_cell == {"45,0": [[0, 10, 4]]}


def test_region_index_takes_the_first_box_holding_the_point_else_the_nearest():
    regions = [{"bbox": [0, 0, 10, 10]}, {"bbox": [0, 0, 50, 50]}, {"bbox": [60, 0, 70, 10]}]
    of = deep.region_index(regions)
    assert of(5, 5) == 0 and of(30, 30) == 1 and of(5, 66) == 2 and of(5, 58) == 2


def test_committed_deep_section_has_one_row_per_era_in_every_cell():
    n = len(atlas.DEEP_ERAS)
    for cell in DEEP["cells"].values():
        assert all(len(cell[k]) == n for k in ("temp", "rain", "biome", "ice", "people"))
        assert 0 <= cell["region"] < len(DEEP["regions"]) and cell["land_km2"] > 0
        assert all(0 <= i <= 100 for i in cell["ice"])
        for sid, last_ka, count in cell.get("fauna", []):
            assert 0 <= sid < len(DEEP["species"]) and 0 <= last_ka <= 102 and 3 <= count <= 25
