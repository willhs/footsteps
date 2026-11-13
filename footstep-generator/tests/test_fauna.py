"""Fauna ingest: the timing logic (pure), the loss table, role/selection rules, and the built file.

The timing tests need no downloads. Table-integrity and built-file tests skip when data/raw/phylacine
or data/fauna is absent (run `fauna/phylacine.py fetch` and `build` first)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import habitat_lookup as hl  # noqa: E402
from fauna import losses as lo  # noqa: E402
from fauna import phylacine as ph  # noqa: E402
from fauna import taxa  # noqa: E402
from fauna import timing as tm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
HAVE_RAW = (ph.REPO / "Data" / "Traits" / "Trait_data.csv").exists()
BUILT = ph.OUT / "fauna.json.gz"
HAVE_BUILT = BUILT.exists()


# --- the presence rule ---------------------------------------------------------------

def test_a_species_is_shown_through_the_step_holding_its_last_record():
    assert tm.is_present(4.0, 4) and not tm.is_present(4.0, 3)
    assert tm.is_present(3.7, 4) and not tm.is_present(3.7, 3)  # last record in the 4 ka step's span
    assert tm.is_present(12.5, 12) and not tm.is_present(12.5, 11)


def test_no_loss_means_present_at_every_step():
    assert all(tm.is_present(None, k) for k in range(tm.MAX_KA + 1))


def test_younger_last_record_never_shows_earlier():
    """Monotone: a species present at step k is present at every older step."""
    for last in (0.0, 0.3, 1.0, 4.4, 10.5, 27.8, 101.0):
        shown = [tm.is_present(last, k) for k in range(tm.MAX_KA + 1)]
        assert shown == sorted(shown)


def test_loss_older_than_the_series_is_never_shown():
    assert tm.first_present_step(tm.NEVER_KA) > tm.MAX_KA
    assert tm.first_present_step(104.0) > tm.MAX_KA


def test_historic_loss_in_the_last_step_still_shows_at_step_zero():
    assert tm.is_present(tm.year_to_last_ka(1627), 0)  # aurochs, last cow 1627
    assert tm.year_to_last_ka(1938) == 0.0  # after the app's last year: alive through it
    assert tm.year_to_last_ka(1800) == pytest.approx(0.15)


def test_year_to_ka_matches_the_habitat_lookup_steps():
    for y in (-100_000, -80_000, -20_000, -10_000, -500, 0, 1000, 1500, 1900, 2500, -500_000):
        assert tm.year_to_ka(y) == hl.year_to_ka(y)
    assert tm.MAX_KA == hl.MAX_KA and tm.STEP_YEARS == hl.STEP_YEARS


# --- which loss applies where ----------------------------------------------------------

def test_first_matching_box_wins_and_a_catch_all_goes_last():
    small = (10.0, 20.0, 10.0, 20.0)
    ls = (tm.Loss(3.0, tm.Basis.DATED, "refuge", (small,)), tm.Loss(10.0, tm.Basis.DATED, "everywhere"))
    assert tm.resolve(ls, "EP", 15, 15)[0] == 3.0
    assert tm.resolve(ls, "EP", 50, 50)[0] == 10.0


def test_extinct_without_a_loss_takes_the_regional_default():
    assert tm.resolve((), "EP", 40, -100)[0] == tm.REGIONAL_DEFAULT["north_america"][0]  # Kansas
    assert tm.resolve((), "EP", -25, 135)[0] == tm.REGIONAL_DEFAULT["sahul"][0]
    assert tm.resolve((), "EP", -10, -60)[0] == tm.REGIONAL_DEFAULT["south_america"][0]
    assert tm.resolve((), "EP", 0, 25)[0] == tm.REGIONAL_DEFAULT["africa"][0]
    assert tm.resolve((), "EP", 50, 30)[0] == tm.REGIONAL_DEFAULT["eurasia"][0]
    ka, basis, _ = tm.resolve((), "EP", 40, -100)
    assert basis is tm.Basis.REGIONAL


def test_living_species_without_a_loss_are_never_lost():
    assert tm.resolve((), "LC", 0, 25) == (None, None, None)


def test_a_loss_elsewhere_does_not_silence_the_default_for_an_extinct_species():
    box = ((0.0, 1.0, 0.0, 1.0),)
    ls = (tm.Loss(5.0, tm.Basis.DATED, "island", box),)
    assert tm.resolve(ls, "EP", 40, -100)[0] == tm.REGIONAL_DEFAULT["north_america"][0]


def test_region_of_picks_the_continent():
    assert tm.region_of(65, 100) == "eurasia"
    assert tm.region_of(-33, 143) == "sahul"
    assert tm.region_of(-2, 35) == "africa"
    assert tm.region_of(41, -100) == "north_america"
    assert tm.region_of(-35, -60) == "south_america"


def test_loss_rejects_nonsense():
    with pytest.raises(ValueError):
        tm.Loss(-1.0, tm.Basis.DATED, "x")
    with pytest.raises(ValueError):
        tm.Loss(1.0, tm.Basis.DATED, "x", None, refugium=True)


# --- the cited table ---------------------------------------------------------------------

def last_ka(name: str, lat: float, lon: float, status: str = "EP") -> float | None:
    return tm.resolve(lo.losses_for(name), status, lat, lon)[0]


def test_mammoth_dates_by_place():
    assert last_ka("Mammuthus_primigenius", 71.0, 179.5) == 4.0  # Wrangel
    assert last_ka("Mammuthus_primigenius", 71.0, -178.5) == 4.0  # Wrangel, west of the antimeridian
    assert last_ka("Mammuthus_primigenius", 57.0, -170.0) == 5.6  # St Paul
    assert last_ka("Mammuthus_primigenius", 65.0, 100.0) == 10.5  # mainland Siberia
    assert tm.is_present(10.5, 20) and not tm.is_present(10.5, 4) and not tm.is_present(10.5, 9)


def test_horses_leave_north_america_but_not_eurasia():
    ka = last_ka("Equus_ferus", 41.0, -100.0, "EN")
    assert ka is not None and ka >= 10
    assert not tm.is_present(ka, 9) and tm.is_present(ka, 14)
    assert last_ka("Equus_ferus", 50.0, 70.0, "EN") is None  # Kazakh steppe: still there
    assert tm.first_present_step(last_ka("Equus_ferus", -35.0, -60.0, "EN")) > tm.MAX_KA  # never in S America


def test_aurochs_gone_early_in_britain_late_in_poland():
    assert last_ka("Bos_primigenius", 52, -1, "EX") == 3.5
    assert last_ka("Bos_primigenius", 52, 20, "EX") == pytest.approx(0.323)


def test_every_table_entry_ends_with_a_catch_all_or_is_boxed_on_purpose():
    """A species whose losses are all boxed falls back to its default (EP) or stays present (living):
    allowed, but a catch-all must never be followed by another entry (it would be unreachable)."""
    for name, ls in lo.LOSSES.items():
        for i, loss in enumerate(ls):
            if loss.boxes is None:
                assert i == len(ls) - 1, f"{name}: entry after a catch-all is unreachable"


def test_refugia_have_boxes_and_the_wrangel_box_straddles_the_antimeridian():
    refs = [l for ls in lo.LOSSES.values() for l in ls if l.refugium]
    assert refs and all(l.boxes for l in refs)
    cells = ph.refuge_cells(lo.WRANGEL)
    lons = {ph.cell_lon(c % ph.GW) for c in cells}
    assert any(x > 0 for x in lons) and any(x < 0 for x in lons)


# --- grid + selection + roles -------------------------------------------------------------

def test_cell_ids_round_trip_and_are_north_up():
    assert ph.cell_id(89.5, -179.5) == 0
    assert ph.cell_id(-89.5, 179.5) == ph.GH * ph.GW - 1
    cid = ph.cell_id(65.2, 100.7)
    assert (ph.cell_lat(cid // ph.GW), ph.cell_lon(cid % ph.GW)) == (65.5, 100.5)  # the 65..66N, 100..101E cell


def traits(**kw) -> taxa.Traits:
    base = dict(binomial="Test_species", order="Artiodactyla", family="Bovidae", mass_kg=100.0, status="LC",
                terrestrial=True, marine=False, plant_pct=100, vertebrate_pct=0)
    return taxa.Traits(**{**base, **kw})


def test_selection_keeps_big_land_mammals_only():
    assert taxa.keep(traits())
    assert not taxa.keep(traits(mass_kg=43.9))
    assert taxa.keep(traits(mass_kg=20, binomial="Canis_lupus"))  # key predator below the line
    assert not taxa.keep(traits(order="Primates", family="Hominidae"))
    assert not taxa.keep(traits(binomial="Homo_sapiens", family="Hominidae"))
    assert not taxa.keep(traits(family="Phocidae", order="Carnivora"))
    assert not taxa.keep(traits(marine=True, binomial="Odobenus_rosmarus"))
    assert taxa.keep(traits(marine=True, binomial="Hippopotamus_amphibius"))
    assert not taxa.keep(traits(binomial="Camelus_dromedarius", status="EP"))


def test_roles():
    assert taxa.role_of(traits(vertebrate_pct=100, plant_pct=0, family="Felidae")) == "predator"
    assert taxa.role_of(traits(family="Ursidae", binomial="Ursus_arctos", plant_pct=85, vertebrate_pct=9)) == "predator"
    assert taxa.role_of(traits(family="Ursidae", binomial="Ailuropoda_melanoleuca")) == "prey"
    assert taxa.role_of(traits(family="Bovidae", binomial="Bison_bison")) == "herd"
    assert taxa.role_of(traits(family="Equidae", binomial="Equus_ferus")) == "herd"
    assert taxa.role_of(traits(family="Elephantidae", binomial="Mammuthus_primigenius")) == "herd"
    assert taxa.role_of(traits(family="Bovidae", binomial="Capricornis_thar")) == "prey"
    assert taxa.role_of(traits(family="Rhinocerotidae", binomial="Coelodonta_antiquitatis")) == "prey"
    assert taxa.role_of(traits(family="Cervidae", binomial="Rangifer_tarandus")) == "herd"


@pytest.mark.skipif(not HAVE_RAW, reason="PHYLACINE not fetched")
def test_every_kept_species_has_a_name_and_a_way_to_be_dated():
    kept = [t for t in ph.read_traits() if taxa.keep(t) and t.binomial not in lo.EXCLUDED_NO_TIMING]
    assert 300 < len(kept) < 400
    unnamed = [t.binomial for t in kept if taxa.common_name(t.binomial) == t.binomial.replace("_", " ")]
    assert not unnamed, unnamed
    # an island endemic has no continental default worth using: it needs its own entry
    islands = [t.binomial for t in kept if t.status == "EP" and t.binomial not in lo.LOSSES and t.family in
               ("Palaeopropithecidae", "Megaladapidae")]
    assert not islands
    for name in lo.LOSSES:
        assert any(t.binomial == name for t in ph.read_traits()), f"{name} is not a PHYLACINE species"


# --- the built file ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fauna() -> "ph.Fauna":
    return ph.Fauna.load(BUILT)


@pytest.mark.skipif(not HAVE_BUILT, reason="data/fauna not built")
def test_built_mammoths(fauna):
    mam = "Mammuthus primigenius"
    assert mam in fauna.named(65, 100, -20_000)  # Siberia at 20 ka BP-ish (22 ka)
    assert mam in fauna.named(65, 100, -10_000)
    assert mam not in fauna.named(65, 100, -4_000)  # 6 ka
    assert mam in fauna.named(71, -178.5, -2_050)  # Wrangel at 4 ka
    assert mam not in fauna.named(71, -178.5, -1_000)
    mainland = [cid for cid, v in fauna.cells.items() for i in range(0, len(v), 2)
                if fauna.species[v[i]]["name"] == mam and v[i + 1] <= 3]
    assert mainland == []  # nothing at 3 ka or younger, Wrangel included


@pytest.mark.skipif(not HAVE_BUILT, reason="data/fauna not built")
def test_built_horses_in_north_america(fauna):
    for lat, lon in ((41, -100), (65, -150), (20, -100)):
        horses = lambda y: {n for n in fauna.named(lat, lon, y) if n.startswith("Equus")}  # noqa: E731
        assert horses(-20_000), (lat, lon)
        assert not horses(-8_000), (lat, lon)  # about 10 ka BP: gone
        assert not horses(0)
    assert "Equus ferus" in fauna.named(50, 70, 0)  # Eurasian steppe keeps them


@pytest.mark.skipif(not HAVE_BUILT, reason="data/fauna not built")
def test_built_ice_and_australia(fauna):
    assert fauna.at(65, 20, -20_000) == []  # Fennoscandian ice sheet
    assert fauna.at(65, 20, -5_000)
    assert "Diprotodon optatum" in fauna.named(-33, 143, -50_000)
    assert "Diprotodon optatum" not in fauna.named(-33, 143, -30_000)
    assert not any(n.startswith(("Mammuthus", "Diprotodon")) for n in fauna.named(-2.3, 34.8, -20_000))


@pytest.mark.skipif(not HAVE_BUILT, reason="data/fauna not built")
def test_built_file_is_small_and_species_have_roles(fauna):
    assert BUILT.stat().st_size < 1_000_000
    assert {s["role"] for s in fauna.species} == {"prey", "predator", "herd"}
    assert all(s["kg"] >= 10 and s["common"] for s in fauna.species)
