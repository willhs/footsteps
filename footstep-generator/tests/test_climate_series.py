"""Climate series: BP conversion, interpolation, fixed-mask weighting, committed JSON."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import climate_series as cs

ROOT = Path(__file__).resolve().parents[2]


def test_years_are_the_terrain_years():
    ys = cs.slider_years()
    assert ys[0] == -100_000 and ys[99] == -1000 and ys[100] == 0 and ys[-1] == 1900
    assert len(ys) == 120


def test_bp_is_before_1950():
    assert cs.year_to_bp(-10_000) == 11_950
    assert cs.year_to_bp(1900) == 50


def test_interp_between_rows_and_clamps_after_1950():
    bp = np.array([0.0, 1000.0, 2000.0])
    v = np.array([0.0, 10.0, 20.0])
    out = cs.interp_bp(bp, v, [950, 1900, 2000])  # 1000, 50, clamped to 0 BP
    assert out == pytest.approx([10.0, 0.5, 0.0])
    with pytest.raises(ValueError):
        cs.interp_bp(bp, v, [-5000])


def test_land_mean_uses_fixed_mask_and_latitude_weights():
    field = np.array([[10.0, 10.0], [0.0, np.nan]])
    mask = np.array([[True, True], [True, True]])
    # NaN cell is dropped; equator row (cos 0 = 1) outweighs the 60N row (0.5)
    m = cs.land_mean(field, np.array([60.0, 0.0]), mask)
    assert m == pytest.approx((10 * 0.5 * 2 + 0 * 1) / (0.5 * 2 + 1))
    assert cs.land_mean(field, np.array([60.0, 0.0]), np.array([[True, False], [False, False]])) == 10.0


def test_committed_series_matches_the_known_glacial_cycle():
    d = json.loads((ROOT / "footsteps-web/public/climate_series.json").read_text())
    n = len(d["years"])
    assert n == len(d["seaLevel"]["values"]) == len(d["seaLevel"]["sigma"]) == len(d["temperature"]["values"])
    at = dict(zip(d["years"], zip(d["seaLevel"]["values"], d["temperature"]["values"])))
    assert at[-19_000][0] < -100  # Last Glacial Maximum, ~21 ka BP: about -120 m
    assert at[-19_000][1] < -3  # clearly colder than today
    assert at[1900][0] == 0.0 and abs(at[1900][1]) < 1
    assert max(d["seaLevel"]["values"]) <= 0  # never above today's (capped)


def test_sea_level_is_capped_at_today():
    assert cs.capped_at_today(np.array([-120.0, 3.2, 0.0])).tolist() == [-120.0, 0.0, 0.0]
