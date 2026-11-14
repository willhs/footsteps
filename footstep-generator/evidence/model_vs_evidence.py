#!/usr/bin/env python3
"""Compare the modelled pre-HYDE population with the p3k14c radiocarbon evidence, region by region.

    python footstep-generator/evidence/model_vs_evidence.py [--out docs/research/0009-model-vs-evidence]

Reads (all git-ignored, rebuild them): data/evidence/p3k14c_dates.csv.gz (p3k14c.py build),
data/tiles/prehistory/humans_*.webp (prehistory_population.py) and data/tiles/grid/humans_-10000.webp
(HYDE). Writes tables (results.json, tables.md) and PNG charts. It does not change the model.
See docs/research/0009-model-vs-evidence/research.md for what the numbers mean.

Data shape (one direction of flow):

    arrivals.yaml regions --assign--> region id per 0.5 deg cell (model) and per date (evidence)
    model:    humans_{year}.webp --sum per region--> people[region, bin]
    evidence: date (14C age, cal intervals) --mass per 1 ka bin--> site occupancy[region, bin]
              --Surovell 2009 correction--> corrected occupancy[region, bin]
    Bin = 1 ka wide, centred on a model image age (1950 - year); BP = years before 1950.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

import grid_image  # noqa: E402

ARRIVALS = HERE.parent / "prehistory" / "arrivals.yaml"
DATES = ROOT / "data" / "evidence" / "p3k14c_dates.csv.gz"
PREHISTORY = ROOT / "data" / "tiles" / "prehistory"
HYDE_10K = ROOT / "data" / "tiles" / "grid" / "humans_-10000.webp"

CELL_DEG = 0.5
BP_ZERO = 1950
FIRST_YEAR, LAST_YEAR = -48_000, -11_000  # 49.95 ka BP .. 12.95 ka BP, 1 ka steps
HYDE_YEAR = -10_000
BLEND_START_AGE_KA = (BP_ZERO + 14_000) / 1000  # model hands over to HYDE from here (15.95 ka BP)

# Evidence filter: the same as research 0003's "qualifying" date, so the two notes agree.
MAX_ERR = 1500  # 14C 1-sigma, years
LOC_MIN = 1  # LocAccuracy: province centroid or better (0 = country only is dropped)

# Surovell et al. 2009, J Archaeol Sci 36:1715, as published in R rcarbon (transformSPD default):
# expected survival of dated material falls as 5.726442e6 * (t + 2176.4) ** -1.3925309, t in cal BP.
SUROVELL = (5.726442e6, 2176.4, -1.3925309)
TAPHO_REF_BP = 12_950  # corrected values read "as if as well preserved as at 12.95 ka BP"

EVIDENCE_MIN_SITES = 2.0  # raw occupied-site expectation that counts as "evidence present" in a bin
EVIDENCE_ONSET_RUN = 2  # ... held for this many consecutive 1 ka bins
MODEL_PRESENT_SHARE = 0.02  # a region "has people" from the first bin holding this share of its own peak (the edge blur leaks a few hundred)
WELL_SAMPLED_SITES = 100  # qualifying sites in the region older than 12 ka: below this "no evidence" is not a test


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    central: float
    early: float
    late: float
    ramp_ka: float
    verification: str


def load_regions(path: Path = ARRIVALS) -> list[Region]:
    table = yaml.safe_load(path.read_text())
    return [Region(r["id"], r["name"], tuple(r["bbox"]), r["arrival_ka_bp"]["central"],
                   r["arrival_ka_bp"]["early"], r["arrival_ka_bp"]["late"], r["ramp_ka"], r["verification"])
            for r in table["regions"]]


def assign(regions: list[Region], lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Region index per point: the model's rule (prehistory_population.assign_regions): first bbox
    holding the point, else the nearest bbox; ties (distance 0) go to the first region."""
    dist = []
    for r in regions:
        west, south, east, north = r.bbox
        dx = np.maximum(np.maximum(west - lon, lon - east), 0.0)
        dy = np.maximum(np.maximum(south - lat, lat - north), 0.0)
        dist.append(dx * dx + dy * dy)
    return np.argmin(np.stack(dist), axis=0)


