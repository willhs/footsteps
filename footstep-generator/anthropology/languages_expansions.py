#!/usr/bin/env python3
"""languages_expansions.yaml -> footsteps-web/public/languages/expansions.json: the cited language expansions the hover card
shows behind ?langs=deep (research 0007 steps 2-3, docs/ops/languages.md).

    poetry run python footstep-generator/anthropology/languages_expansions.py

The YAML header holds the rules; `validate` enforces them and fails the build on a broken row. The asset keeps only what the
card needs: rows with boxes (disputed rows with no area are never shown), each with `from_year`, the first year it may be
shown (its start, or the older end of its range, never before the 5 ka floor).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "languages_expansions.yaml"
OUT = HERE.parents[1] / "footsteps-web" / "public" / "languages" / "expansions.json"
BP_ZERO = 1950
FLOOR_BP = 5000
FLOOR_YEAR = BP_ZERO - FLOOR_BP  # -3050: nothing is said earlier
GRID = 5
KINDS = ("historical", "deep")
LINK = re.compile(r"doi:10\.\d{4,9}/\S+|https?://\S+")


def load(path: Path = SOURCE) -> dict:
    return yaml.safe_load(path.read_text())


def from_year(row: dict) -> int:
    """The first year a row may be shown: its start year, or the older end of its range, never before the floor."""
    start = row["start_year"] if row["kind"] == "historical" else BP_ZERO - max(row["start_bp"])
    return max(start, FLOOR_YEAR)


def _box_errors(box: object) -> list[str]:
    if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, int) for v in box)):
        return [f"box {box!r} is not [south, west, north, east] integers"]
    s, w, n, e = box
    errors = []
    if any(v % GRID for v in box):
        errors.append(f"box {box} is off the {GRID}° grid")
    if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
        errors.append(f"box {box} is empty or out of range")
    return errors


def row_errors(row: dict) -> list[str]:
    rid = row.get("id", "?")
    errors = []
    for key in ("id", "family", "glottocode", "kind", "boxes", "disputed", "cite", "source", "checked", "unverified", "note"):
        if key not in row:
            errors.append(f"missing {key}")
    if errors:
        return [f"{rid}: {e}" for e in errors]
    if not re.fullmatch(r"[a-z0-9]{4}\d{4}", row["glottocode"]):
        errors.append(f"glottocode {row['glottocode']!r} is not a Glottolog id")
    if row["kind"] not in KINDS:
        errors.append(f"kind {row['kind']!r} not in {KINDS}")
    elif row["kind"] == "historical":
        if not isinstance(row.get("start_year"), int) or "start_bp" in row:
            errors.append("a historical row has an integer start_year and no start_bp")
    else:
        bp = row.get("start_bp")
        if not (isinstance(bp, list) and len(bp) == 2 and all(isinstance(v, int) and v > 0 for v in bp) and bp[0] <= bp[1]):
            errors.append("a deep row has start_bp [lo, hi], positive, lo <= hi")
        if "start_year" in row:
            errors.append("a deep row has no start_year")
    if not row["boxes"] and not row["disputed"]:
        errors.append("only a disputed row may have no boxes")
    for box in row["boxes"]:
        errors.extend(_box_errors(box))
    if row["checked"]:
        if not LINK.search(row["source"]):
            errors.append("checked, but the source has no doi: or URL")
        if row["unverified"]:
            errors.append("checked, but unverified says why not")
    elif not row["unverified"].strip():
        errors.append("not checked, so unverified must say why")
    return [f"{rid}: {e}" for e in errors]


def validate(table: dict) -> None:
    rows = table["rows"]
    errors = [e for row in rows for e in row_errors(row)]
    ids = [r.get("id") for r in rows]
    errors += [f"duplicate id {i}" for i in sorted({i for i in ids if ids.count(i) > 1})]
    if table.get("floor_bp") != FLOOR_BP:
        errors.append(f"floor_bp must be {FLOOR_BP}")
    if errors:
        raise ValueError("languages_expansions.yaml:\n  " + "\n  ".join(errors))


def export(table: dict) -> dict:
    validate(table)
    rows = []
    for r in table["rows"]:
        if not r["boxes"]:
            continue  # disputed with no area: never shown
        out = {"id": r["id"], "family": r["family"], "glottocode": r["glottocode"], "from_year": from_year(r)}
        out.update({"start_year": r["start_year"]} if r["kind"] == "historical" else {"range_bp": r["start_bp"]})
        out.update({"boxes": r["boxes"], "disputed": r["disputed"], "cite": r["cite"], "checked": r["checked"]})
        rows.append(out)
    rows.sort(key=lambda r: (r["from_year"], r["id"]))
    return {
        "version": table["version"],
        "checked_on": table["checked_on"],
        "floor_year": FLOOR_YEAR,
        "note": "Hand-drawn 5° boxes from cited studies and records (footstep-generator/anthropology/languages_expansions.yaml). "
                "A spreading family, not a boundary; nothing before 5 ka.",
        "rows": rows,
    }


def render(table: dict) -> str:
    return json.dumps(export(table), separators=(",", ":"), ensure_ascii=False) + "\n"


def main() -> None:
    text = render(load())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    rows = json.loads(text)["rows"]
    print(f"{len(rows)} rows -> {OUT.relative_to(HERE.parents[1])} ({len(text.encode())} bytes)")


if __name__ == "__main__":
    main()
