"""Rebuild the comparison envelope and chart. --check verifies committed outputs.

Uses Python's standard library; rendering the chart additionally needs matplotlib.
No downloads: source anchors are the reviewed research input in sources.json.
"""
import argparse
import io
import json
import math
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUTPUT = ROOT / 'footsteps-web/lib/population_estimates.json'


def derive(corpus):
    constants = (ROOT / 'footsteps-web/lib/constants.ts').read_text()
    years = list(map(int, re.findall(r'-?\d+', constants.split('export const TARGET_YEARS = [')[1].split(']')[0])))
    assert len(years) == len(set(years)) and years == sorted(years)
    anchors = {}
    for key, source in corpus['sources'].items():
        points = source['anchors']
        assert points and [a[0] for a in points] == sorted(set(a[0] for a in points))
        assert all(math.isfinite(lo) and math.isfinite(hi) and 0 < lo <= hi for _, lo, hi in points)
        assert source['url'] and source['locator']
        # Keep the two complete HYDE series separate so they cannot make gaps in
        # the comparative literature appear to be tightly constrained.
        if key not in ('hyde-3.3', 'hyde-3.5-app'):
            for year, low, high in points:
                anchors.setdefault(year, []).append((key, low, high))
    dates = sorted(anchors)

    def literature(year):
        def bound(date, index, extreme):
            values = anchors[date]
            value = extreme(v[index] for v in values)
            refs = [{'source': k, 'year': date} for k, lo, hi in values if (lo, hi)[index-1] == value]
            return value, refs
        if year in anchors:
            low, low_refs = bound(year, 1, min)
            high, high_refs = bound(year, 2, max)
            return low, high, low_refs, high_refs, [year]
        for a, b in zip(dates, dates[1:]):
            if a < year < b:
                f = (year - a) / (b - a)
                lo_a, lo_refs_a = bound(a, 1, min)
                lo_b, lo_refs_b = bound(b, 1, min)
                hi_a, hi_refs_a = bound(a, 2, max)
                hi_b, hi_refs_b = bound(b, 2, max)
                return (lo_a * (lo_b / lo_a)**f, hi_a * (hi_b / hi_a)**f,
                        lo_refs_a + lo_refs_b, hi_refs_a + hi_refs_b, [a, b])
        raise ValueError(f'No literature bracket for {year}; never extrapolate')

    rows = []
    for year in years:
        low, high, low_refs, high_refs, bracket = literature(year)
        direct = []
        for key, source in corpus['sources'].items():
            for y, lo, hi in source['anchors']:
                if y != year:
                    continue
                direct.append(key)
                ref = {'source': key, 'year': year}
                if lo < low:
                    low, low_refs = lo, [ref]
                elif lo == low and ref not in low_refs:
                    low_refs.append(ref)
                if hi > high:
                    high, high_refs = hi, [ref]
                elif hi == high and ref not in high_refs:
                    high_refs.append(ref)
        rows.append({'year': year, 'low': math.floor(low), 'high': math.ceil(high),
                     'lowFrom': low_refs, 'highFrom': high_refs,
                     'literatureAnchorYears': bracket, 'directSources': direct})
    return {
        'schemaVersion': 1, 'units': 'persons',
        'kind': 'spread-across-estimates-not-confidence-interval',
        'method': 'Min lower/max upper at published comparison dates; geometrically interpolate envelope only in missing literature years; include HYDE 3.3 and app 3.5 totals; round outward to persons. No extrapolation.',
        'sourcesPath': '../../docs/research/0005-world-population-estimates/sources.json',
        'years': rows,
    }


def chart(data, corpus):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), gridspec_kw={'width_ratios': [1, 1.25]})
    for ax, start, end, title in zip(axes, [-10000, 0], [0, 1900], ['10,000 BCE–1 CE', '1–1900 CE']):
        rows = [r for r in data['years'] if start <= r['year'] <= end]
        x = [r['year'] for r in rows]
        ax.fill_between(x, [r['low']/1e6 for r in rows], [r['high']/1e6 for r in rows], color='#d9e2e8', label='Across-source envelope*')
        for key, color, label in [('mcevedy-jones', '#426b88', 'McEvedy & Jones'), ('hyde-3.2', '#6b8443', 'HYDE 3.2'), ('hyde-3.3', '#9471a3', 'HYDE 3.3'), ('hyde-3.5-app', '#be612c', 'HYDE 3.5 app')]:
            points = [(y, lo/1e6) for y, lo, _ in corpus['sources'][key]['anchors'] if start <= y <= end]
            ax.plot(*zip(*points), marker='.', markersize=5, lw=1.2,
                    linestyle='-' if key.startswith('hyde-3.3') or key.startswith('hyde-3.5') else 'none',
                    color=color, label=label)
        ax.set_yscale('log')
        ax.set_title(title)
        ax.set_ylabel('World population (millions, log scale)')
        ax.set_xticks([-10000, -5000, 0] if start < 0 else [0, 500, 1000, 1500, 1900])
        ax.set_xticklabels(['10,000 BCE', '5000 BCE', '1 CE'] if start < 0 else ['1', '500', '1000', '1500', '1900'])
        ax.grid(axis='y', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    axes[1].legend(fontsize=8, loc='upper left')
    fig.suptitle('Published reconstructions disagree; HYDE is one reconstruction', fontsize=14)
    fig.text(.06, .025, '*Includes interpolated literature-envelope gaps; not a confidence interval. Only complete HYDE series are joined.\nSources and exact figures: sources.json. HYDE 3.5 = current app grid totals.', fontsize=9)
    fig.tight_layout(rect=(0, .1, 1, .94))
    output = io.BytesIO()
    fig.savefig(output, format='png', dpi=150, metadata={'Software': 'Footsteps population comparison'})
    plt.close(fig)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--chart', action='store_true', help='Also render/check the PNG (requires matplotlib).')
    args = parser.parse_args()
    corpus = json.loads((HERE / 'sources.json').read_text())
    data = derive(corpus)
    outputs = {OUTPUT: (json.dumps(data, indent=2) + '\n').encode()}
    if args.chart:
        outputs[HERE / 'comparison.png'] = chart(data, corpus)
    for path, content in outputs.items():
        if args.check:
            assert path.read_bytes() == content, f'Stale output: {path}'
        else:
            path.write_bytes(content)
    # Regression anchors catch units, source column alignment, year seam, and coverage.
    by_year = {r['year']: r for r in data['years']}
    assert by_year[-10000]['low'] == 1_000_000 and by_year[-10000]['high'] == 10_000_000
    assert corpus['sources']['durand']['anchors'][0] == [0, 270_000_000, 330_000_000]
    assert by_year[0]['low'] == 170_000_000 and by_year[0]['high'] == 400_000_000
    assert by_year[1900]['high'] == 1_762_000_000
    for y in [-10000, -1000, 0, 1000, 1600, 1900]:
        row = by_year[y]
        print(f"{y}: {row['low']:,}–{row['high']:,}; bounds: {row['lowFrom']} / {row['highFrom']}")
    print(f"{'Verified' if args.check else 'Built'} {len(data['years'])} HYDE years; {len(corpus['sources'])} sources; {len(outputs)} outputs")


if __name__ == '__main__':
    main()
