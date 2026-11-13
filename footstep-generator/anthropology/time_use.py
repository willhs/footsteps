#!/usr/bin/env python3
"""time_use.yaml -> deploy/budgie/api/time_use.json: the part of the time-use table the day API may show.

    poetry run python footstep-generator/anthropology/time_use.py

The API image has no YAML reader, and the YAML holds more than the prompt may use. This keeps only
figures with a value and a source that was read (`check: read` or `secondary`; `recalled` ones must be
verified first, see the YAML header) and drops `sex_note`, basis prose and the recalled
`human_baseline`. A way of life with no usable figure is left out, so the API says nothing quantitative.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "time_use.yaml"
OUT = HERE.parents[1] / "deploy" / "budgie" / "api" / "time_use.json"
USABLE_CHECKS = ("read", "secondary")


def export(table: dict) -> dict:
    ways = {}
    for way, entry in table["ways_of_life"].items():
        figures = {
            name: {"value": f["value"], "range": f["range"], "scope": f.get("scope"), "cite": f["cite"],
                   "check": f["check"]}
            for name, f in entry["figures"].items()
            if f.get("value") is not None and f.get("range") and f.get("check") in USABLE_CHECKS
        }
        if figures:
            ways[way] = {"measured_among": entry["measured_among"], "figures": figures,
                         **({"caution": entry["caution"]} if entry.get("caution") else {})}
    return {
        "version": table["version"],
        "units": table["units"],
        "note": "Ranges are the spread across studies, not confidence intervals. Definitions of work differ "
                "between studies. No figure is split by sex.",
        "ways_of_life": ways,
    }


def main() -> None:
    out = export(yaml.safe_load(SOURCE.read_text()))
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{sorted(out['ways_of_life'])} -> {OUT.relative_to(HERE.parents[1])}")


if __name__ == "__main__":
    main()
