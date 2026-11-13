"""Ethnographic analogs: ingest of D-PLACE-shaped files, the committed export, and the analog ranking."""
import re
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "footstep-generator" / "anthropology"))
sys.path.insert(0, str(ROOT / "deploy" / "budgie" / "api"))
import atlas  # noqa: E402
import ethnography as eth  # noqa: E402

REAL = eth.load()


# --- a miniature D-PLACE to ingest -----------------------------------------------------------

SOC_HEAD = "ID,Name,Latitude,Longitude,Glottocode,xd_id,main_focal_year,region\n"
DATA_HEAD = "ID,Soc_ID,Var_ID,Value,Code_ID,Source\n"


def make_zip(path: Path, files: dict[str, str], comment: str = "abc123") -> Path:
    with zipfile.ZipFile(path, "w") as z:
        for name, text in files.items():
            z.writestr(f"dplace-dataset-x-main/cldf/{name}", text)
        z.comment = comment.encode()
    return path


def data_rows(rows: list[tuple]) -> str:
    return DATA_HEAD + "".join(f"{i},{s},{v},{val},{code},{src}\n" for i, (s, v, val, code, src) in enumerate(rows))


BIB = "@book{lee1979,\n    author = {Lee, R.},\n    title = {The !Kung San},\n    year = {1979}\n}\n"


@pytest.fixture
def mini(tmp_path, monkeypatch):
    """EA: a forager (Aa1) and a town-dwelling farmer (Ab1). Binford: the same forager (xd1) and one
    forager the Atlas lacks (B9). SCCS: the first forager. Climate and biome for all."""
    ea = make_zip(tmp_path / "ea.zip", {
        "societies.csv": SOC_HEAD + "Aa1,!Kung,-20,21,juho1239,xd1,1950,Southern Africa\n"
                                    "Ab1,Hausa,12,8,haus1257,xd2,1900,Western Africa\n",
        "data.csv": data_rows([
            ("Aa1", "EA001", "76-85%", "EA001-8", "lee1979"), ("Aa1", "EA002", "6-15%", "EA002-1", ""),
            ("Aa1", "EA003", "0-5%", "EA003-0", ""), ("Aa1", "EA004", "0-5%", "EA004-0", ""),
            ("Aa1", "EA005", "0-5%", "EA005-0", ""), ("Aa1", "EA034", "x", "EA034-3", ""),
            ("Ab1", "EA001", "0-5%", "EA001-0", ""), ("Ab1", "EA002", "0-5%", "EA002-0", ""),
            ("Ab1", "EA003", "0-5%", "EA003-0", ""), ("Ab1", "EA004", "6-15%", "EA004-1", ""),
            ("Ab1", "EA005", "86-100%", "EA005-9", ""), ("Ab1", "EA031", "x", "EA031-7", ""),
            ("Ab1", "EA034", "Missing data", "EA034-NA", ""),
        ]),
        "codes.csv": "ID,Var_ID,Name,Description,ord\n" + "".join(
            f"EA001-{n},EA001,{lo}-{hi}%,x,0\n" for n, (lo, hi) in {0: (0, 5), 8: (76, 85), 9: (86, 100)}.items())
        + "EA002-0,EA002,0-5%,x,0\nEA002-1,EA002,6-15%,x,0\nEA003-0,EA003,0-5%,x,0\nEA004-0,EA004,0-5%,x,0\n"
          "EA004-1,EA004,6-15%,x,0\nEA005-0,EA005,0-5%,x,0\nEA005-9,EA005,86-100%,x,0\n"
          "EA031-7,EA031,5000-50000,x,0\nEA034-3,EA034,Active but not moral,x,0\n",
        "sources.bib": BIB,
    })
    sccs = make_zip(tmp_path / "sccs.zip", {
        "societies.csv": SOC_HEAD + "SCCS2,!Kung,-20,21,juho1239,xd1,1950,Southern Africa\n",
        "data.csv": data_rows([("SCCS2", "SCCS891", "Infrequent", "SCCS891-3", "")]),
        "codes.csv": "ID,Var_ID,Name,Description,ord\nSCCS891-3,SCCS891,Infrequent,x,0\n",
        "sources.bib": BIB,
    })
    binford = make_zip(tmp_path / "b.zip", {
        "societies.csv": SOC_HEAD + "B72,!Kung,-20,21.18,juho1239,xd1,1950,Southern Africa\n"
                                    "B9,Nunamiut,68,-153,x,xd9,1900,Arctic\n",
        "data.csv": data_rows([
            ("B72", "B011", "24.3", "", ""), ("B72", "B009", "Mobile", "B009-1", ""),
            ("B9", "B001", "10", "", ""), ("B9", "B002", "80", "", ""), ("B9", "B003", "10", "", ""),
            ("B9", "B004", "Hunting", "B004-1", ""), ("B9", "B011", "-999", "", ""),
        ]),
        "codes.csv": "ID,Var_ID,Name,Description,ord\nB009-1,B009,Mobile,x,0\nB004-1,B004,Hunting,x,0\n",
        "sources.bib": BIB,
    })
    teow = make_zip(tmp_path / "teow.zip", {
        "data.csv": "ID,Soc_ID,Var_ID,Value,Code_ID\n1,Aa1,Biome,Deserts & Xeric Shrublands,Biome-13\n"
                    "2,Ab1,Biome,,Biome-NA\n3,B9,Biome,Tundra,Biome-11\n"})
    eco = make_zip(tmp_path / "eco.zip", {
        "data.csv": "ID,Soc_ID,Var_ID,Value\n1,Aa1,AnnualMeanTemperature,21.04\n"
                    "2,Aa1,MonthlyMeanPrecipitation,40000\n3,B9,AnnualMeanTemperature,-12.5\n"})
    monkeypatch.setattr(eth, "ZIPS", {"EA": ea, "SCCS": sccs, "Binford": binford, "TEOW": teow, "ecoClimate": eco})
    return eth.build_export()


