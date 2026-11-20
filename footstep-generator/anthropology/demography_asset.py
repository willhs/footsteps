#!/usr/bin/env python3
"""Compile demography.yaml into the small validated asset the people layer samples ages from (research 0006).

    poetry run python footstep-generator/anthropology/demography_asset.py            # -> footsteps-web/lib/demography.json
    poetry run python footstep-generator/anthropology/demography_asset.py --check    # fail if the committed asset is stale
    poetry run python footstep-generator/anthropology/demography_asset.py --onset data/food/food.json.gz
                                                                                      # -> footsteps-web/lib/farmingOnset.json

The YAML stays the one source of truth; the app imports the JSON and never reads the YAML. Only what the
sampler needs travels: the five living-age shares, the tail, the transition window and provenance. Life-table
metrics (e0, e15, TFR) stay in the YAML: they have not been jointly calibrated with the shares and must not drive
sampling. Everything here is MODELLED (evidence: modelled)."""
from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
YAML = Path(__file__).with_name("demography.yaml")
ASSET = ROOT / "footsteps-web" / "lib" / "demography.json"
ONSET = ROOT / "footsteps-web" / "lib" / "farmingOnset.json"
BAND_KEYS = ["0-4", "5-14", "15-29", "30-49", "50+"]
PROFILE_IDS = ["forager", "early_farmer", "agrarian", "urban"]


def validate(data: dict) -> None:
    """Fail loudly on anything the sampler would silently mishandle."""
    assert data["schema_version"] == 1
    assert data["evidence"] == "modelled"
    assert set(data["profiles"]) == set(PROFILE_IDS), "profile ids are part of the app's contract"
    bins = data["sampling"]["bins"]
    assert [b[0] for b in bins] == [0, 5, 15, 30] and [b[1] for b in bins] == [5, 15, 30, 50], "bins must tile 0-50"
    tail = data["sampling"]["tail"]
    assert tail["anchor"] == 50 and tail["scale"] > 0 and tail["max_age"] > tail["anchor"]
    window = data["sampling"]["early_farmer_window_years"]["value"]
    assert isinstance(window, int) and window > 0
    for name, profile in data["profiles"].items():
        ages = profile["age_structure"]
        assert list(ages) == BAND_KEYS, f"{name}: age bands must be {BAND_KEYS} in order"
        shares = [ages[k]["value"] for k in BAND_KEYS]
        assert all(isinstance(s, (int, float)) and math.isfinite(s) and 0 < s < 1 for s in shares), name
        assert math.isclose(sum(shares), 1, abs_tol=1e-9), f"{name}: shares sum to {sum(shares)}"
        for k in BAND_KEYS:
            assert set(ages[k]["sources"]) <= data["sources"].keys(), (name, k)
            assert "EDITORIAL2026" in ages[k]["sources"], (name, k)


def compile_asset(data: dict) -> dict:
    validate(data)
    used = {s for p in data["profiles"].values() for k in BAND_KEYS for s in p["age_structure"][k]["sources"]}
    return {
        "schema_version": 1,
        "evidence": "modelled",
        "research": data["research"],
        "generated_by": "footstep-generator/anthropology/demography_asset.py from demography.yaml; do not edit",
        "label": "Modelled age structure; individual speculative",
        "bins": data["sampling"]["bins"],
        "tail": {k: data["sampling"]["tail"][k] for k in ("anchor", "scale", "max_age", "basis")},
        "early_farmer_window_years": data["sampling"]["early_farmer_window_years"]["value"],
        "profiles": {
            name: {
                "way_of_life": p["way_of_life"],
                "era": p["era"],
                # five living-age shares in BAND_KEYS order; the last is the 50+ tail
                "shares": [p["age_structure"][k]["value"] for k in BAND_KEYS],
                "sources": sorted({s for k in BAND_KEYS for s in p["age_structure"][k]["sources"]}),
            }
            for name, p in data["profiles"].items()
        },
        "sources": {k: v for k, v in data["sources"].items() if k in used},
    }


def farming_onset(food: dict) -> dict:
    """Year crops first reach each 5-degree cell in the food model (docs/ops/food.md): the regional transition evidence."""
    eras = food["eras"]
    crops = {t["id"] for t in food["taxa"] if t["kind"] == "crop"}
    cells = {}
    for key, cell in food["cells"].items():
        firsts = [eras[i] for tid, i in cell["first"].items() if tid in crops]
        if firsts:
            cells[key] = min(firsts)
    return {
        "evidence": "modelled",
        "generated_by": "footstep-generator/anthropology/demography_asset.py --onset from data/food/food.json.gz; do not edit",
        "about": "Year (negative = BCE) the earliest modelled crop reaches each 5-degree cell, keyed 'south,west' as in lib/food.ts. "
                 "Cells absent never get a crop by 1900 in the model. Hand-compiled, partly unchecked claims (docs/ops/food.md).",
        "cells": dict(sorted(cells.items())),
    }


def dump(obj: dict) -> str:
    return json.dumps(obj, indent=1, sort_keys=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 1 if the committed demography.json differs from the YAML")
    ap.add_argument("--onset", type=Path, help="food.json.gz: also write farmingOnset.json")
    args = ap.parse_args()
    text = dump(compile_asset(yaml.safe_load(YAML.read_text())))
    if args.check:
        if not ASSET.exists() or ASSET.read_text() != text:
            print(f"STALE: {ASSET.relative_to(ROOT)}; run demography_asset.py", file=sys.stderr)
            return 1
        print("demography.json is current")
        return 0
    ASSET.write_text(text)
    print(f"wrote {ASSET.relative_to(ROOT)} ({len(text)} bytes)")
    if args.onset:
        onset = farming_onset(json.loads(gzip.open(args.onset).read()))
        ONSET.write_text(dump(onset))
        print(f"wrote {ONSET.relative_to(ROOT)} ({len(onset['cells'])} cells)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