# --- model -----------------------------------------------------------------------------------

def bin_centres_bp() -> np.ndarray:
    """Model image ages in years BP, oldest first, then the HYDE 10,000 BCE point."""
    years = list(range(FIRST_YEAR, LAST_YEAR + 1, 1000)) + [HYDE_YEAR]
    return np.array([BP_ZERO - y for y in years], dtype=float)


def model_people(regions: list[Region]) -> np.ndarray:
    """People per region per bin, shape (n_regions, n_bins). The last bin is HYDE (measured)."""
    lon, lat = np.meshgrid(-180 + CELL_DEG * (np.arange(720) + 0.5), 90 - CELL_DEG * (np.arange(360) + 0.5))
    idx = assign(regions, lat, lon)
    out = []
    for year in list(range(FIRST_YEAR, LAST_YEAR + 1, 1000)) + [HYDE_YEAR]:
        if year == HYDE_YEAR:
            g = grid_image.decode(HYDE_10K)
            people = g.reshape(360, 6, 720, 6).sum(axis=(1, 3))
        else:
            people = grid_image.decode(PREHISTORY / f"humans_{year}.webp")
        out.append(np.bincount(idx.ravel(), weights=people.ravel(), minlength=len(regions)))
    return np.array(out).T


# --- evidence --------------------------------------------------------------------------------

def load_dates(regions: list[Region], max_err: int = MAX_ERR) -> pd.DataFrame:
    d = pd.read_csv(DATES)
    d = d[(d.status == "ok") & (d.carbon_source == "terrestrial") & (d.err <= max_err) & (d.acc >= LOC_MIN)
          & d.intervals.notna()].copy()
    d["rid"] = assign(regions, d.lat.to_numpy(), d.lon.to_numpy())
    d["charcoal"] = d.material.fillna("").str.lower().str.contains("charcoal|charred|burnt|ash|hearth")
    return d.reset_index(drop=True)


def parse_intervals(text: str) -> list[tuple[float, float]]:
    """'730-645;585-570' -> [(645, 730), (570, 585)] as (young, old) cal BP."""
    out = []
    for part in text.split(";"):
        old, young = part.split("-")
        out.append((float(young), float(old)))
    return out


def date_bin_mass(intervals: str, edges: np.ndarray) -> np.ndarray:
    """Share of one date's probability inside each bin [edges[i], edges[i+1]), spreading the 95.4%
    HPD mass evenly over its intervals' calendar years. Shares sum to <= 1 (the rest is outside the bins)."""
    spans = parse_intervals(intervals)
    total = sum(max(o - y, 1.0) for y, o in spans)
    mass = np.zeros(len(edges) - 1)
    for y, o in spans:
        o = max(o, y + 1.0)  # a degenerate interval still carries mass
        lo = np.maximum(edges[:-1], y)
        hi = np.minimum(edges[1:], o)
        mass += np.clip(hi - lo, 0, None) / total
    return mass


def tapho_weight(age_bp: np.ndarray) -> np.ndarray:
    """Multiplier that lifts older bins to the preservation of TAPHO_REF_BP (Surovell 2009)."""
    a, b, c = SUROVELL
    return (TAPHO_REF_BP + b) ** c / (np.asarray(age_bp) + b) ** c


