"""Food over time: the claim model, the cited tables, the pooling helpers, and the built lookup.

Everything here runs without downloads. The pipeline test builds a tiny synthetic world in tmp_path
(habitat tiles in the format `habitat_lookup.py` writes) and runs the real `build.build` and
`lookup.plate` over it. The last tests also run on the real habitat tiles when `data/tiles/habitat` exists."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "deploy" / "budgie" / "api"))
import atlas  # noqa: E402
import habitat_lookup as hl  # noqa: E402
from food import animals, build, crops, foragers, lookup  # noqa: E402
from food import regions as R  # noqa: E402
from food.model import ERAS, Basis, Claim, Taxon, cell_centre, cell_origin, claim, era_bp, era_index  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
META = json.loads((ROOT / "footsteps-web/public/habitat_meta.json").read_text())
TAXA = {t.id: t for t in build.TAXA}
REAL_TILES = build.DATA / "tiles" / "habitat"
HAVE_REAL = (REAL_TILES / "use_1900.webp").exists() and (REAL_TILES / "bp_0.webp").exists()


def arrival(tid: str, box: tuple) -> float | None:
    """Arrival of a taxon at the centre of a region box."""
    x0, x1, y0, y1 = box
    return TAXA[tid].arrival_ka((x0 + x1) / 2, (y0 + y1) / 2)


# --- eras and cells agree with the atlas -------------------------------------------------

def test_eras_are_the_atlas_eras_and_the_habitat_years():
    assert ERAS == atlas.ERAS == hl.HYDE_YEARS


def test_a_year_maps_to_the_atlas_era_bucket():
    for y in (-10000, -9999, -2500, -1000, -1, 0, 99, 100, 1850, 1900):
        assert ERAS[era_index(y)] == atlas.era_of(y)


def test_years_before_the_first_era_use_the_first_era():
    assert era_index(-50000) == 0


def test_cells_use_the_atlas_convention():
    for lat, lon in ((33.2, 36.1), (-0.1, -0.1), (90, 180), (-90, -180), (51.5, -0.12)):
        lat0, lon0 = cell_origin(lat, lon)
        assert atlas.cell_of(lat, lon) == f"{lat0},{lon0}"


def test_cell_centre_is_lon_lat():
    assert cell_centre(30, 35) == (37.5, 32.5)


# --- claim and taxon rules -----------------------------------------------------------------

def test_presence_is_the_union_of_claims_and_ignores_order():
    a = claim(8.0, R.NEAR_EAST, Basis.DATED, "x", origin=True)
    b = claim(6.0, R.GREECE_BALKANS, Basis.FRONT, "y")
    t1 = Taxon("t", "T", "crop", "g", "c", (a, b))
    t2 = Taxon("t", "T", "crop", "g", "c", (b, a))
    for lon, lat in ((37.5, 32.5), (22.5, 37.5), (100.0, 10.0)):
        assert t1.arrival_ka(lon, lat) == t2.arrival_ka(lon, lat)
    assert t1.arrival_ka(37.5, 32.5) == 8.0 and t1.arrival_ka(22.5, 37.5) == 6.0 and t1.arrival_ka(100, 10) is None


def test_the_oldest_overlapping_claim_sets_the_arrival():
    big = claim(4.0, (0, 40, 30, 60), Basis.FRONT, "wide, late")
    small = claim(9.0, (10, 20, 40, 50), Basis.DATED, "narrow, early", origin=True)
    t = Taxon("t", "T", "crop", "g", "c", (big, small))
    assert t.arrival_ka(15, 45) == 9.0  # the late wide box does not suppress the early narrow one
    assert t.arrival_ka(30, 45) == 4.0


def test_presence_is_a_snapshot_at_the_era_year():
    t = Taxon("t", "T", "crop", "g", "c", (claim(4.05, R.SW_US, Basis.DATED, "Merrill 2009", origin=True),))
    lon, lat = -107.5, 32.5
    assert not t.present(lon, lat, -3000)  # 4,950 BP: before the 4,050 BP arrival
    assert t.present(lon, lat, -2000)  # 3,950 BP
    assert t.present(lon, lat, 1900)


def test_presence_never_retreats():
    for t in build.TAXA:
        for lon, lat in ((37.5, 32.5), (-97.5, 17.5), (112.5, 32.5), (22.5, -2.5), (2.5, 47.5)):
            seen = [t.present(lon, lat, y) for y in ERAS]
            assert seen == sorted(seen), f"{t.id} leaves a place it had reached"


def test_a_taxon_needs_an_origin_and_no_spread_older_than_it():
    with pytest.raises(ValueError, match="origin"):
        Taxon("t", "T", "crop", "g", "c", (claim(5, R.NEAR_EAST, Basis.FRONT, "s"),))
    with pytest.raises(ValueError, match="older than the oldest origin"):
        Taxon("t", "T", "crop", "g", "c", (claim(5, R.NEAR_EAST, Basis.DATED, "o", origin=True), claim(6, R.GREECE_BALKANS, Basis.FRONT, "s")))


def test_a_second_origin_may_be_older_than_a_spread_but_not_the_reverse():
    t = Taxon("t", "T", "crop", "g", "c", (
        claim(5, R.NEAR_EAST, Basis.DATED, "o1", origin=True),
        claim(9, R.INDUS, Basis.DATED, "o2", origin=True),
        claim(8, R.GREECE_BALKANS, Basis.FRONT, "s"),
    ))
    assert t.origin_ka == 9


def test_bad_boxes_and_dates_are_rejected():
    for box in ((10, 5, 0, 1), (0, 1, 5, 2), (-200, 0, 0, 1), (0, 1, 0, 95), (170, 190, 0, 1)):
        with pytest.raises(ValueError):
            Claim(1.0, (box,), Basis.FRONT, "s")
    with pytest.raises(ValueError):
        Claim(-1.0, (R.NEAR_EAST,), Basis.FRONT, "s")
    with pytest.raises(ValueError):
        Claim(1.0, (), Basis.FRONT, "s")
    with pytest.raises(ValueError):
        Taxon("Bad Id", "T", "crop", "g", "c", (claim(1, R.NEAR_EAST, Basis.DATED, "o", origin=True),))


def test_confidence_follows_basis_and_whether_it_was_checked():
    b = (R.NEAR_EAST,)
    assert Claim(1, b, Basis.DATED, "s", checked=True).confidence == "high"
    assert Claim(1, b, Basis.DATED, "s").confidence == "medium"
    assert Claim(1, b, Basis.HISTORIC, "s").confidence == "high"
    assert Claim(1, b, Basis.FRONT, "s").confidence == "low"
    assert Claim(1, b, Basis.FRONT, "s", checked=True).confidence == "low"  # a checked front is still an estimate


def test_what_a_taxon_needs_from_land_use():
    assert TAXA["wheat"].needs == "crop"
    assert TAXA["sheep"].needs == "farm"
    assert TAXA["dog"].needs == "none"


# --- the tables --------------------------------------------------------------------------------

REQUIRED_CROPS = {"wheat", "barley", "rice", "maize", "millets_ne_asia", "sorghum", "potato", "cassava", "squash",
                  "common_bean", "taro", "banana"}
REQUIRED_ANIMALS = {"dog", "sheep", "goat", "cattle", "pig", "horse", "dromedary", "bactrian", "llama", "chicken"}


def test_the_task_lists_are_covered():
    assert REQUIRED_CROPS <= {t.id for t in crops.CROPS}
    assert REQUIRED_ANIMALS <= {t.id for t in animals.ANIMALS}
    assert all(t.kind == "crop" for t in crops.CROPS) and all(t.kind == "animal" for t in animals.ANIMALS)


def test_ids_are_unique():
    ids = [t.id for t in build.TAXA]
    assert len(ids) == len(set(ids))


def test_every_taxon_and_claim_is_cited():
    for t in build.TAXA:
        assert t.centre.strip(), t.id
        for c in t.claims:
            assert len(c.source.strip()) > 10, (t.id, c.ka)
            assert c.confidence in ("high", "medium", "low")


def test_independent_domestication_centres_are_dated_finds_not_estimates():
    for t in build.TAXA:
        for c in t.claims:
            if c.kind == "origin":
                assert c.basis is Basis.DATED, t.id


def test_historic_claims_are_written_record_dates():
    for t in build.TAXA:
        for c in t.claims:
            if c.basis is Basis.HISTORIC:
                assert c.ka <= 1.1, f"{t.id}: a written-record arrival older than ~850 CE ({c.ka})"


def test_no_domesticate_predates_its_first_dated_origin_anywhere():
    for t in build.TAXA:
        assert all(c.ka <= t.origin_ka for c in t.claims), t.id
        assert t.origin_ka <= 15, t.id  # the oldest is the dog


def test_old_world_arrival_fronts_run_in_the_right_order_across_europe():
    chain = [R.ANATOLIA_C, R.GREECE_BALKANS, R.W_MEDITERRANEAN, R.CENTRAL_EUROPE, R.BRITAIN_IRELAND, R.S_SCANDINAVIA, R.BALTIC_E]
    for tid in ("wheat", "barley"):
        ks = [arrival(tid, b) for b in chain]
        assert ks == sorted(ks, reverse=True), (tid, ks)
        assert 4.0 <= ks[-1] and ks[0] <= 10.5  # "farming into Europe 7-4 ka": the Baltic edge is ~4.8, the Balkans 8.5


def test_farming_enters_europe_between_9_and_4_8_ka():
    for tid in ("wheat", "barley"):
        assert 8.0 <= arrival(tid, R.GREECE_BALKANS) <= 9.5
        assert 4.0 <= arrival(tid, R.BALTIC_E) <= 6.0
        assert arrival(tid, R.CENTRAL_EUROPE) == 7.5


def test_maize_moves_north_and_has_not_reached_the_old_world_before_1492():
    chain = [R.BALSAS, R.OAXACA, R.SW_US, R.EASTERN_NA, R.NE_WOODLANDS]
    ks = [arrival("maize", b) for b in chain]
    assert ks == sorted(ks, reverse=True) and ks[0] == 8.7 and ks[-1] <= 1.5
    for b in (R.EUROPE_ALL, R.NORTH_CHINA, R.AFRICA_ALL[0], R.SE_ASIA_MAINLAND, R.SOUTH_INDIA):
        assert arrival("maize", b) <= 0.5, b


NEW_WORLD = ("maize", "potato", "cassava", "common_bean", "squash", "sweet_potato", "turkey", "guinea_pig", "llama")


def test_new_world_domesticates_are_absent_from_the_old_world_before_the_columbian_exchange():
    for tid in NEW_WORLD:
        for c in TAXA[tid].claims:
            for x0, x1, y0, y1 in c.boxes:
                old_world = x0 >= -20 and x1 <= 180 and not (y1 < 0 and x0 >= 130)  # Europe, Africa, Asia; not Pacific islands
                if old_world and tid != "sweet_potato":
                    assert c.ka <= 0.5 and c.basis is Basis.HISTORIC, (tid, c.ka, (x0, x1, y0, y1))


def test_horse_is_absent_from_the_americas_before_1493():
    americas = [(-100, -90, 15, 20), (-75, -70, -15, -10), (-100, -95, 35, 40), (-60, -55, -35, -30)]
    for lon0, lon1, lat0, lat1 in americas:
        a = TAXA["horse"].arrival_ka((lon0 + lon1) / 2, (lat0 + lat1) / 2)
        assert a is not None and a <= 0.5


def test_domestic_horse_dates_follow_librado_2021():
    assert TAXA["horse"].arrival_ka(*cell_centre(45, 40)) == 4.2  # Don-Volga: 2200 BCE
    assert arrival("horse", R.NORTH_CHINA) == 3.3


def test_the_bantu_package_runs_from_cameroon_to_the_cape():
    chain = [R.SAHEL_E, R.GREAT_LAKES, R.EAST_COAST, R.ZAMBEZI, R.SOUTH_AFRICA]
    ks = [arrival("sorghum", b) for b in chain]
    assert ks[0] > ks[1] >= ks[2] >= ks[3] > ks[4], ks
    assert ks[-1] == 1.65  # ~300 CE


def test_the_austronesian_chain_runs_from_island_asia_to_new_zealand():
    chain = [R.ISLAND_SEA, R.MELANESIA_W, R.FIJI_SAMOA[0], R.POLYNESIA_E, R.HAWAII]
    ks = [arrival("chicken", b) for b in chain]
    assert ks == sorted(ks, reverse=True) and ks[-1] < 1.0, ks
    assert arrival("dog", R.NEW_ZEALAND) < 1.0  # Polynesian settlement of New Zealand: ~1300 CE
    assert TAXA["pig"].arrival_ka(*cell_centre(-45, 170)) is None  # no pig reached New Zealand before Cook (1769 CE)


def test_the_chicken_is_not_older_than_the_2022_redating():
    assert TAXA["chicken"].origin_ka <= 3.6
    assert arrival("chicken", R.EUROPE_ALL) == 2.8


def test_dingo_reaches_australia_about_3500_years_ago():
    assert TAXA["dog"].arrival_ka(*cell_centre(-25, 135)) == 3.5


# --- forager table ------------------------------------------------------------------------------------

def test_every_krapp_biome_has_a_forager_entry_and_only_those():
    assert set(foragers.BIOME_DIETS) == {int(k) for k in META["biomes"]}


def test_ice_and_barren_ground_carry_no_plant_food():
    assert foragers.BIOME_DIETS[28].plant_weight == "none" and not foragers.BIOME_DIETS[28].animals
    assert foragers.BIOME_DIETS[27].plant_weight == "none"


def test_plant_weight_falls_toward_the_pole_as_binford_found():
    w = {"none": 0, "low": 1, "medium": 2, "high": 3}
    rainforest = w[foragers.BIOME_DIETS[1].plant_weight]
    taiga = w[foragers.BIOME_DIETS[10].plant_weight]
    tundra = w[foragers.BIOME_DIETS[24].plant_weight]
    assert rainforest > taiga >= tundra


def test_cold_biomes_list_animals_and_fish_first():
    assert "caribou" in " ".join(foragers.BIOME_DIETS[24].animals + foragers.BIOME_DIETS[10].animals)
    assert "fish" in " ".join(foragers.COASTAL.animals)


# --- pooling helpers (synthetic arrays) ---------------------------------------------------

def test_blocks_groups_pixels_by_five_degree_cell_north_first():
    a = np.zeros((360, 720), dtype=np.uint8)
    a[0, 0] = 7  # top-left pixel: 90N-89.5N, 180W
    a[359, 719] = 9  # bottom-right
    b = build.blocks(a)
    assert b.shape == (36, 72, 100)
    assert b[0, 0].max() == 7 and b[35, 71].max() == 9 and b[0, 1].max() == 0


def test_blocks_rejects_the_wrong_size():
    with pytest.raises(ValueError):
        build.blocks(np.zeros((180, 360), dtype=np.uint8))


def test_use_levels_none_trace_some_heavy():
    land = np.ones((1, 1, 100), dtype=bool)
    z = np.zeros((1, 1, 100))
    assert build.use_levels(z, land)[0, 0] == 0
    one = z.copy(); one[0, 0, 0] = 1  # a single byte level in one pixel: 0.004% of the cell
    assert build.use_levels(one, land)[0, 0] == 1
    some = np.full((1, 1, 100), 0.05 * 255)
    assert build.use_levels(some, land)[0, 0] == 2
    heavy = np.full((1, 1, 100), 0.5 * 255)
    assert build.use_levels(heavy, land)[0, 0] == 3


def test_use_levels_ignore_sea_pixels():
    land = np.zeros((1, 1, 100), dtype=bool); land[0, 0, :10] = True
    share = np.zeros((1, 1, 100)); share[0, 0, :10] = 0.5 * 255
    assert build.use_levels(share, land)[0, 0] == 3  # half of the LAND is cropland, not 5% of the cell
    share_sea = np.zeros((1, 1, 100)); share_sea[0, 0, 50:] = 255
    assert build.use_levels(share_sea, land)[0, 0] == 0


def test_modal_biome_prefers_land_over_ice_over_sea():
    px = np.zeros((1, 3, 100), dtype=np.int16)
    px[0, 0, :60] = 4; px[0, 0, 60:80] = 21  # forest beats desert; the rest is sea
    px[0, 1, :50] = 28  # only ice and sea
    # px[0, 2] stays all sea
    out = build.modal_biome(px)
    assert list(out[0]) == [4, 28, 0]


def test_a_cell_is_coastal_only_with_both_land_and_sea():
    px = np.zeros((1, 3, 100), dtype=np.int16)
    px[0, 0, :50] = 4  # half land, half sea
    px[0, 1, :] = 4  # all land
    out = build.coastal(px)
    assert list(out[0]) == [1, 0, 0]


def test_first_era_matches_the_snapshot_rule():
    assert build.first_era(None) is None
    assert build.first_era(10.5) == ERAS.index(-8000)  # 9,950 BP <= 10,500 BP, but -9000 is 10,950 BP > 10,500
    assert build.first_era(11.95) == 0  # exactly the first era
    assert build.first_era(0.0) is None  # arrives after 1900 CE... (50 BP) not before
    assert build.first_era(0.05) == len(ERAS) - 1
    for t in build.TAXA:
        for lon, lat in ((37.5, 32.5), (112.5, 32.5)):
            a = t.arrival_ka(lon, lat)
            i = build.first_era(a)
            for e, y in enumerate(ERAS):
                assert t.present(lon, lat, y) == (i is not None and e >= i)


# --- a synthetic world through the real pipeline ------------------------------------------------

def _write_tiles(root: Path) -> None:
    """720x360 habitat tiles: sea everywhere except a cell at 30-35N, 35-40E (Levant) that is forest with
    cropland from -5000, a half-land cell at 40-45N 5-10E (coast), and a land-ice cell at 70-75N 20-25E."""
    hab = root / "tiles" / "habitat"
    hab.mkdir(parents=True)

    def px(lat0: int, lon0: int) -> tuple[slice, slice]:
        r = int((90 - (lat0 + 5)) / 0.5)
        c = int((lon0 + 180) / 0.5)
        return slice(r, r + 10), slice(c, c + 10)

    for year in ERAS:
        ka = hl.year_to_ka(year)
        bp = np.zeros((360, 720, 3), dtype=np.uint8)
        bp[px(30, 35)] = (4, 0, 0)
        half = px(40, 5)
        bp[half[0], half[1]] = (0, 0, 0)
        bp[half[0].start:half[0].start + 5, half[1]] = (20, 0, 0)
        bp[px(70, 20)] = (28, 0, 0)
        Image.fromarray(bp).save(hab / f"bp_{ka}.webp", "WEBP", lossless=True)
        use = np.zeros((360, 720, 3), dtype=np.uint8)
        if year >= -5000:
            use[px(30, 35)] = (100, 60, 0)  # 39% cropland, 24% grazing
        Image.fromarray(use).save(hab / f"use_{year}.webp", "WEBP", lossless=True)


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> dict:
    root = tmp_path_factory.mktemp("data")
    _write_tiles(root)
    return build.build(root)


def test_the_pipeline_keeps_only_land_cells(world):
    assert set(world["cells"]) == {"30,35", "40,5", "70,20"}


def test_pipeline_land_use_biome_and_coast_strings(world):
    c = world["cells"]["30,35"]
    assert len(c["crop"]) == len(ERAS) == len(c["biome"]) == len(c["coast"])
    assert c["crop"][:ERAS.index(-5000)] == "0" * ERAS.index(-5000)
    assert set(c["crop"][ERAS.index(-5000):]) == {"3"} and set(c["graze"][ERAS.index(-5000):]) == {"3"}
    assert set(c["biome"]) == {"4"} and set(c["coast"]) == {"0"}
    edge = world["cells"]["40,5"]
    assert set(edge["coast"]) == {"1"} and set(edge["biome"]) == {"k"}  # biome 20 -> base-36 'k'
    assert set(world["cells"]["70,20"]["biome"]) == {"s"}  # 28 = ice


def test_pipeline_keeps_domesticate_arrivals_monotone_and_complete(world):
    first = world["cells"]["30,35"]["first"]
    assert first["wheat"] == ERAS.index(-8000) and first["dog"] == 0
    assert "maize" not in first
    assert "sorghum" not in first and "chicken" in first
    assert first["horse"] == ERAS.index(-1000)  # 3.8 ka: -2000 is 3,950 BP, still before the arrival; -1000 is 2,950 BP


def test_plate_separates_available_from_grown(world):
    before = lookup.plate(world, 33.0, 36.0, -7000)  # wheat has arrived; HYDE shows no farming yet
    assert "wheat" in before["available"] and "wheat" not in before["grown"]
    assert "dog" in before["grown"]  # companions need no farmland
    assert before["land_use"] == {"cropland": "none", "grazing": "none"}
    after = lookup.plate(world, 33.0, 36.0, -4000)
    assert {"wheat", "barley", "sheep", "goat"} <= set(after["grown"])
    assert after["land_use"] == {"cropland": "heavy", "grazing": "heavy"}


def test_plate_uses_the_era_bucket_and_reports_it(world):
    p = lookup.plate(world, 33.0, 36.0, -4500)
    assert p["era"] == -5000 and p["cell"] == {"south": 30, "west": 35, "size_deg": 5}
    assert lookup.plate(world, 33.0, 36.0, -50000)["era"] == -10000


def test_plate_forager_staples_come_from_the_biome_and_coast(world):
    f = lookup.plate(world, 33.0, 36.0, -9000)["forager"]
    assert f["biome"] == 4 and f["biome_name"] == "Temperate deciduous forest" and "coastal" not in f
    assert "acorns" in " ".join(f["plants"])
    coastal = lookup.plate(world, 42.0, 7.0, 0)["forager"]
    assert coastal["biome"] == 20 and "fish" in " ".join(coastal["coastal"]["animals"])


def test_plate_on_the_sea_and_on_ice(world):
    sea = lookup.plate(world, 0.0, -150.0, 0)
    assert sea["land"] is False and sea["available"] == [] and sea["forager"] is None
    ice = lookup.plate(world, 72.0, 22.0, 0)
    assert ice["land"] is True and ice["forager"]["plant_weight"] == "none"


def test_plate_confidence_is_the_confidence_of_the_arrival_claim(world):
    p = lookup.plate(world, 33.0, 36.0, 0)
    assert p["confidence"]["wheat"] == "medium"  # a dated but recalled origin


def test_plate_rejects_bad_coordinates(world):
    with pytest.raises(ValueError):
        lookup.plate(world, 91, 0, 0)


def test_built_file_round_trips_through_gzip(world, tmp_path):
    path = build.write(tmp_path, world)
    again = lookup.load(path)
    assert again["cells"].keys() == world["cells"].keys() and again["eras"] == ERAS
    assert (tmp_path / "claims.csv").read_text().count("\n") == 1 + sum(len(t.claims) for t in build.TAXA)


def test_the_export_carries_every_claim_with_its_source(world):
    by_id = {t["id"]: t for t in world["taxa"]}
    assert set(by_id) == set(TAXA)
    for t in TAXA.values():
        assert len(by_id[t.id]["claims"]) == len(t.claims)
        assert all(c["source"] and c["confidence"] for c in by_id[t.id]["claims"])


# --- real habitat tiles --------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def real() -> dict:
    return build.build(build.DATA)


@pytest.mark.skipif(not HAVE_REAL, reason="needs data/tiles/habitat from habitat_lookup.py")
def test_real_tiles_build_a_small_file(real, tmp_path):
    path = build.write(tmp_path, real)
    assert path.stat().st_size < 120_000
    assert 1000 < len(real["cells"]) < 1800


@pytest.mark.skipif(not HAVE_REAL, reason="needs data/tiles/habitat from habitat_lookup.py")
def test_real_places_and_years(real):
    p = lookup.plate
    assert "wheat" in p(real, 33, 36, -7000)["available"]
    assert "wheat" not in p(real, 52, -1, -7000)["available"]
    assert "wheat" in p(real, 52, -1, -2000)["available"]
    assert "maize" not in p(real, 47, 8, 1000)["available"] and "maize" in p(real, 47, 8, 1700)["available"]
    assert "horse" not in p(real, 19, -99, 1400)["available"] and "horse" in p(real, 19, -99, 1600)["available"]
    assert {"maize", "potato", "llama"} <= set(p(real, -13, -72, 1400)["grown"])
    assert "rice" in p(real, 30, 115, -3000)["available"]


@pytest.mark.skipif(not HAVE_REAL, reason="needs data/tiles/habitat from habitat_lookup.py")
def test_real_hyde_cropland_is_mostly_covered_by_a_crop_claim_from_the_year_zero(real):
    kinds = {t["id"]: t["kind"] for t in real["taxa"]}
    e = ERAS.index(0)
    farmed = [c for c in real["cells"].values() if int(c["crop"][e]) > 0]
    bare = [c for c in farmed if not any(f <= e and kinds[t] == "crop" for t, f in c["first"].items())]
    assert len(bare) / len(farmed) < 0.10, f"{len(bare)} of {len(farmed)} HYDE-cropland cells have no crop claimed"
