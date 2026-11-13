"""AADR ingest: date and range parsing, filtering, dedupe, regions, export and the regional report.

A tiny synthetic .anno keeps these independent of the 13 MB download; one smoke test reads the real
table when data/raw/aadr/ has it."""
import gzip
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evidence import aadr  # noqa: E402
from evidence import aadr_report  # noqa: E402
from evidence import regions as reg  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REAL = sorted((ROOT / "data" / "raw" / "aadr").glob(f"*{aadr.ANNO_SUFFIX}"))

# Real headers are long sentences that start with these words; extra columns sit between them.
HEADER = [
    'Genetic ID (suffices: ".DG" is a high coverage shotgun genome...)', "Persistent Genetic ID", "Individual ID",
    "First publication: Abbreviation for earliest paper", "Publication abbreviation",
    "doi for publication of this representation of the data", "Method for Determining Date; unless otherwise specified",
    "Date mean in BP in years before 1950 CE [OxCal mu...]", "Date standard deviation in BP [OxCal sigma...]",
    "Full Date One of two formats.", "Group ID", "Locality", "Political Entity", "Latitude", "Longitude",
    "Molecular Sex", "ASSESSMENT", "ASSESSMENT WARNINGS: X contamination interval",
]


def rec(id="A1.AG", ind=None, pub="SmithNature2020", doi="10.1/x", method="Direct: IntCal20", mean="5000",
        sd="50", full="3100-2900 calBCE (4400±30 BP, X-1)", group="Germany_N", loc="Cave A (Bavaria)",
        country="Germany", lat="48.5", lon="11.5", assess="Pass") -> list[str]:
    return [id, "1", ind or id.split(".")[0], "Smith2020", pub, doi, method, mean, sd, full, group, loc, country,
            lat, lon, "M", assess, ".."]


def write_anno(path: Path, rows: list[list[str]], header: list[str] = HEADER) -> Path:
    path.write_text("\n".join("\t".join(r) for r in [header, *rows]) + "\n", encoding="utf-8")
    return path


# --- dates ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "full, expected",
    [
        ("3648-3528 calBCE (4820±34 BP, UBA-29003)", (5598, 5478)),  # BCE years add 1950
        ("1300-1200 BCE", (3250, 3150)),
        ("600-700 CE", (1350, 1250)),  # CE years subtract from 1950
        ("50 BCE - 120 CE", (2000, 1830)),  # the first year has its own era
        ("51 calBCE - 70 calCE (2012±23 BP, MAMS-43520)", (2001, 1880)),
        ("1300–1200 BCE", (3250, 3150)),  # en dash
        ("550 CE", (1400, 1400)),  # a single year
        (">43500 calBCE (45300±2300 BP, OxA-32278)", None),  # open-ended
        ("present", None),
        ("", None),
    ],
)
def test_parse_range(full, expected):
    assert aadr.parse_range(full) == expected


def test_range_matches_the_tables_own_mean_convention():
    # AADR: '1300-1200 BCE' has mean 3200 BP, the midpoint of 3250 and 3150.
    old, young = aadr.parse_range("1300-1200 BCE")
    assert (old + young) / 2 == 3200


def test_resolve_range_uses_the_table_range_when_it_holds_the_mean():
    assert aadr.resolve_range("1300-1200 BCE", 3200, 29) == (3250, 3150, "anno")
    # an OxCal mu can sit just outside a skewed 95.4% range: within 2 sd is still the table's range
    assert aadr.resolve_range("850-1000 CE", 1125, 43)[2] == "anno"


def test_resolve_range_falls_back_to_mean_and_sd_and_says_why():
    assert aadr.resolve_range(">43500 calBCE", 50000, 5000) == (60000, 40000, "mean_sd")
    old, young, why = aadr.resolve_range("50 BCE - 150 CE", 900, 58)  # a real row: range ~1900 BP, mean 900
    assert why == "conflict" and (old, young) == (1016, 784)


def test_a_fallback_range_never_runs_below_zero_bp():
    assert aadr.resolve_range("", 30, 100)[1] == 0


@pytest.mark.parametrize(
    "method, expected",
    [
        ("Direct: IntCal20", "direct"),
        ("Direct (WARNING: MISSING LAB CODE): IntCal20", "direct"),
        ("Context: Archaeological", "context"),
        ("Context: Direct dates on other individuals at site", "context"),
        ("Method: Tethering to radiocarbon dated close genetic relatives", "tethered"),
        ("Something new", "other"),
    ],
)
def test_date_type(method, expected):
    assert aadr.date_type(method).value == expected


