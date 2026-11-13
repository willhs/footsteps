"""What the AADR samples say about the Homo sapiens arrival table, and how lopsided they are.

Pure functions over the deduped sample table (`aadr.ingest`). Three outputs:

- earliest: per arrival-table region, the oldest sample at each of the five oldest sites, once over
  every dating method and once over direct radiocarbon dates only. A context date is an
  archaeologist's range for the layer, so the direct list is the stricter "how early could it be".
- coverage: sapiens samples per era, overall and per region.
- bias: the shares that show the table is Europe-heavy and Holocene-heavy.

Samples whose own date and range disagree (`range_src == 'conflict'`), samples the curators mark as
not to be used, and non-sapiens samples are left out of all three; the archaic samples are listed on their own. A sample is one skeleton: counts
show where labs have sampled, never how many people lived there.
"""

from __future__ import annotations

import pandas as pd

from evidence import aadr
from evidence import regions as reg

TOP = 5
HOLOCENE_START_BP = 11_700
# (label, oldest BP exclusive of the next era, youngest BP). Upper edge inclusive, lower exclusive.
ERAS: tuple[tuple[str, float, float], ...] = (
    ("> 50 ka", float("inf"), 50_000),
    ("50-40 ka", 50_000, 40_000),
    ("40-30 ka", 40_000, 30_000),
    ("30-20 ka", 30_000, 20_000),
    ("20-12 ka", 20_000, 12_000),
    ("12-8 ka", 12_000, 8_000),
    ("8-5 ka", 8_000, 5_000),
    ("5-3 ka", 5_000, 3_000),
    ("3-1 ka", 3_000, 1_000),
    ("< 1 ka", 1_000, -1),
)


# AADR's own group labels mark a few samples as not to be used (Red Deer Cave: "...-DontUseHighlyProblematic").
_DO_NOT_USE = r"(?i)dontuse|do_not_use|_ignore"


def usable(r: pd.DataFrame) -> pd.DataFrame:
    """Homo sapiens samples whose date and range agree and that the curators do not flag as unusable."""
    return r[
        (r.hominin == aadr.Hominin.SAPIENS.value)
        & (r.range_src != "conflict")
        & ~r.group.str.contains(_DO_NOT_USE)
    ]


def era_of(date_bp: pd.Series) -> pd.Series:
    labels = pd.Series(index=date_bp.index, dtype=object)
    for label, hi, lo in ERAS:
        labels[(date_bp < hi) & (date_bp >= lo)] = label
    return labels


def _row(s: pd.Series) -> dict:
    return {
        "id": s.id, "site": s.locality or "(no locality)", "country": s.country, "group": s.group,
        "lat": round(float(s.lat), 3), "lon": round(float(s.lon), 3), "loc_dp": int(s.loc_dp),
        "date_bp": int(s.date_bp), "range_bp": [int(s.old), int(s.young)], "date_type": s.date_type,
        "assessment": s.assess, "reference": s.pub,
    }


def _oldest_per_site(d: pd.DataFrame) -> pd.DataFrame:
    keyed = d.assign(site_key=d.locality + "|" + d.lat.round(3).astype(str) + "|" + d.lon.round(3).astype(str))
    return keyed.sort_values(["date_bp", "id"], ascending=[False, True]).drop_duplicates("site_key").head(TOP)


def report(r: pd.DataFrame, stats: dict) -> dict:
    u = usable(r)
    u = u.assign(era=era_of(u.date_bp))
    regions = [*reg.REGION_IDS, reg.OTHER]
    out: dict = {"stats": stats, "regions": {}}

    for region in regions:
        d = u[u.region == region]
        direct = d[d.date_type == aadr.DateType.DIRECT.value]
        out["regions"][region] = {
            "samples": int(len(d)),
            "direct": int(len(direct)),
            "oldest": [_row(s) for _, s in _oldest_per_site(d).iterrows()],
            "oldest_direct": [_row(s) for _, s in _oldest_per_site(direct).iterrows()],
            "by_era": {label: int((d.era == label).sum()) for label, _, _ in ERAS},
        }

    era_totals = {label: int((u.era == label).sum()) for label, _, _ in ERAS}
    n = len(u)
    out["coverage"] = {
        "samples": int(n),
        "by_era": era_totals,
        "direct_by_era": {label: int(((u.era == label) & (u.date_type == "direct")).sum()) for label, _, _ in ERAS},
    }
    out["bias"] = {
        "europe_share": float((u.region == "europe").mean()) if n else 0.0,
        "holocene_share": float((u.date_bp < HOLOCENE_START_BP).mean()) if n else 0.0,
        "younger_than_5ka_share": float((u.date_bp < 5_000).mean()) if n else 0.0,
        "older_than_12ka": int((u.date_bp >= 12_000).sum()),
        "older_than_12ka_europe": int(((u.date_bp >= 12_000) & (u.region == "europe")).sum()),
        "older_than_12ka_outside_europe_and_siberia": int(
            ((u.date_bp >= 12_000) & ~u.region.isin(["europe", "siberia_arctic"])).sum()
        ),
        "regions_without_a_pre_12ka_sample": [
            x for x in regions if x != reg.OTHER and not ((u.region == x) & (u.date_bp >= 12_000)).any()
        ],
        "conflicting_dates_left_out": int(((r.range_src == "conflict") & (r.hominin == "sapiens")).sum()),
    }
    out["archaic"] = [
        {**_row(s), "hominin": s.hominin}
        for _, s in r[r.hominin != aadr.Hominin.SAPIENS.value].sort_values("date_bp", ascending=False).iterrows()
    ]
    return out


