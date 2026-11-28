"""Every past-water scenario (`?pastwater=1`): the committed manifests and patches checked on their own. Mega-Chad's geometry has
its own tests (test_past_water.py); this file covers what all scenarios share (dates, ids, regions, files) and the European LGM and
Mesopotamian scenarios' content. Tests that need the downloaded sources skip without them (data/pastwater_src, git-ignored)."""
import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import past_water as pw
import past_water_lgm as lgm
import past_water_mesopotamia as meso
import past_water_texcoco as tex
import water_distance as wd

STATIC = wd.OUT / "water_distance.webp"
REACH = 3  # cells the ranker adds round an epoch's patches (siteRanking.ts)


def pixel(lat: float, lon: float) -> tuple[int, int]:
    """(row, col) of the 2.5' world pixel holding a point."""
    return int((90 - lat) / pw.PIXEL_DEG), int((lon + 180) / pw.PIXEL_DEG)


def wet_at(epoch: dict, lat: float, lon: float) -> bool:
    patch, wet, _ = pw.load_mask(epoch)
    r, c = pixel(lat, lon)
    r, c = r - patch.y0, c - patch.x0
    return bool(0 <= r < patch.height and 0 <= c < patch.width and wet[r, c])


def epoch(scenario: str, epoch_id: int) -> dict:
    return next(e for e in pw.load_manifest(scenario)["epochs"] if e["id"] == epoch_id)


# --- shared --------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("name", pw.SCENARIOS)
def test_each_manifest_states_datum_dates_licence_uncertainty_and_what_outside_means(name):
    m = pw.load_manifest(name)
    assert m["version"] == pw.SCHEMA_VERSION and m["id"] == name
    assert m["datum"] and m["uncertainty"] and m["sources"] and m["evidence"]
    assert "not the same as" in m["outside_epochs"] and "dry" in m["outside_epochs"]
    for e in m["epochs"]:
        assert e["from_year"] == 1950 - e["from_bp"] and e["to_year"] == 1950 - e["to_bp"] and e["from_year"] < e["to_year"]
        assert e["level"]["kind"] in ("plane", "pixel", "sea") and e["paint"] in ("lake", "sea") and e["water"]
    if name not in ("mega_chad", "texcoco"):  # DEM-derived, no figure or vectors to license
        assert "CC" in m["licence"]


@pytest.mark.parametrize("name", pw.SCENARIOS)
def test_committed_files_match_their_manifest(name):
    for e in pw.load_manifest(name)["epochs"]:
        for key in ("mask", "distance"):
            if e[key]:
                path = pw.OUT / e[key]["file"]
                assert hashlib.sha256(path.read_bytes()).hexdigest() == e[key]["sha256"]
                assert path.stat().st_size == e[key]["bytes"]


def test_epoch_ids_are_unique_across_scenarios_and_fit_a_byte():
    ids = [e["id"] for m in pw.manifests() for e in m["epochs"]]
    assert len(ids) == len(set(ids)) and 0 not in ids and max(ids) < 256


def test_epochs_that_hold_at_the_same_time_never_reach_the_same_cell():
    """So a cell sees at most one epoch at any year: the ranker's cache keeps one epoch byte per cell."""
    epochs = [e for m in pw.manifests() for e in m["epochs"]]
    for i, a in enumerate(epochs):
        for b in epochs[i + 1:]:
            if a["from_year"] <= b["to_year"] and b["from_year"] <= a["to_year"]:
                ra, rb = pw.epoch_region(a), pw.epoch_region(b)
                apart = ra[1] + REACH <= rb[0] - REACH or rb[1] + REACH <= ra[0] - REACH or ra[3] + REACH <= rb[2] - REACH or rb[3] + REACH <= ra[2] - REACH
                assert apart, (a["id"], b["id"])


@pytest.mark.parametrize("year,ids", [
    (-26000, []), (-24550, [2]), (-20000, [2]), (-17050, [2]), (-17049, []), (-12000, []),
    (-6051, [1]), (-6050, [1, 3]), (-6000, [1, 3]), (-4551, [1, 3]), (-4550, [1, 4]), (-4000, [1, 4]), (-3550, [1, 4]),
    (-3549, [1]), (-3050, [1]), (-3049, []), (-2551, []), (-2550, [5]), (-2051, [5]), (-2050, [5, 6]), (-1550, [5, 6]), (-1549, [6]),
    (0, [6]), (1600, [6]), (1601, []), (1900, []),
])
def test_active_epochs_by_year(year, ids):
    assert [e["id"] for _, e in pw.active_epochs(year)] == ids


