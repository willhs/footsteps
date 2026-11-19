---
id: settlements
type: reference
purpose: "The ?settlements=1 experiment: real cities, regional settlement mixes, deep-time forager types, households, a hover-only regional group, farm settlement layouts and a largest-settlement hover line — how to turn it on, regenerate it, and what it does not claim"
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

## Farm layouts and the largest settlement (2026-11-20)

Parts A and B of research 0012 "3. Farmer settlement hierarchy" ([research](../research/0012-group-structure/research.md)), behind the flag only. Legend line says: farmers' groups follow
their analogs' settlement patterns (modelled, places imagined); the largest-settlement exponent is an assumption (imagined).

**A. Layouts by EA030 (map geometry).** `layers/settlementLayout.ts`. Each farming group already takes its size from one of its region's three analog societies; it now also takes that
society's EA030 pattern as a layout (`lib/settlements.ts` `layoutOfPattern`: 5 dispersed homesteads, 6 hamlets, 7 villages/towns and 8 complex permanent are *nucleated*; 1-4 and a missing code keep the plain ranked spot,
same as nucleated). The cell's ranked spots ([site terrain](site-terrain.md)) are still the "where":

| Layout | Group *k* goes to |
| --- | --- |
| nucleated (villages) | the best-ranked free spot: villages stand apart, each on a good place. This is exactly what every group did before layouts |
| dispersed | the free spot farthest from the groups already placed, among the 8 best-ranked: farmsteads scatter |
| hamlet | the first hamlet takes the best free spot; the next ones stand 0.05-0.07 of a cell (about 450-650 m) from it, off water: a tight cluster |

A group's place depends only on the cell and the groups before it, so adding groups leaves earlier ones where they were. Only positions change: cell totals, group counts, ids, sizes and kinds are untouched (tested).
Bands, camps and glows are unchanged; `?sites=0` keeps the old random positions. **What the catalog actually says** (check against `public/settlements.json`, farming profiles): NW Europe, Rome and the Nile are
all villages/complex (EA030 7-8), so they look the same as before; the farming analogs are 64 % nucleated, 16 % hamlets and 8 % dispersed worldwide, 11 % mobile/impermanent. Hamlet country is the Sahel and Hausaland, parts of
SE Asia (Luzon) and Pacific islands; dispersed share peaks at about a third in tropical Asia, Melanesia and the Amazon (pure only for a few thinly peopled boxes). The task's expectation that NW Europe is dispersed
was a guess; the catalog does not say so.
Not done: street-zoom household spacing does not vary by layout (people.ts reads only the group's kind); each cell is capped at 4 farming groups, so "dispersed" is four marks spread over the cell, not twenty farmsteads.

**B. Largest settlement (hover card only, never map geometry).** `lib/rankSize.ts`, `hooks/useLargestSettlement.ts`. The card line reads "Largest settlement around here: about N people" with "a tail of bigger and
smaller villages, exponent *q* assumed (imagined) · in a ~590 km block · modelled", where the block is the 64 x 64 cell block (5.3 degrees) round the cursor, aligned with the regional-group blocks and year-independent.
The model: the block's farming and town people P (HYDE way of life Farmer or Urban) live in n = P / m settlements, where m is the mean group size of the cell's region analogs (`profileAt`); settlement *r* has
size S1 / r^q, summing to P, so S1 = P / H(n, q) (generalised harmonic number, Euler-Maclaurin). The answer is never below the largest named city in the block (Reba et al. 2016, population interpolated by `cityPopulation`;
then the card names the city) nor below the largest HYDE town cell (drawn as one glow), so the card never calls a place smaller than the one under the cursor. No line before 10,000 BCE, with no farming people in the block, or fewer
than one analog village's worth of them.

**The exponent is an assumption.** Research 0012 found no pre-industrial value, and one finding against the idea (Europe's city sizes followed Zipf's law only after about 1500). What the sources support is the shape: archaeological
rank-size curves are usually convex, flatter at the top than z = 1, more so where places are loosely integrated (Johnson 1980; Drennan & Peterson 2004). So q is below 1 and ordered by integration: **0.6 dispersed, 0.7 hamlets, 0.8 villages and towns**
(`RANK_SIZE_EXPONENT`), mixed by the region's analog weights and rounded to 0.05 (`regionExponent`), one value per 5-degree region. I tuned the three numbers by eye so that, in NW Europe and Hausaland in 1500 CE, the tail's biggest place is of
the order of the biggest known cities (Paris, Kano), not a multiple of them: at 0.9 it was 350,000 and 120,000 people there. That is a calibration to two places, not a fit. Sample lines at 1 CE-1900 CE: Rome 800,000 (the named city), Nile
(Luxor block, 1000 CE) 22,000, NW Europe 1500 200,000, Hausaland 1500 71,000, Luzon 1500 5,400. Treat the figures as illustrative.

Tests: `settlementLayout.test.ts` (rank order, scatter vs cluster, no sea, prefix stability, totals and ids conserved through `buildSettlementUnits`), `rankSize.test.ts` (harmonic sum, bounds, exponent mix, city and town floors, block edges, null cases), `hoverCard.test.ts` (row text, height).

Browser check: `node footsteps-web/scripts/verify-layouts.mjs http://localhost:4444 /abs/evidence/dir` (production data proxied; headed) hovers Rome, the Nile, NW Europe, Hausaland, Luzon, New Guinea highlands and the Amazon at zoom 9-10 and records the card line, the
legend sentence and that the card fits the viewport; with `SUFFIX=-before` and the layouts temporarily forced to nucleated it takes the comparison shots. Hover-card heights are reserved per row (`cardHeightFor`): the first cut let the new row run off the bottom of a 900 px window.

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
