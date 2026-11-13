"""Anthropology atlas: record schema and source tagging, builder aggregation, and the
GET /api/anthropology endpoint driven over HTTP with a stubbed model."""
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "deploy" / "budgie" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT / "footstep-generator" / "anthropology"))
import atlas  # noqa: E402
import build  # noqa: E402
import day_api  # noqa: E402

REAL = atlas.Atlas.load(API / "anthropology.json.gz")
DATASETS = {atlas.HYDE, atlas.EA, atlas.TEOW, atlas.SESHAT, atlas.PREHISTORY, atlas.CULTURES, atlas.BIOME_PREY,
            atlas.KRAPP, atlas.BEYER, atlas.PHYLACINE}

FILL = {
    "dwelling": {"phrase": "hide tent", "material": "hides"},
    "clothing": {"garments": ["cloak"], "materials": ["hide"], "palette": ["#8b5a2b", "not-a-colour", "#d2b48c"]},
    "hair_adornment": {"styles": ["braids"], "ornaments": ["shell beads"], "body_paint": "red ochre"},
    "tools_by_role": [{"role": "forager", "items": ["digging stick", "net bag"]}],
    "diet": ["tubers", "game"],
    "skin_hair": {"skin_palette": ["#8d5524", "#c68642"], "hair_palette": ["#1b1b1b"], "note": "broad range"},
    "climate": "hot savanna",
    "technology": ["stone tools"],
}


def assert_record_shape(record: dict) -> None:
    assert set(record["fields"]) == set(atlas.FIELDS)
    for name, f in [*record["fields"].items(), ("confidence", record["confidence"])]:
        assert isinstance(f["source"], str) and f["source"], name
        assert (f["value"] is None) == (f["source"] == atlas.NONE), name
        if f["source"] not in (atlas.NONE, atlas.MODEL, "derived"):
            assert set(f["source"].split("; ")) <= DATASETS, (name, f["source"])
    assert record["fields"]["subsistence"]["value"]["way"] in atlas.SUBSISTENCE
    assert record["fields"]["settlement"]["value"]["type"] in atlas.SETTLEMENT
    assert record["confidence"]["value"] in ("high", "medium", "low")


# --- bucketing ------------------------------------------------------------------------------

@pytest.mark.parametrize("year, era", [(-10000, -10000), (-9999, -10000), (-2500, -3000), (-1, -1000),
                                       (0, 0), (99, 0), (1850, 1800), (1900, 1900),
                                       (-10001, -11000), (-11000, -11000), (-43500, -44000), (-100000, -100000)])
def test_era_buckets_are_1000_years_bce_and_100_years_ce(year, era):
    assert atlas.era_of(year) == era
    assert era in atlas.ERAS or era in atlas.DEEP_ERAS


@pytest.mark.parametrize("year", [-100001, 1901])
def test_years_outside_the_data_are_refused(year):
    with pytest.raises(ValueError):
        atlas.era_of(year)


@pytest.mark.parametrize("lat, lon, key", [(0, 0, "0,0"), (-0.1, -0.1, "-5,-5"), (90, 180, "85,175"),
                                           (-90, -180, "-90,-180"), (51.5, -0.1, "50,-5")])
def test_cells_are_5_degree_south_west_corners(lat, lon, key):
    assert atlas.cell_of(lat, lon) == key


# --- rules ----------------------------------------------------------------------------------

@pytest.mark.parametrize("people, land, crop, graze, way", [
    (0, 1000, 0, 0, "uninhabited"),
    (100, 1000, 0, 0, "foraging"),
    (100_000, 100_000, 0.02, 0.01, "farming"),   # 2 ha cropland per person
    (100_000, 100_000, 0.0005, 0.01, "foraging"),  # 0.05 ha: a garden, not farming
    (100_000, 100_000, 0.2, 0.1, "mixed"),
    (100_000, 100_000, 0.005, 0.5, "herding"),   # grazing 100x cropland
    (100, 100_000, 0, 0.3, "herding"),
])
def test_way_of_life_from_hyde_land_use(people, land, crop, graze, way):
    assert atlas.way_of_life(people, land, crop, graze) == way


