"""Terrain detail pyramid: Mercator tile maths, which source file a tile reads, the open-ocean skip,
the manifest's parent rule, and a full build of one synthetic quadrant set."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import terrain_tiles as tt


def test_tile_lat_edges():
    assert tt.tile_lat(0, 0) == pytest.approx(85.0511, abs=1e-3)
    assert tt.tile_lat(1, 1) == pytest.approx(0.0, abs=1e-9)
    assert tt.tile_lat(2 ** 8, 8) == pytest.approx(-85.0511, abs=1e-3)


def test_tile_lon_edges():
    assert tt.tile_lon(0, 5) == -180
    assert tt.tile_lon(16, 5) == 0
    assert tt.tile_lon(8, 5) == -90


def test_blocks_never_straddle_two_source_files():
    # 90 deg meridians and the equator are tile edges at zoom 5, so each block reads one file.
    for bx in range(32):
        for by in range(32):
            col, row = tt.block_quadrant(bx, by)
            assert tt.tile_lon(bx, 5) >= -180 + 90 * col
            assert tt.tile_lon(bx + 1, 5) <= -180 + 90 * (col + 1) + 1e-9
            assert (row == 0) == (tt.tile_lat(by + 1, 5) >= -1e-9)
    assert tt.source_name(2, 0).endswith(".C1.jpg")


def test_uniform_ocean_skip():
    sea = np.tile(tt.OCEAN.astype(np.uint8), (256, 256, 1))
    assert tt.is_uniform_ocean(sea)
    noisy = sea.copy()
    noisy[3, 4] = [6, 9, 25]  # JPEG noise
    assert tt.is_uniform_ocean(noisy)
    island = sea.copy()
    island[100, 100] = [90, 80, 50]
    assert not tt.is_uniform_ocean(island)


def test_has_tile_parent_rule():
    m = np.zeros((256, 256), bool)
    m[200, 13] = True
    assert tt.has_tile(m, 8, 13, 200)
    assert tt.has_tile(m, 3, 13 // 32, 200 // 32)
    assert not tt.has_tile(m, 3, 0, 0)
    assert not tt.has_tile(m, 8, 14, 200)


def test_halve_means():
    a = np.array([[[0, 0, 0], [4, 4, 4]], [[8, 8, 8], [12, 12, 12]]], np.uint8)
    assert tt.halve(a)[0, 0].tolist() == [6, 6, 6]


def test_block_pixels_maps_rows_by_latitude():
    # A source whose rows encode latitude: row r holds r // 240, whole degrees from the top (90N).
    col = (np.arange(tt.SRC) // 240).astype(np.uint8)
    src = np.broadcast_to(col[:, None, None], (tt.SRC, 2700, 3)).copy()
    north = tt.block_pixels(src, 0, 0, 0, 15)  # the z5 row just north of the equator: ~0..11N
    assert north.shape == (2048, 2048, 3)
    assert north[0, 0, 0] == pytest.approx(90 - tt.tile_lat(15, 5), abs=1)
    assert north[-1, 0, 0] == 89


def test_build_small(tmp_path, monkeypatch):
    # Eight tiny fake quadrants: all ocean except one bright square in C1 (0-90E, north).
    monkeypatch.setattr(tt, "SRC", 360)
    monkeypatch.setattr(tt, "PX_PER_DEG", 4.0)
    monkeypatch.setattr(tt, "MAX_ZOOM", 6)
    monkeypatch.setattr(tt, "BLOCK_ZOOM", 4)
    src = tmp_path / "src"
    src.mkdir()
    for col in range(4):
        for row in range(2):
            a = np.tile(tt.OCEAN.astype(np.uint8), (360, 360, 1))
            if (col, row) == (2, 0):
                a[160:180, 40:80] = [120, 110, 70]  # 10-20E, 45-50N: inside one z3 tile
            Image.fromarray(a).save(src / tt.source_name(col, row), quality=95)
    ref = tmp_path / "ref5400.jpg"
    Image.new("RGB", (540, 270), (30, 40, 50)).save(ref)
    out = tmp_path / "out"
    meta = tt.build(src, out, quality=80, workers=1, ref_source=ref)
    assert meta["tiles"]["6"] > 0
    assert meta["tiles"]["3"] == 1  # one z3 tile covers the square
    manifest = np.asarray(Image.open(out / "manifest.png")) > 0
    assert manifest.shape == (64, 64)
    for y, x in zip(*np.nonzero(manifest)):
        assert (out / "6" / str(x) / f"{y}.webp").exists()
        lon = tt.tile_lon(x, 6)
        assert 0 <= lon < 30
    assert Image.open(out / "ref.webp").size == (2048, 1024)
    assert json.loads((out / "meta.json").read_text())["tiles"]["6"] == int(manifest.sum())


def test_shore_ramp_fades_today_land_out_at_the_shore():
    land = np.zeros((64, 64), np.uint8)
    land[:, 32:] = 255  # land east of column 32
    a = tt.shore_ramp(land, sigma=2.0)
    assert a[32, 0] == 0  # sea
    assert a[32, 31] == 0 and a[32, 32] < 100  # the shore
    assert a[32, 63] == 255  # well inland
    assert 0 < a[32, 34] < 255  # the ramp


def test_land_mask_draws_land_minus_lakes(tmp_path, monkeypatch):
    monkeypatch.setattr(tt, "SRC", 360)
    monkeypatch.setattr(tt, "PX_PER_DEG", 4.0)
    square = lambda w, s, e, n: {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}}  # noqa: E731
    land = tmp_path / "land.geojson"
    lakes = tmp_path / "lakes.geojson"
    land.write_text(json.dumps({"features": [square(10, 40, 30, 60)]}))
    lakes.write_text(json.dumps({"features": [square(15, 45, 20, 50)]}))
    m = tt.land_mask({"ne_10m_land": land, "ne_10m_lakes": lakes}, 2, 0)  # C1: 0-90E, 0-90N
    px = lambda lon, lat: m[int((90 - lat) * 4), int(lon * 4)]  # noqa: E731
    assert px(25, 55) == 255
    assert px(17.5, 47.5) == 0  # lake
    assert px(5, 55) == 0  # sea
