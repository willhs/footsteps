"""The close-up's river asset (rivers_asset.py -> footsteps-web/public/water/rivers.json)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rivers_asset as ra  # noqa: E402


def test_simplify_keeps_ends_and_drops_points_within_tolerance():
    line = [[0, 0], [1, 0.001], [2, 0], [3, 1]]
    out = ra.simplify(line, 0.01)
    assert out[0] == [0, 0] and out[-1] == [3, 1]
    assert [1, 0.001] not in out


def test_encode_is_integer_deltas_without_repeats():
    assert ra.encode([[1.0, 2.0], [1.0001, 2.0], [1.0001, 2.0], [1.0002, 2.0001]]) == [10000, 20000, 1, 0, 1, 1]


def test_committed_asset_is_well_formed():
    data = json.loads(ra.OUT.read_text())
    assert data["version"] == 1 and data["scale"] == ra.SCALE
    assert len(data["rivers"]) > 1500
    for row in data["rivers"][:200]:
        assert 0 <= row[0] <= 10 and len(row) % 2 == 1 and len(row) >= 5
