"""Split data/fauna/fauna.json.gz into small files the hover card loads lazily.

  data/tiles/fauna/species.json        id -> [common name, kg, role, extinct 0/1]   (~15 KB)
  data/tiles/fauna/r_{row}_{col}.json  one 30x30 degree block: {"c": {cell: [species, first step, ...]}, "i": {cell: [ice steps]}}

Copy data/tiles/fauna/ to footsteps-web/public/fauna/. Cell ids and steps are as in fauna.json.gz (docs/ops/fauna.md).
Run: poetry run python footstep-generator/fauna/export_web.py
"""
from __future__ import annotations

import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "fauna" / "fauna.json.gz"
OUT = ROOT / "data" / "tiles" / "fauna"
BLOCK = 30  # degrees; keep in sync with footsteps-web/lib/fauna.ts


def block_of(cell: int) -> tuple[int, int]:
    row, col = divmod(cell, 360)
    return row // BLOCK, col // BLOCK


def main() -> None:
    with gzip.open(SRC, "rt", encoding="utf-8") as f:
        data = json.load(f)
    OUT.mkdir(parents=True, exist_ok=True)
    species = [[s["common"], round(s["kg"]), s["role"], int(s["extinct"])] for s in data["species"]]
    (OUT / "species.json").write_text(json.dumps(species, separators=(",", ":"), ensure_ascii=False))

    ice_steps: dict[int, list[int]] = defaultdict(list)
    for step, ids in data["ice"].items():
        for cid in ids:
            ice_steps[cid].append(int(step))

    blocks: dict[tuple[int, int], dict] = defaultdict(lambda: {"c": {}, "i": {}})
    for cid, flat in data["cells"].items():
        cid = int(cid)
        b = blocks[block_of(cid)]
        b["c"][cid] = flat
        if cid in ice_steps:
            b["i"][cid] = sorted(ice_steps[cid])
    total = 0
    for (r, c), b in blocks.items():
        text = json.dumps(b, separators=(",", ":"))
        (OUT / f"r_{r}_{c}.json").write_text(text)
        total += len(text)
    print(f"wrote {len(blocks)} blocks ({total / 1e3:.0f} KB raw, largest "
          f"{max(p.stat().st_size for p in OUT.glob('r_*.json')) / 1e3:.0f} KB) + species.json to {OUT}")


if __name__ == "__main__":
    main()
