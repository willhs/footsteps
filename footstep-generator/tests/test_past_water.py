"""The Mega-Chad highstand scenario: its dates, its basin-connected geometry, and the committed mask and distance patch
(the two files every flag-on consumer reads) checked on their own, not through the code that wrote them."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import past_water as pw
import water_distance as wd

STATIC = wd.OUT / "water_distance.webp"


# --- dates -----------------------------------------------------------------------------------------------------------

def test_epochs_are_calendar_bp_from_1950():
    e = pw.EPOCHS[0]
    assert (e.from_year, e.to_year) == (-9550, -3050)  # 11.5 ka BP, 5 ka BP: not -11500 / -5000


@pytest.mark.parametrize("year,epoch", [(-6000, 1), (-9550, 1), (-3050, 1), (-9551, 0), (-3049, 0), (-12000, 0), (0, 0), (1900, 0)])
def test_epoch_at_is_the_highstand_inside_the_window_and_inactive_outside(year, epoch):
    assert pw.epoch_at(year) == epoch


# --- geometry --------------------------------------------------------------------------------------------------------

def test_the_fill_joins_the_basin_and_skips_a_dip_the_water_cannot_reach():
    z = np.full((9, 9), 400.0)
    z[2:6, 2:6] = 300  # the basin
    z[7, 7] = 300  # a dip of the same height, walled off
    z[4, 6] = 330  # a sill just above the level: the basin stays shut
    z[4, 7] = 300
    lake = pw.connected_below(z, 329.0, (3, 3))
    assert lake.sum() == 16 and lake[2:6, 2:6].all()
    assert not lake[7, 7] and not lake[4, 7]


def test_the_fill_refuses_a_seed_above_the_level():
    with pytest.raises(ValueError):
        pw.connected_below(np.full((3, 3), 500.0), 329.0, (1, 1))


def test_a_flood_that_reaches_the_window_edge_is_an_error():
    r0, r1, c0, c1 = pw.window_pixels()
    z = np.full((r1 - r0, c1 - c0), 100.0)
    with pytest.raises(ValueError, match="leaked"):
        pw.highstand_lake(z)


# --- the committed scenario --------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def scenario():
    patch, mask, manifest = pw.load_lake()
    return patch, mask, manifest


def test_manifest_states_datum_dates_freshness_and_what_outside_the_window_means(scenario):
    _, _, m = scenario
    assert m["level_m"] == 329.0 and "geoid" in m["datum"] and "not relative to the year's global ocean level" in m["datum"]
    assert [(e["from_year"], e["to_year"]) for e in m["epochs"]] == [(-9550, -3050)]
    assert m["epochs"][0]["water"] == "fresh (assumed)"
    assert "not the same as a dry lakebed" in m["outside_epochs"]
    assert m["evidence"] == "modelled"
    assert m["uncertainty"]


def test_committed_files_match_the_manifest(scenario):
    import hashlib
    _, _, m = scenario
    for key in ("mask", "distance"):
        path = pw.OUT / m[key]["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == m[key]["sha256"]
        assert path.stat().st_size == m[key]["bytes"]
    assert m["mask"]["bytes"] + m["distance"]["bytes"] < 20_000  # a regional patch, not a world image


def test_lake_area_matches_the_published_361k_km2(scenario):
    _, _, m = scenario
    assert abs(m["area_km2"] - 361_000) / 361_000 < 0.03


def test_the_mask_is_one_lake_that_holds_lake_chad_and_clears_its_patch_edge(scenario):
    patch, mask, _ = scenario
    assert mask.shape == (patch.height, patch.width)
    assert not (mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any())
    row = int((90 - pw.SEED[0]) / pw.PIXEL_DEG) - patch.y0
    col = int((pw.SEED[1] + 180) / pw.PIXEL_DEG) - patch.x0
    assert mask[row, col]
    # one connected body: filling it again from the seed finds every lake pixel
    assert pw.connected_below(np.where(mask, 0.0, 999.0), 1.0, (row, col)).sum() == mask.sum()


def test_the_mask_is_the_329_m_contour_of_the_terrarium_dem(scenario):
    if not (pw.TERRARIUM.exists() and any(pw.TERRARIUM.glob("6_*.png"))):
        pytest.skip("Terrarium tiles not cached (footstep-generator/past_water.py fetches the ~20 it needs)")
    patch, mask, _ = scenario
    elev = pw.window_elevation()
    r0, _, c0, _ = pw.window_pixels()
    sub = elev[patch.y0 - r0:patch.y0 - r0 + patch.height, patch.x0 - c0:patch.x0 - c0 + patch.width]
    assert (sub[mask] <= pw.LEVEL_M).all()  # the lake is nowhere above its level
    # ...and every pixel below the level that touches the lake is lake (no unfilled pixel at the shore)
    edge = np.zeros_like(mask)
    edge[1:, :] |= mask[:-1, :]; edge[:-1, :] |= mask[1:, :]; edge[:, 1:] |= mask[:, :-1]; edge[:, :-1] |= mask[:, 1:]
    assert not ((sub <= pw.LEVEL_M) & edge & ~mask).any()


def test_a_pixel_dry_in_the_mask_is_not_lake_and_the_world_outside_the_patch_is_dry(scenario):
    patch, mask, _ = scenario
    world = pw.place_on_world(patch, mask.astype(np.uint8))
    assert int(world.sum()) == int(mask.sum())
    assert not world[:patch.y0].any() and not world[patch.y0 + patch.height:].any()


# --- freshwater distance patch ---------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def distances(scenario):
    patch, mask, m = scenario
    d = m["distance"]
    dpatch = pw.Patch(d["x0"], d["y0"], d["width"], d["height"])
    codes = pw.read_gray(pw.OUT / d["file"])
    base = pw.read_gray(STATIC)
    merged = base.copy()
    merged[dpatch.y0:dpatch.y0 + dpatch.height, dpatch.x0:dpatch.x0 + dpatch.width] = codes
    return dpatch, base, merged, pw.lake_cells(patch, mask)


def test_outside_the_patch_every_cell_is_the_static_image(distances):
    dpatch, base, merged, _ = distances
    outside = np.ones(base.shape, bool)
    outside[dpatch.y0:dpatch.y0 + dpatch.height, dpatch.x0:dpatch.x0 + dpatch.width] = False
    assert (merged[outside] == base[outside]).all()
    assert (merged != base).sum() == json.loads((pw.OUT / "mega_chad.json").read_text())["distance"]["cells_changed"]


def test_the_lake_never_makes_water_farther_and_its_cells_are_water(distances):
    _, base, merged, cells = distances
    assert (merged <= base).all()
    assert (merged[cells] == 0).all()
    assert cells.sum() > 4000  # ~359k km2 over ~85 km2 cells


def test_shore_distance_matches_brute_force_haversine(distances):
    """Distances where the lake is nearest, against a plain nearest-lake-cell haversine search (not the jump flooding)."""
    _, base, merged, cells = distances
    lr, lc = np.nonzero(cells)
    lat, lon = wd.centre_lat(lr), wd.centre_lon(lc)
    changed = np.argwhere(merged != base)
    rng = np.random.default_rng(3)
    for r, c in changed[rng.choice(len(changed), 40, replace=False)]:
        want = wd.haversine_m(wd.centre_lat(r), wd.centre_lon(c), lat, lon).min()
        got = float(wd.dequantise(merged[r, c]))
        # the jump flooding may keep a near-miss seed (water_distance.py); allow one code step plus a cell of that
        assert abs(got - want) <= wd.code_step_metres(int(merged[r, c])) + 6_000, (r, c, got, want)


def test_a_cell_the_lake_does_not_reach_keeps_its_static_distance(distances):
    _, base, merged, _ = distances
    r, c = int((90 - 30.0) / (180 / wd.NY)), int((10.0 + 180) / (360 / wd.NX))  # Algeria's Hoggar side: no lake nearer than a river
    assert merged[r, c] == base[r, c]
