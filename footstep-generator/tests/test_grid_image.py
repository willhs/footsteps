"""Exercise source ASC -> RGB PNG -> source verification and population compatibility."""
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


def test_population_encoding_unchanged(sources):
    sources("popd_0AD.asc", [[-9999, 0], [1, 2]])
    path = grid.encode(0)
    with Image.open(path) as image:
        pixels = np.array(image)
    assert path.name == "humans_0.png"
    assert pixels[0].tolist() == [[0, 0, 0], [0, 0, 0]]
    encoded = pixels[1, :, 0].astype(int) * 256 + pixels[1, :, 1]
    people = np.expm1(encoded / 65535 * np.log1p(5_000_000))
    assert people == pytest.approx([12363.718145, 24727.436290], rel=0.00012)
    assert pixels[..., 2].tolist() == [[0, 0], [0, 0]]