def evidence_curves(d: pd.DataFrame, n_regions: int, centres: np.ndarray) -> dict[str, np.ndarray]:
    """Per region per bin: spd (summed probability, 1 per date), spd_site (each site weighs 1),
    sites (expected number of sites with a date in the bin, noisy-or), and the same three corrected."""
    edges_asc = np.arange(centres.min() - 500, centres.max() + 501, 1000.0)  # centres are oldest first, 1 ka apart
    n = len(centres)
    spd = np.zeros((n_regions, n))
    spd_site = np.zeros((n_regions, n))
    # One pass per (site, region): site weight is split over its dates; occupancy is noisy-or over dates.
    d = d.assign(_key=d.site_id + "|" + d.rid.astype(str))
    sizes = d.groupby("_key").size()
    masses = {}
    for key, rid, iv in zip(d._key, d.rid, d.intervals):
        m = date_bin_mass(iv, edges_asc)[::-1]  # ascending edges -> youngest first; flip to oldest first
        spd[rid] += m
        spd_site[rid] += m / sizes[key]
        masses.setdefault((key, rid), []).append(m)
    sites = np.zeros((n_regions, n))
    for (key, rid), ms in masses.items():
        p = 1 - np.prod(1 - np.array(ms), axis=0)
        sites[rid] += p
    w = tapho_weight(centres)
    return {"spd": spd, "spd_site": spd_site, "sites": sites,
            "spd_c": spd * w, "spd_site_c": spd_site * w, "sites_c": sites * w}


CHECKPOINTS = [  # (place, lon, lat): where a reader would expect a region, and what the box rule gives
    ("Sicily", 15.1, 36.7), ("Managua, Nicaragua", -86.3, 12.1), ("Ust'-Ishim", 71.2, 57.7),
    ("Jerusalem", 35.2, 31.8), ("Ucagizli Cave, Hatay", 36.1, 36.2), ("Riyadh", 46.7, 24.7), ("Tehran", 51.4, 35.7),
    ("Lhasa", 91.1, 29.7), ("Xiahe, Gansu", 102.5, 35.0), ("Qinghai Lake", 100.0, 37.0), ("Kunming", 102.7, 25.0),
    ("Guilin", 110.3, 25.3), ("Yuchanyan, Hunan", 111.4, 25.5), ("Beijing", 116.4, 40.0), ("Fukuoka, Kyushu", 130.4, 33.6),
    ("Tokyo", 139.7, 35.7), ("Sapporo", 141.3, 43.1), ("Vladivostok", 132.0, 43.1), ("Manila, Luzon", 121.0, 14.6),
    ("Tegucigalpa, Honduras", -87.2, 14.1), ("Mexico City", -99.1, 19.4), ("Panama City", -79.5, 9.0),
    ("Gibraltar", -5.4, 36.1), ("Madagascar, centre", 47.0, -19.0), ("Cuba, Havana", -82.4, 23.1),
    ("Kimberley, Australia", 127.0, -16.0), ("Niah, Borneo", 113.8, 3.8), ("Bacho Kiro", 25.4, 42.9),
]


def checkpoints(regions: list[Region]) -> list[dict]:
    lon = np.array([c[1] for c in CHECKPOINTS])
    lat = np.array([c[2] for c in CHECKPOINTS])
    idx = assign(regions, lat, lon)
    return [{"place": c[0], "lon": c[1], "lat": c[2], "region": regions[i].id, "central_ka": regions[i].central}
            for c, i in zip(CHECKPOINTS, idx)]


def ever_populated_cells(regions: list[Region]) -> dict[str, int]:
    """Number of 0.5 deg cells per region that hold more than 1 person in any model image 50-16 ka BP."""
    lon, lat = np.meshgrid(-180 + CELL_DEG * (np.arange(720) + 0.5), 90 - CELL_DEG * (np.arange(360) + 0.5))
    idx = assign(regions, lat, lon)
    ever = np.zeros((360, 720), dtype=bool)
    for year in range(FIRST_YEAR, -14_000 + 1, 1000):
        ever |= grid_image.decode(PREHISTORY / f"humans_{year}.webp") > 1
    return {r.id: int(((idx == i) & ever).sum()) for i, r in enumerate(regions)}


