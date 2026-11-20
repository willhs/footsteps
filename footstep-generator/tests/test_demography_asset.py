"""demography.yaml -> footsteps-web/lib/demography.json (research 0006): the committed asset is current and validated."""
import copy
import json
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "anthropology"))
import demography_asset as da  # noqa: E402

DATA = yaml.safe_load(da.YAML.read_text())


def test_committed_asset_matches_the_yaml():
    assert json.loads(da.ASSET.read_text()) == json.loads(da.dump(da.compile_asset(DATA)))


def test_asset_carries_only_what_sampling_needs_and_says_modelled():
    asset = da.compile_asset(DATA)
    assert asset["evidence"] == "modelled"
    assert asset["label"] == "Modelled age structure; individual speculative"
    assert asset["profiles"]["forager"]["shares"] == [0.14, 0.24, 0.26, 0.24, 0.12]
    assert "e0" not in json.dumps(asset["profiles"])  # uncalibrated life-table metrics stay in the YAML
    assert set(asset["sources"]) == {"EDITORIAL2026", "GK2007", "BA2011", "LANDERS1987"}


def test_validation_rejects_shares_that_do_not_sum_to_one():
    bad = copy.deepcopy(DATA)
    bad["profiles"]["forager"]["age_structure"]["0-4"]["value"] = 0.2
    with pytest.raises(AssertionError, match="sum"):
        da.compile_asset(bad)


def test_validation_rejects_bins_that_do_not_tile_zero_to_fifty():
    bad = copy.deepcopy(DATA)
    bad["sampling"]["bins"][1] = [5, 16]
    with pytest.raises(AssertionError, match="tile"):
        da.compile_asset(bad)


def test_farming_onset_is_the_earliest_crop_era_per_cell_and_ignores_animals():
    food = {
        "eras": [-10000, -9000, -8000],
        "taxa": [{"id": "wheat", "kind": "crop"}, {"id": "sheep", "kind": "animal"}],
        "cells": {"30,30": {"first": {"wheat": 2, "sheep": 0}}, "50,0": {"first": {"sheep": 1}}, "60,0": {"first": {}}},
    }
    assert da.farming_onset(food)["cells"] == {"30,30": -8000}


def test_committed_onset_has_the_levant_early():
    cells = json.loads(da.ONSET.read_text())["cells"]
    assert cells["30,30"] <= -7000