# --- European LGM ----------------------------------------------------------------------------------------------------------

def test_lgm_is_one_snapshot_26_5_to_19_ka_bp():
    (e,) = pw.load_manifest(lgm.NAME)["epochs"]
    assert (e["from_year"], e["to_year"]) == (-24550, -17050)
    assert e["level"]["kind"] == "pixel" and e["paint"] == "lake"


def test_lgm_lakes_are_wet_and_the_black_sea_is_not_modelled():
    e = epoch(lgm.NAME, 2)
    assert wet_at(e, 47.0, 48.0)  # the north Caspian lowland, inside the LGM Caspian outline (land today)
    assert wet_at(e, 45.0, 60.0)  # the Aral outline
    assert not wet_at(e, 43.0, 34.0)  # the Black Sea: no polygon in the source
    assert not wet_at(e, 45.0, 10.0)  # the Po plain is land with a river, not a lake


def test_lgm_levels_are_per_lake_and_carried_in_the_mask():
    m = pw.load_manifest(lgm.NAME)
    patch, wet, level = pw.load_mask(m["epochs"][0])
    assert level is not None and (level[~wet] == -pw.LEVEL_OFFSET).all()
    caspian = next(r for r in m["lakes"] if r["name"] == "Caspian Sea")
    r, c = pixel(47.0, 48.0)
    assert level[r - patch.y0, c - patch.x0] == caspian["level_m"]
    assert -100 < caspian["level_m"] < 100


def test_lgm_fresh_water_never_makes_water_farther_and_skips_the_saline_lakes():
    e = epoch(lgm.NAME, 2)
    dpatch, codes = pw.load_distance(e)
    base = pw.read_gray(STATIC)
    sub = base[dpatch.y0:dpatch.y0 + dpatch.height, dpatch.x0:dpatch.x0 + dpatch.width]
    assert (codes <= sub).all() and int((codes != sub).sum()) == e["distance"]["cells_changed"]
    # the middle of the South Caspian: brackish then and now, so no nearer fresh water than the static image says
    r, c = int((90 - 41.0) / wd.CELL_DEG), int((51.0 + 180) / wd.CELL_DEG)
    assert codes[r - dpatch.y0, c - dpatch.x0] == base[r, c]


@pytest.fixture(scope="module")
def lgm_source():
    if not all((lgm.SRC / name).exists() for name in lgm.FILES):
        pytest.skip("CRC806 zips not downloaded (footstep-generator/past_water_lgm.py fetches them)")
    return lgm.read(lgm.fetch())


def test_lgm_mask_matches_the_source_polygons(lgm_source):
    """Pixel centres against the shapefile itself (shapely), not through the rasteriser's own bookkeeping."""
    import shapely
    lakes, _ = lgm_source
    patch, wet, _ = pw.load_mask(epoch(lgm.NAME, 2))
    rng = np.random.default_rng(5)
    rows, cols = rng.integers(0, patch.height, 4000), rng.integers(0, patch.width, 4000)
    lon = -180 + (patch.x0 + cols + 0.5) * pw.PIXEL_DEG
    lat = 90 - (patch.y0 + rows + 0.5) * pw.PIXEL_DEG
    inside = np.zeros(4000, bool)
    for geom in lakes.geometry:
        inside |= shapely.contains_xy(geom, lon, lat)
    assert (inside == wet[rows, cols]).all()


def test_lgm_rivers_are_fresh_water_cells(lgm_source):
    from shapely.geometry import mapping
    _, rivers = lgm_source
    dpatch, codes = pw.load_distance(epoch(lgm.NAME, 2))
    po = rivers[rivers["Name"] == "Po"].geometry
    lines = [line for g in po for line in wd._lines_and_polygons(mapping(g))[0]]
    lon, lat = np.array(lines[0]).T[:2]
    r = ((90 - lat) / wd.CELL_DEG).astype(int) - dpatch.y0
    c = ((lon + 180) / wd.CELL_DEG).astype(int) - dpatch.x0
    assert (codes[r, c] == 0).all()


