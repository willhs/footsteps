"""Arrival check: modelled arrival dates against the earliest p3k14c and AADR evidence per region.

Synthetic rows for the logic; the committed research 0009 results for the one fact that has to stay
true (its region list is the yaml's), so a stale snapshot fails here rather than silently mis-joining."""
import gzip
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evidence import arrival_check as ac  # noqa: E402
from evidence import regions as reg  # noqa: E402

REGION = next(r for r in reg.REGIONS if r.id == "east_asia")  # central 42, early 80, late 38


def row(p=None, c=None, a=None) -> ac.Row:
    return ac.Row(REGION, p, c, None, a)


def test_evidence_is_flagged_only_when_older_than_the_models_early_bound():
    assert row(p=ac.Earliest(REGION.early + 0.1, "x")).flags == ("p3k14c",)
    assert row(p=ac.Earliest(REGION.early, "x")).flags == ()  # equal is not older
    assert row().flags == ()  # no evidence is not a disagreement
    both = row(c=ac.Earliest(90, "y"), a=ac.Earliest(85, "z"))
    assert both.flags == ("p3k14c charcoal", "AADR")


def test_aadr_earliest_uses_direct_dated_usable_sapiens_only():
    def s(id, date, t="d", lat=35.0, lon=105.0, rs="anno", h="sapiens", group="G"):
        return {"id": id, "la": lat, "lo": lon, "d": date, "t": t, "n": f"site {id}", "c": "China", "g": group,
                "rs": rs, "h": h}
    samples = [
        s("direct_old", 40000), s("direct_young", 30000),
        s("context_older", 90000, t="c"), s("conflict", 95000, rs="conflict"),
        s("archaic", 99000, h="neanderthal"), s("flagged", 98000, group="X_DontUse"),
        s("elsewhere", 12000, lat=-33.9, lon=151.2),
    ]
    got = ac.aadr_earliest_direct(_frame(samples))
    assert got["east_asia"] == ac.Earliest(40.0, "site direct_old (China)")
    assert got["sahul"].ka == 12.0  # regions are re-assigned from the coordinates


def _frame(samples: list[dict]) -> pd.DataFrame:
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "a.json.gz"
        with gzip.open(path, "wt") as f:
            json.dump({"samples": samples}, f)
        return ac.load_aadr(path)


def test_p3k14c_earliest_reads_results_rows_and_skips_empty_regions():
    results = {"earliest": [
        {"id": "east_asia", "oldest_all": 45.6, "oldest_all_site": "Xujiacheng (China), acc 1",
         "oldest_charcoal": 40.0, "oldest_charcoal_site": "Cave (China), acc 2", "third_site_all": 41.3},
        {"id": "sahul", "oldest_all": None, "oldest_all_site": None, "oldest_charcoal": None,
         "oldest_charcoal_site": None, "third_site_all": None},
    ]}
    got = ac.p3k14c_earliest(results)
    assert got.any_material == {"east_asia": ac.Earliest(45.6, "Xujiacheng (China)")}
    assert got.charcoal == {"east_asia": ac.Earliest(40.0, "Cave (China)")}
    assert got.third_site_ka == {"east_asia": 41.3}


def test_build_gives_one_row_per_region_in_yaml_order():
    rows = ac.build(reg.REGIONS, {}, ac.P3k14cEarliest({}, {}, {}))
    assert [r.region.id for r in rows] == list(reg.REGION_IDS)
    assert "| east_asia |" in ac.render_markdown(rows)


def test_committed_p3k14c_snapshot_covers_exactly_the_yaml_regions():
    results = json.loads(ac.P3K14C_RESULTS.read_text())
    assert results["regions"] == list(reg.REGION_IDS), "rerun model_vs_evidence.py: arrivals.yaml regions changed"
