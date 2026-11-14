"""Habitat lookup: step choice, byte encodings, packing, committed meta, and agreement with the terrain painter."""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import habitat_lookup as hl
import terrain_image as ti

ROOT = Path(__file__).resolve().parents[2]
META = json.loads((ROOT / "footsteps-web/public/habitat_meta.json").read_text())
HAVE_INPUTS = hl.KRAPP.exists() and hl.BEYER.exists()


def test_year_picks_the_nearest_thousand_year_step():
    assert hl.year_to_ka(-80_000) == 82  # 81,950 BP
    assert hl.year_to_ka(-20_000) == 22
    assert hl.year_to_ka(1500) == 0  # 450 BP
    assert hl.year_to_ka(1900) == 0
    assert hl.year_to_ka(0) == 2  # 1,950 BP
    assert hl.year_to_ka(-100_000) == 102


def test_step_is_clamped_to_the_series():
    assert hl.year_to_ka(2500) == 0
    assert hl.year_to_ka(-500_000) == hl.MAX_KA


def test_every_terrain_year_has_a_step():
    for y in ti.TERRAIN_YEARS:
        assert 0 <= hl.year_to_ka(y) <= hl.MAX_KA


def test_hyde_years_are_the_target_years():
    ts = (ROOT / "footsteps-web/lib/constants.ts").read_text()
    block = re.search(r"TARGET_YEARS = \[(.*?)\];", ts, re.S).group(1)
    assert [int(n) for n in re.findall(r"-?\d+", re.sub(r"//.*", "", block))] == hl.HYDE_YEARS


def test_nearest_beyer_step_prefers_the_younger_on_a_tie():
    bp = np.array([0.0, 21_000.0, 22_000.0, 24_000.0])
    assert hl.nearest_index(bp, 23_000) == 2
    assert hl.nearest_index(bp, 21_400) == 1


def test_temperature_round_trips_within_a_quarter_degree():
    t = np.array([-49.0, -7.3, 0.0, 14.26, 29.7])
    assert hl.decode_temp(hl.encode_temp(t)) == pytest.approx(t, abs=0.26)


def test_precipitation_round_trips_within_two_percent():
    p = np.array([10.0, 120.0, 462.9, 3100.0, 7400.0])
    assert hl.decode_precip(hl.encode_precip(p)) == pytest.approx(p, rel=0.02)
    assert hl.decode_precip(hl.encode_precip(np.array([0.0])))[0] == 0.0


def test_no_data_is_byte_zero_and_data_never_is():
    nan = np.array([np.nan])
    assert hl.encode_temp(nan)[0] == 0 and hl.encode_precip(nan)[0] == 0
    assert hl.encode_temp(np.array([-90.0]))[0] == 1  # clipped, not "no data"
    assert hl.encode_precip(np.array([0.0]))[0] == 1
    assert hl.encode_precip(np.array([1e6]))[0] == 255


def test_golden_bytes_match_the_client_test():
    # footsteps-web/lib/habitat.test.ts asserts the same pairs.
    assert hl.decode_temp(np.array([1, 101, 255])).tolist() == [-50.0, 0.0, 77.0]
    assert hl.decode_precip(np.array([1]))[0] == 0.0
    assert hl.decode_precip(np.array([255]))[0] == pytest.approx(10_000)


def test_biome_names_parse_from_the_netcdf_attribute():
    names = hl.parse_biome_names("1  Tropical evergreen forest; 12 Tropical savanna; 28 Land ice; ")
    assert names == {1: "Tropical evergreen forest", 12: "Tropical savanna", 28: "Land ice"}


def test_committed_meta_matches_the_encoder():
    assert META["maxKa"] == hl.MAX_KA and META["stepYears"] == hl.STEP_YEARS
    assert META["iceBiome"] == hl.ICE
    assert (META["width"], META["height"]) == (hl.CW, hl.CH)
    assert META["temperature"]["min"] == hl.TEMP_MIN and META["temperature"]["step"] == hl.TEMP_STEP
    assert META["precipitation"]["max"] == hl.PRECIP_MAX
    assert sorted(int(k) for k in META["biomes"]) == list(range(1, 29))
    assert META["biomes"]["28"] == "Land ice"


def test_pack_step_channels():
    biome = np.zeros((hl.CH, hl.CW), np.int16)
    biome[10, 20] = 12
    temp = np.full((hl.CH, hl.CW), np.nan)
    temp[10, 20] = 25.0
    precip = np.full((hl.CH, hl.CW), np.nan)
    precip[10, 20] = 800.0
    img = hl.pack_step(biome, temp, precip)
    assert img.shape == (hl.CH, hl.CW, 3) and img.dtype == np.uint8
    assert img[10, 20, 0] == 12
    assert hl.decode_temp(img[10, 20, 1]) == 25.0
    assert hl.decode_precip(img[10, 20, 2]) == pytest.approx(800, rel=0.02)
    assert img[0, 0].tolist() == [0, 0, 0]  # sea with no climate


def test_pack_landuse_means_each_block():
    crop = np.zeros((hl.CH * 6, hl.CW * 6), np.float32)
    grazing = np.zeros_like(crop)
    crop[:6, :3] = 255  # half of the first 6 x 6 block
    grazing[6:12, 6:12] = 100
    img = hl.pack_landuse(crop, grazing, 6)
    assert img.shape == (hl.CH, hl.CW, 3)
    assert img[0, 0].tolist() == [128, 0, 0]  # 127.5 rounds to even
    assert img[1, 1].tolist() == [0, 100, 0]
    assert img[2, 2].tolist() == [0, 0, 0]


def test_smoke_checks_every_step():
    smoke = (ROOT / "scripts/smoke.sh").read_text()
    # The full smoke walks every step; --quick narrows HABITAT_LAST_BP to 0.
    assert f"HABITAT_LAST_BP={hl.MAX_KA}" in smoke and "seq 0 $HABITAT_LAST_BP" in smoke
    assert "habitat/bp_" in smoke and "habitat/use_" in smoke


@pytest.mark.skipif(not HAVE_INPUTS, reason="needs data/raw krapp2021 and beyer2020")
def test_biome_channel_is_what_the_terrain_painter_reads():
    ds = hl.load_krapp()
    for ka in (0, 22, 82):
        assert (hl.krapp_biome(ds, ka) == ti.biome(ka * 1000)).all()


@pytest.mark.skipif(not HAVE_INPUTS, reason="needs data/raw krapp2021 and beyer2020")
def test_real_step_has_plausible_land_climate(tmp_path):
    ds = hl.load_krapp()
    bp, bio1, bio12 = hl.load_beyer()
    i = hl.nearest_index(bp, 0)
    img = hl.pack_step(hl.krapp_biome(ds, 0), bio1[i], bio12[i])
    row, col = int((90 + 3.0) * 2), int((-60 + 180) * 2)  # 3S 60W, central Amazon; row 0 is 90N
    assert img[row, col, 0] in range(1, 28)
    assert hl.decode_temp(img[row, col, 1]) > 22
    assert hl.decode_precip(img[row, col, 2]) > 1500
    # Antarctica is outside Beyer's 60S limit: climate unknown, biome still there
    assert (img[-10:, :, 1] == 0).all()
    path = tmp_path / "bp_0.webp"
    assert hl.save_webp(img, path) < hl.MAX_BYTES
