"""Behaviour of the modelled pre-HYDE population: curve, density fit, arrivals, hand-over."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import grid_image
import prehistory_population as pp

TABLE = pp.load_table()
SLIDER = list(range(pp.FIRST_YEAR, pp.LAST_YEAR + 1, pp.STEP))


# --- the world total curve ------------------------------------------------------

def test_curve_is_anchored_at_hyde_and_ordered():
    t = pp.world_totals(pp.HYDE_YEAR)
    assert t.central == pytest.approx(4.6e6)
    for year in SLIDER:
        t = pp.world_totals(year)
        assert 0 < t.low < t.central < t.high, year


def test_central_curve_grows_toward_hyde():
    central = [pp.world_totals(y).central for y in SLIDER]
    assert all(a <= b * 1.0001 for a, b in zip(central, central[1:]))
    assert central[0] == pytest.approx(0.2e6, rel=0.01)  # held flat beyond the 100 ka anchor


# --- density: Miami NPP and Tallavaara's fit ------------------------------------

def test_miami_npp_is_limited_by_cold_and_by_drought():
    assert float(pp.miami_npp(30, 0)) == 0
    assert pp.miami_npp(-30, 3000) < 30  # frozen
    # warm and wet: the precipitation limit binds, 3000 * (1 - exp(-0.000664 * 3000))
    assert float(pp.miami_npp(30, 3000)) == pytest.approx(2589, abs=2)
    assert pp.miami_npp(15, 500) < pp.miami_npp(15, 1500)


def test_forager_density_rises_then_plateaus_at_the_published_break():
    c = pp.TALLAVAARA
    assert float(pp.forager_density(0)) == pytest.approx(np.exp(c["intercept"]))
    below = pp.forager_density(np.linspace(0, c["break"], 50))
    assert np.all(np.diff(below) > 0)
    peak = float(pp.forager_density(c["break"]))
    assert 40 < peak < 50  # people per 100 km2 at the break
    # above the break the fit is nearly flat (it falls 0.02% per g/m2/yr)
    assert float(pp.forager_density(c["break"] + 500)) == pytest.approx(peak, rel=0.15)
    assert float(pp.forager_density(c["break"] + 500)) < peak


def test_ramps():
    assert float(pp.ramp(-40, -35, -20)) == 0
    assert float(pp.ramp(-27.5, -35, -20)) == pytest.approx(0.5)
    assert float(pp.ramp(-10, -35, -20)) == 1
    assert float(pp.ramp(50, 100, 300)) == 0


# --- who was there --------------------------------------------------------------

def test_occupancy_ramps_up_after_arrival_and_steps_when_ramp_is_zero():
    # arrival 45 ka BP, ramp 3 ka
    assert float(pp.occupancy(46, 45, 3)) == 0
    assert float(pp.occupancy(45, 45, 3)) == 0
    assert float(pp.occupancy(43.5, 45, 3)) == pytest.approx(0.5)
    assert float(pp.occupancy(40, 45, 3)) == 1
    assert float(pp.occupancy(100, 300, 0)) == 1
    assert float(pp.occupancy(100, 4.5, 0)) == 0


def test_every_cell_has_a_region_and_known_places_land_in_the_right_one():
    ids = [r["id"] for r in TABLE["regions"]]
    idx = pp.assign_regions([r["bbox"] for r in TABLE["regions"]])
    assert idx.shape == (pp.NY, pp.NX)

    def region(lat, lon):
        return ids[idx[int((90 - lat) / pp.CELL_DEG), int((lon + 180) / pp.CELL_DEG)]]

    assert region(30, 31) == "africa"            # Nile
    assert region(-33, 151) == "sahul"           # Sydney
    assert region(-19, 47) == "madagascar_indian_ocean"
    assert region(22, -79) == "caribbean"        # Cuba
    assert region(65, -19) == "greenland_arctic_canada"  # Iceland
    assert region(60, 15) in {"europe_west", "europe_east_steppe"}  # Sweden: nearest box, not empty
    assert region(19, -155) == "pacific_remote"  # Hawaii


def test_coast_and_ecotone_flags():
    land = np.zeros((6, 8))
    land[1:5, 1:7] = 1.0
    c = pp.coastal(land)
    assert c[1, 1] and c[4, 6] and not c[2, 3] and not c[0, 0]
    biome = np.full((6, 8), 4)
    biome[:, 4:] = 8
    biome[0, 0] = 0  # sea
    e = pp.ecotone(biome)
    assert e[2, 3] and e[2, 4] and not e[2, 1] and not e[0, 0]
    biome[2, 1] = 28  # ice is not a second biome
    assert not pp.ecotone(biome)[2, 2]


# --- the model on a synthetic world ----------------------------------------------

class FlatClimate:
    def at(self, bp):
        full = lambda v: np.full((pp.NY, pp.NX), v, dtype=np.float32)  # noqa: E731
        return pp.Climate(full(20.0), full(1500.0), full(12.0))


def flat_land(year):
    one = np.ones((pp.NY, pp.NX))
    return pp.Land(one, one, np.full((pp.NY, pp.NX), 4, dtype=np.int16))


@pytest.fixture(scope="module")
def model():
    hyde = np.zeros((pp.NY, pp.NX))
    hyde[100:200, 200:400] = 4.6e6 / (100 * 200)
    zero = np.zeros((pp.NY, pp.NX), dtype=bool)
    return pp.Model(TABLE, climate=FlatClimate(), hyde=hyde, water=(zero, zero), land_fn=flat_land)


@pytest.mark.parametrize("year", [-100_000, -75_000, -50_000, -30_000, -20_000, -13_000])
def test_each_step_matches_the_curve_before_the_handover(model, year):
    s = model.step(year)
    assert s.hyde_weight == 0
    assert s.people.sum() == pytest.approx(pp.world_totals(year).central, rel=1e-9)
    assert s.totals.central == pytest.approx(s.people.sum(), rel=1e-9)


def test_only_africa_is_populated_at_100_ka(model):
    s = model.step(-100_000)
    ids = [r["id"] for r in TABLE["regions"]]
    africa = np.isin(model.region_index, [ids.index("africa")])
    assert s.people[africa].sum() > 0.97 * s.people.sum()  # the rest is edge blur


def test_people_spread_east_as_the_arrival_dates_pass(model):
    lon, lat = np.meshgrid(pp.grid_lons(), pp.grid_lats())
    east = lon > 100
    assert model.step(-60_000).people[east].sum() > 0       # mainland SE Asia, 70 ka
    americas = (lon < -100) & (lat < 55)
    assert model.step(-40_000).people[americas].sum() == 0
    assert model.step(-14_000).people[americas].sum() > 0  # after the 16 ka arrival


def test_handover_converges_on_hyde_without_a_jump(model):
    hyde = model.hyde
    before, mid = model.step(-12_000), model.step(-11_000)
    after = model.step(pp.HYDE_YEAR)
    assert after.hyde_weight == 1
    assert np.allclose(after.people, hyde)
    assert mid.hyde_weight == pytest.approx(0.5)
    assert mid.people.sum() == pytest.approx(0.5 * pp.world_totals(-11_000).central + 0.5 * hyde.sum())
    # each step is closer to HYDE than the last, in total and cell by cell
    dist = lambda s: np.abs(s.people - hyde).sum()  # noqa: E731
    assert dist(before) > dist(mid) > dist(after) == 0
    # the counter range closes on HYDE's own total
    assert mid.totals.low < mid.totals.central < mid.totals.high
    assert after.totals.low == pytest.approx(hyde.sum())


# --- images --------------------------------------------------------------------

def test_image_round_trip_uses_the_grid_image_encoding(tmp_path):
    rng = np.random.default_rng(1)
    people = np.where(rng.random((pp.NY, pp.NX)) < 0.3, rng.lognormal(2, 2, (pp.NY, pp.NX)), 0.0)
    path = tmp_path / "humans_-50000.webp"
    pp.encode_people(people, path)
    decoded = grid_image.decode(path)
    assert decoded.shape == (pp.NY, pp.NX)
    assert np.all((decoded > 0) == (people > 0))
    assert decoded.sum() == pytest.approx(people.sum(), rel=0.01)


# --- real data (skipped when data/raw is absent) -----------------------------------

REAL = pytest.mark.skipif(
    not (pp.BEYER.exists() and pp.NATURAL_EARTH.exists()
         and (pp.RAW / "krapp2021").exists() and (pp.RAW / "hyde-3.5" / "popd_10000BC.asc").exists()),
    reason="needs Beyer, Krapp, Natural Earth and HYDE under data/raw",
)


@REAL
def test_real_11000_bce_is_close_to_hyde_and_closer_than_12000():
    m = pp.Model(TABLE)
    hyde = m.hyde
    mid, earlier = m.step(-11_000), m.step(-12_000)
    assert mid.people.sum() == pytest.approx(hyde.sum(), rel=0.05)
    l1 = lambda s: np.abs(s.people - hyde).sum() / hyde.sum()  # noqa: E731
    assert l1(mid) < l1(earlier) < 1.5


@REAL
def test_real_totals_and_ice_sea_masks():
    m = pp.Model(TABLE)
    s = m.step(-20_000)  # last glacial maximum
    assert s.people.sum() == pytest.approx(pp.world_totals(-20_000).central, rel=1e-9)
    land = pp.land_at(-20_000)
    assert s.people[land.habitable == 0].sum() == 0  # no people on ice or sea
    lon, lat = np.meshgrid(pp.grid_lons(), pp.grid_lats())
    assert s.people[(lat > 55) & (lon > -10) & (lon < 30)].sum() < 0.01 * s.people.sum()  # N Europe empty
    south_europe = (lat > 35) & (lat < 45) & (lon > -10) & (lon < 30)
    assert s.people[south_europe].sum() > 0  # the southern refugia hold people
