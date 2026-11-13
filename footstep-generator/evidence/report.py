"""Earliest well-located dates per region, as evidence for the Homo sapiens arrival table.

Pure functions over the calibrated date table (`p3k14c.ingest`). Two lists per region:

- single: the oldest qualifying date at each of the five oldest sites. One date can be a
  contaminated or misplaced outlier, so this is the "how early could it be" end.
- corroborated: sites with at least three qualifying dates, ranked by the median of their
  third-oldest date, so one stray old date cannot place a site. This is the "how early is it
  repeatedly seen" end.

A qualifying date is: placed at least to its province or county (LocAccuracy >= 1) and named,
calibrated on the curve, terrestrial carbon (no marine or reservoir-uncertain material) and a
1-sigma error of at most MAX_ERR. Province-level is enough to say which region a date is in, but
the public p3k14c gives almost every Pleistocene date only that precision (1,027 of the 1,030
European dates older than 35 ka), so requiring a 500 m location would erase the evidence. The
accuracy is shown on every row and the oldest locally placed (>= 2) date is reported beside it.
Neither list says who made the site. p3k14c records no hominin, and before ~45 ka the same
caves hold Neanderthals.
"""

from __future__ import annotations

import pandas as pd

from evidence import calibrate as cal
from evidence import regions as reg

MAX_ERR = 1500  # 14C years; above this a date near the limit is more noise than evidence
TOP = 5
CORROBORATING_DATES = 3


def qualifying(d: pd.DataFrame, min_accuracy: int = 1) -> pd.DataFrame:
    return d[
        (d.acc >= min_accuracy)
        & (d.site_name != "")
        & (d.status == cal.CalStatus.OK.value)
        & (d.carbon_source == "terrestrial")
        & (d.err <= MAX_ERR)
    ]


def _nth_oldest(medians: pd.Series) -> float:
    """Median cal BP of the CORROBORATING_DATES-th oldest date; NaN if the site has fewer."""
    if len(medians) < CORROBORATING_DATES:
        return float("nan")
    return float(medians.nlargest(CORROBORATING_DATES).iloc[-1])


def _row(r: pd.Series) -> dict:
    return {
        "site": r.site_name or "(unnamed)",
        "country": r.country,
        "lat": round(float(r.lat), 3),
        "lon": round(float(r.lon), 3),
        "loc_accuracy": int(r.acc),
        "lab_id": r.lab_id,
        "age_bp": f"{int(r.age)}±{int(r.err)}",
        "cal_bp": [int(r.cal_old), int(r.cal_young)],
        "median_cal_bp": int(r.cal_median),
        "material": r.material,
        "method": r.method,
        "source": r.source,
        "reference": r.reference,
        "site_id": r.site_id,
    }


def earliest_by_region(d: pd.DataFrame) -> dict[str, dict]:
    q = qualifying(d)
    out: dict[str, dict] = {}
    for region in [*reg.REGION_IDS, reg.OTHER]:
        all_r, q_r = d[d.region == region], q[q.region == region]
        ranked = q_r.sort_values("cal_median", ascending=False)
        single = ranked.drop_duplicates("site_id").head(TOP)

        third = ranked.groupby("site_id").cal_median.agg(_nth_oldest).dropna()
        best = third.sort_values(ascending=False).head(TOP).index
        corroborated = [
            {**_row(ranked[ranked.site_id == sid].iloc[0]), "third_oldest_median_cal_bp": int(third[sid])}
            for sid in best
        ]
        local = q_r[q_r.acc >= 2]
        out[region] = {
            "dates_all": int(len(all_r)),
            "dates_local": int((all_r.acc >= 2).sum()),
            "dates_province_level": int((all_r.acc == 1).sum()),
            "dates_qualifying": int(len(q_r)),
            "oldest_qualifying_median_cal_bp": int(q_r.cal_median.max()) if len(q_r) else None,
            "oldest_local": _row(local.loc[local.cal_median.idxmax()]) if len(local) else None,
            "single": [_row(r) for _, r in single.iterrows()],
            "corroborated": corroborated,
        }
    return out


def _ka(v: int) -> str:
    return f"{v / 1000:.1f} ka"


def _line(r: dict, extra: str = "") -> str:
    lo, hi = r["cal_bp"][1], r["cal_bp"][0]
    ref = (r["reference"] or r["source"]).replace("|", "/")
    ref = ref if len(ref) <= 110 else ref[:107] + "..."
    return (
        f"| {r['site']} ({r['country']}) | {r['loc_accuracy']} | {r['lab_id']} | {r['age_bp']} | "
        f"{_ka(r['median_cal_bp'])} ({lo:,}-{hi:,}) | {r['material'] or '?'} / {r['method']} | {ref} |{extra}"
    )


def render_markdown(evidence: dict[str, dict]) -> str:
    lines = []
    for region in reg.REGIONS:
        e = evidence[region.id]
        lo, hi = region.table_ka if region.table_ka else (0, 0)
        table = "no date" if not region.table_ka else f"{lo} ka" if lo == hi else f"{lo}-{hi} ka"
        lines += [
            f"### {region.name}",
            "",
            f"- Arrival table (research 0002): {table}. {region.table_note}",
            f"- Dates in region: {e['dates_all']:,} ({e['dates_local']:,} locally placed, "
            f"{e['dates_province_level']:,} province or county level); qualifying: {e['dates_qualifying']:,}.",
        ]
        if not e["single"]:
            lines += ["- **No qualifying dates.** p3k14c cannot speak to this region.", ""]
            continue
        ol = e["oldest_local"]
        lines.append(
            f"- Oldest locally placed (LocAccuracy >= 2) qualifying date: {_ka(ol['median_cal_bp'])}, "
            f"{ol['site']} ({ol['country']})." if ol else "- No locally placed qualifying dates."
        )
        head = "| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |"
        sep = "|---|---|---|---|---|---|---|"
        lines += ["", "Oldest qualifying date at each of the five oldest sites:", "", head, sep]
        lines += [_line(r) for r in e["single"]]
        if e["corroborated"]:
            lines += [
                "",
                f"Sites with at least {CORROBORATING_DATES} qualifying dates, ranked by their third-oldest "
                "date (the oldest date shown):",
                "",
                head + " 3rd-oldest median |",
                sep + "---|",
            ]
            lines += [_line(r, f" {_ka(r['third_oldest_median_cal_bp'])} |") for r in e["corroborated"]]
        lines.append("")
    return "\n".join(lines)
