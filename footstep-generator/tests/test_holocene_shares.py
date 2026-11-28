"""holocene_shares.py: continent boxes (same golden places as footsteps-web/lib/holoceneShares.test.ts) and the committed table."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import holocene_shares as hs  # noqa: E402

PLACES = {  # lon, lat -> continent (None: no box, multiplier 1)
    (36.8, -1.3): "africa", (31.2, 30.0): "africa", (35.2, 31.8): "west_asia", (44.4, 33.3): "west_asia",
    (32.9, 39.9): "west_asia", (-3.7, 40.4): "europe", (77.2, 28.6): "south_asia", (116.4, 39.9): "east_asia",
    (106.8, -6.2): "southeast_asia", (151.2, -33.9): "sahul", (87.0, 55.0): "north_central_asia",
    (-99.1, 19.4): "north_america", (-60.0, -3.1): "south_america", (-157.8, 21.3): None,
}


def test_places_fall_in_the_expected_continent():
    cmap = hs.continent_map(360, 720)
    for (lon, lat), want in PLACES.items():
        i = cmap[int((90 - lat) * 2), int((lon + 180) * 2)]
        assert (hs.CONTINENTS[i][0] if i >= 0 else None) == want, (lon, lat)


def test_committed_table_matches_the_boxes_and_years():
    table = json.loads(hs.OUT.read_text())
    assert [c["id"] for c in table["continents"]] == [n for n, _ in hs.CONTINENTS]
    assert [c["boxes"] for c in table["continents"]] == [b for _, b in hs.CONTINENTS]
    assert sorted(map(int, table["factors"])) == hs.YEARS
    for year, row in table["shares_percent"].items():
        assert sum(v["after"] for v in row.values()) == pytest.approx(sum(v["before"] for v in row.values()), abs=0.6)
        assert row["west_asia"]["after"] == row["west_asia"]["before"]


def test_factors_keep_the_world_total_on_a_real_image():
    path = hs.LOCAL[0] / "humans_-10000.webp"
    if not path.exists():
        pytest.skip("population images not in data/tiles/grid")
    people = hs.decode_bytes(path.read_bytes())
    row = json.loads(hs.OUT.read_text())["factors"]["-10000"]
    cmap = hs.continent_map(*people.shape)
    f = np.ones_like(people)
    for i, (name, _) in enumerate(hs.CONTINENTS):
        f[cmap == i] = row[name]
    assert (people * f).sum() == pytest.approx(people.sum(), rel=1e-3)