# --- the real atlas -------------------------------------------------------------------------

def test_every_land_cell_and_era_has_a_sourced_record():
    assert len(REAL.cells) > 800
    for key in REAL.cells:
        lat, lon = (int(v) + 2.5 for v in key.split(","))
        for era in atlas.ERAS:
            record = REAL.record(lat, lon, era)
            assert_record_shape(record)
            assert record["fields"]["subsistence"]["source"].startswith(atlas.HYDE)


def test_open_ocean_has_no_record():
    assert REAL.record(0, -160, 1900) is None


def test_known_places_read_as_expected():
    meso = REAL.record(32.5, 44.4, -2500)["fields"]
    assert meso["subsistence"]["value"]["way"] == "farming"
    assert meso["polity"]["source"] == atlas.SESHAT and "Akkadian Empire" in meso["polity"]["value"]["names"]
    assert "bronze" in meso["technology"]["value"]
    assert REAL.record(-20, 21, -8000)["fields"]["subsistence"]["value"]["way"] == "foraging"
    assert REAL.record(-20, 21, -8000)["confidence"]["value"] == "low"


def test_analogues_from_the_ethnographic_present_say_so():
    dwelling = REAL.record(-20, 21, -8000)["fields"]["dwelling"]
    assert dwelling["source"] == atlas.EA
    assert "analogue" in dwelling["note"]


# --- gap-fill merge -------------------------------------------------------------------------

def test_gapfill_fills_only_unknown_fields_and_tags_them_model():
    record = REAL.record(32.5, 44.4, -2500)
    merged = atlas.merge_gapfill(record, FILL)
    assert_record_shape(merged)
    for name in atlas.FIELDS:
        before, after = record["fields"][name], merged["fields"][name]
        if before["source"] != atlas.NONE:
            assert after == before, name  # data always wins
        elif name in atlas.MODEL_FIELDS:
            assert after["source"] == atlas.MODEL, name
    assert merged["fields"]["polity"] == record["fields"]["polity"]
    assert merged["fields"]["clothing"]["value"]["palette"] == ["#8b5a2b", "#d2b48c"]


def test_polity_is_never_model_filled():
    record = REAL.record(-20, 21, -8000)
    assert record["fields"]["polity"]["source"] == atlas.NONE
    assert atlas.merge_gapfill(record, {**FILL, "polity": "Made-up Kingdom"})["fields"]["polity"]["source"] == atlas.NONE


def test_gapfill_prompt_lists_real_facts_and_the_gaps():
    text = atlas.gapfill_prompt(REAL.record(-20, 21, -8000))
    assert atlas.HYDE in text and "clothing" in text and "skin_hair" in text


# --- builder --------------------------------------------------------------------------------

def test_aggregate_cells_sums_people_and_weights_shares_by_land():
    people = np.array([[10.0, 0, 0, 0], [30, 0, 0, 0]])
    landuse = np.zeros((2, 4, 3))
    landuse[0, 0, 0] = 1.0  # one fully cropped pixel
    land = np.array([[True, True, False, False], [True, True, False, False]])
    out = build.aggregate_cells(people, landuse, land, np.full((2, 1), 2.0), cell_px=2)
    assert out.shape == (1, 2, 6)
    assert out[0, 0, 0] == 40 and out[0, 0, 1] == 8  # 4 land pixels of 2 km2
    assert out[0, 0, 2] == pytest.approx(0.25)  # 2 of 8 km2 cropped
    assert out[0, 0, 5] == pytest.approx((10 * 5 + 30 * 15) / 40)  # people-weighted density
    assert out[0, 1, 1] == 0  # no land: the builder drops this cell


def test_ethnographic_codes_decode_to_phrases():
    assert build.dwelling({"EA079": 2, "EA081": 5, "EA083": 5}) == {
        "phrase": "circular house, walls of hides or skins, roof of hides or skins", "material": "hides or skins"}
    assert build.diet({"EA029": 6, "EA040": 7, "EA041": 2}) == ["cereal grains", "meat from cattle, yaks or water buffalo", "milk"]
    assert build.way_class({"EA001": 8, "EA002": 2, "EA003": 0, "EA004": 0, "EA005": 0}) == "foraging"


