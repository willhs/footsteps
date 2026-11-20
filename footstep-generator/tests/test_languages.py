"""The languages block: Glottolog filtering, per-cell grouping, and where the record shows it (research 0007, step 1)."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "deploy" / "budgie" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(ROOT / "footstep-generator" / "anthropology"))
import atlas  # noqa: E402
import languages  # noqa: E402

REAL = atlas.Atlas.load(API / "anthropology.json.gz")
GLOTTOLOG_FILES = languages.RAW / "glottolog" / languages.VERSION


def row(id_, name, family="", parent="", level="language", lat="1", lon="1", bookkeeping="False"):
    return {"id": id_, "name": name, "family_id": family, "parent_id": parent or family, "level": level,
            "latitude": lat, "longitude": lon, "bookkeeping": bookkeeping}


ROWS = [
    row("indo1319", "Indo-European", level="family", lat="", lon=""),
    row("sign1238", "Sign Language", level="family", lat="", lon=""),
    row("pidg1258", "Pidgin", level="family", lat="", lon=""),
    row("uncl1493", "Unclassifiable", level="family", lat="", lon=""),
    row("engl1111", "English-based Creole", family="indo1319", level="family", lat="", lon=""),
    row("stan1293", "English", "indo1319"),
    row("tokp1240", "Tok Pisin", "indo1319", parent="engl1111", lat="-9", lon="147"),  # creole by its parent node's name
    row("jama1262", "Jamaican Creole English", "indo1319", lat="18", lon="-77"),  # creole by its own name
    row("afri1274", "Afrikaans", "indo1319", lat="-30", lon="25"),  # transplant: IE outside Eurasia
    row("lati1261", "Latin", "indo1319"),  # historical
    row("ased1236", "American Sign Language", "sign1238"),
    row("tokp9999", "Pidgin Thing", "pidg1258"),
    row("basq1248", "Basque", ""),  # an isolate is its own family
    row("odd11111", "Odd Language", "uncl1493"),
    row("nopt1234", "No Point", "indo1319", lat="", lon=""),
    row("book1111", "Booked", "indo1319", bookkeeping="True"),
    row("dial1234", "A Dialect", "indo1319", level="dialect"),
]
MACRO = {"stan1293": "Eurasia", "tokp1240": "Papunesia", "afri1274": "Africa", "lati1261": "Eurasia", "basq1248": "Eurasia"}


def names(rows=ROWS, historical=("Latin",)):
    return sorted(lang["name"] for lang in languages.languages_of(rows, MACRO, historical))


def test_sign_pidgin_creole_transplanted_and_historical_languages_are_dropped():
    assert names() == ["Basque", "English", "Odd Language"]


def test_an_isolate_is_its_own_family_and_the_unclassifiable_are_one_unclassified_group():
    by_name = {lang["name"]: lang for lang in languages.languages_of(ROWS, MACRO, ("Latin",))}
    assert (by_name["Basque"]["family"], by_name["Basque"]["family_name"]) == ("basq1248", "Basque")
    assert by_name["Odd Language"]["family_name"] == "Unclassified"


def test_a_historical_name_that_is_not_in_the_data_fails_loudly():
    with pytest.raises(ValueError, match="Nonesuch"):
        languages.languages_of(ROWS, MACRO, ("Latin", "Nonesuch"))


def lang(code, name, fam, lat, lon):
    return {"glottocode": code, "name": name, "family": fam, "family_name": fam.title(), "lat": lat, "lon": lon}


def test_a_cell_lists_its_families_by_count_and_the_nearest_languages():
    langs = [lang("a", "A", "x", 1, 1), lang("b", "B", "x", 2, 2), lang("c", "C", "y", 3, 3),
             lang("d", "D", "z", 6, 1), lang("e", "E", "z", 40, 40)]
    blocks = languages.cell_blocks(langs, ["0,0", "5,0", "-40,-40"])
    here = blocks["0,0"]
    assert (here["n_languages"], here["n_families"]) == (3, 2)
    assert [(f["name"], f["n"]) for f in here["families"]] == [("X", 2), ("Y", 1)]
    assert [n["name"] for n in here["nearest"]] == ["C", "B", "A"]  # nearest the centre (2.5, 2.5) first
    assert all(n["km"] <= languages.NEAR_KM for n in here["nearest"])
    assert blocks["5,0"]["n_languages"] == 1 and blocks["5,0"]["families"][0]["name"] == "Z"
    assert "-40,-40" not in blocks  # nothing within range: no block, so the record says unknown


def test_a_cell_with_no_language_point_still_names_the_ones_near_it():
    block = languages.cell_blocks([lang("a", "A", "x", 6, 2.5)], ["0,0"])["0,0"]
    assert block["n_languages"] == 0 and block["families"] == [] and [n["name"] for n in block["nearest"]] == ["A"]


def test_families_are_capped_and_counts_are_kept():
    langs = [lang(f"l{i}", f"L{i}", f"f{i}", 1, 1) for i in range(languages.MAX_FAMILIES + 4)]
    block = languages.cell_blocks(langs, ["0,0"])["0,0"]
    assert len(block["families"]) == languages.MAX_FAMILIES and block["n_families"] == languages.MAX_FAMILIES + 4


# --- the record ---------------------------------------------------------------------------

MEXICO = (17.5, -97.5)  # the Mixtec cell, 15,-100


@pytest.mark.parametrize("year", [1500, 1599, 1900])
def test_the_record_carries_the_languages_from_1500(year):
    f = REAL.record(*MEXICO, year)["fields"]["languages"]
    assert f["source"] == atlas.GLOTTOLOG and f["value"]["baseline_year"] == 1500 and f["value"]["tier"] == "attested"
    assert f["value"]["families"][0]["name"] == "Otomanguean" and "baseline" in f["note"]


@pytest.mark.parametrize("year", [1499, 1400, 0, -3000, -10000])
def test_the_record_says_unknown_before_1500(year):
    assert REAL.record(*MEXICO, year)["fields"]["languages"] == {"value": None, "source": atlas.NONE}


def test_nothing_is_said_for_the_deep_past_and_the_prompt_facts_leave_languages_out():
    assert REAL.record(*MEXICO, -50000)["fields"]["languages"]["source"] == atlas.NONE
    facts = atlas.known_facts(REAL.record(*MEXICO, 1900))
    assert "languages" not in facts
    assert "Otomanguean" not in json.dumps(facts)


def test_the_atlas_blocks_are_small_and_nearly_every_land_cell_has_one():
    cells = REAL.cells
    with_block = [c for c in cells.values() if "languages" in c]
    assert len(with_block) / len(cells) > 0.85
    assert all(len(c["languages"]["families"]) <= languages.MAX_FAMILIES and len(c["languages"]["nearest"]) <= languages.NEAREST
               for c in with_block)


def test_d_place_societies_carry_their_glottocode():
    assert all("glottocode" in s for s in REAL.societies.values())
    assert sum(bool(s["glottocode"]) for s in REAL.societies.values()) > 0.95 * len(REAL.societies)


@pytest.mark.skipif(not GLOTTOLOG_FILES.exists(), reason="Glottolog files not fetched (languages.py fetch)")
def test_pinned_glottolog_files_filter_to_a_clean_baseline():
    rows, macro = languages.read_files()
    kept = {lang["name"] for lang in languages.languages_of(rows, macro)}
    assert not kept & {"Latin", "Classical Chinese", "Hittite", "Esperanto", "Afrikaans", "Haitian", "Tok Pisin"}
    assert {"Basque", "Yoruba", "Classical Nahuatl", "Old Prussian"} <= kept  # old but spoken at the baseline, or plain living
    assert 7000 < len(kept) < 8000
