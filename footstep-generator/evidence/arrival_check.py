#!/usr/bin/env python3
"""Per-region arrival check: the model's arrival dates against the earliest evidence in each region.

    python footstep-generator/evidence/arrival_check.py [--aadr PATH] [--p3k14c-results PATH] [--out DIR]

For each region of `prehistory/arrivals.yaml` (one table, one set of boxes, `regions.py`), side by side:
the modelled central / early / late arrival, the earliest qualifying p3k14c radiocarbon date, and the
earliest direct-radiocarbon-dated Homo sapiens sample in AADR. A region is flagged when either piece of
evidence is OLDER than the model's `early` bound: the model then says "nobody yet" about a place where
something was dated. It reports; it never changes the model or the yaml (research 0009 owns the proposals).

Inputs (git-ignored; see the evidence README):
- AADR: `data/evidence/aadr_samples.json.gz` (aadr.py build). Its stored region ids come from whatever
  boxes were current at build time, so every sample is re-assigned from its coordinates here.
- p3k14c: the `earliest` rows of `docs/research/0009-model-vs-evidence/results.json`, written by
  model_vs_evidence.py from the full calibrated dates file with the same boxes and filters (research
  0003's "qualifying" date). Re-run that script to refresh it; the raw dates are not needed here.

Data shape: Region --1:0..1--> Earliest (p3k14c), Region --1:0..1--> Earliest (AADR direct); a Row
holds the three and derives the flags, so a flag cannot disagree with the numbers beside it.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

from evidence import aadr, aadr_report  # noqa: E402
from evidence import regions as reg  # noqa: E402

AADR_EXPORT = ROOT / "data" / "evidence" / "aadr_samples.json.gz"
P3K14C_RESULTS = ROOT / "docs" / "research" / "0009-model-vs-evidence" / "results.json"


@dataclass(frozen=True)
class Earliest:
    ka: float  # cal BP / 1000 (p3k14c: median of the calibrated date; AADR: the table's mean)
    where: str  # "site (country)"


@dataclass(frozen=True)
class Row:
    region: reg.Region
    p3k14c: Earliest | None  # oldest qualifying date, any material (megafauna, wood and driftwood included)
    p3k14c_charcoal: Earliest | None  # same, charcoal and other hearth-like material only (the stricter reading)
    p3k14c_third_site_ka: float | None  # third-oldest *site* (a repeat, not a one-off), any material
    aadr: Earliest | None  # oldest direct-dated sapiens sample

    def predates_early(self, e: Earliest | None) -> bool:
        return e is not None and e.ka > self.region.early

    @property
    def flags(self) -> tuple[str, ...]:
        return tuple(
            name
            for name, e in (("p3k14c", self.p3k14c), ("p3k14c charcoal", self.p3k14c_charcoal), ("AADR", self.aadr))
            if self.predates_early(e)
        )


# --- sources ---------------------------------------------------------------------------------


def load_aadr(path: Path) -> pd.DataFrame:
    """The export as the frame `aadr_report.usable` expects, regions re-assigned from the coordinates."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        samples = json.load(f)["samples"]
    r = pd.DataFrame(
        {
            "id": [s["id"] for s in samples], "lat": [s["la"] for s in samples], "lon": [s["lo"] for s in samples],
            "date_bp": [s["d"] for s in samples],
            "date_type": [{"d": "direct", "c": "context", "t": "tethered"}.get(s["t"], "other") for s in samples],
            "locality": [s["n"] for s in samples], "country": [s["c"] for s in samples],
            "group": [s["g"] for s in samples],
            "range_src": [s.get("rs", "anno") for s in samples],
            "hominin": [s.get("h", aadr.Hominin.SAPIENS.value) for s in samples],
        }
    )
    r["region"] = reg.assign_regions(r.lat.to_numpy(), r.lon.to_numpy())
    return r


