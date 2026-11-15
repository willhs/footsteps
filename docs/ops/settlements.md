---
id: settlements
type: reference
purpose: "The ?settlements=1 experiment: real cities, regional settlement mixes and deep-time forager types — how to turn it on, regenerate it, and what it does not claim"
updated: 2026-11-15
---

# Settlements experiment (`?settlements=1`)

An opt-in Units view that makes settlement lumpy instead of even. Everything it draws is
**modelled**; the population budget is unchanged. Method, sources and limits:
[research 0011](../research/0011-settlement-patterns/research.md).

## Turn it on

Add `settlements=1` to the URL, e.g. `/?mode=units&lat=41.9&lon=12.5&zoom=7&settlements=1`.
The flag is read once per page load (the grid worker caches by year only), so reload to switch.
Grid and Dots ignore it. Without the flag the default Units path is byte-for-byte the old one.

### Seasonal scenarios (2026-11-15)

`?seasons=1` also enables the settlement model and adds Off / Jun / Dec controls to
the people view. Off is the annual settlement scenario. June and December reverse
summer/winter between hemispheres; contrast fades towards the equator. Mobile
forager bands pool into two gathering groups per cell in winter and move towards
shared gathering sites in illustrative 0.5° territories, weighted by the existing
analog mobility score. This also gathers the single fractional bands typical of
sparse prehistoric cells. The territory size is a scenario choice, not measured
Binford travel distance. Source-cell allocations retain their IDs and people.
Herders shift to illustrative summer/winter
pastures within their cell. Settled groups, farmers and cities stay fixed.
Every cell keeps its population budget; zero-population marks disappear and
individual people use the same seasonal groups. Changes run on viewport slices
in the worker; annual caches are immutable.
Seasonal slices include whole gathering territories so zooming into a winter camp
does not drop the neighbouring allocations that gathered there.

The on-screen label says **modelled**. These are explicit scenarios: the catalog
does not reconstruct seasonal calendars or pasture routes. They do not alter HYDE,
snow, sea ice, farmer activities, or the historical year. Seasonal snow and sea ice
need additional data before they can be represented honestly.

The separate **Day / night** control is available without flags and starts off.
It shades the background using today's UTC instant, refreshed every 20 seconds,
and [NOAA's annual solar declination](https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF). It shares that instant and the mean-solar-time
approximation with the local sun clock (no equation-of-time correction). The clock
uses latitude for daylight/night, including polar days. Historical time and the
seasonal scenario never change that live sun. A per-fragment inverse of deck.gl's
common-space projection handles flat and globe surfaces; ground and plants inherit
the same colour-scaling extension, preserving
baked hillshade and leaving people's firelight readable. Civil twilight blends to
22% brightness at six degrees below the horizon.

Reproduce the real-data browser check (production data is proxied by the script):

```bash
node footsteps-web/scripts/verify-sun-seasons.mjs http://localhost:4444 /abs/evidence/dir
```

This captures flat, globe, close-up 3D, Grid and Dots with night off/on, plus both
season scenarios. Solar time is fixed to June 21, 2026, noon UTC for repeatability.
It asserts night-side pixels darken, default controls are off, flags control the
season UI, and the close-up's clock agrees with night. Unit tests cover solar
geometry, polar days, leap days, seasonal population conservation and fixed groups.

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
