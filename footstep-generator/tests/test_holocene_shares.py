"""holocene_shares.py: continent boxes (same golden places as footsteps-web/lib/holoceneShares.test.ts) and the committed table."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import holocene_shares as hs  # noqa: E402

GRID_HEIGHT, GRID_WIDTH = 360, 720  # the 0.5 degree grid
CELLS_PER_DEGREE = 2

# shares_percent rounds each share to 0.1 point, so ten continents can drift up to 10 x 0.05 from the true sum.
ROUNDING_SLACK_PERCENT = 0.6
TOTAL_RTOL = 1e-3  # multipliers are rounded to 4 decimals

PLACES = {  # (lon, lat) -> continent; None: no box, multiplier 1
    (36.8, -1.3): "africa",  # Nairobi
    (31.2, 30.0): "africa",  # Cairo, on the Nile, not West Asia
    (35.2, 31.8): "west_asia",  # Jerusalem
    (44.4, 33.3): "west_asia",  # Baghdad
    (32.9, 39.9): "west_asia",  # Ankara
    (-3.7, 40.4): "europe",  # Madrid
    (77.2, 28.6): "south_asia",  # Delhi
    (116.4, 39.9): "east_asia",  # Beijing
    (106.8, -6.2): "southeast_asia",  # Jakarta
    (151.2, -33.9): "sahul",  # Sydney
    (87.0, 55.0): "north_central_asia",  # Siberia
    (-99.1, 19.4): "north_america",  # Mexico City
    (-60.0, -3.1): "south_america",  # Manaus
    (-157.8, 21.3): None,  # Honolulu: remote Pacific keeps its people as they are
}


def test_places_fall_in_the_expected_continent():
    cmap = hs.continent_map(GRID_HEIGHT, GRID_WIDTH)

    for (lon, lat), want in PLACES.items():
        row = int((90 - lat) * CELLS_PER_DEGREE)
        col = int((lon + 180) * CELLS_PER_DEGREE)
        index = cmap[row, col]
        got = hs.CONTINENTS[index][0] if index != hs.NO_CONTINENT else None
        assert got == want, (lon, lat)


def test_committed_table_matches_the_boxes_and_years():
    table = json.loads(hs.OUT.read_text())

    assert [c["id"] for c in table["continents"]] == [name for name, _ in hs.CONTINENTS]
    assert [c["boxes"] for c in table["continents"]] == [boxes for _, boxes in hs.CONTINENTS]
    assert sorted(map(int, table["factors"])) == hs.YEARS

    for row in table["shares_percent"].values():
        before = sum(share["before"] for share in row.values())
        after = sum(share["after"] for share in row.values())
        assert after == pytest.approx(before, abs=ROUNDING_SLACK_PERCENT)
        assert row["west_asia"]["after"] == row["west_asia"]["before"]


def test_factors_keep_the_world_total_on_a_real_image():
    path = hs.IMAGE_DIRS[0] / "humans_-10000.webp"
    if not path.exists():
        pytest.skip("population images not in data/tiles/grid")

    people = hs.decode_bytes(path.read_bytes())
    multipliers = json.loads(hs.OUT.read_text())["factors"]["-10000"]
    cmap = hs.continent_map(*people.shape)

    per_cell = np.ones_like(people)
    for index, (name, _) in enumerate(hs.CONTINENTS):
        per_cell[cmap == index] = multipliers[name]

    assert (people * per_cell).sum() == pytest.approx(people.sum(), rel=TOTAL_RTOL)