@pytest.mark.parametrize(
    "group, expected",
    [
        ("Germany_N", "sapiens"),
        ("Altai_Neanderthal", "neanderthal"),
        ("VindijaCave_Neanderthal", "neanderthal"),
        ("Russia_Denisova", "denisovan"),
        ("Russia_DenisovaCave_MPleistocene", "denisovan"),
        ("Russia_DenisovaCave", "sapiens"),  # the 2023 pendant DNA: a modern human woman
        ("Russia_Denisova_Neanderthal_Mix", "neanderthal_denisovan"),
        ("Russia_Altai_Medieval", "sapiens"),
    ],
)
def test_hominin(group, expected):
    assert aadr.hominin(group).value == expected


def test_russia_is_split_at_the_urals_and_unknown_countries_have_no_continent():
    assert aadr.continent_of("Russia", 39.3) == "Europe"
    assert aadr.continent_of("Russia", 84.7) == "Asia"
    assert aadr.continent_of("Chile", -70) == "South America"
    assert aadr.continent_of("Atlantis", 0) == ""


# --- parse, dedupe, regions ----------------------------------------------------------------------


def test_parse_drops_present_day_unlocated_and_off_planet_rows(tmp_path):
    p = write_anno(tmp_path / "t.anno", [
        rec("OK.AG"),
        rec("Mod.SG", method="Modern", mean="0", sd="0", full="present"),
        rec("NoLoc.AG", lat="..", lon=".."),
        rec("NoDate.AG", mean=".."),
        rec("Null.AG", lat="0", lon="0"),
        rec("Pole.AG", lat="95", lon="10"),
    ])
    r, stats = aadr.parse(p)
    assert list(r.id) == ["OK.AG"]
    assert stats["rows"] == 6 and stats["dropped_present_day"] == 1
    assert stats["dropped_no_coordinates_or_date"] == 2 and stats["dropped_bad_coordinates"] == 2


def test_parse_reads_dates_range_type_hominin_and_place_precision(tmp_path):
    (row,) = aadr.parse(write_anno(tmp_path / "t.anno", [
        rec("RNI4.AG", full="47600-40250 BCE", mean="45875", sd="2122", method="Context: Archaeological",
            group="Germany_Ranis_IUP", lat="50.663889", lon="11.5")
    ]))[0].itertuples()
    assert (row.date_bp, row.date_sd, row.old, row.young, row.range_src) == (45875, 2122, 49550, 42200, "anno")
    assert row.date_type == "context" and row.hominin == "sapiens"
    assert row.loc_dp == 1  # the coarser of the two coordinates decides


def test_parse_finds_columns_by_header_text_and_rejects_a_table_without_them(tmp_path):
    shuffled = [HEADER[i] for i in (2, 0, *range(3, len(HEADER)))]
    with pytest.raises(ValueError, match="missing expected columns"):
        aadr.parse(write_anno(tmp_path / "bad.anno", [], header=[h for h in HEADER if not h.startswith("Latitude")]))
    # column order does not matter: only the header text does
    r, _ = aadr.parse(write_anno(tmp_path / "ok.anno", [[rec("Z.AG")[i] for i in (2, 0, *range(3, len(HEADER)))]], shuffled))
    assert list(r.id) == ["Z.AG"]


def test_assessment_is_not_confused_with_the_warnings_column(tmp_path):
    (row,) = aadr.parse(write_anno(tmp_path / "t.anno", [rec(assess="Questionable")]))[0].itertuples()
    assert row.assess == "Questionable"


def test_dedupe_keeps_the_best_assessed_library_of_each_individual(tmp_path):
    p = write_anno(tmp_path / "t.anno", [
        rec("X1.AG", ind="X1", assess="Questionable"),
        rec("X1_d.AG", ind="X1", assess="Pass"),
        rec("X1.SG", ind="X1", assess="Pass"),  # tie: the earlier row in the file wins
        rec("Y2.AG", ind="Y2"),
    ])
    r, dropped, disagree = aadr.dedupe(aadr.parse(p)[0])
    assert list(r.id) == ["X1_d.AG", "Y2.AG"] and dropped == 2 and disagree == 0


def test_dedupe_counts_individuals_whose_libraries_disagree(tmp_path):
    p = write_anno(tmp_path / "t.anno", [rec("X1.AG", ind="X1", mean="5000"), rec("X1.SG", ind="X1", mean="6000")])
    assert aadr.dedupe(aadr.parse(p)[0])[2] == 1


