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


def _era(taxa, lon, lat):
    i = gate.first_era(taxa, lon, lat)
    return None if i is None else gate.ERAS[i]


def test_second_pass_africa_americas_and_southeast_asia():
    crops = [t for t in gate.CROPS if t.kind == "crop"]
    herds = [t for t in gate.ANIMALS if t.id in gate.HERD_IDS]
    # Lake Chad and the Middle Nile had herds long before the 1st millennium CE.
    assert _era(herds, 14, 13) <= -1000
    assert _era(herds, 32.5, 15.6) <= -5000
    # The Cape and the Kalahari: no farming until Europeans (Bantu farmers stopped east of the Fish River).
    assert _era(crops, 18.5, -33.9) >= 1600
    assert _era(crops, 22, -23) >= 1600
    # The Great Plains: farming arrives with the Central Plains tradition (~900 CE), not the Archaic.
    assert 800 <= _era(crops, -98, 39) <= 1100
    # The Pampas and Patagonia: never farmed before Europeans.
    assert _era(crops, -61, -35) >= 1500
    assert _era(crops, -68, -45) >= 1500
    assert _era(herds, -61, -35) >= 1500
    # NW Argentina's Andean farmers stay.
    assert _era(crops, -65.5, -23.5) <= -1000
    # Mainland Southeast Asia: Hoabinhian foragers until ~2500-2000 BCE.
    assert _era(crops, 105.5, 10) == -2000
    # Taiwan before the Philippines.
    assert _era(crops, 121, 23.5) < _era(crops, 121, 16)
