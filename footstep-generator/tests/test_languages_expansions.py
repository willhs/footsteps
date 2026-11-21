"""The cited language expansions table (research 0007 steps 2-3): its rules, the 5 ka floor and the committed asset."""
import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "anthropology"))
import languages_expansions as le  # noqa: E402

TABLE = le.load()
ROWS = {r["id"]: r for r in TABLE["rows"]}


def broken(row_id: str, **changes) -> dict:
    table = copy.deepcopy(TABLE)
    row = next(r for r in table["rows"] if r["id"] == row_id)
    for key, value in changes.items():
        if value is None:
            row.pop(key)
        else:
            row[key] = value
    return table


def test_committed_table_is_valid():
    le.validate(TABLE)


def test_every_planned_movement_is_a_row():
    families = {r["family"] for r in TABLE["rows"]}
    # Step 2: colonial and historical; step 3: Findings §2 of research 0007.
    assert {"Spanish", "Portuguese", "English", "Arabic", "Turkic"} <= families
    assert {"Bantu", "Austronesian", "Indo-European", "Afro-Asiatic", "Uralic", "Sino-Tibetan", "Pama-Nyungan",
            "Uto-Aztecan", "Quechuan", "Aymaran"} <= families
    english = {r["id"] for r in TABLE["rows"] if r["family"] == "English"}
    assert {"english-north-america-east", "english-australia", "english-new-zealand"} <= english


def test_disputed_families_have_no_area_until_a_model_is_chosen():
    for rid in ("indo-european", "afro-asiatic", "uto-aztecan"):
        assert ROWS[rid]["disputed"] is True and ROWS[rid]["boxes"] == []
    exported = {r["id"] for r in le.export(TABLE)["rows"]}
    assert not exported & {"indo-european", "afro-asiatic", "uto-aztecan"}


def test_every_row_is_checked_with_a_link_or_says_why_not():
    for r in TABLE["rows"]:
        if r["checked"]:
            assert le.LINK.search(r["source"]), r["id"]
            assert r["unverified"] == "", r["id"]
        else:
            assert r["unverified"].strip(), r["id"]


@pytest.mark.parametrize("changes, message", [
    ({"checked": False, "unverified": ""}, "unverified must say why"),
    ({"source": "Koile et al. 2022, from memory"}, "no doi: or URL"),
    ({"boxes": [[-10, 5, 10, 31]]}, "off the 5° grid"),
    ({"boxes": [[10, 5, -10, 30]]}, "empty or out of range"),
    ({"boxes": []}, "only a disputed row"),
    ({"start_bp": [5000, 4040]}, "lo <= hi"),
    ({"glottocode": "bantu"}, "not a Glottolog id"),
    ({"note": None}, "missing note"),
])
def test_validate_rejects_a_broken_row(changes, message):
    with pytest.raises(ValueError, match=message):
        le.validate(broken("bantu-west-central", **changes))


def test_from_year_is_the_start_or_the_older_end_of_the_range():
    assert le.from_year(ROWS["spanish-mexico"]) == 1519
    assert le.from_year(ROWS["bantu-east"]) == 1950 - 3000
    assert le.from_year(ROWS["austronesian-east-polynesia"]) == 1950 - 760


def test_nothing_is_shown_before_5_ka():
    assert le.FLOOR_YEAR == -3050
    # Rows whose range reaches past 5 ka are clamped to the floor, never earlier.
    for rid in ("austronesian-taiwan", "pama-nyungan", "sino-tibetan", "uralic"):
        assert max(ROWS[rid]["start_bp"]) > le.FLOOR_BP
        assert le.from_year(ROWS[rid]) == le.FLOOR_YEAR
    assert min(r["from_year"] for r in le.export(TABLE)["rows"]) == le.FLOOR_YEAR
    deep = {"kind": "deep", "start_bp": [40000, 60000]}
    assert le.from_year(deep) == le.FLOOR_YEAR


def test_committed_asset_matches_the_table():
    assert le.OUT.read_text() == le.render(TABLE), "re-run languages_expansions.py"


def test_asset_is_small():
    assert le.OUT.stat().st_size < 16_000
