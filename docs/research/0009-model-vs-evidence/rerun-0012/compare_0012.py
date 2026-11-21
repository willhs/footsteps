#!/usr/bin/env python3
"""Before/after numbers for research 0009 P5, P6, P8 and the rest of P9, one stage after another.

    python compare_0012.py before:IMAGES:MVE p6:IMAGES:MVE p5:IMAGES:MVE ...

IMAGES is a `prehistory_population.py --out` directory (humans_*.webp, totals.json; manifest.sha256 if
present), MVE a `model_vs_evidence.py --out` directory (results.json). Each stage is compared with the one
before it and with the first. Prints markdown tables (compare_0012.txt).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[4] / "footstep-generator"))
import prehistory_population as pp  # noqa: E402

P5 = "europe_west"
P6 = ["europe_east_steppe", "central_asia_siberia_south", "east_asia"]
P9 = ["madagascar_indian_ocean", "caribbean", "greenland_arctic_canada", "pacific_remote"]


class Stage:
    def __init__(self, spec: str):
        self.name, images, mve = spec.split(":")
        self.images, self.mve = Path(images), Path(mve)
        self.totals = json.loads((self.images / "totals.json").read_text())
        r = json.loads((self.mve / "results.json").read_text())
        self.centres = np.array(r["centres_bp"])
        self.ids = r["regions"]
        self.people = np.array(r["model_people"])
        self.compare = {row["id"]: row for row in r["compare"]}

    def at(self, region: str, year: int) -> float:
        return float(self.people[self.ids.index(region), int(np.argmin(abs(self.centres - (pp.BP_ZERO - year))))])

    def world(self, year: int) -> float:
        return float(self.people[:, int(np.argmin(abs(self.centres - (pp.BP_ZERO - year))))].sum())

    def hashes(self) -> dict[str, str]:
        return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(self.images.glob("humans_*.webp"))}


def fmt(v, nd=2):
    return "-" if v is None else (f"{v:,.0f}" if abs(v) >= 100 else f"{v:.{nd}f}")


def table(header: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def main(specs: list[str]) -> None:
    stages = [Stage(s) for s in specs]
    names = [s.name for s in stages]
    first = stages[0]

    print("## Images changed\n")
    rows = []
    for prev, s in zip(stages, stages[1:]):
        a, b = prev.hashes(), s.hashes()
        changed = [k for k in b if a.get(k) != b[k]]
        years = sorted(int(k[7:-5]) for k in changed)
        rows.append([f"{prev.name} → {s.name}", len(changed), f"{years[0]:,} to {years[-1]:,}" if years else "-"])
    print(table(["Step", "Images changed (of 90)", "Years"], rows))

    print("\n## World totals (literature curve)\n")
    rows = []
    for s in stages:
        t = s.totals
        curve_err = max(abs(c - pp.world_totals(y).central)
                        for y, c, w in zip(t["years"], t["central"], t["hyde_weight"]) if w == 0)
        same = t["central"] == first.totals["central"]
        img = max(abs(s.world(y) - c) / c for y, c in zip(t["years"], t["central"])
                  if pp.BP_ZERO - y <= s.centres.max() + 1)  # results.json bins start at 50 ka
        rows.append([s.name, "yes" if same else "NO", f"{curve_err:,.0f}", f"{img:.2%}"])
    print(table(["Stage", "central == before, every year", "max |central − curve| before the blend (people)",
                 "max |image sum − central| / central"], rows))

    print("\n## P5: west Europe at the glacial maximum\n")
    rows = []
    for s in stages:
        c = s.compare[P5]
        rows.append([s.name, fmt(c["lgm_ratio_model"]), fmt(c["lgm_ratio_sites_raw"]), fmt(c["lgm_ratio_sites_corrected"]),
                     fmt(s.at(P5, -20_000)), fmt(s.at(P5, -32_000)), f"{c['model_share_20ka']:.1%}", fmt(c["rho_50_16"])])
    print(table(["Stage", "model 26-20 / 36-30 ka", "evidence raw", "evidence corrected", "people at 21.95 ka",
                 "people at 33.95 ka", "share of world at 20 ka", "rho 50-16 ka"], rows))
    rows = []
    for s in stages:
        rows.append([s.name] + [f"{s.compare[r]['model_share_20ka']:.2%}" for r in
                                ("africa", "europe_south_iberia", "europe_east_steppe", "sahul", "east_asia")])
    print()
    print(table(["Stage (share of world at 20 ka)", "africa", "europe_south_iberia", "europe_east_steppe", "sahul",
                 "east_asia"], rows))

    print("\n## P6: ramps\n")
    rows = []
    for r in P6:
        for s in stages:
            c = s.compare[r]
            rows.append([r, s.name, c["ramp_ka"], fmt(c["model_first_ka"]), fmt(c["evidence_first_ka"]),
                         fmt(c["half_rise_model_ka"]), fmt(c["half_rise_evidence_ka"]), fmt(c["rho_50_16"]),
                         fmt(c["rho_50_16_raw"])])
    print(table(["Region", "Stage", "ramp ka", "model first ≥2% ka", "evidence onset ka", "model half-rise ka",
                 "evidence half-rise ka", "rho (corrected)", "rho (raw)"], rows))

    print("\n## P9: people from the HYDE blend before arrival\n")
    years = [-14_000, -13_000, -12_000, -11_000]
    rows = [[r, s.name] + [fmt(s.at(r, y)) for y in years] for r in P9 for s in stages]
    print(table(["Region", "Stage"] + [f"{-y:,} BCE" for y in years], rows))

    print("\n## P8: range and the share of people with no evidence behind their weight\n")
    rows = []
    for y in (-48_000, -28_000, -18_000, -13_000, -11_000):
        for s in stages:
            t = s.totals
            i = t["years"].index(y)
            share = t.get("unevidenced_share", [None] * len(t["years"]))[i]
            rows.append([f"{-y:,} BCE", s.name, f"{t['low'][i] / 1e6:.2f}", f"{t['central'][i] / 1e6:.2f}",
                         f"{t['high'][i] / 1e6:.2f}", "-" if share is None else f"{share:.0%}"])
    print(table(["Year", "Stage", "low M", "central M", "high M", "no-evidence share (model)"], rows))
    print(f"\nStages: {', '.join(names)}")


if __name__ == "__main__":
    main(sys.argv[1:])
