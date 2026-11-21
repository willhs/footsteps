"""Dated ice sheets (`?ice=1`): the GMT reader, the rasteriser, the epoch rule, and the committed masks and manifest checked on their own
(the files every flag-on consumer reads), against places whose LGM ice is not in doubt."""
import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ice_sheets as ice
import past_water as pw

MANIFEST = json.loads((ice.OUT / "ice_sheets.json").read_text())

GMT = """# @VGMT1.0 @GPOLYGON
# FEATURE_DATA
>
# @P
0 0
10 0
10 10
0 10
0 0
# @H
4 4
6 4
6 6
4 6
4 4
>
# @P
20 0
22 0
22 2
20 0
"""


def test_parse_gmt_reads_perimeters_and_holes():
    polys = ice.parse_gmt(GMT)
    assert len(polys) == 2
    assert polys[0].outer.shape == (5, 2) and len(polys[0].holes) == 1
    assert polys[1].holes == []


def test_parse_gmt_moves_0_360_longitudes_to_the_grid():
    polys = ice.parse_gmt(">\n# @P\n190 0\n200 0\n200 5\n190 0\n")
    assert polys[0].outer[:, 0].min() == pytest.approx(-170)


def test_rasterise_fills_the_outer_ring_and_leaves_the_hole():
    world = ice.rasterise(ice.parse_gmt(GMT)[:1])
    per_deg = 1 / ice.PIXEL_DEG  # 24 pixels a degree
    assert world.sum() == (10 * per_deg) ** 2 - (2 * per_deg) ** 2
    row, col = int((90 - 5) * per_deg), int((180 + 5) * per_deg)
    assert not world[row, col]  # in the hole
    assert world[row, int((180 + 1) * per_deg)]


@pytest.mark.parametrize("year,epoch", [(-20000, 22500), (-25000, 27500), (-15000, 17500), (-10000, 12500), (1900, 0), (0, 2500),
                                        (-79299, 80000), (-79300, None), (-100000, None)])
def test_a_year_shows_the_nearest_native_epoch(year, epoch):
    assert ice.epoch_at(year) == epoch


def test_epoch_windows_tile_the_years_with_no_gaps():
    windows = sorted(ice.epoch_window(a) for a in ice.AGES_BP)
    for (lo, hi), (lo2, _) in zip(windows, windows[1:]):
        assert lo2 == hi + 1
    for age in ice.AGES_BP:
        lo, hi = ice.epoch_window(age)
        assert abs((pw.BP_ZERO - lo) - age) <= ice.HALF_STEP and abs((pw.BP_ZERO - hi) - age) <= ice.HALF_STEP


# --- the committed files ---------------------------------------------------------------------------------------------------

def test_manifest_windows_match_the_rule_and_cover_25000_to_10000_bce():
    by_bp = {e["bp"]: e for e in MANIFEST["epochs"]}
    assert sorted(by_bp) == list(ice.AGES_BP)
    for bp, e in by_bp.items():
        assert (e["from_year"], e["to_year"]) == ice.epoch_window(bp)
    for year in range(-25000, -9999, 500):
        e = by_bp[ice.epoch_at(year)]
        assert {p["region"] for p in e["patches"]} == set(ice.REGIONS), year


def test_patch_ids_are_unique_and_above_past_water():
    ids = [p["id"] for e in MANIFEST["epochs"] for p in e["patches"]]
    assert len(ids) == len(set(ids))
    assert min(ids) >= ice.FIRST_ID and max(ids) < 256


def test_patch_files_match_their_manifest():
    total = 0
    for e in MANIFEST["epochs"]:
        for p in e["patches"]:
            data = (ice.OUT / p["file"]).read_bytes()
            assert len(data) == p["bytes"] and hashlib.sha256(data).hexdigest() == p["sha256"]
            _, mask, _ = pw.load_mask({"mask": p, "level": {"kind": "sea"}}, ice.OUT)
            assert mask.shape == (p["height"], p["width"]) and int(mask.sum()) == p["pixels"]
            total += p["bytes"]
    assert total == MANIFEST["bytes"]


def ice_at(bp: int, lat: float, lon: float) -> bool:
    e = next(e for e in MANIFEST["epochs"] if e["bp"] == bp)
    x, y = int((lon + 180) / ice.PIXEL_DEG), int((90 - lat) / ice.PIXEL_DEG)
    for p in e["patches"]:
        if p["x0"] <= x < p["x0"] + p["width"] and p["y0"] <= y < p["y0"] + p["height"]:
            _, mask, _ = pw.load_mask({"mask": p, "level": {"kind": "sea"}}, ice.OUT)
            if mask[y - p["y0"], x - p["x0"]]:
                return True
    return False


@pytest.mark.parametrize("bp,lat,lon,expected,place", [
    (22500, 59.9, 10.75, True, "Oslo at the LGM"),
    (20000, 62.0, 15.0, True, "central Sweden at the LGM"),
    (20000, 48.85, 2.35, False, "Paris, never under the Scandinavian ice"),
    (20000, 41.9, -87.6, True, "Chicago under the Laurentide at the LGM"),
    (12500, 41.9, -87.6, False, "Chicago free by 12.5 ka"),
    (20000, 51.0, -73.5, True, "Patagonian ice sheet at the LGM"),
    (2500, 59.9, 10.75, False, "Oslo in the late Holocene"),
])
def test_known_places(bp, lat, lon, expected, place):
    assert ice_at(bp, lat, lon) == expected, place
