"""Model-vs-evidence comparison (docs/research/0009): the pure parts, on synthetic data.

The real-data run (model_vs_evidence.py) needs data/evidence and data/tiles; these tests do not."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evidence"))
import model_vs_evidence as mve  # noqa: E402
import prehistory_population as pp  # noqa: E402


def test_region_assignment_is_the_models_rule():
    """The evidence side must put a point in the same region the model puts the cell in."""
    regions = mve.load_regions()
    lon, lat = np.meshgrid(pp.grid_lons()[::7], pp.grid_lats()[::7])
    mine = mve.assign(regions, lat.ravel(), lon.ravel())
    table = pp.load_table()
    theirs = pp.assign_regions([r["bbox"] for r in table["regions"]])
    rows, cols = np.meshgrid(np.arange(0, 360, 7), np.arange(0, 720, 7), indexing="ij")
    assert (mine == theirs[rows.ravel(), cols.ravel()]).all()


def test_levant_override_precedes_africa_on_the_evidence_side():
    """Evidence and regenerated people must use the corrected Levant region."""
    regions = mve.load_regions()
    ids = [r.id for r in regions]
    jerusalem = mve.assign(regions, np.array([31.8]), np.array([35.2]))[0]
    assert ids[jerusalem] == "levant_arabia"


def test_date_bin_mass_sums_to_one_inside_the_bins_and_splits_intervals():
    edges = np.arange(0, 6001, 1000.0)
    m = mve.date_bin_mass("2600-2400", edges)  # one interval, wholly in bin [2000, 3000)
    assert m.sum() == pytest.approx(1.0) and m[2] == pytest.approx(1.0)
    m = mve.date_bin_mass("3100-3000;1100-1000", edges)  # two equal intervals, in bins 1 and 3
    assert m[1] == pytest.approx(0.5) and m[3] == pytest.approx(0.5)
    m = mve.date_bin_mass("6500-5500", edges)  # half beyond the last edge
    assert m[5] == pytest.approx(0.5)


def test_taphonomic_weight_is_one_at_reference_and_grows_with_age():
    ages = np.array([12_950.0, 20_000.0, 30_000.0, 50_000.0])
    w = mve.tapho_weight(ages)
    assert w[0] == pytest.approx(1.0)
    assert (np.diff(w) > 0).all()
    assert w[-1] == pytest.approx(((50_000 + 2176.4) / (12_950 + 2176.4)) ** 1.3925309)


def test_site_occupancy_counts_a_site_once_however_many_dates_it_has():
    regions = mve.load_regions()
    centres = np.array([3500.0, 2500.0, 1500.0])  # oldest first, 1 ka apart
    one = pd.DataFrame({"site_id": ["a"], "rid": [0], "intervals": ["3600-3400"]})
    many = pd.DataFrame({"site_id": ["a"] * 5, "rid": [0] * 5, "intervals": ["3600-3400"] * 5})
    s1 = mve.evidence_curves(one, len(regions), centres)
    s5 = mve.evidence_curves(many, len(regions), centres)
    assert s1["sites"][0][0] == pytest.approx(1.0)
    assert s5["sites"][0][0] == pytest.approx(1.0)  # five dates, still one occupied site
    assert s5["spd"][0][0] == pytest.approx(5.0)  # the plain sum counts every date
    assert s5["spd_site"][0][0] == pytest.approx(1.0)  # the site-weighted sum counts the site once


def test_first_run_needs_consecutive_bins():
    centres = np.array([5000.0, 4000.0, 3000.0, 2000.0])
    assert mve.first_run(np.array([0, 3, 0, 3.0]), centres, 2, 2) is None
    assert mve.first_run(np.array([0, 3, 3, 3.0]), centres, 2, 2) == 4.0
