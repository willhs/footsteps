"""The domesticates gate (food/gate.py) the web app reads to stop HYDE land use naming farmers or herders too early."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food import gate  # noqa: E402


def test_rle_round_trip():
    row = "." * 100 + "AAB" + "." * 257
    assert gate.unrle(gate.rle(row)) == row
    assert gate.rle("." * 360) == "360."


def test_committed_gate_is_current_and_well_formed():
    committed = json.loads(gate.OUT.read_text())
    assert committed["eras"] == gate.ERAS
    for key in ("crop", "herd"):
        assert len(committed[key]) == 180
        assert all(len(gate.unrle(r)) == 360 for r in committed[key])


def test_first_era_examples():
    crops = [t for t in gate.CROPS if t.kind == "crop"]
    herds = [t for t in gate.ANIMALS if t.id in gate.HERD_IDS]
    # Australia: nothing until the British (1788 -> the 1800 era).
    assert gate.ERAS[gate.first_era(herds, 145, -31)] == 1800
    # Fertile Crescent: both by 8000 BCE.
    assert gate.ERAS[gate.first_era(crops, 38, 36)] <= -8000
    assert gate.ERAS[gate.first_era(herds, 38, 36)] <= -8000


def test_reindeer_make_the_arctic_herding_country_only_once_they_were_kept():
    herds = [t for t in gate.ANIMALS if t.id in gate.HERD_IDS]
    # Yamal (lower Ob): harnessed reindeer at Ust'-Polui ~2 ka, so herding is possible from the turn of the era, not before.
    first = gate.ERAS[gate.first_era(herds, 70, 67)]
    assert -500 < first <= 100
    # The Chukchi tundra: large herds from the 17th-18th centuries.
    assert gate.ERAS[gate.first_era(herds, 170, 66)] >= 1600
    # Taymyr: Dolgan herds from the 18th century.
    assert gate.ERAS[gate.first_era(herds, 100, 72)] >= 1700
    # North Greenland: never reindeer herding, nor any other herd animal.
    assert gate.first_era(herds, -45, 76) is None