# --- HTTP endpoint --------------------------------------------------------------------------

@pytest.fixture
def server(tmp_path, monkeypatch):
    monkeypatch.setattr(day_api, "DB_PATH", str(tmp_path / "days.db"))
    monkeypatch.setattr(day_api, "_ip_hits", {})
    calls = []

    def fake_model(system, user, schema, name):
        calls.append({"system": system, "user": user, "name": name})
        if name == "anthropology_gapfill":
            return FILL, "test/haiku"
        return {"summary": "s", "schedule": [], "grounded_in": [], "uncertainty": "u"}, "test/haiku"

    monkeypatch.setattr(day_api, "call_model", fake_model)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), day_api.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}", calls
    httpd.shutdown()


def get(url: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def test_endpoint_without_key_returns_real_fields_and_no_model(server, monkeypatch):
    base, calls = server
    monkeypatch.delenv(day_api.KEY_ENV, raising=False)
    status, body = get(f"{base}/api/anthropology?lat=-20&lon=21&year=1900")
    assert status == 200 and body["gapfill"] == "off" and not calls
    assert_record_shape(body)
    assert atlas.HYDE in body["sources"] and "licence" in body["sources"][atlas.EA]


def test_endpoint_gapfills_once_then_serves_from_cache(server, monkeypatch):
    base, calls = server
    monkeypatch.setenv(day_api.KEY_ENV, "test")
    status, first = get(f"{base}/api/anthropology?lat=-20&lon=21&year=-7500")
    assert status == 200 and first["gapfill"] == "generated"
    assert_record_shape(first)
    assert first["fields"]["clothing"]["source"] == atlas.MODEL
    _, again = get(f"{base}/api/anthropology?lat=-18&lon=24&year=-7100")  # same cell and era
    assert again["gapfill"] == "cached" and again["fields"] == first["fields"]
    assert len(calls) == 1 and calls[0]["name"] == "anthropology_gapfill"


def test_endpoint_respects_the_shared_daily_cap(server, monkeypatch):
    base, calls = server
    monkeypatch.setenv(day_api.KEY_ENV, "test")
    monkeypatch.setattr(day_api, "DAILY_CAP", 0)
    status, body = get(f"{base}/api/anthropology?lat=-20&lon=21&year=1900")
    assert status == 200 and body["gapfill"] == "capped" and not calls
    assert body["fields"]["subsistence"]["source"] == atlas.HYDE


@pytest.mark.parametrize("query, code", [("lat=0&lon=-160&year=1900", 404), ("lat=0&lon=0", 400),
                                         ("lat=95&lon=0&year=0", 400), ("lat=0&lon=0&year=1950", 400),
                                         ("lat=x&lon=0&year=0", 400)])
def test_endpoint_rejects_bad_input_and_open_ocean(server, query, code):
    base, _ = server
    assert get(f"{base}/api/anthropology?{query}")[0] == code


def test_day_prompt_carries_the_record_and_keeps_its_cache_key(server, monkeypatch):
    base, calls = server
    monkeypatch.setenv(day_api.KEY_ENV, "test")
    f = {"lat": 32.5, "lon": 44.4, "year": -2500, "cellPeople": 900, "neighbourhoodPeople": 5000,
         "densityClass": "dense", "person": {"age": 30, "female": True, "role": "potter", "groupKind": 1,
                                             "groupPeople": 200}}
    key_before = day_api.cache_key(f)
    req = urllib.request.Request(f"{base}/api/day", data=json.dumps(f).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
    user = calls[-1]["user"]
    facts = json.loads(user.split("\n\n", 1)[1])["what_we_know_about_this_region_and_era"]
    assert facts["polity"]["source"] == atlas.SESHAT and facts["subsistence"]["source"] == atlas.HYDE
    assert day_api.cache_key(f) == key_before