# Boxes the arrival table intends as regions but that the first-match rule hands to others (see research 0009).
# (label, bbox west/south/east/north). Model people and evidence are summed over the *whole box*, whoever owns the cells.
INTENDED_BOXES = [
    ("Levant (32-42.5 E, 29-38 N)", (32, 29, 42.5, 38)),
    ("Tibetan Plateau interior (80-100 E, 30-36 N)", (80, 30, 100, 36)),
]


def intended_box_series(d: pd.DataFrame, centres: np.ndarray) -> list[dict]:
    lon, lat = np.meshgrid(-180 + CELL_DEG * (np.arange(720) + 0.5), 90 - CELL_DEG * (np.arange(360) + 0.5))
    out = []
    for label, (w, s, e, n) in INTENDED_BOXES:
        inside = (lon >= w) & (lon <= e) & (lat >= s) & (lat <= n)
        people = []
        for year in list(range(FIRST_YEAR, LAST_YEAR + 1, 1000)) + [HYDE_YEAR]:
            if year == HYDE_YEAR:
                g = grid_image.decode(HYDE_10K).reshape(360, 6, 720, 6).sum(axis=(1, 3))
            else:
                g = grid_image.decode(PREHISTORY / f"humans_{year}.webp")
            people.append(float(g[inside].sum()))
        sub = d[(d.lon >= w) & (d.lon <= e) & (d.lat >= s) & (d.lat <= n)].copy()
        sub["rid"] = 0
        ev = evidence_curves(sub, 1, centres)
        first_old = sub.sort_values("cal_median", ascending=False).drop_duplicates("site_id").head(3)
        out.append({"label": label, "people": people, "sites": ev["sites"][0].tolist(), "sites_c": ev["sites_c"][0].tolist(),
                    "dates": int(len(sub)), "oldest": [(r.site_name, r.country, round(r.cal_median / 1000, 1), r.material)
                                                      for r in first_old.itertuples()]})
    return out


def japan_country(d: pd.DataFrame) -> dict:
    """Evidence for all Japanese islands by country, across their separate arrival boxes."""
    g = d[d.country == "Japan"]
    top = g.sort_values("cal_median", ascending=False).drop_duplicates("site_id").head(3)
    return {"dates": int(len(g)), "sites": int(g.site_id.nunique()),
            "oldest": [(r.site_name, round(r.cal_median / 1000, 1)) for r in top.itertuples()]}


def earliest(d: pd.DataFrame, regions: list[Region]) -> list[dict]:
    """Per region: oldest qualifying date (median cal BP), and the third-oldest *site* (a repeat, not a one-off),
    for all material and for charcoal only (hearth-like, less likely a mastodon or driftwood)."""
    rows = []
    for i, r in enumerate(regions):
        g = d[d.rid == i]
        row = {"id": r.id, "dates": int(len(g)), "sites": int(g.site_id.nunique())}
        for label, sub in (("all", g), ("charcoal", g[g.charcoal])):
            if len(sub) == 0:
                row[f"oldest_{label}"] = row[f"oldest_{label}_site"] = row[f"third_site_{label}"] = None
                continue
            per_site = sub.groupby("site_id").cal_median.max().sort_values(ascending=False)
            top = sub.loc[sub.cal_median.idxmax()]
            row[f"oldest_{label}"] = round(top.cal_median / 1000, 1)
            row[f"oldest_{label}_site"] = f"{top.site_name} ({top.country}), acc {int(top.acc)}"
            row[f"third_site_{label}"] = round(per_site.iloc[2] / 1000, 1) if len(per_site) >= 3 else None
        row["older_than_12ka_sites"] = int(g[g.cal_median > 12_000].site_id.nunique())
        row["older_than_30ka_sites"] = int(g[g.cal_median > 30_000].site_id.nunique())
        rows.append(row)
    return rows


def first_run(values: np.ndarray, centres: np.ndarray, threshold: float, run: int) -> float | None:
    """Oldest centre (ka BP) from which `run` consecutive bins (going younger) reach `threshold`."""
    for i in range(len(values) - run + 1):
        if all(values[i + j] >= threshold for j in range(run)):
            return round(centres[i] / 1000, 2)
    return None


