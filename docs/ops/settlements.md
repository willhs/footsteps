---
id: settlements
type: reference
purpose: "The ?settlements=1 experiment: real cities, regional settlement mixes and deep-time forager types — how to turn it on, regenerate it, and what it does not claim"
---

# Settlements experiment (`?settlements=1`)

An opt-in Units view that makes settlement lumpy instead of even. Everything it draws is
**modelled**; the population budget is unchanged. Method, sources and limits:
[research 0011](../research/0011-settlement-patterns/research.md).

## Turn it on

Add `settlements=1` to the URL, e.g. `/?mode=units&lat=41.9&lon=12.5&zoom=7&settlements=1`.
The flag is read once per page load (the grid worker caches by year only), so reload to switch.
Grid and Dots ignore it. Without the flag the default Units path is byte-for-byte the old one.

## What changes

- **Named cities** (Reba et al. 2016, Chandler + Modelski, ≤1900 CE) appear as cyan circles with
  a "modelled" population label from zoom 6. Each city takes its people from grid cells within
  100 km, nearest first; a city that cannot be filled shows "(budget limited)". Populations are
  interpolated only between observations ≤500 years apart and never extrapolated.
- **Regional mixes** (after 10,000 BCE): each 5° region and way of life draws group sizes from
  three nearest D-PLACE analogs (EA030 settlement pattern, EA031 community size).
- **Forager types** (before 10,000 BCE): the cell's climate (habitat WebP) picks a Binford
  climate bin; mobile bands, seasonal aggregation camps and settled groups are alternative
  shares of the same people. Mobility drives how much a mark roams. Storage is unknown.
- **Sizes** are long-tailed (truncated Pareto) draws, normalised so each cell's total is exact.

## Regenerate the catalog

`footsteps-web/public/settlements.json` is committed (a static model input, about 4 MB).

```bash
python3 footstep-generator/anthropology/settlements.py --fetch   # pinned CSVs, MD5-checked
python3 footstep-generator/anthropology/settlements.py --check-sites /tmp/sites.json  # site probes
poetry run pytest footstep-generator/tests/test_settlements.py -q
```

Raw CSVs land in `data/raw/reba/` and are not committed. Rebuild after any change to
`deploy/budgie/api/ethnography.json.gz` or `analogs.py`; the catalog records the export's SHA-256.

## Browser check

```bash
pnpm --dir footsteps-web dev
node footsteps-web/scripts/verify-settlements.mjs http://localhost:4444 /abs/evidence/dir
```

Captures Rome (flag on/off), Ohalo II at 21,000 BCE, and Grid/Dots with the flag. In `next dev`
React reports hydration mismatches on every scene, flagged or not, in legend and terrain-note
markup this experiment does not touch, so the script exits non-zero there; read `browser.json`.
