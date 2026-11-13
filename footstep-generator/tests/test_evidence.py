"""p3k14c ingest: calibration, site grouping, regions, export and the regional report.

Synthetic curves and a tiny CSV keep these independent of the downloads; one test checks
real IntCal20 values when data/raw/p3k14c/ has the curve."""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evidence import calibrate as cal  # noqa: E402
from evidence import p3k14c as p3  # noqa: E402
from evidence import regions as reg  # noqa: E402
from evidence import report  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
INTCAL = ROOT / "data" / "raw" / "p3k14c" / "intcal20.14c"


def identity_curve(sigma: float = 0.0) -> cal.Curve:
    """14C age == cal age, so a date calibrates to itself +- its error."""
    return cal.Curve("identity", cal.CAL_GRID.copy(), np.full_like(cal.CAL_GRID, sigma))


def test_identity_curve_returns_age_within_two_sigma():
    (r,) = cal.calibrate(np.array([5000.0]), np.array([50.0]), identity_curve())
    assert r.status is cal.CalStatus.OK
    assert r.median == pytest.approx(5000, abs=5)
    assert len(r.intervals) == 1
    old, young = r.intervals[0]
    assert old == pytest.approx(5100, abs=10) and young == pytest.approx(4900, abs=10)


def test_multimodal_curve_keeps_every_interval():
    # A curve that wiggles so one 14C age matches two calendar ages.
    c14 = 4000 + 400 * np.sin(cal.CAL_GRID / 300.0)
    curve = cal.Curve("wiggle", c14, np.zeros_like(c14))
    (r,) = cal.calibrate(np.array([4000.0]), np.array([20.0]), curve)
    assert len(r.intervals) > 1
    assert r.old == r.intervals[0][0] and r.young == r.intervals[-1][1]


def test_date_older_than_curve_is_flagged_not_calibrated():
    (r,) = cal.calibrate(np.array([60000.0]), np.array([100.0]), identity_curve())
    assert r.status is cal.CalStatus.OLDER_THAN_CURVE
    assert r.intervals == () and r.old is None and r.median is None


def test_batch_order_does_not_matter():
    ages = np.array([9000.0, 300.0, 4500.0, 30000.0])
    errs = np.array([60.0, 20.0, 40.0, 400.0])
    together = cal.calibrate(ages, errs, identity_curve(), chunk=2)
    for i in range(len(ages)):
        (alone,) = cal.calibrate(ages[i : i + 1], errs[i : i + 1], identity_curve())
        assert together[i] == alone


@pytest.mark.skipif(not INTCAL.exists(), reason="run evidence/p3k14c.py fetch first")
def test_intcal20_known_values():
    curve = cal.load_curve(INTCAL, "IntCal20")
    (r,) = cal.calibrate(np.array([3000.0]), np.array([30.0]), curve)
    # OxCal gives 3330-3070 cal BP (95.4%) for 3000 +- 30.
    assert 3300 <= r.old <= 3350 and 3050 <= r.young <= 3100
    (r,) = cal.calibrate(np.array([10000.0]), np.array([50.0]), curve)
    assert 11200 <= r.young and r.old <= 11800


@pytest.mark.parametrize(
    "material,taxa,expected",
    [
        ("charcoal", "", p3.CarbonSource.TERRESTRIAL),
        ("bone collagen", "Bos taurus", p3.CarbonSource.TERRESTRIAL),
        ("shell", "Mytilus californianus", p3.CarbonSource.MARINE),
        ("seal bone", "", p3.CarbonSource.MARINE),
        ("shell", "", p3.CarbonSource.UNCERTAIN),
        ("organic sediment", "", p3.CarbonSource.UNCERTAIN),
        ("sealed jar charcoal", "", p3.CarbonSource.TERRESTRIAL),
    ],
)
def test_carbon_source(material, taxa, expected):
    assert p3.carbon_source(material, taxa) is expected