# --- Mesopotamia -------------------------------------------------------------------------------------------------------------

BASRA = (30.5, 47.8)
UR = (30.96, 46.10)
BAGHDAD = (33.3, 44.4)


def test_mesopotamia_stages_are_sea_inside_the_region_with_no_fresh_water():
    m = pw.load_manifest(meso.NAME)
    south, north, west, east = meso.REGION
    for e in m["epochs"]:
        assert e["distance"] is None and e["level"]["kind"] == "sea" and e["paint"] == "sea"
        p = e["mask"]
        assert p["x0"] >= int(round((west + 180) / pw.PIXEL_DEG)) and p["x0"] + p["width"] <= int(round((east + 180) / pw.PIXEL_DEG))
        assert p["y0"] >= int(round((90 - north) / pw.PIXEL_DEG)) and p["y0"] + p["height"] <= int(round((90 - south) / pw.PIXEL_DEG))
        assert not wet_at(e, *BAGHDAD)
    assert [(e["from_year"], e["to_year"]) for e in m["epochs"]] == [(-6050, -4551), (-4550, -3550), (-2550, -1550)]


def test_mesopotamia_the_bay_covers_basra_at_6_ka_and_has_closed_by_4_ka():
    assert wet_at(epoch(meso.NAME, 4), *BASRA)
    assert not wet_at(epoch(meso.NAME, 5), *BASRA)
    assert wet_at(epoch(meso.NAME, 3), *UR)  # ~7-8 ka: the Gulf's head reached Ur's latitude band in Fig 6a
    assert not wet_at(epoch(meso.NAME, 5), *UR)


def test_mesopotamia_georeference_fits_the_graticule_within_a_pixel():
    for ticks in (meso.TICKS_X, meso.TICKS_Y):
        slope, intercept = meso.fit(ticks)
        assert all(abs(slope * d + intercept - p) < 1.0 for p, d in ticks)
        assert abs(slope - 76.17) < 0.1 or abs(slope + 76.17) < 0.1


def test_outlines_and_arrows_are_filled_from_their_neighbours():
    c = np.array([[1, 1, 1], [1, -1, 1], [1, 1, 1]], np.int8)
    assert meso.fill_unknown(c)[1, 1] == 1
    c = np.zeros((3, 3), np.int8); c[1, 1] = -1
    assert meso.fill_unknown(c)[1, 1] == 0


# --- Basin of Mexico ---------------------------------------------------------------------------------------------------------

TEXCOCO_BED = (19.45, -99.0)  # the middle of Lake Texcoco (Nezahualcoyotl's airport and the dry lakebed today)
CHALCO = (19.26, -98.95)
TENOCHTITLAN = (19.4326, -99.1332)
TOLUCA = (19.29, -99.66)  # the next valley west: its own basin, never joined to the Basin of Mexico's lakes


def test_texcoco_lakes_fill_the_basin_floor_and_spare_the_island_city():
    e = epoch(tex.NAME, 6)
    assert (e["from_year"], e["to_year"]) == (-2050, 1600) and e["paint"] == "lake" and e["level"]["kind"] == "plane"
    assert wet_at(e, *TEXCOCO_BED) and wet_at(e, *CHALCO)
    assert not wet_at(e, *TENOCHTITLAN)
    assert not wet_at(e, *TOLUCA)
    assert tex.AREA_RANGE[0] <= pw.load_manifest(tex.NAME)["area_km2"] <= tex.AREA_RANGE[1]


def test_texcoco_fresh_water_comes_only_from_the_southern_lakes():
    e = epoch(tex.NAME, 6)
    dpatch, codes = pw.load_distance(e)
    base = pw.read_gray(STATIC)
    sub = base[dpatch.y0:dpatch.y0 + dpatch.height, dpatch.x0:dpatch.x0 + dpatch.width]
    assert (codes <= sub).all() and int((codes != sub).sum()) == e["distance"]["cells_changed"]
    cell = lambda lat, lon: (int((90 - lat) / wd.CELL_DEG) - dpatch.y0, int((lon + 180) / wd.CELL_DEG) - dpatch.x0)
    assert codes[cell(*CHALCO)] == 0  # Chalco: a fresh lake cell
    assert codes[cell(*TEXCOCO_BED)] > 0  # Texcoco's salt water is not fresh water