def by_name(export: dict, name: str) -> dict:
    return next(s for s in export["societies"] if s["name"] == name)


def test_one_society_per_xd_id_with_variables_from_each_dataset(mini):
    kung = by_name(mini, "!Kung")
    assert kung["ids"] == {"EA": "Aa1", "SCCS": "SCCS2", "Binford": "B72"}
    assert kung["values"]["high_gods"] == 3  # Atlas
    assert kung["values"]["internal_war"] == 3  # SCCS
    assert kung["values"]["camp_size_aggregated"] == 24.3  # Binford
    assert kung["values"]["mobility"] == 1
    assert len(mini["societies"]) == 3  # !Kung once, not three times


def test_subsistence_bands_become_midpoint_percentages(mini):
    kung, hausa = by_name(mini, "!Kung")["values"], by_name(mini, "Hausa")["values"]
    assert (kung["gathering"], kung["hunting"], kung["agriculture"]) == (80.5, 10.5, 2.5)
    assert hausa["agriculture"] == 93.0  # the open "86-100%" band


def test_way_of_life_comes_from_the_atlas_rule_then_binford_then_towns(mini):
    assert by_name(mini, "!Kung")["way"] == "foraging"
    assert by_name(mini, "Nunamiut")["way"] == "foraging"  # Binford only: hunting
    assert by_name(mini, "Hausa")["way"] == "urban"  # farming, but EA031 says towns over 5,000


def test_binford_only_society_gets_its_mix_and_drops_missing_numbers(mini):
    values = by_name(mini, "Nunamiut")["values"]
    assert (values["hunting"], values["gathering"], values["herding"], values["agriculture"]) == (80, 10, 0, 0)
    assert "camp_size_aggregated" not in values  # -999 is Binford's "no data"


def test_missing_code_is_left_out_not_zeroed(mini):
    assert "high_gods" not in by_name(mini, "Hausa")["values"]


def test_climate_and_biome_attach_and_precipitation_is_millimetres_per_year(mini):
    kung = by_name(mini, "!Kung")
    assert kung["biome"] == "Deserts & Xeric Shrublands"
    assert kung["temp_c"] == 21.0
    assert kung["precip_mm"] == 480  # 40,000 ml/m2/month = 40 mm a month
    assert "biome" not in by_name(mini, "Hausa")


