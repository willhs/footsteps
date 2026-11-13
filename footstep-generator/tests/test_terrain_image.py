"""Terrain frame helpers: step bracketing, sea level, Green Sahara timing, farm
share, blur, and the frame years the web client expects."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import terrain_image as terrain

ROOT = Path(__file__).resolve().parents[2]


def ts_years(name: str) -> list[int]:
    """Evaluate a `name = [...]` list from lib/constants.ts (literals or ranges)."""
    src = (ROOT / "footsteps-web" / "lib" / "constants.ts").read_text()
    body = re.search(rf"{name}\b[^=]*=\s*\[(.*?)\];", src, re.S).group(1)
    return [int(v) for v in re.findall(r"-?\d+", body)]


def test_step_bracket_uses_bp_from_1950():
    # 10,000 BCE = 11,950 BP: between the 11 ka and 12 ka steps, nearer 12 ka.
    assert terrain.step_bracket(-10_000) == (11_000, 12_000, pytest.approx(0.95))
    # 1900 CE = 50 BP; years after 1950 clamp to the 0 BP step.
    assert terrain.step_bracket(1900) == (0, 1000, pytest.approx(0.05))
    assert terrain.step_bracket(2000) == (0, 1000, 0.0)


def test_sea_level_is_the_readout_series():
    # Coasts use the same capped Spratt series as the slider readout.
    assert terrain.sea_level(-19_000) < -100  # Last Glacial Maximum
    assert terrain.sea_level(1900) == 0.0  # capped at today's


def test_green_sahara_is_full_in_the_humid_period_and_absent_outside():
    assert terrain.sahara_weight(-6000) == pytest.approx(1.0)
    assert terrain.sahara_weight(-12_000) == 0.0
    assert terrain.sahara_weight(1000) == 0.0
    # Eases in and out around the literature's ~9000 and ~3500 BCE edges.
    assert 0.3 < terrain.sahara_weight(-9000) < 0.7
    assert 0.3 < terrain.sahara_weight(-3500) < 0.7
    assert terrain.sahara_weight(-9500) < terrain.sahara_weight(-8500)


def test_farmed_fraction_counts_cropland_more_than_rangeland():
    crop = np.array([1.0, 0.0, 0.0])
    grazing = np.array([0.0, 1.0, 0.0])
    f = terrain.farmed_fraction(crop, grazing)
    assert f[0] > f[1] > f[2] == 0
    assert f.max() <= 1


def test_farm_weight_is_the_share_of_todays_farming():
    today = np.array([0.6, 0.6, 0.6, 0.0])
    then = np.array([0.0, 0.3, 0.9, 0.5])
    k = terrain.farm_weight(then, today)
    # none, half of today's, capped at today's look, and nothing to restore where unfarmed today
    assert k.tolist() == pytest.approx([0.0, 0.5, 1.0, 0.0])


def test_blur_keeps_the_mean_and_wraps_east_west():
    a = np.zeros((20, 40), np.float32)
    a[10, 0] = 1
    b = terrain.blur(a, 1.5)
    assert b.sum() == pytest.approx(1.0, rel=1e-5)
    assert b[10, -1] == pytest.approx(b[10, 1])  # spilt across the dateline


def test_frame_years_match_the_web_client():
    assert terrain.TERRAIN_YEARS[0] == -100_000
    assert terrain.HYDE_YEARS == ts_years("TARGET_YEARS")
    assert set(terrain.HYDE_YEARS) <= set(terrain.TERRAIN_YEARS)
    steps = np.diff(terrain.TERRAIN_YEARS)
    assert steps.max() == 1000 and steps.min() == 100