def test_regions_follow_the_arrival_table_boxes_and_continents(tmp_path):
    p = write_anno(tmp_path / "t.anno", [
        rec("EU.AG", country="Germany", lat="50.7", lon="11.6"),
        rec("TY.AG", country="China", lat="39.4", lon="115.5"),
        rec("MA.AG", country="Russia", lat="51.4", lon="84.7"),  # Altai: Asia, Siberia box
        rec("PNG.AG", country="Papua New Guinea", lat="-4.3", lon="152.2"),
        rec("TZ.AG", country="Tanzania", lat="-7.6", lon="35.0"),
        rec("CL.AG", country="Chile", lat="-31.9", lon="-71.5"),
        rec("TR.AG", country="Turkey", lat="40.5", lon="31.0"),  # Anatolia is not in the table
    ])
    r, stats = aadr.ingest(p)
    assert dict(zip(r.id, r.region)) == {
        "EU.AG": "europe", "TY.AG": "east_asia", "MA.AG": "siberia_arctic", "PNG.AG": "sahul",
        "TZ.AG": "africa", "CL.AG": "americas", "TR.AG": reg.OTHER,
    }
    assert stats["unmapped_countries"] == []


def test_unmapped_country_is_reported_not_silently_placed(tmp_path):
    r, stats = aadr.ingest(write_anno(tmp_path / "t.anno", [rec(country="Atlantis")]))
    assert stats["unmapped_countries"] == ["Atlantis"] and r.region.iloc[0] == reg.OTHER


# --- export --------------------------------------------------------------------------------------


def test_export_round_trip_keeps_fields_and_marks_what_is_unusual(tmp_path):
    p = write_anno(tmp_path / "t.anno", [
        rec("A.AG", pub="PaperOne", doi="10.1/a"),
        rec("B.SG", pub="PaperOne", doi="10.1/a", lat="49.0"),
        rec("N.DG", group="Altai_Neanderthal", full=">43500 calBCE", mean="110000", sd="9000", country="Russia",
            lat="51.4", lon="84.7"),
    ])
    r, stats = aadr.ingest(p)
    out = tmp_path / "o" / "aadr_samples.json.gz"
    meta = aadr.export_web(r, stats, "v0", out)
    doc = json.load(gzip.open(out, "rt", encoding="utf-8"))
    assert doc["meta"] == json.loads(json.dumps(meta))
    assert meta["counts"]["samples_exported"] == 3
    assert doc["refs"][0] == "PaperOne (doi:10.1/a)" and len(doc["refs"]) == 2  # interned: two papers, not three
    by_id = {s["id"]: s for s in doc["samples"]}
    a = by_id["A.AG"]
    assert (a["d"], a["sd"], a["r"], a["t"], a["rg"], a["c"], a["g"]) == (
        5000, 50, [5050, 4850], "d", "europe", "Germany", "Germany_N")
    assert "h" not in a and "rs" not in a  # only written when unusual
    assert by_id["N.DG"]["h"] == "neanderthal" and by_id["N.DG"]["rs"] == "mean_sd"
    assert [s["la"] for s in doc["samples"]] == sorted(s["la"] for s in doc["samples"])  # stable order
    assert "head count" in meta["caveat"] and "Neanderthals" in meta["attribution"]


# --- report --------------------------------------------------------------------------------------


def samples(rows: list[list[str]], tmp_path: Path):
    return aadr.ingest(write_anno(tmp_path / "t.anno", rows))


def test_usable_leaves_out_archaic_conflicting_and_curator_flagged_samples(tmp_path):
    r, _ = samples([
        rec("Good.AG"),
        rec("Nean.DG", group="Altai_Neanderthal"),
        rec("Bad.AG", full="50 BCE - 150 CE", mean="900", sd="58"),  # range and mean disagree
        rec("Flag.AG", group="China_Cave-DontUseHighlyProblematic"),
    ], tmp_path)
    assert list(aadr_report.usable(r).id) == ["Good.AG"]