def spearman(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 5 or np.ptp(a) == 0 or np.ptp(b) == 0:
        return None
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


def window_mean(values: np.ndarray, centres: np.ndarray, young_ka: float, old_ka: float) -> float:
    sel = (centres >= young_ka * 1000 - 1) & (centres <= old_ka * 1000 + 1)
    return float(values[sel].mean())


def lgm_ratio(values: np.ndarray, centres: np.ndarray) -> float | None:
    """Mean over 26-20 ka (the glacial maximum) over the mean over 36-30 ka: below 1 = a trough at the maximum."""
    before = window_mean(values, centres, 29.9, 36.0)
    return None if before <= 0 else window_mean(values, centres, 19.9, 26.0) / before


def half_rise_ka(values: np.ndarray, centres: np.ndarray) -> float | None:
    """Oldest bin (ka BP) whose 3-bin running mean reaches half the 30-20 ka mean: how fast the region fills up."""
    ref = window_mean(values, centres, 19.9, 30.0)
    if ref <= 0:
        return None
    smooth = np.convolve(values, np.ones(3) / 3, mode="same")
    for c, v in zip(centres, smooth):
        if 20_000 <= c <= 50_500 and v >= 0.5 * ref:
            return round(c / 1000, 2)
    return None


def compare(regions, people, ev, centres) -> list[dict]:
    """One row per region: when the model and the evidence start, and how their shapes agree."""
    rows = []
    in_window = centres <= 50_500  # 50 ka .. 12 ka; the HYDE point (last) is not model
    model_bins = np.arange(len(centres)) < len(centres) - 1
    win = in_window & (centres >= 12_000) & model_bins
    pure = win & (centres >= BLEND_START_AGE_KA * 1000)  # before the HYDE hand-over starts
    for i, r in enumerate(regions):
        pop = people[i]
        peak = pop[win].max()
        has = [c for c, p, w in zip(centres, pop, win) if w and peak > 0 and p >= MODEL_PRESENT_SHARE * peak]
        model_first = round(max(has) / 1000, 2) if has else None
        ev_first = first_run(ev["sites"][i][win], centres[win], EVIDENCE_MIN_SITES, EVIDENCE_ONSET_RUN)
        a, b = pop[pure], ev["spd_site_c"][i][pure]
        rows.append({
            "id": r.id, "central": r.central, "early": r.early, "late": r.late, "ramp_ka": r.ramp_ka,
            "model_first_ka": model_first, "evidence_first_ka": ev_first,
            "model_peak_ka": round(float(centres[win][np.argmax(pop[win])]) / 1000, 2) if pop[win].max() > 0 else None,
            "evidence_peak_ka": round(float(centres[win][np.argmax(ev['spd_site_c'][i][win])]) / 1000, 2)
            if ev["spd_site_c"][i][win].max() > 0 else None,
            "model_share_20ka": float(pop[np.argmin(abs(centres - 20_000))] / people[:, np.argmin(abs(centres - 20_000))].sum()),
            "evidence_share_20ka": float(ev["spd_site_c"][i][np.argmin(abs(centres - 20_000))]
                                         / ev["spd_site_c"][:, np.argmin(abs(centres - 20_000))].sum()),
            "half_rise_model_ka": half_rise_ka(pop, centres),
            "half_rise_evidence_ka": half_rise_ka(ev["sites_c"][i], centres),
            "lgm_ratio_model": lgm_ratio(pop, centres),
            "lgm_ratio_sites_raw": lgm_ratio(ev["sites"][i], centres),
            "lgm_ratio_sites_corrected": lgm_ratio(ev["sites_c"][i], centres),
            "rho_50_16": spearman(a, b),
            "rho_50_16_raw": spearman(a, ev["spd_site"][i][pure]),
            "sites_window": float(ev["sites"][i][win].sum()),
        })
    return rows


# --- charts ----------------------------------------------------------------------------------

MODEL_COLOUR, EVIDENCE_COLOUR, INK, MUTED = "#2a6fbb", "#d9822b", "#222222", "#777777"


def draw_charts(regions, people, ev, centres, cmp_rows, early_rows, out: Path, dates_old: pd.DataFrame) -> list[str]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                         "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False})
    ka = centres / 1000
    win = (ka <= 50.5) & (ka >= 11.9)
    names = []

    # 1. World composition: model vs evidence by region (shares, so the totals' scale drops out).
    keep = [i for i, c in enumerate(cmp_rows) if people[i][win].max() >= 1000 or ev["sites"][i][win].sum() >= 3]
    cmap = plt.get_cmap("tab20")
    fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=True)
    for ax, series, title in ((axes[0], people, "Modelled people, share of the world"),
                              (axes[1], ev["spd_site_c"], "Radiocarbon evidence (site-weighted, taphonomy-corrected), share of the world")):
        tot = series[:, win].sum(axis=0)
        tot[tot == 0] = np.nan
        shares = np.array([series[i][win] / tot for i in keep])
        ax.stackplot(ka[win], np.nan_to_num(shares), labels=[regions[i].id for i in keep],
                     colors=[cmap(j % 20) for j in range(len(keep))], linewidth=0.5, edgecolor="white")
        ax.set_ylim(0, 1)
        ax.set_title(title, loc="left", fontsize=10)
        ax.axvline(BLEND_START_AGE_KA, color=MUTED, ls=":", lw=1)
    axes[0].text(BLEND_START_AGE_KA - 0.3, 0.97, "model blends into HYDE", ha="right", va="top", fontsize=8, color=MUTED)
    axes[1].set_xlabel("ka BP (older to the left)")
    axes[1].invert_xaxis()
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, ncol=6, fontsize=7, loc="lower center", frameon=False)
    fig.tight_layout(rect=(0, 0.1, 1, 1))
    fig.savefig(out / "chart-1-world-shares.png", dpi=150)
    plt.close(fig)
    names.append("chart-1-world-shares.png")

    # 2. Small multiples: each region's model curve and evidence curve, each scaled to its own peak.
    show = [i for i in keep if regions[i].central <= 60 or people[i][win].max() > 0]
    cols = 4
    rows_n = int(np.ceil(len(show) / cols))
    fig, axes = plt.subplots(rows_n, cols, figsize=(14, 2.6 * rows_n), sharex=True)
    axes = np.atleast_2d(axes)
    for ax in axes.ravel():
        ax.axis("off")
    for ax, i in zip(axes.ravel(), show):
        ax.axis("on")
        r = regions[i]
        pop = people[i][win]
        evc = ev["spd_site_c"][i][win]
        raw = ev["sites"][i][win]
        if evc.max() > 0:
            ax.bar(ka[win], evc / evc.max(), width=0.9, color=EVIDENCE_COLOUR, alpha=0.85, label="evidence (corrected)")
        if pop.max() > 0:
            ax.plot(ka[win], pop / pop.max(), color=MODEL_COLOUR, lw=2, label="model")
        ax.axvline(r.central, color=MODEL_COLOUR, ls="--", lw=1)
        e = early_rows[i]["oldest_all"]
        if e:
            ax.plot([e], [1.04], marker="v", color=EVIDENCE_COLOUR, ms=7, clip_on=False)
        ax.set_title(f"{r.id}  (n={int(round(raw.sum()))} site-bins)", loc="left", fontsize=8.5)
        ax.set_ylim(0, 1.08)
        ax.set_xlim(50.5, 11.9)
        ax.tick_params(labelsize=7)
    handles = [plt.Line2D([], [], color=MODEL_COLOUR, lw=2), plt.Rectangle((0, 0), 1, 1, color=EVIDENCE_COLOUR),
               plt.Line2D([], [], color=MODEL_COLOUR, ls="--"), plt.Line2D([], [], color=EVIDENCE_COLOUR, marker="v", ls="")]
    fig.legend(handles, ["model (own peak = 1)", "evidence, site-weighted, corrected (own peak = 1)",
                         "model central arrival", "oldest qualifying date"], ncol=4, loc="lower center", frameon=False, fontsize=8)
    fig.supxlabel("ka BP (older to the left)", y=0.05, fontsize=9)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(out / "chart-2-regions.png", dpi=130)
    plt.close(fig)
    names.append("chart-2-regions.png")

    # 3. Timing: model arrival (early-late bar, central dot) against what the evidence shows.
    fig, ax = plt.subplots(figsize=(10, 0.42 * len(regions) + 1.5))
    order = [i for i in range(len(regions)) if regions[i].central <= 60]
    for y, i in enumerate(order):
        r, c, e = regions[i], cmp_rows[i], early_rows[i]
        ax.plot([r.late, r.early], [y, y], color=MODEL_COLOUR, lw=3, alpha=0.35, solid_capstyle="round")
        ax.plot([r.central], [y], "o", color=MODEL_COLOUR, ms=8)
        if e["oldest_all"]:
            ax.plot([e["oldest_all"]], [y + 0.18], "v", color=EVIDENCE_COLOUR, ms=7)
        if e["oldest_charcoal"]:
            ax.plot([e["oldest_charcoal"]], [y - 0.18], "^", color="#8a4b0f", ms=7)
        if c["evidence_first_ka"]:
            ax.plot([c["evidence_first_ka"]], [y], "D", mfc="white", mec=EVIDENCE_COLOUR, ms=7)
    ax.set_yticks(range(len(order)))
    ax.set_yticklabels([regions[i].id for i in order])
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 5, 10, 20, 30, 50, 100, 200, 300])
    ax.set_xticklabels(["1", "2", "5", "10", "20", "30", "50", "100", "200", "300"])
    ax.set_xlim(1, 330)
    ax.invert_xaxis()
    ax.invert_yaxis()
    ax.set_xlabel("ka BP (log scale, older to the left)")
    handles = [plt.Line2D([], [], color=MODEL_COLOUR, marker="o", ls="-", lw=3, alpha=0.6),
               plt.Line2D([], [], color=EVIDENCE_COLOUR, marker="v", ls=""), plt.Line2D([], [], color="#8a4b0f", marker="^", ls=""),
               plt.Line2D([], [], mfc="white", mec=EVIDENCE_COLOUR, marker="D", ls="")]
    ax.legend(handles, ["model: late-early range, central dot", "oldest qualifying date (any material)",
                        "oldest qualifying charcoal date", "evidence onset (>= 2 sites in 2 consecutive ka)"],
              loc="lower left", fontsize=8, frameon=False)
    ax.grid(axis="x", color="#e5e5e5", lw=0.6)
    fig.tight_layout()
    fig.savefig(out / "chart-3-timing.png", dpi=150)
    plt.close(fig)
    names.append("chart-3-timing.png")

    # 5. Map: which region each populated cell belongs to, and where the old dated sites are.
    lon, lat = np.meshgrid(-180 + CELL_DEG * (np.arange(720) + 0.5), 90 - CELL_DEG * (np.arange(360) + 0.5))
    idx = assign(regions, lat, lon)
    ever = np.zeros((360, 720), dtype=bool)
    for year in range(FIRST_YEAR, -14_000 + 1, 1000):
        ever |= grid_image.decode(PREHISTORY / f"humans_{year}.webp") > 1
    fig, ax = plt.subplots(figsize=(14, 6.2))
    img = np.where(ever, idx, np.nan)
    ax.imshow(img, extent=(-180, 180, -90, 90), cmap="tab20", vmin=0, vmax=19, interpolation="nearest", alpha=0.85)
    for j, r in enumerate(regions):
        sel = ever & (idx == j)
        if sel.sum() >= 15:
            ax.text(lon[sel].mean(), lat[sel].mean(), r.id.replace("_", "\n", 1), fontsize=6.5, ha="center", va="center", color="black")
    old = dates_old
    ax.scatter(old.lon, old.lat, s=3, c="black", alpha=0.5, lw=0, label="site with a date older than 30 ka")
    ax.set_xlim(-180, 180)
    ax.set_ylim(-60, 85)
    ax.legend(loc="lower left", frameon=False, fontsize=8)
    ax.set_title("Model regions (cells ever populated 50-16 ka BP) and old dated sites", loc="left", fontsize=10)
    fig.tight_layout()
    fig.savefig(out / "chart-5-map.png", dpi=130)
    plt.close(fig)
    names.append("chart-5-map.png")

    # 4. Effort: why "no evidence" often means "no dating".
    fig, ax = plt.subplots(figsize=(9, 0.38 * len(regions) + 1.2))
    all_d = [early_rows[i]["dates"] for i in range(len(regions))]
    old = [early_rows[i]["older_than_12ka_sites"] for i in range(len(regions))]
    y = np.arange(len(regions))
    ax.barh(y, all_d, color="#bbbbbb", height=0.4, label="qualifying dates, any age")
    ax.barh(y + 0.4, old, color=EVIDENCE_COLOUR, height=0.4, label="sites with a date older than 12 ka")
    ax.set_xscale("symlog", linthresh=10)
    ax.set_yticks(y + 0.2)
    ax.set_yticklabels([r.id for r in regions])
    ax.invert_yaxis()
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    ax.set_xlabel("count (symlog)")
    fig.tight_layout()
    fig.savefig(out / "chart-4-effort.png", dpi=150)
    plt.close(fig)
    names.append("chart-4-effort.png")
    return names


