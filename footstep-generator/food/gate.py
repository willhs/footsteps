#!/usr/bin/env python3
"""Where farming and herding were possible at all: the first HYDE era any crop, and any herd animal, had reached each 1° cell.

    poetry run python footstep-generator/food/gate.py   # -> footsteps-web/lib/domesticatesGate.json

HYDE's land use is allocated from population with per-capita rules, so it puts cropland and grazing land where no crop or herd
animal had yet arrived (grazing in Australia before 1788, cropland in the Americas and Europe at 10,000 BCE). The web app
classes each populated cell as forager, farmer or herder from that land use (`lib/waysOfLife.ts`); this gate stops it naming
farmers where the food table (crops.py, animals.py, research 0008) has no crop yet, or herders where it has no herd animal.

Reads only the claim tables, no data files. A 1° cell counts a domesticate from the oldest claim holding any of five points in
it (its centre and four points 0.25° in from its corners), so a 5° claim box is not missed at its edge.

Output: `{"version", "eras", "crop", "herd"}`; `crop` and `herd` are 180 strings (rows north to south, 90N first) of 360
characters (columns west to east, 180W first): the index of the first era (`A` = eras[0] ... ) or `.` for none by 1900,
run-length encoded as `<count><character>` pairs (`360.` is a row with neither).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food.animals import ANIMALS  # noqa: E402
from food.crops import CROPS  # noqa: E402
from food.model import ERAS, Taxon, era_bp  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "footsteps-web" / "lib" / "domesticatesGate.json"

# Animals kept in herds on grazing land. Not dogs (companions), pigs, guinea pigs or poultry, which are kept round the house.
HERD_IDS = {"sheep", "goat", "cattle", "zebu", "horse", "donkey", "dromedary", "bactrian", "llama", "water_buffalo"}
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
NONE = "."


def first_era(taxa: list[Taxon], lon0: float, lat0: float) -> int | None:
    """Index of the first era at which any of `taxa` is present somewhere in the 1° cell at (lon0, lat0) south-west corner."""
    points = [(lon0 + 0.5, lat0 + 0.5), (lon0 + 0.25, lat0 + 0.25), (lon0 + 0.75, lat0 + 0.25), (lon0 + 0.25, lat0 + 0.75), (lon0 + 0.75, lat0 + 0.75)]
    oldest = None
    for t in taxa:
        for lon, lat in points:
            a = t.arrival_ka(lon, lat)
            if a is not None and (oldest is None or a > oldest):
                oldest = a
    if oldest is None:
        return None
    for i, year in enumerate(ERAS):
        if oldest * 1000 >= era_bp(year):
            return i
    return None


def grid(taxa: list[Taxon]) -> list[str]:
    rows = []
    for r in range(180):
        lat0 = 89 - r
        row = []
        for c in range(360):
            i = first_era(taxa, -180 + c, lat0)
            row.append(NONE if i is None else LETTERS[i])
        rows.append(rle("".join(row)))
    return rows


def rle(row: str) -> str:
    out, i = [], 0
    while i < len(row):
        j = i
        while j < len(row) and row[j] == row[i]:
            j += 1
        out.append(f"{j - i}{row[i]}")
        i = j
    return "".join(out)


def unrle(row: str) -> str:
    out, n = [], ""
    for ch in row:
        if ch.isdigit():
            n += ch
        else:
            out.append(ch * int(n))
            n = ""
    return "".join(out)


def build() -> dict:
    crops = [t for t in CROPS if t.kind == "crop"]
    herds = [t for t in ANIMALS if t.id in HERD_IDS]
    missing = HERD_IDS - {t.id for t in herds}
    if missing:
        raise SystemExit(f"herd animals not in the table: {sorted(missing)}")
    return {"version": 1, "eras": ERAS, "crop": grid(crops), "herd": grid(herds)}


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
