"""Guessed bands of the other kinds of human: stable rounding, range masks, the dry-land test."""
import sys
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import other_humans_bands as ob


def test_cell_counts_round_to_the_expected_total_and_stay_put():
    rng = np.random.default_rng(1)
    u = rng.random(10_000)
    e = np.full(10_000, 0.13)
    counts = ob.cell_counts(e, u)
    assert abs(counts.sum() - 1300) < 120
    # A small change in expectation keeps nearly every occupied cell occupied.
    again = ob.cell_counts(e * 1.05, u)
    assert ((counts > 0) & (again == 0)).sum() == 0
    assert ob.cell_counts(np.array([2.0]), np.array([0.99]))[0] == 2


def test_table_has_the_four_kinds_with_sources_or_says_there_are_none():
    table = yaml.safe_load(ob.TABLE.read_text())
    assert [s["id"] for s in table["species"]] == ["neanderthals", "denisovans", "floresiensis", "luzonensis"]
    for s in table["species"]:
        assert s["people"] > 0 and s["source"] and s["note"]
        assert s["ranges"]


def test_range_mask_covers_flores_and_flags_hinted_areas():
    table = {s["id"]: s for s in yaml.safe_load(ob.TABLE.read_text())["species"]}
    w, hinted = ob.range_mask(table["floresiensis"]["ranges"])
    row, col = int((90 + 8.6) / 0.5), int((180 + 121.0) / 0.5)
    assert w[row, col] > 0.5 and not hinted.any()
    w, hinted = ob.range_mask(table["denisovans"]["ranges"])
    row, col = int((90 + 4) / 0.5), int((180 + 135) / 0.5)  # New Guinea side of Wallacea
    assert hinted[row, col] and 0 < w[row, col] <= 0.3 + 1e-9
    assert w[int((90 - 45) / 0.5), int((180 + 100) / 0.5)] > 0.9  # Mongolia/China, a likely area


def test_dry_land_follows_the_sea_level():
    dry = ob.Dry()
    # Sunda shelf between Sumatra and Borneo (~40-60 m deep): sea today, land at -120 m.
    lon, lat = np.array([106.5]), np.array([-1.0])
    assert not dry(lon, lat, 0)[0]
    assert dry(lon, lat, 120)[0]
    assert dry(np.array([2.35]), np.array([48.85]), 0)[0]  # Paris
