---
id: settlements
type: reference
purpose: "The ?settlements=1 experiment: real cities, regional settlement mixes, deep-time forager types, households and a hover-only regional group — how to turn it on, regenerate it, and what it does not claim"
updated: 2026-11-20
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

## Where groups sit in a cell (2026-11-19)

With the flag on, group *k* of a cell sits at the cell's *k*-th ranked spot: flat ground, near fresh water, near the year's coast, never in
the sea or a lake at that year's sea level (`siteRanking.ts`, [site terrain](site-terrain.md)). Scrubbing time does not move a group unless
its cell's coast changes; cell totals, group ids, counts and sizes are unchanged. The rule is modelled, the exact spot imagined, and the
legend says so. `?sites=0` (with the flag) keeps the old random positions, for comparison. Groups in the sea fell from 1.8 % to 0.4 %
(1900 CE, against Natural Earth); not zero, see the doc for what is left. First load of a year costs more in the worker (once per page).

## Households and a regional group (2026-11-20)

Part 3 of research 0012 "Recommended first build" ([research](../research/0012-group-structure/research.md), "2. Nested levels"). Both are behind the flag
only; without it the default path is unchanged. Legend line says: households are imagined in layout, the regional group's people are modelled and
its edge imagined.

**Households (street zoom, where individuals are footprints).** `layers/households.ts`. With the flag, `people.ts` packs a group's people into
households instead of the default random "hearths": sizes 2-7 with a mean of 4.51, inside Binford's 4.48 (95 % CI 4.31-4.67; Hamilton et al. 2007, *Proc R Soc B* 274:2195, Table 1, as
cited in research 0012). People fill households in order; household 0 stands on the group's spot (the ranked spot from [site terrain](site-terrain.md)), the rest on a sunflower spiral, 40 m apart (camps, bands) or 60 m (villages), members within 4 m of their household's centre. All spacings are
**imagined**: research 0012 found no data for households per camp or house spacing. Everything is a pure function of the group's position, and the
household sequence never looks at the group's size, so person *i* keeps their household and place when a group grows or shrinks (`peopleForMorph`'s steady/leaving/entering split is unchanged). The three random draws each person takes are kept,
so age, sex, role and footwear come out exactly as without households; only the standing place differs. Name tags and the footprint gait read `Person.position` as before. Households are legible from about zoom 14; at the first street zoom (12.5) a group still reads as one cluster.

**Regional group (hover or selection only).** `lib/regionalGroup.ts`. The data gives sizes, not who belonged to whom (research 0012), so membership is a modelling
choice: a block of the 5' cell grid, 2^level cells a side, aligned so blocks nest and never depend on the year. The level is the smallest whose block holds
about 840 people (Binford regional population 839, CI 736-954). A block over 3,360 (840 x 4, one level up) falls back to the level below; **no regional group is modelled** (no line, no tint) where one cell already exceeds 3,360 (a 1900 CE town), or where even a 5.3° block holds under 100 people.
So a group's block is the same in every year **at the same level**; the level (and so which groups share a block, and the people count) follows the year's population. The tint is one
soft rectangle (14 nested, inset, faint fills, no line) drawn by `layers/regionTint.ts` for the cell under the cursor, or else the clicked place, from zoom 7 (marks clickable). The hover card gets "Part of a regional group of about N people" (two figures, *modelled*).

Tests: `households.test.ts`, `peopleGen.test.ts` (same people and head count, households of 2-7 averaging about 4.5, person *i* independent of group size, the morph contract), `regionalGroup.test.ts` (block nesting, same block across years, fall-back and "none" cases), `hoverCard.test.ts`.

Browser check: `node footsteps-web/scripts/verify-households.mjs http://localhost:4444 /abs/evidence/dir` (production data proxied; runs headed). Captures a forager band at 11,000 BCE (the Natufian Levant, the densest
modelled block: individuals need a group of 15 or more, which sparse deep-time cells never reach, e.g. Ohalo II at 21,000 BCE) and a 1500 CE village (Nile near Luxor), flat and 3D, at zoom 12.6 and 15.5, plus the hover tint and card at zoom 9. On an M-series Mac with a 120 Hz display
every street-zoom scene held 110-120 fps with households on (one 3D village run measured 93 fps once, 120 on the rerun); no browser errors. The default-path screenshots at the close zoom show an empty patch because default groups stand in other places, so they are not a like-for-like frame-rate comparison.

Not done: the regional group is not a polity (no names, borders or hierarchy beyond one level); dense places show no regional line; membership is not tested against real data (none exists); households per camp is a consequence of group size and the 4.5 mean, not a measurement.

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

Captures Rome (flag on/off), Ohalo II at 21,000 BCE, and Grid/Dots with the flag, and, close in (zoom 9, flat map), the Nile near Luxor,
the Bay of Naples and Ohalo II with ranked spots (`*-ranked.png`) against the old positions (`sites=0`, `*-old.png`). It checks the placement legend line too. It exits 0
against both `next dev` and a production build. (Until 15 Nov 2026 every `?mode=` deep link threw a
React hydration error, because `FootstepsViz` read the query string in its first render; it now
applies URL and cookie state after mount.) Any hydration error now fails the script.