def aadr_earliest_direct(r: pd.DataFrame) -> dict[str, Earliest]:
    u = aadr_report.usable(r)
    u = u[u.date_type == aadr.DateType.DIRECT.value]
    oldest = u.sort_values(["date_bp", "id"], ascending=[False, True]).drop_duplicates("region")
    return {
        s.region: Earliest(s.date_bp / 1000, f"{(s.locality or s.id).split(' (')[0]} ({s.country})") for s in oldest.itertuples()
    }


@dataclass(frozen=True)
class P3k14cEarliest:
    any_material: dict[str, Earliest]
    charcoal: dict[str, Earliest]
    third_site_ka: dict[str, float]  # third-oldest *site* (a repeat, not a one-off), any material


def p3k14c_earliest(results: dict) -> P3k14cEarliest:
    """The oldest qualifying date per region from the 0009 results (`earliest` rows)."""
    out = P3k14cEarliest({}, {}, {})
    for e in results["earliest"]:
        for label, store in (("all", out.any_material), ("charcoal", out.charcoal)):
            if e[f"oldest_{label}"] is not None:
                store[e["id"]] = Earliest(e[f"oldest_{label}"], e[f"oldest_{label}_site"].split(", acc")[0])
        if e["third_site_all"] is not None:
            out.third_site_ka[e["id"]] = e["third_site_all"]
    return out


def build(regions: tuple[reg.Region, ...], aadr_oldest: dict[str, Earliest], p3k: P3k14cEarliest) -> list[Row]:
    return [
        Row(r, p3k.any_material.get(r.id), p3k.charcoal.get(r.id), p3k.third_site_ka.get(r.id), aadr_oldest.get(r.id))
        for r in regions
    ]


# --- rendering -------------------------------------------------------------------------------


def _cell(e: Earliest | None, row: Row, extra: str = "") -> str:
    if e is None:
        return "none"
    mark = " **>**" if row.predates_early(e) else ""
    return f"{e.ka:.1f}{mark}: {e.where}{extra}"


def render_markdown(rows: list[Row]) -> str:
    lines = [
        "| Region | Central | Early-late | Sourced | Earliest p3k14c, any material (ka) | Earliest p3k14c, charcoal (ka) | Earliest direct AADR sapiens (ka) | Evidence older than `early` |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        r = row.region
        third = f" (3rd-oldest site {row.p3k14c_third_site_ka:.1f})" if row.p3k14c_third_site_ka else ""
        lines.append(
            f"| {r.id} | {r.central:g} | {r.early:g}-{r.late:g} | {r.verification} | {_cell(row.p3k14c, row, third)} "
            f"| {_cell(row.p3k14c_charcoal, row)} | {_cell(row.aadr, row)} | {', '.join(row.flags) or '-'} |"
        )
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=(__doc__ or "").strip().splitlines()[0])
    p.add_argument("--aadr", type=Path, default=AADR_EXPORT)
    p.add_argument("--p3k14c-results", type=Path, default=P3K14C_RESULTS)
    p.add_argument("--out", type=Path, help="also write arrival_check.md and arrival_check.json here")
    args = p.parse_args()
    a_old = aadr_earliest_direct(load_aadr(args.aadr))
    rows = build(reg.REGIONS, a_old, p3k14c_earliest(json.loads(args.p3k14c_results.read_text())))
    text = render_markdown(rows)
    print(text)
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "arrival_check.md").write_text(text + "\n")
        (args.out / "arrival_check.json").write_text(json.dumps(
            [{"id": r.region.id, "central": r.region.central, "early": r.region.early, "late": r.region.late,
              "p3k14c": r.p3k14c and r.p3k14c.__dict__, "p3k14c_charcoal": r.p3k14c_charcoal and r.p3k14c_charcoal.__dict__,
              "p3k14c_third_site_ka": r.p3k14c_third_site_ka,
              "aadr_direct": r.aadr and r.aadr.__dict__, "flags": list(r.flags)} for r in rows], indent=1))


if __name__ == "__main__":
    main()
