"""Distance to fresh water: the scale, the jump-flooding distance against brute force, the input handling, and the
committed image (a river cell near 0, a desert cell far)."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import water_distance as wd

IMAGE = wd.OUT / "water_distance.webp"


def at(distance: np.ndarray, lat: float, lon: float) -> float:
    return float(distance[int((90 - lat) / (180 / wd.NY)), int((lon + 180) / (360 / wd.NX))])


# --- scale -----------------------------------------------------------------------------------------------------------

def test_scale_is_zero_at_water_monotonic_and_saturates():
    assert wd.quantise(0) == 0
    assert wd.quantise(wd.MAX_METRES) == 255
    assert wd.quantise(10 * wd.MAX_METRES) == 255  # beyond the scale reads as the scale's end
    codes = wd.quantise(np.linspace(0, wd.MAX_METRES, 5000))
    assert (np.diff(codes.astype(int)) >= 0).all()


def test_scale_is_fine_near_water_and_round_trips_within_a_step():
    # a site a few km from a river must be told from one at the river
    assert wd.code_step_metres(1) < 100
    assert wd.code_step_metres(5) < 1_000
    for metres in (0, 50, 800, 5_000, 40_000, 300_000, 1_500_000):
        back = float(wd.dequantise(wd.quantise(metres)))
        assert abs(back - metres) <= wd.code_step_metres(int(wd.quantise(metres))) / 2 + 1e-6


# --- distance --------------------------------------------------------------------------------------------------------

def brute_force(water: np.ndarray) -> np.ndarray:
    ny, nx = water.shape
    wr, wc = np.nonzero(water)
    wlat, wlon = wd.centre_lat(wr, ny), wd.centre_lon(wc, nx)
    out = np.zeros(water.shape)
    for r in range(ny):
        for c in range(nx):
            if not water[r, c]:
                out[r, c] = wd.haversine_m(wd.centre_lat(r, ny), wd.centre_lon(c, nx), wlat, wlon).min()
    return out


def test_distance_matches_brute_force_on_a_small_world():
    # thin lines and a pond, one across the antimeridian seam, one near the pole: the hard cases for flooding
    ny, nx = 72, 144
    water = np.zeros((ny, nx), bool)
    water[30, 10:60] = True  # a river along a parallel
    water[10:50, 100] = True  # one along a meridian
    water[2, 70] = True  # near the north pole
    water[40, 0] = True  # on the seam
    water[60:63, 120:123] = True  # a pond
    got = wd.distance_metres(water)
    want = brute_force(water)
    # flooding is approximate (a few cells keep a near-miss seed), never short, and close: here 15 of 10,368 are over by <0.1%
    assert (got >= want - 1.0).all()
    assert (got <= want * 1.01 + 1.0).all()
    assert np.isclose(got, want, rtol=1e-4, atol=1.0).mean() > 0.995


def test_distance_wraps_around_the_antimeridian_and_is_zero_on_water():
    ny, nx = 36, 72
    water = np.zeros((ny, nx), bool)
    water[18, 0] = True
    d = wd.distance_metres(water)
    assert d[18, 0] == 0
    # the cell on the other side of the 180 meridian is one cell away, not nx - 1 cells
    assert d[18, nx - 1] == pytest.approx(d[18, 1], rel=1e-3)
    assert d[18, 1] < 1.1 * wd.haversine_m(0, 0, 0, 360 / nx)


def test_no_water_means_no_distance():
    assert np.isinf(wd.distance_metres(np.zeros((8, 16), bool))).all()


# --- inputs ----------------------------------------------------------------------------------------------------------

def write_geojson(path: Path, features: list) -> Path:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def line(coords, **props):
    return {"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": coords}}


def lake(ring, **props):
    return {"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [ring]}}


def fake_ne(root: Path, lakes: list) -> Path:
    write_geojson(root / "ne_10m_rivers_lake_centerlines.geojson", [line([[10, 10], [20, 10]], featurecla="River")])
    write_geojson(root / "ne_10m_lakes.geojson", lakes)
    return root


def test_rivers_and_fresh_lakes_are_water_and_saline_lakes_are_not(tmp_path):
    root = fake_ne(tmp_path, [
        lake([[50, 20], [52, 20], [52, 22], [50, 22], [50, 20]], name="Lake Fresh"),
        lake([[80, 20], [82, 20], [82, 22], [80, 22], [80, 20]], name="Dead Sea"),
    ])
    water = wd.water_cells(*wd.water_features(root))
    assert at(water, 10.0, 15.0)  # on the river
    assert at(water, 21.0, 51.0)  # in the lake
    assert not at(water, 21.0, 81.0)  # saline lake left out
    assert not at(water, 40.0, 15.0)


def test_extra_water_hook_adds_water_and_changes_nothing_by_default(tmp_path):
    root = fake_ne(tmp_path, [])
    wadi = write_geojson(tmp_path / "wadi.geojson", [line([[25, 24], [26, 24]])])
    plain = wd.water_cells(*wd.water_features(root))
    with_wadi = wd.water_cells(*wd.water_features(root, extra_water=[wadi]))
    assert not at(plain, 24.0, 25.5)
    assert at(with_wadi, 24.0, 25.5)
    assert (with_wadi >= plain).all()


def test_fetch_checks_the_pinned_checksum(tmp_path, monkeypatch):
    def download(url, dest):
        Path(dest).write_bytes(b"not natural earth")

    monkeypatch.setattr(wd.urllib.request, "urlretrieve", download)
    with pytest.raises(ValueError, match="pinned"):
        wd.fetch(tmp_path)
    assert not list(tmp_path.glob("*.geojson"))  # nothing unchecked is kept


def test_fetch_keeps_a_file_that_matches_its_pin(tmp_path, monkeypatch):
    content = b'{"features": []}'
    pins = {name: wd.hashlib.sha256(content).hexdigest() for name in wd.NE_FILES}
    monkeypatch.setattr(wd, "NE_FILES", pins)
    for name in pins:
        (tmp_path / f"{name}.geojson").write_bytes(content)

    def no_download(url, dest):
        raise AssertionError("a verified file must not be fetched again")

    monkeypatch.setattr(wd.urllib.request, "urlretrieve", no_download)
    assert set(wd.fetch(tmp_path)) == set(pins)


# --- the committed image ---------------------------------------------------------------------------------------------

needs_image = pytest.mark.skipif(not IMAGE.exists(), reason="footsteps-web/public/water/water_distance.webp not baked")


@needs_image
def test_river_cells_are_near_zero_and_desert_cells_are_far():
    d = wd.decode(IMAGE)
    assert d.shape == (wd.NY, wd.NX)
    assert at(d, 25.70, 32.64) < 5_000  # the Nile at Luxor
    assert at(d, -1.0, 33.0) == 0  # Lake Victoria
    assert at(d, 24.0, 26.0) > 400_000  # Libyan desert, between the Nile and Chad
    assert at(d, 21.0, 51.0) > 800_000  # Rub' al Khali
    assert at(d, 24.0, 26.0) > 50 * at(d, 25.70, 32.64)


@needs_image
def test_sidecar_states_the_scale_the_image_uses():
    meta = json.loads(IMAGE.with_suffix(".json").read_text())
    assert (meta["width"], meta["height"]) == (wd.NX, wd.NY)
    assert meta["max_metres"] == wd.MAX_METRES and meta["levels"] == wd.LEVELS
    assert meta["sources"]["sha256"] == wd.NE_FILES
    assert IMAGE.stat().st_size < 1_500_000  # small enough to commit beside settlements.json


@needs_image
@pytest.mark.skipif(not (wd.NATURAL_EARTH / "ne_10m_lakes.geojson").exists(), reason="Natural Earth not downloaded")
def test_image_is_what_the_pinned_inputs_make():
    for name, want in wd.NE_FILES.items():
        assert wd.sha256(wd.NATURAL_EARTH / f"{name}.geojson") == want
    water = wd.water_cells(*wd.water_features(wd.NATURAL_EARTH))
    np.testing.assert_array_equal(wd.decode(IMAGE) == 0, water)