def test_export_cites_sources_and_the_codebook(mini):
    assert mini["bib"]["lee1979"] == "Lee, R. (1979). The !Kung San"
    assert by_name(mini, "!Kung")["sources"] == ["lee1979"]
    assert mini["datasets"]["EA"]["commit"] == "abc123"
    assert mini["variables"]["high_gods"]["codes"]["3"] == "Active but not moral"
    assert mini["variables"]["high_gods"]["id"] == "EA034"


# --- the committed export ----------------------------------------------------------------------

def test_export_is_a_global_sample_of_every_way_of_life():
    ways = {s["way"] for s in REAL["societies"]}
    assert ways == set(eth.WAYS)
    assert len(REAL["societies"]) >= 1300
    assert all(-90 <= s["lat"] <= 90 and -180 <= s["lon"] <= 180 for s in REAL["societies"])


def test_every_value_decodes_and_every_source_is_cited():
    for s in REAL["societies"]:
        for key, value in s["values"].items():
            var = REAL["variables"][key]
            if var["kind"] == "code":
                assert str(value) in var["codes"], (s["name"], key, value)
        assert set(s["sources"]) <= set(REAL["bib"]), s["name"]


def test_variables_each_ground_a_constant_in_the_constants_doc():
    doc = (ROOT / "docs" / "philosophy" / "human-constants.md").read_text()
    constants = set(re.findall(r"^\| \*\*(.+?)\*\* \|", doc, re.M))
    assert {v["constant"] for v in REAL["variables"].values()} <= constants
    assert len(eth.VARIABLES) - len(eth.SUBSISTENCE_KEYS) + 1 == 25  # the task's "about 15-25", the five-part mix counted once


def test_way_of_life_agrees_with_the_atlas_for_every_society_it_already_uses():
    ours = {(s["name"], s["lat"], s["lon"]): s["way"] for s in REAL["societies"]}
    checked = 0
    for soc in atlas.Atlas.load(ROOT / "deploy" / "budgie" / "api" / "anthropology.json.gz").societies.values():
        way = ours.get((soc["name"], soc["lat"], soc["lon"]))
        if way and way != "urban" and soc["class"]:
            assert way == soc["class"], soc["name"]
            checked += 1
    assert checked > 100


# --- ranking, on a small hand-made export ------------------------------------------------------

def soc(name, way, lat, lon, biome, temp, precip, year=1900, **values):
    mix = {"foraging": {"gathering": 60, "hunting": 30}, "farming": {"agriculture": 80, "herding": 20},
           "herding": {"herding": 70, "agriculture": 30}, "fishing": {"fishing": 80, "gathering": 20},
           "urban": {"agriculture": 70, "herding": 30}}[way]
    return {"id": name, "name": name, "lat": lat, "lon": lon, "year": year, "region": "R", "way": way,
            "biome": biome, "temp_c": temp, "precip_mm": precip, "values": {**mix, **values}}


DESERT, FOREST = "Deserts & Xeric Shrublands", "Boreal Forests/Taiga"
TOY = {"societies": [
    soc("Dry", "foraging", 0, 0, DESERT, 25, 200),
    soc("Wet", "foraging", 0, 1, "Tropical & Subtropical Moist Broadleaf Forests", 26, 2500),
    soc("Cold", "foraging", 60, 100, FOREST, -8, 500),
    soc("Farmers", "farming", 0, 0, DESERT, 25, 200),
    soc("Old", "urban", 31, 46, DESERT, 24, 80, year=-2000),
]}


def names(result):
    return [a.society["name"] for a in result.analogs]


def test_the_environment_decides_between_foragers_the_same_distance_away():
    dry = eth.nearest_analogs(TOY, 0, 0.5, 1000, "foraging", biome="Desert", temp_c=24, precip_mm=250)
    assert names(dry)[0] == "Dry"
    wet = eth.nearest_analogs(TOY, 0, 0.5, 1000, "foraging", biome="Tropical evergreen forest", temp_c=26,
                              precip_mm=2200)
    assert names(wet)[0] == "Wet"


def test_only_societies_of_the_asked_way_of_life_are_ranked_and_k_limits_them():
    result = eth.nearest_analogs(TOY, 0, 0, 1000, "forager", k=2)
    assert len(names(result)) == 2 and "Farmers" not in names(result)
    assert result.pool == 3
    assert names(eth.nearest_analogs(TOY, 0, 0, 1000, "farmer")) == ["Farmers"]