def test_text_repair_and_normalisation():
    assert p3.fix_text("√úcgiz Cave") == "Ücgiz Cave"
    assert p3.fix_text("Sine-Ngayène") == "Sine-Ngayène"
    assert p3.norm_name("Çatalhöyük East") == p3.norm_name("catalhoyuk  east")
    assert p3.norm_method("AMS") == "AMS" and p3.norm_method("RADIOMETRICPLUS") == "radiometric"
    assert p3.norm_method(float("nan")) == "unknown"


def test_regions_first_match_wins_and_uses_continent():
    pts = {
        "japan": (35.7, 139.7, "Asia"),
        "levant_arabia": (32.0, 35.0, "Asia"),
        "sahul": (-33.9, 151.2, "Australia"),
        "africa": (-26.0, 28.0, "Africa"),
        "europe": (48.8, 2.3, "Europe"),
        "americas": (40.0, -100.0, "North America"),
        "east_asia": (34.0, 108.0, "Asia"),
        "tibetan_plateau": (32.0, 90.0, "Asia"),
        reg.OTHER: (40.0, 70.0, "Asia"),
    }
    got = reg.assign_regions(
        np.array([v[0] for v in pts.values()]),
        np.array([v[1] for v in pts.values()]),
        np.array([v[2] for v in pts.values()]),
    )
    assert dict(zip(pts, got)) == {k: k for k in pts}


def test_every_table_region_has_an_id_and_unique_ids():
    assert len(set(reg.REGION_IDS)) == len(reg.REGION_IDS)
    assert {"africa", "europe", "americas", "sahul", "japan"} <= set(reg.REGION_IDS)


CSV_HEADER = "LabID,Age,Error,Material,Taxa,d13C,Method,Long,Lat,LocAccuracy,Period,SiteID,SiteName,Country,Province,Continent,Source,Reference\n"


def write_csv(path: Path, rows: list[str]) -> Path:
    path.write_text(CSV_HEADER + "\n".join(rows) + "\n", encoding="utf-8")
    return path


def test_parse_drops_unplaceable_and_dedupes_across_catalogues(tmp_path):
    csv = write_csv(
        tmp_path / "p.csv",
        [
            # Same sample under two lab ids, same site: one survives (the better placed).
            "A-1,5000,50,charcoal,,,AMS,10.0,50.0,2,,,Cave One,France,,Europe,SrcA,Ref A",
            "B-9,5000,50,charcoal,,,AMS,10.0,50.0,3,,,Cave One,France,,Europe,SrcB,Ref B",
            # Same age and error, but only a province centroid: never treated as a duplicate.
            "C-1,5000,50,charcoal,,,,11.0,51.0,1,,,,France,,Europe,SrcA,",
            "C-2,5000,50,charcoal,,,,11.0,51.0,1,,,,France,,Europe,SrcA,",
            # No coordinates: dropped and counted.
            "D-1,4000,50,charcoal,,,,,,0,,,Lost,France,,Europe,SrcA,",
        ],
    )
    d, stats = p3.parse(csv)
    assert stats["raw_rows"] == 5
    assert stats["dropped_no_coordinates"] == 1
    assert stats["dropped_cross_catalogue_duplicates"] == 1
    assert sorted(d.lab_id) == ["B-9", "C-1", "C-2"]
    assert d.set_index("lab_id").loc["B-9", "acc"] == 3


