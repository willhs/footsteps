"""Schema checks for prehistory/arrivals.yaml (the pre-HYDE arrival and habitat table)."""

from pathlib import Path

import yaml

PATH = Path(__file__).resolve().parents[1] / "prehistory" / "arrivals.yaml"
TABLE = yaml.safe_load(PATH.read_text())


def test_regions_have_ordered_dates_and_valid_bbox():
    ids = set()
    for r in TABLE["regions"]:
        assert r["id"] not in ids, r["id"]
        ids.add(r["id"])
        a = r["arrival_ka_bp"]
        # early = oldest plausible, late = youngest plausible, central between them
        assert a["early"] >= a["central"] >= a["late"], r["id"]
        west, south, east, north = r["bbox"]
        assert -180 <= west < east <= 180 and -90 <= south < north <= 90, r["id"]
        assert r["verification"] in {"checked", "memory"}, r["id"]
        assert r["source"] and r["ramp_ka"] >= 0, r["id"]


def test_contested_dates_keep_an_alternative():
    by_id = {r["id"]: r for r in TABLE["regions"]}
    assert by_id["sahul"]["alt"]["ka_bp"] == 65
    assert by_id["north_america"]["alt"]["ka_bp"] == 23


def test_catch_all_region_is_last():
    assert TABLE["regions"][-1]["id"] == "pacific_remote"


def test_other_hominins_are_separate():
    assert {h["id"] for h in TABLE["other_hominins"]} >= {
        "neanderthals",
        "denisovans",
        "floresiensis",
    }
    assert "habitat_rules" in TABLE and "cold_limit" in TABLE["habitat_rules"]
