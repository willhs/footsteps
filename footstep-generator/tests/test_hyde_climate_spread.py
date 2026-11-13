"""Behaviour of the climate-adjusted HYDE spread: totals kept, people move toward habitable land."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hyde_climate_spread as hs
import prehistory_population as pp
import terrain_image

B = hs.BLOCK


# --- climate_shift: regional totals kept, people follow capacity -------------------

def two_regions():
    region = np.array([[0, 0, 1, 1]])
    hyde = np.array([[10.0, 10.0, 5.0, 5.0]])
    return hyde, region


def test_strength_zero_is_hyde():
    hyde, region = two_regions()
    out = hs.climate_shift(np.array([[1, 3, 1, 1.0]]), np.array([[1, 1, 1, 1.0]]), hyde, region, 0.0)
    assert np.allclose(out, hyde)


def test_people_move_toward_land_that_was_more_habitable_then_and_regions_keep_totals():
    hyde, region = two_regions()
    then = np.array([[1.0, 3.0, 2.0, 2.0]])  # cell 1 was three times as habitable as cell 0
    now = np.array([[1.0, 1.0, 2.0, 2.0]])
    out = hs.climate_shift(then, now, hyde, region, 1.0)
    assert out[0, 1] > hyde[0, 1] and out[0, 0] < hyde[0, 0]
    assert out[0, :2].sum() == pytest.approx(20.0) and out[0, 2:].sum() == pytest.approx(10.0)
    assert np.allclose(out[0, 2:], 5.0)  # region 1 did not change climate


def test_people_appear_where_hyde_has_none_and_never_go_negative():
    hyde = np.array([[8.0, 0.0, 0.5]])
    region = np.zeros((1, 3), int)
    then = np.array([[1.0, 5.0, 0.0]])  # a shelf cell HYDE leaves empty; a cell that is sea now
    now = np.array([[1.0, 0.0, 4.0]])
    out = hs.climate_shift(then, now, hyde, region, 1.0)
    assert out[0, 1] > 0 and np.all(out >= 0)
    assert out.sum() == pytest.approx(hyde.sum())


def test_region_without_capacity_or_people_is_left_alone():
    hyde = np.array([[4.0, 0.0]])
    region = np.array([[0, 1]])
    out = hs.climate_shift(np.array([[0.0, 1.0]]), np.array([[1.0, 1.0]]), hyde, region, 1.0)
    assert np.array_equal(out, hyde)


# --- spread_to_cells: block totals become the new ones ------------------------------

def blocks(old, new, hyde5, land5):
    return hs.spread_to_cells(hyde5, np.array([[old]], float), np.array([[new]], float), land5)


def test_loss_is_shared_in_proportion_and_block_total_matches():
    hyde5 = np.zeros((B, B))
    hyde5[0, 0], hyde5[1, 1] = 30.0, 10.0
    out = blocks(40.0, 20.0, hyde5, np.ones((B, B), bool))
    assert out.sum() == pytest.approx(20.0)
    assert out[0, 0] == pytest.approx(15.0) and out[1, 1] == pytest.approx(5.0)


def test_gain_goes_only_to_land_cells_of_the_block():
    hyde5 = np.zeros((B, B))
    hyde5[0, 0] = 10.0
    land = np.zeros((B, B), bool)
    land[:, :2] = True  # the block's west third is dry
    out = blocks(10.0, 70.0, hyde5, land)
    assert out.sum() == pytest.approx(70.0)
    assert np.all(out[:, 2:] == 0)
    assert out[2, 1] == pytest.approx(60.0 / land.sum())


def test_empty_block_gains_spread_evenly_and_a_block_with_no_land_still_conserves():
    hyde5 = np.zeros((B, B))
    assert blocks(0.0, 36.0, hyde5, np.ones((B, B), bool)).max() == pytest.approx(1.0)
    assert blocks(0.0, 36.0, hyde5, np.zeros((B, B), bool)).sum() == pytest.approx(36.0)


# --- Green Sahara ---------------------------------------------------------------------

def grids():
    lat = pp.grid_lats()[:, None]
    lon = pp.grid_lons()[None, :]
    now = np.where((lat < 20) & (lat > 10), 600.0, 50.0) * np.ones((1, pp.NX))
    return lat, lon, now.copy()


def test_green_sahara_only_raises_npp_inside_the_humid_period_and_extent():
    lat, lon, now = grids()
    dry = now.copy()
    assert np.array_equal(hs.green_sahara_npp(dry, now, lat, lon, 2000), dry)  # not humid
    wet = hs.green_sahara_npp(dry, now, lat, lon, -6000)
    assert np.all(wet >= dry)
    row = lambda deg: int((90 - deg) / pp.CELL_DEG)  # noqa: E731
    col = int((10 + 180) / pp.CELL_DEG)
    assert wet[row(25), col] > dry[row(25), col] * 3  # the rain belt reached 25N
    assert wet[row(45), col] == dry[row(45), col]  # not Europe
    assert wet[row(25), int((100 + 180) / pp.CELL_DEG)] == dry[row(25), int((100 + 180) / pp.CELL_DEG)]  # not Asia


def test_terrain_and_spread_share_one_sahara_extent():
    lat = np.array([[20.0], [40.0]])
    lon = np.array([[10.0, 100.0]])
    e = terrain_image.sahara_extent(lat, lon)
    assert e[0, 0] == pytest.approx(1.0) and e[1, 0] == 0 and e[0, 1] == 0


# --- places ----------------------------------------------------------------------------

def test_place_box_across_the_antimeridian():
    m = hs.place_mask((165, 58, -160, 72), False)
    lon, lat = np.meshgrid(pp.grid_lons(), pp.grid_lats())
    assert m[(lon > 170) & (lon < 175) & (lat > 65) & (lat < 66)].all()
    assert m[(lon > -170) & (lon < -165) & (lat > 65) & (lat < 66)].all()
    assert not m[(lon > 0) & (lon < 10)].any()


def test_regions_cover_every_cell_and_use_known_names():
    idx = hs.region_index()
    assert idx.shape == (pp.NY, pp.NX) and idx.min() == 0 and idx.max() == len(hs.REGIONS) - 1


# --- real data (skipped when data/raw is absent) ------------------------------------------

REAL = pytest.mark.skipif(
    not (pp.BEYER.exists() and pp.NATURAL_EARTH.exists() and (pp.RAW / "krapp2021").exists()
         and (pp.RAW / "etopo").exists() and (pp.RAW / "hyde-3.5" / "popd_8000BC.asc").exists()),
    reason="needs Beyer, Krapp, ETOPO, Natural Earth and HYDE under data/raw",
)


@pytest.fixture(scope="module")
def model():
    return hs.SpreadModel(pp.load_table())


@REAL
def test_real_8000_bce_keeps_totals_and_moves_people_into_the_sahara_and_onto_the_shelf(model):
    hyde5, adj5, rep = hs.adjusted_people(model, -8000, hs.STRENGTH)
    assert adj5.sum() == pytest.approx(hyde5.sum(), rel=1e-9)
    assert np.all(adj5 >= 0)
    for name, r in rep["regions"].items():
        assert r["adjusted"] == pytest.approx(r["hyde"], abs=2), name
    places = rep["places"]
    assert places["sahara"]["adjusted"] > 2 * places["sahara"]["hyde"]
    assert places["doggerland"]["adjusted"] > 3 * places["doggerland"]["hyde"]
    assert places["sundaland"]["adjusted"] > 3 * places["sundaland"]["hyde"]


@REAL
def test_real_nobody_is_added_on_the_sea_at_that_years_sea_level(model):
    hyde5, adj5, _ = hs.adjusted_people(model, -10_000, hs.STRENGTH)
    sea = hs.elevation5() <= terrain_image.sea_level(-10_000)
    assert adj5[sea & (hyde5 == 0)].sum() < 0.002 * adj5.sum()


@REAL
def test_real_the_adjustment_fades_as_the_climate_becomes_todays(model):
    rep = hs.adjusted_people(model, 1900, 1.0)[2]
    assert rep["moved"] / rep["world"] < 0.01  # 50 years before the 'today' capacity is measured at
