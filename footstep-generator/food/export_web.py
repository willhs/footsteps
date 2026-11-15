#!/usr/bin/env python3
"""Export the modelled food lookup for the opt-in hover row; no raw claims in the web payload."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food import lookup  # noqa: E402
from food.build import DATA, ROOT  # noqa: E402


def export(data: dict) -> dict:
    taxa = {t['id']: t for t in data['taxa'] if t['needs'] != 'none'}  # dogs are not a food staple
    cells = {}
    for key, cell in data['cells'].items():
        lat0, lon0 = map(int, key.split(','))
        arrivals = {}
        for tid, first in cell['first'].items():
            if tid not in taxa:
                continue
            claims = [c for c in taxa[tid]['claims'] if any(
                x0 <= lon0 + 2.5 <= x1 and y0 <= lat0 + 2.5 <= y1
                for x0, x1, y0, y1 in c['boxes'])]
            oldest = max(c['ka'] for c in claims)
            claim = max((c for c in claims if c['ka'] == oldest),
                        key=lambda c: ({'low': 0, 'medium': 1, 'high': 2}[c['confidence']], c['checked']))
            arrivals[tid] = [first, claim['confidence'], claim['checked']]
        cells[key] = arrivals
    return {
        'version': 1, 'eras': data['eras'], 'licence': data['licence'],
        'taxa': [{'id': t['id'], 'name': t['name'], 'kind': t['kind']} for t in taxa.values()],
        'cells': cells,
        'biomes': {data['biome_names'][key]: value for key, value in data['foragers']['biomes'].items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DATA / 'food/food.json.gz')
    parser.add_argument('--out', type=Path, default=ROOT / 'footsteps-web/public/food/food.json')
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(export(lookup.load(args.input)), separators=(',', ':')))
    print(f'wrote {args.out} ({args.out.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