# --- main ------------------------------------------------------------------------------------

def run(out: Path) -> dict:
    regions = load_regions()
    centres_all = bin_centres_bp()  # oldest first, last is the HYDE point
    centres = centres_all
    people = model_people(regions)
    d = load_dates(regions)
    ev = evidence_curves(d, len(regions), centres)
    early = earliest(d, regions)
    cmp_rows = compare(regions, people, ev, centres)
    # sensitivity: a tighter error cut and charcoal only
    sens = {}
    for label, sub in (("err<=500", load_dates(regions, 500)), ("charcoal", d[d.charcoal])):
        e2 = evidence_curves(sub, len(regions), centres)
        sens[label] = compare(regions, people, e2, centres)
    out.mkdir(parents=True, exist_ok=True)
    charts = draw_charts(regions, people, ev, centres, cmp_rows, early, out, d[d.cal_median > 30_000].drop_duplicates('site_id'))
    result = {
        "centres_bp": centres.tolist(),
        "regions": [r.id for r in regions],
        "model_people": people.tolist(),
        "evidence": {k: v.round(3).tolist() for k, v in ev.items()},
        "earliest": early, "compare": cmp_rows, "checkpoints": checkpoints(regions),
        "ever_cells": ever_populated_cells(regions), "boxes": intended_box_series(d, centres), "japan_country": japan_country(d), "sensitivity": sens, "charts": charts,
        "params": {"max_err": MAX_ERR, "loc_min": LOC_MIN, "surovell": SUROVELL, "tapho_ref_bp": TAPHO_REF_BP,
                   "evidence_min_sites": EVIDENCE_MIN_SITES, "onset_run": EVIDENCE_ONSET_RUN,
                   "model_present_share": MODEL_PRESENT_SHARE, "dates_used": int(len(d))},
    }
    (out / "results.json").write_text(json.dumps(result, separators=(",", ":")))
    return result


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").strip().splitlines()[0])
    p.add_argument("--out", type=Path, default=ROOT / "docs" / "research" / "0009-model-vs-evidence")
    args = p.parse_args()
    r = run(args.out)
    print(json.dumps({"dates_used": r["params"]["dates_used"], "charts": r["charts"]}))


if __name__ == "__main__":
    main()
