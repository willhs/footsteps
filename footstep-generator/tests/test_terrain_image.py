"""Terrain frame helpers: step bracketing, sea level, Green Sahara timing, farm
share, blur, and the frame years the web client expects."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import climate_series
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


@pytest.mark.skipif(not climate_series.SPRATT.exists(), reason="data/raw/spratt2025 not downloaded")
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



# --- ?pastwater=1: every scenario from its shared masks -------------------------------------------------------------------

def test_pastwater_years_are_where_the_picture_differs():
    # the old lake fades in over -9750..-8250 and out over -4250..-2750; the scenario holds -9550..-3050: 1,000-year steps in between
    # ...plus the European LGM window (-24550..-17050) and the Mesopotamian stages (-6050..-4551, -4550..-3550, -2550..-1550)
    assert terrain.pastwater_years() == list(range(-24000, -17000, 1000)) + list(range(-9000, -2000, 1000)) + [-2000]


def test_pastwater_lake_is_the_shared_mask_at_output_resolution():
    import past_water
    lake = terrain.pastwater_lake()
    assert lake.shape == (terrain.H, terrain.W) and 0 <= lake.min() and lake.max() <= 1
    _, mask, _ = past_water.load_lake()
    # an output pixel is 10.5' = 4.2 mask pixels across: the shared lake's area survives the resampling within a pixel's rim
    per_pixel = (past_water.PIXEL_DEG * 60 / (360 * 60 / terrain.W)) ** 2
    assert abs(lake.sum() - mask.sum() * per_pixel) / (mask.sum() * per_pixel) < 0.01
    # it sits on Lake Chad's basin, nowhere near the old box's far corners
    row, col = int((90 - 13.5) / 180 * terrain.H), int((15.5 + 180) / 360 * terrain.W)
    assert lake[row, col] > 0.9


def test_pastwater_paint_is_every_active_epoch_on_land_only_in_its_own_colour():
    from types import SimpleNamespace
    p = SimpleNamespace(sea=np.array([10.0, 20.0, 90.0], np.float32), lake=np.array([30.0, 60.0, 80.0], np.float32))
    land = np.ones((terrain.H, terrain.W, 1), np.float32)
    at = lambda lat, lon: (int((90 - lat) / 180 * terrain.H), int((lon + 180) / 360 * terrain.W))  # noqa: E731
    share, colour = terrain.pastwater_paint(-4000, land, p)  # Mega-Chad and the Mesopotamian bay at ~6 ka
    assert share[at(13.5, 15.5)] > 0.9 and np.allclose(colour[at(13.5, 15.5)], p.lake)
    assert share[at(30.5, 47.8)] > 0.9 and np.allclose(colour[at(30.5, 47.8)], p.sea)
    share, _ = terrain.pastwater_paint(-20000, land, p)  # the LGM Caspian
    assert share[at(47.0, 48.0)] > 0.9 and share[at(13.5, 15.5)] == 0
    assert terrain.pastwater_paint(-12000, land, p)[0].max() == 0  # no scenario
    assert terrain.pastwater_paint(-4000, np.zeros_like(land), p)[0].max() == 0  # never on the sea
