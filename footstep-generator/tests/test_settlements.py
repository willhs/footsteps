"""Settlement catalog: source observations and residential scenarios, not visual constants."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "footstep-generator/anthropology"))
import settlements  # noqa: E402


def test_city_sources_merge_without_double_counting_or_filling_missing_years(tmp_path):
    header = "City,OtherName,Country,Latitude,Longitude,Certainty,BC_1000,AD_100,AD_200,AD_2000\n"
    ancient = tmp_path / "modelski.csv"
    recent = tmp_path / "chandler.csv"
    ancient.write_text(header + "Old name,,X,30,20,1,10000,20000,,\n", encoding="cp1252")
    recent.write_text(header + "Alias,,X,30,20,1,,30000,,50000\n", encoding="cp1252")
    cities = settlements.read_cities({"modelski": ancient, "chandler": recent})
    assert len(cities) == 1
    assert cities[0]["observations"] == [(-1000, 10000), (100, 30000)]
    assert cities[0]["source"] == "chandler+modelski"
    assert (cities[0]["lat"], cities[0]["lon"]) == (30, 20)


def society(**values):
    return {"id": "test", "values": values}


def test_sedentary_task_groups_do_not_become_residential_villages():
    components = settlements.binford_components(society(
        moves_per_year=0, mobility=2, cooperating_group=8, camp_size_aggregated=240))
    assert [(c["mode"], c["size"], c["weight"]) for c in components] == [("settled", 240, 1)]
    assert components[0]["moves"] == 0


def test_mobile_and_aggregation_are_alternative_shares_of_one_population():
    components = settlements.binford_components(society(
        moves_per_year=12, mobility=1, cooperating_group=20, camp_size_aggregated=100))
    assert [(c["mode"], c["size"]) for c in components] == [("mobile", 20), ("aggregation", 100)]
    assert sum(c["weight"] for c in components) == 1


def test_missing_binford_size_is_unknown_not_an_invented_band():
    assert settlements.binford_components(society(moves_per_year=10, camp_size_aggregated=50)) == []
    assert settlements.binford_components(society(moves_per_year=0, camp_size_aggregated=50))[0]["size"] == 50


def test_ea_categories_produce_weighted_regional_sizes_without_inventing_moves():
    matches = [SimpleNamespace(score=0.75, society=society(community_size=2, settlement_pattern=2)),
               SimpleNamespace(score=0.25, society=society(community_size=4, settlement_pattern=7))]
    result = settlements.profile(matches)
    assert [(c["size"], c["mode"], c["weight"]) for c in result["components"]] == [
        (75, "mobile", 0.75), (300, "settled", 0.25)]
    assert [c["moves"] for c in result["components"]] == [None, None]
    assert result["storage"] is None


def test_shipped_catalog_has_supported_profiles_and_distinct_climate_scenarios():
    catalog = json.loads((ROOT / "footsteps-web/public/settlements.json").read_text())
    assert len(catalog["regions"]) == 36 * 72
    assert len(catalog["climate"]) == 12 * 13
    assert len(catalog["cities"]) > 1000
    assert catalog["climate"]["-20,0"] != catalog["climate"]["25,2000"]
    profiles = [p for ps in catalog["regions"].values() for p in ps] + list(catalog["climate"].values())
    for profile in profiles:
        assert sum(c["weight"] for c in profile["components"]) == pytest.approx(1)
        assert profile["components"]
        for component in profile["components"]:
            assert component["size"] > 0
            assert component["society"] in catalog["sources"]["societies"]
    for city in catalog["cities"]:
        years = [row[0] for row in city["observations"]]
        assert years == sorted(set(years))
        assert all(row[1] > 0 for row in city["observations"])


def test_site_diagnostic_reads_habitat_pixels_and_retains_source_societies(tmp_path):
    from PIL import Image

    meta = json.loads((ROOT / "footsteps-web/public/habitat_meta.json").read_text())
    (tmp_path / "habitat_meta.json").write_text(json.dumps(meta))
    (tmp_path / "habitat").mkdir()
    for step in (23, 18, 14, 13):
        Image.new("RGB", (720, 360), (4, 141, 1)).save(tmp_path / "habitat" / f"bp_{step}.webp", lossless=True)
    catalog = {"climate": {"20,0": {"components": [{"society": "a", "size": 80}], "storage": None}},
               "sources": {"societies": {"a": {"name": "Recorded analog", "year": 1900}}}}
    result = settlements.site_diagnostics(catalog, tmp_path)
    assert [c["habitat_step_ka"] for c in result["checks"]] == [23, 18, 14, 13]
    assert result["checks"][0]["temp_c"] == 20
    assert result["checks"][0]["precip_mm"] == 0
    assert result["checks"][0]["profile"]["components"][0]["size"] == 80
    assert result["checks"][0]["societies"]["a"]["name"] == "Recorded analog"