def test_scores_run_from_a_perfect_match_down():
    perfect = eth.nearest_analogs(TOY, 0, 0, 1000, "foraging", biome="Desert", temp_c=25, precip_mm=200).analogs[0]
    assert perfect.society["name"] == "Dry"
    assert perfect.parts["temperature"] == perfect.parts["precipitation"] == perfect.parts["biome"] == 1.0
    assert perfect.score == 1.0
    far = eth.nearest_analogs(TOY, 0, 0, 1000, "foraging", biome="Desert", temp_c=25, precip_mm=200).analogs[-1]
    assert far.society["name"] == "Cold" and far.score < 0.5


def test_missing_environment_is_not_scored_and_the_result_says_so():
    result = eth.nearest_analogs(TOY, 60, 99, 1000, "foraging")
    assert names(result)[0] == "Cold"  # nearest, since nothing else is known
    assert result.basis == ("subsistence", "proximity")
    assert any("way of life and distance only" in w for w in result.warnings)


def test_every_result_says_the_ethnographic_present_is_not_the_past():
    result = eth.nearest_analogs(TOY, 0, 0, -6000, "foraging")
    assert "not the past" in result.caveat
    assert "1850-1950" in result.caveat
    assert "not the past" in eth.describe(TOY | {"variables": {}}, result)


def test_analog_reports_how_long_after_the_asked_year_it_was_recorded():
    analog = eth.nearest_analogs(TOY, 0, 0, -6000, "foraging").analogs[0]
    assert analog.gap_years == 7900 and analog.record == "ethnographic present"
    old = eth.nearest_analogs(TOY, 31, 46, -2500, "urban").analogs[0]
    assert (old.gap_years, old.record) == (500, "historical account")


def test_a_way_of_life_before_it_is_known_anywhere_carries_a_warning():
    early = eth.nearest_analogs(TOY, 31, 46, -12000, "city")
    assert early.analogs and any("3500 BCE" in w for w in early.warnings)


def test_no_warning_when_the_way_of_life_existed():
    result = eth.nearest_analogs(TOY, 31, 46, -2500, "city", biome="Desert", temp_c=24, precip_mm=100)
    assert result.warnings == ()


def test_unknown_way_of_life_and_unknown_biome_are_not_guessed():
    with pytest.raises(ValueError):
        eth.nearest_analogs(TOY, 0, 0, 1000, "sailor")
    result = eth.nearest_analogs(TOY, 0, 0, 1000, "foraging", biome="Swamp")
    assert any("Swamp" in w for w in result.warnings) and "biome" not in result.analogs[0].parts


def test_cell_centre_matches_the_atlas_cell_key():
    assert eth.cell_centre(atlas.cell_of(-18.3, 22.9)) == (-17.5, 22.5)


# --- three places on the real export -----------------------------------------------------------
# Climate and biome are what the app's habitat lookup (Beyer 2020 / Krapp 2021) gives there and then.

def test_kalahari_foragers_in_the_mid_holocene_are_san_peoples():
    result = eth.nearest_analogs(REAL, -20.5, 21.5, -6000, "foraging", biome="Tropical xerophytic shrubland",
                                 temp_c=22.2, precip_mm=249)
    assert {a.society["region"] for a in result.analogs} == {"Southern Africa"}
    assert all(a.society["values"]["mobility"] == 1 for a in result.analogs)  # all fully mobile
    assert all(a.gap_years > 7000 for a in result.analogs)


def test_kazakh_steppe_herders_are_the_kazakh_first():
    result = eth.nearest_analogs(REAL, 48.5, 70.5, -1000, "herding", biome="Desert", temp_c=3.3, precip_mm=252)
    assert result.analogs[0].society["name"] == "Kazakh"
    assert result.analogs[0].society["values"]["settlement_pattern"] == 2  # seminomadic
    assert result.analogs[0].distance_km < 200


def test_a_city_in_southern_mesopotamia_is_the_babylonians_marked_as_history():
    result = eth.nearest_analogs(REAL, 31.5, 46.5, -2500, "city", biome="Desert", temp_c=23.7, precip_mm=168)
    top = result.analogs[0]
    assert top.society["name"] == "Babylonians" and top.record == "historical account"
    assert top.society["values"]["community_size"] == 8  # indigenous cities over 50,000
