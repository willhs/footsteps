"""Terrain for placing groups: the encodings, the geometry helpers, and the committed image (sea, shelf, lakes, slope)."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_terrain as st

IMAGE = st.OUT / f"{st.NAME}.webp"


def px(lat: float, lon: float) -> tuple[int, int]:
    return int((90 - lat) / st.PIXEL_DEG), int((lon + 180) / st.PIXEL_DEG)


# --- encodings ---------------------------------------------------------------------------------------------------------

def test_depth_is_zero_on_land_at_least_one_on_sea_and_saturates():
    elev = np.array([500.0, -3.0, 4.0, -0.2, -60.4, -61.0, -131.0, -133.5, -136.0, -300.0, -3000.0])
    land = np.array([True, True, False, False, False, False, False, False, False, False, False])
    # land reads 0 even below today's sea (a polder); sea reads at least one step even if the mean is above 0 (a mixed shore pixel);
    # depths round UP to a 4 m step, and 136 m or more (below any sea level in the series) is "deep"
    assert st.depth_code(elev, land).tolist() == [0, 0, 4, 4, 60, 64, 132, 255, 255, 255, 255]


def test_slope_classes_cover_the_range_in_order():
    deg = np.array([0.0, 0.2, 0.21, 0.5, 2.0, 7.4, 20.0, 45.0, 89.0])
    classes = st.slope_class(deg).tolist()
    assert classes == sorted(classes)
    assert classes[0] == 0 and classes[1] == 0 and classes[2] == 1
    assert classes[-1] == 7 and classes[-2] == 7
    assert len(st.SLOPE_UPPER_DEG) == 7 and st.SLOPE_UPPER_DEG == sorted(st.SLOPE_UPPER_DEG)


def test_median_removes_a_lone_steep_pixel_and_keeps_a_ridge():
    a = np.zeros((7, 7), dtype=np.uint8)
    a[3, 3] = 7  # speckle
    a[:, 5:] = 6  # a real ridge, two columns wide
    m = st.median3(a)
    assert m[3, 3] == 0
    assert (m[:, 6] == 6).all() and (m[1:-1, 5] == 6).all()


def test_mercator_rows_run_north_to_south_and_the_equator_is_the_middle():
    rows = st.mercator_row(np.array([80.0, 40.0, 0.0, -40.0, -80.0]))
    assert (np.diff(rows) > 0).all()
    assert rows[2] == pytest.approx(st.MOSAIC / 2)
    assert st.mercator_row(np.array([89.9]))[0] == pytest.approx(st.mercator_row(np.array([st.MAX_LAT]))[0])  # clamped to the tiles


def test_a_ramp_has_the_slope_it_was_built_with():
    n = 256
    metres = 40_075_016.686 / n  # a pixel's ground size at the equator
    z = np.tile((np.arange(n) * metres * np.tan(np.radians(2.0))).astype(np.float32), (n, 1))  # rises 2 degrees west to east
    slope = st.mosaic_slope_deg(z, chunk=64) / 8.0
    middle = slope[n // 2 - 2:n // 2 + 2, 3:-3]  # near the equator, away from the wrap-around column
    assert np.abs(middle - 2.0).max() < 0.3
    assert (st.mosaic_slope_deg(np.zeros((n, n), dtype=np.int16)) == 0).all()


def test_green_byte_packs_sea_share_lake_and_slope_and_unpacks_the_same():
    sea = np.array([0.0, 0.03, 0.5, 1.0])
    lake = np.array([False, True, False, True])
    slope = np.array([0, 3, 7, 5])
    g = st.pack(sea, lake, slope)
    assert (g & 7).tolist() == [0, 3, 7, 5]
    assert ((g & 8) > 0).tolist() == [False, True, False, True]
    assert (g >> 4).tolist() == [0, 0, 8, 15]  # 3 % of a pixel is under half a level: land


def test_a_pixel_with_any_sea_has_a_depth_and_an_all_land_pixel_has_none():
    elev = np.array([[300.0, -2.0, -80.0]])
    sea = np.array([[0.0, 0.4, 1.0]])
    rgb = st.build(elev, np.full((1, 3), 5.0), sea, np.zeros((1, 3), dtype=bool))
    assert rgb[0, :, 0].tolist() == [0, 4, 80]  # the shore pixel is sea 4 m deep at least
    assert (rgb[0, :, 1] >> 4).tolist() == [0, 6, 15]


def test_natural_earth_pins_and_sizes_are_what_the_baker_reads():
    assert st.NX == 2 * 4320 and st.NY == 2 * 2160  # each HYDE 5' cell is 2 x 2 pixels
    assert set(st.NE_FILES) == {"ne_10m_land", "ne_10m_lakes"}
    assert all(len(v) == 64 for v in st.NE_FILES.values())


# --- the committed image -----------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def image():
    if not IMAGE.exists():
        pytest.skip("site_terrain.webp not built")
    return st.decode(IMAGE)


def test_image_has_the_documented_shape_and_sidecar(image):
    depth, sea, slope, lake = image
    assert depth.shape == (st.NY, st.NX) == sea.shape == slope.shape == lake.shape
    meta = json.loads((st.OUT / f"{st.NAME}.json").read_text())
    assert meta["width"] == st.NX and meta["height"] == st.NY
    assert meta["slope_upper_deg"] == st.SLOPE_UPPER_DEG
    assert slope.max() <= 7


def test_land_sea_and_shelf_at_known_places(image):
    depth, sea, slope, lake = image
    assert depth[px(41.9, 12.5)] == 0 and sea[px(41.9, 12.5)] == 0  # Rome is land
    assert depth[px(30.0, -40.0)] == 255  # mid-Atlantic is deep
    assert 4 <= depth[px(45.0, 13.0)] < 60  # the northern Adriatic is shallow sea
    assert 4 <= depth[px(52.5, 3.0)] < 80  # the southern North Sea, a shelf that was land at the glacial maximum
    assert depth[px(52.0, 5.0)] == 0  # the Netherlands, much of it below sea level, is land
    assert depth[px(-80.0, 0.0)] == 0  # Antarctica is land
    # coast pixels are partly sea: some share is strictly between all land and all sea
    assert ((sea > 0) & (sea < 1)).sum() > 100_000


def test_lakes_are_flagged(image):
    depth, sea, slope, lake = image
    assert lake[px(-1.0, 33.0)]  # Lake Victoria
    assert lake[px(47.5, -87.5)]  # Lake Superior
    assert not lake[px(41.9, 12.5)]
    assert depth[px(-1.0, 33.0)] == 0  # a lake in land is land, not sea


def test_slope_is_flat_on_river_plains_and_steep_in_mountains(image):
    depth, sea, slope, lake = image
    assert slope[px(26.0, 31.0)] <= 1  # the Nile valley below Luxor: under about 0.5 degrees
    assert slope[px(28.0, 86.9)] >= 6  # the Himalaya