def _ka(bp: int) -> str:
    return f"{bp / 1000:.1f} ka"


def _line(s: dict) -> str:
    old, young = s["range_bp"]
    return (
        f"| {s['site']} ({s['country']}) | {s['loc_dp']} | {s['id']} | {s['date_type']} | "
        f"{_ka(s['date_bp'])} ({old:,}-{young:,}) | {s['group']} | {s['assessment']} | {s['reference'].replace('|', '/')} |"
    )


def _pct(x: float) -> str:
    return f"{100 * x:.0f}%"


def render_markdown(rep: dict, source_name: str) -> str:
    st, cov, bias = rep["stats"], rep["coverage"], rep["bias"]
    n = cov["samples"]
    lines = [
        f"# AADR samples ({source_name})",
        "",
        "## How lopsided it is",
        "",
        f"- {n:,} Homo sapiens individuals with a usable date and place (of {st['rows']:,} rows in the table: "
        f"{st['dropped_present_day']:,} present-day, {st['dropped_no_coordinates_or_date']:,} unlocated, "
        f"{st['dropped_duplicate_libraries']:,} repeat libraries of the same individual, "
        f"{bias['conflicting_dates_left_out']:,} whose own date and range disagree).",
        f"- **Europe-heavy:** {_pct(bias['europe_share'])} of them are in Europe (the arrival table's `europe` region).",
        f"- **Holocene-heavy:** {_pct(bias['holocene_share'])} are younger than 11.7 ka and "
        f"{_pct(bias['younger_than_5ka_share'])} younger than 5 ka. Only {bias['older_than_12ka']:,} are older than 12 ka "
        f"({bias['older_than_12ka_europe']:,} of those in Europe; "
        f"{bias['older_than_12ka_outside_europe_and_siberia']:,} outside Europe and Siberia).",
        "- Regions with no sample older than 12 ka: "
        + (", ".join(bias["regions_without_a_pre_12ka_sample"]) or "none")
        + ". Absence there reflects where DNA survives (warm climates preserve it badly) and who has sampled, not empty land.",
        "- Samples are where labs have dug and sequenced. They do not measure how many people lived anywhere.",
        "",
        "## Coverage by era (Homo sapiens)",
        "",
        "| Era | Samples | Of which direct-dated |",
        "|---|---|---|",
        *[f"| {e} | {cov['by_era'][e]:,} | {cov['direct_by_era'][e]:,} |" for e, _, _ in ERAS],
        "",
        "By region:",
        "",
        "| Region | " + " | ".join(e for e, _, _ in ERAS) + " | All |",
        "|---|" + "---|" * (len(ERAS) + 1),
    ]
    for region in [*reg.REGIONS, None]:
        rid = region.id if region else reg.OTHER
        name = region.name if region else "Other (Anatolia, Central Asia, Pacific...)"
        e = rep["regions"][rid]
        lines.append(f"| {name} | " + " | ".join(str(e["by_era"][era]) for era, _, _ in ERAS) + f" | {e['samples']:,} |")

    lines += ["", "## Earliest samples per arrival-table region", ""]
    head = "| Site | Place dp | Genetic ID | Dated by | Mean cal BP (95% range) | Group | Assessment | First publication |"
    sep = "|---|---|---|---|---|---|---|---|"
    for region in reg.REGIONS:
        e = rep["regions"][region.id]
        lo, hi = region.table_ka if region.table_ka else (0, 0)
        table = "no date" if not region.table_ka else f"{lo} ka" if lo == hi else f"{lo}-{hi} ka"
        lines += [
            f"### {region.name}",
            "",
            f"- Arrival table (research 0002): {table}. {region.table_note}",
            f"- {e['samples']:,} samples ({e['direct']:,} direct-dated).",
        ]
        if not e["oldest"]:
            lines += ["- **No samples.** AADR cannot speak to this region.", ""]
            continue
        lines += ["", "Oldest sample at each of the five oldest sites (any dating method):", "", head, sep]
        lines += [_line(s) for s in e["oldest"]]
        if e["oldest_direct"]:
            lines += ["", "Same, direct radiocarbon dates only:", "", head, sep]
            lines += [_line(s) for s in e["oldest_direct"]]
        lines.append("")

    lines += [
        "### Other (not in the arrival table)",
        "",
        f"{rep['regions'][reg.OTHER]['samples']:,} samples (Anatolia, the Caucasus, Central Asia, Pacific islands).",
        "",
        "## Neanderthals and Denisovans in the table",
        "",
        "Kept out of everything above. AADR carries these genomes; their dates are mostly broad.",
        "",
        "| Hominin | " + head[2:],
        "|---|" + sep[1:],
        *[f"| {s['hominin']} " + _line(s) for s in rep["archaic"]],
        "",
    ]
    return "\n".join(lines)