def test_parse_rejects_a_csv_without_the_expected_columns(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("LabID,Age\nA-1,100\n")
    with pytest.raises(ValueError, match="missing columns"):
        p3.parse(bad)


def dates_frame(rows: list[dict]) -> pd.DataFrame:
    base = dict(
        site_name="", country="X", acc=2, lat=10.0, lon=10.0, source="S", reference="R",
        material="charcoal", method="AMS", carbon_source="terrestrial", region="europe",
        status="ok", err=50, age=5000, lab_id="L", cal_old=5800, cal_young=5600, cal_median=5700,
    )
    d = pd.DataFrame([{**base, **r} for r in rows])
    d["_name_key"] = d.site_name.map(p3.norm_name)
    return d


def test_sites_merge_by_name_within_distance_but_not_across_countries_or_far_apart():
    d = dates_frame(
        [
            dict(site_name="Grotte Chauvet", lat=44.38, lon=4.41),
            dict(site_name="grotte  chauvet", lat=44.381, lon=4.411),  # same site, catalogue noise
            dict(site_name="Grotte Chauvet", lat=47.0, lon=4.41),  # 290 km away: another site
            dict(site_name="Grotte Chauvet", lat=44.38, lon=4.41, country="Y"),
            dict(site_name="", lat=44.38, lon=4.41),  # unnamed points are never merged by name
        ]
    )
    key = p3.cluster_sites(d)
    assert key[0] == key[1]
    assert len({key[0], key[2], key[3], key[4]}) == 4


def test_centroid_dates_are_not_merged_into_a_precise_site_by_name():
    d = dates_frame(
        [
            dict(site_name="Cave", acc=3, lat=10.0, lon=10.0),
            dict(site_name="Cave", acc=1, lat=10.2, lon=10.2),
        ]
    )
    key = p3.cluster_sites(d)
    assert key[0] != key[1]


def test_build_sites_and_web_export_round_trip(tmp_path):
    d = dates_frame(
        [
            dict(site_name="Cave", lab_id="L1", cal_old=9000, cal_young=8800, cal_median=8900, reference="Ref 1"),
            dict(site_name="Cave", lab_id="L2", cal_old=7000, cal_young=6800, cal_median=6900, reference="Ref 2"),
            dict(site_name="Coastal", lab_id="L3", acc=1, lat=20.0, lon=20.0),
        ]
    )
    d["site_key"] = p3.cluster_sites(d)
    sites, key_to_id = p3.build_sites(d)
    cave = next(s for s in sites if s["name"] == "Cave")
    assert cave["n"] == 2 and cave["cal"] == [9000, 6800] and cave["med"] == [8900, 6900]
    assert cave["reference"] == "Ref 1"  # the oldest date's
    assert set(key_to_id.values()) == {s["id"] for s in sites}

    out = tmp_path / "sites.json.gz"
    meta = p3.export_web(sites, p3.IngestStats(raw_rows=3), out)
    doc = json.loads(gzip.open(out, "rt", encoding="utf-8").read())
    assert [s["n"] for s in doc["sites"]] == ["Cave"]  # the province-level site is not exported
    assert doc["refs"][doc["sites"][0]["r"]] == "Ref 1"
    assert meta["counts"]["sites_centroid_only_not_exported"] == 1
    assert "unattributed" in doc["meta"]["attribution"]


def test_report_ranks_by_third_oldest_and_excludes_unusable_dates():
    def site(name, medians, **kw):
        kw.setdefault("site_name", name)
        return [dict(cal_median=m, lab_id=f"{name}{i}", **kw) for i, m in enumerate(medians)]

    rows = (
        site("Outlier", [50000, 10000, 9000])  # one stray old date among young ones
        + site("Steady", [30000, 29000, 28000])
        + site("Pair", [60000, 59000])  # too few dates to corroborate
        + site("Shell", [70000], carbon_source="marine")
        + site("Imprecise", [70000], err=5000)
        + site("Unnamed", [70000], site_name="")
        + site("Offcurve", [70000], status="older_than_curve")
    )
    d = dates_frame(rows)
    d["site_id"] = d.lab_id.str.replace(r"\d+$", "", regex=True)
    ev = report.earliest_by_region(d)["europe"]
    assert [r["site"] for r in ev["single"]][:3] == ["Pair", "Outlier", "Steady"]
    assert [r["site"] for r in ev["corroborated"]] == ["Steady", "Outlier"]
    assert ev["corroborated"][0]["third_oldest_median_cal_bp"] == 28000