def test_oldest_per_site_lists_one_sample_per_site_oldest_first_and_direct_apart(tmp_path):
    r, stats = samples([
        rec("Old1.AG", loc="Cave A", mean="9000", sd="50", full="7100-6900 BCE", method="Context: Archaeological"),
        rec("Old2.AG", loc="Cave A", mean="8000", sd="50", full="6100-5900 BCE"),  # same site, younger
        rec("Dir.AG", loc="Cave B", mean="7000", sd="50", full="5100-4900 BCE", lat="49.0"),
        rec("Pol.AG", loc="Cave C", country="Poland", mean="6000", sd="50", full="4100-3900 BCE", lat="52.0", lon="18.0"),
    ], tmp_path)
    rep = aadr_report.report(r, stats)["regions"]["europe"]
    assert [s["id"] for s in rep["oldest"]] == ["Old1.AG", "Dir.AG", "Pol.AG"]
    assert [s["id"] for s in rep["oldest_direct"]] == ["Old2.AG", "Dir.AG", "Pol.AG"]
    assert rep["samples"] == 4 and rep["direct"] == 3


def test_coverage_counts_each_sample_in_exactly_one_era(tmp_path):
    ages = {"a": 49000, "b": 31000, "c": 12000, "d": 11999, "e": 5000, "f": 300}
    r, stats = samples([
        rec(f"{k}.AG", mean=str(v), sd="10", full="", lat=str(40 + i)) for i, (k, v) in enumerate(ages.items())
    ], tmp_path)
    cov = aadr_report.report(r, stats)["coverage"]
    assert sum(cov["by_era"].values()) == len(ages)
    assert cov["by_era"]["50-40 ka"] == 1 and cov["by_era"]["40-30 ka"] == 1 and cov["by_era"]["30-20 ka"] == 0
    assert cov["by_era"]["20-12 ka"] == 1 and cov["by_era"]["12-8 ka"] == 1  # 12,000 BP opens the 20-12 era
    assert cov["by_era"]["8-5 ka"] == 1 and cov["by_era"]["5-3 ka"] == 0 and cov["by_era"]["< 1 ka"] == 1  # 5,000 opens 8-5


def test_bias_says_how_europe_and_holocene_heavy_the_samples_are(tmp_path):
    r, stats = samples([
        rec("E1.AG", mean="3000", full=""), rec("E2.AG", mean="4000", full="", lat="49"),
        rec("E3.AG", mean="30000", full="", lat="50"),
        rec("T.AG", country="China", lat="39.4", lon="115.5", mean="39000", full=""),
    ], tmp_path)
    rep = aadr_report.report(r, stats)
    assert rep["bias"]["europe_share"] == 0.75 and rep["bias"]["holocene_share"] == 0.5
    assert rep["bias"]["older_than_12ka"] == 2 and rep["bias"]["older_than_12ka_europe"] == 1
    assert "japan" in rep["bias"]["regions_without_a_pre_12ka_sample"]
    text = aadr_report.render_markdown(rep, "t.anno")
    assert "Europe-heavy" in text and "Holocene-heavy" in text and "### Europe" in text
    assert "Neanderthals and Denisovans" in text


def test_archaic_samples_are_listed_separately_and_never_counted(tmp_path):
    r, stats = samples([rec("S.AG"), rec("N.DG", group="Altai_Neanderthal", mean="110000", sd="9000", full="")], tmp_path)
    rep = aadr_report.report(r, stats)
    assert rep["coverage"]["samples"] == 1
    assert [(a["id"], a["hominin"]) for a in rep["archaic"]] == [("N.DG", "neanderthal")]


# --- the real table ------------------------------------------------------------------------------


@pytest.mark.skipif(not REAL, reason="data/raw/aadr/ has no annotation table (run aadr.py fetch)")
def test_real_table_has_the_shape_the_parser_assumes():
    r, stats = aadr.ingest(REAL[-1])
    assert stats["unmapped_countries"] == []  # a new country in a new release must be added to the table
    assert r.id.is_unique and r.individual.is_unique
    assert len(r) > 15_000 and r.date_bp.between(0, 200_000).all()
    assert (r.old >= r.young).all() and (r.young > -100).all()  # a few ranges run past 1950 CE
    assert r.region.isin([*reg.REGION_IDS, reg.OTHER]).all()
    assert set(r.hominin) >= {"sapiens", "neanderthal", "denisovan"}
    assert (r.range_src == "anno").mean() > 0.95  # the table's own ranges read, with few exceptions
    ust = r[r.id == "Ust_Ishim.DG"].iloc[0]  # the classic 45 ka anchor: direct date, Siberia
    assert ust.date_type == "direct" and ust.region == "siberia_arctic" and 43_000 < ust.date_bp < 46_000
