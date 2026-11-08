"""Exercise source ASC -> RGB image -> source verification for population and land use."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import grid_image as grid


@pytest.fixture
def sources(tmp_path, monkeypatch):
    monkeypatch.setattr(grid, "RAW", tmp_path)
    monkeypatch.setattr(grid, "OUT", tmp_path / "out")
    monkeypatch.setattr(grid, "GLOBAL_GRID", {
        "ncols": 2, "nrows": 2, "xllcorner": -180,
        "yllcorner": 0, "cellsize": 1,
    })

    def write(name, values, x=-180):
        path = tmp_path / name
        path.write_text(
            f"ncols 2\nnrows 2\nxllcorner {x}\nyllcorner 0\n"
            "cellsize 1\nNODATA_value -9999\n" +
            "\n".join(" ".join(str(v) for v in row) for row in values)
        )
        return path

    # Independent spherical reference: 1-degree cell from 0N to 1N.
    area = 6371.0088 ** 2 * np.pi / 180 * np.sin(np.pi / 180)
    for name, fraction in zip(grid.LANDUSE_CHANNELS, [0.2, 0.4, 0.12]):
        write(f"{name}1000BC.asc", [[-9999, 0], [area * fraction, area]])
    return write


def test_landuse_round_trip_and_corruption(sources):
    path = grid.encode_landuse(-1000)
    with Image.open(path) as image:
        pixels = np.array(image)
        assert image.mode == "RGB"
    assert path.name == "landuse_-1000.png"
    assert pixels.tolist() == [
        [[0, 0, 0], [0, 0, 0]], [[51, 102, 31], [255, 255, 255]],
    ]
    grid.verify_landuse(-1000)
    pixels[1, 0, 0] = 70
    Image.fromarray(pixels).save(path)
    with pytest.raises(ValueError, match="cropland error"):
        grid.verify_landuse(-1000)


@pytest.mark.parametrize("bad", [-1, float("nan"), float("inf"), 20000])
def test_invalid_area_rejected(sources, bad):
    sources("cropland1000BC.asc", [[bad, 0], [0, 0]])
    with pytest.raises(ValueError, match="invalid land-use area|exceeds cell area"):
        grid.encode_landuse(-1000)


def test_misaligned_grid_rejected(sources):
    sources("grazing1000BC.asc", [[0, 0], [0, 0]], x=-179)
    with pytest.raises(ValueError, match="global 5 arc-min grid"):
        grid.encode_landuse(-1000)


def test_missing_channel_fails(sources):
    (grid.RAW / "tot_irri1000BC.asc").unlink()
    with pytest.raises(FileNotFoundError):
        grid.encode_landuse(-1000)


def test_population_webp_levels_and_decode(sources):
    sources("popd_0AD.asc", [[-9999, 0], [1, 1e-12]])
    path = grid.encode(0)
    assert path.name == "humans_0.webp"
    with Image.open(path) as image:
        assert image.format == "WEBP" and image.mode == "RGB"
        pixels = np.array(image)
    assert pixels[0].tolist() == [[0, 0, 0], [0, 0, 0]]  # nodata and zero: no people
    # Spherical 1-degree cell from 0N to 1N holds 12363.718 people at density 1.
    expected = round(math.log1p(12363.718145) / math.log1p(5_000_000) * 1023)
    assert pixels[1, 0].tolist() == [expected >> 8, expected & 255, 0]
    assert pixels[1, 1].tolist() == [0, 1, 0]  # populated, however tiny: first level
    people = grid.decode(path)
    assert people[0].tolist() == [0, 0]
    assert people[1, 0] == pytest.approx(12363.718145, rel=0.0077)
    grid.verify(0, rtol=0.0077)  # two cells only: no averaging across thousands


def test_population_decode_matches_browser_constants():
    # gridData.ts decodes expm1(value / 1023 * log1p(5e6)); level 0 is empty.
    levels = np.array([0, 1, 512, 1023], dtype=np.uint16)
    assert grid.dequantise(levels).tolist() == pytest.approx(
        [0, math.expm1(math.log1p(5e6) / 1023), math.expm1(512 / 1023 * math.log1p(5e6)), 5e6]
    )


def test_population_verify_catches_a_wrong_cell_and_a_missing_cell(sources):
    sources("popd_0AD.asc", [[0, 0], [1, 2]])
    path = grid.encode(0)
    with Image.open(path) as image:
        pixels = np.array(image)
    bad = pixels.copy()
    bad[1, 0, 1] += 3  # three levels off, ~9%
    Image.fromarray(bad).save(path, lossless=True)
    with pytest.raises(ValueError, match="more than half a level"):
        grid.verify(0)
    bad = pixels.copy()
    bad[0, 0, 1] = 1  # a cell with people where the source has none
    Image.fromarray(bad).save(path, lossless=True)
    with pytest.raises(ValueError, match="populated cells differ"):
        grid.verify(0)
