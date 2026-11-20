---
id: site-terrain
type: reference
purpose: "Where a group sits inside its cell under ?settlements=1: the baked terrain image, the ranking rule, how to regenerate and measure it, and what it cannot do"
updated: 2026-11-20
---

# Site terrain and ranked spots (`?settlements=1`)

Part 2 of research 0012 "Recommended first build" ([research](../research/0012-group-structure/research.md)). Behind the existing
`?settlements=1` flag only: without it the default Units path is byte-for-byte the old one. The rule is **modelled**; the exact spot a
group takes is **imagined** (the on-screen legend says so).

Before this, the two Units builders put groups at seeded random points in the cell and never asked whether the point was land.

## The rule

Each populated 5′ cell has a fixed list of **16 candidate spots** (a jittered 4 × 4 grid covering the whole cell, each spot in the middle 80 % of its
stratum, a pure function of the cell id). The list is ranked by

```
score = flat × near water × near coast × noise
noise       = 1 ± 0.35, a stable factor per (cell, spot)
flat        = 1 / (1 + (slope / 3°)²)                       slope: the baked 2.5′ slope class, bilinear
near water  = 1 / (1 + metres to fresh water / 3 km)        the baked water-distance layer (docs/ops/water-distance.md), bilinear
near coast  = 1 + 0.6 / (1 + metres to the year's sea / 5 km)   1 when there is no sea within two pixels
```

The noise factor breaks ties. The water layer is one value per 5′ cell and the slope is a 2.5′ class, both coarser than the spread of a cell's spots, so on flat
inland ground the scores tie or differ only by the slope of the bilinear interpolation. Before the factor, the best spot was the corner that gradient points to
(candidates 0, 3, 12 and 15, the four corners of the 4 × 4, won 65 % of the time against 25 % if even), the same relative place in cell after cell, and a map of
about one group a cell read as rows (see "Regularity"). ±0.35 is the smallest tried that brought the square order to the random level; ±0.2 left it at 0.15-0.19.
Real preferences still win: a river 3 km away changes the score by far more than 35 %.

The slope scale (3°) is from the Yangshao/Longshan site studies in research 0012 (slope about 2–3°); the water and coast decay lengths are
**invented**, because the literature gave nothing to fit foragers to. Sea and lakes are left out: a spot is **surely dry** when under 5 %
of the area around it is sea or lake; only a cell with no surely dry spot uses the doubtful shore spots (under half wet), driest first.

- **Group k sits at spot k** of its cell's list, whatever the group count. Adding people adds groups without moving the ones already there.
  A cell with more groups than usable spots stacks the extra ones on usable spots, never in the sea.
- **Sea level**: `seaLevelAt(year)` (`lib/climate.ts`) says how far the sea is below today's. A baked sea pixel whose depth is at most that
  drop is dry land, so the exposed shelf at 21,000 BCE takes people. The list changes only when the cell's coast does: it is cached by cell
  id with a 36-bit signature of which pixels around the cell are under water that year. Today's coast, 1900 CE and 0 CE (sea level 0 m)
  share one list; so do 5000 BCE (−6 m) and 1000 CE for a cell whose shelf is deeper than 6 m.
- **Cities**: a city's glow (an urban cell) stays on the cell centre unless the centre is under water, then it takes the first spot.
- Cell totals, group ids (`cell × 32 + slot + ordinal`), group counts and sizes are unchanged: only the position moves. `?sites=0` keeps the
  old invented positions with the flag on, to compare.
- If the baked images fail to load the groups fall back to the old positions (a failed fetch never loses people).

Code: `footsteps-web/components/footsteps/layers/siteRanking.ts` (the ranker), `settlementUnits.ts` (uses it), `hooks/gridData.ts`
(`loadSiteRanker`, one per worker so the cache outlives each year), `hooks/gridWorker.ts` (`sites` flag).

## Why a baked image and not Terrarium tiles

The grid worker builds groups for **every populated cell in the world** each year (1.33 million cells in 1900 CE), so it cannot fetch a
tile per cell. Terrarium (AWS elevation tiles, zoom 6, about 2.4 km a pixel at the equator) is read once, offline, by
`footstep-generator/site_terrain.py`, which bakes one coarser, year-independent image. The slope is therefore **regional** (a 2.4 km
pixel, then a 3 × 3 median), not the local slope of a village site; it separates river plains from hills and mountains, not a terrace
from the slope above it.

## The image

`footsteps-web/public/sites/site_terrain.webp` (**2.4 MB**, lossless, served at `/sites/site_terrain.webp`) and `site_terrain.json`
beside it. 2.5′ grid (8640 × 4320), row 0 = north, column 0 = 180° W; each HYDE 5′ cell is 2 × 2 pixels.

| Channel | Meaning |
|---|---|
| R | depth of the pixel's sea below today's sea level: 0 when the pixel is all land (Natural Earth 10m land); else metres rounded **up** to a multiple of 4 (4 … 132); 255 = 136 m or deeper (below any sea level in the series, −134 m) |
| G bits 4–7 | share of the pixel that is sea today, 0..15 (Natural Earth land drawn at 4× and counted) |
| G bit 3 | lake (Natural Earth 10m lakes, every one, including saline; half the pixel or more) |
| G bits 0–2 | slope class 0..7; upper bounds in degrees `0.2, 0.5, 1, 2, 4, 7.5, 14`, class 7 steeper |
| B | 0 |

A pixel's sea is dry when `depth ≤ drop`; the wet share of a point is the bilinear mix of `sea share` over the four pixels around it, counting
only those whose sea is still under water. Sixteen unfiltered slope classes took the file to 4.6 MB (nearly all speckle); eight classes and a
median filter give 2.4 MB, a little over the water layer's 872 KB and below `settlements.json` (4 MB). In the worker it is read in 256-row
bands into two byte planes (75 MB for terrain, 9 MB for water) plus the cache (about 25 bytes a cell, 33 MB for 1.3 million cells, and a 37 MB slot table indexed by cell id): about 155 MB in all, only with the flag on.

## Regenerate

```bash
NATURAL_EARTH_DIR=/some/writable/dir TERRARIUM_DIR=/some/writable/dir/terrarium \
  poetry run python footstep-generator/site_terrain.py
```

Downloads the 4,096 zoom-6 Terrarium tiles (about 150 MB, not committed) and Natural Earth `ne_10m_land` and `ne_10m_lakes` v5.1.2 (sha256
pinned in the script), then writes both files above. About 5 minutes and 3 GB of memory; the output is deterministic.
`poetry run pytest footstep-generator/tests/test_site_terrain.py -q` checks the encodings, the geometry and the committed image (Rome, the Adriatic
shelf, the Netherlands polders, Lake Superior, the Nile valley, the Himalaya). Present-day land and lakes stand in for the past, so the Aral, Caspian
and the Great Lakes ice are not modelled.

## Measure

Before and after, on the shipped images, with the real builder. The harness is a jest file skipped unless asked for:

```bash
FOOTSTEPS_SITES_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_SITES_OUT=/abs/out \
  pnpm --dir footsteps-web exec jest components/footsteps/layers/settlementSites.real.test.ts
NATURAL_EARTH_DIR=/some/dir poetry run python footstep-generator/site_check.py /abs/out
```

It builds the `?settlements=1` Units for 1900, 1000, 0 CE, 5000, 10,000 and 21,000 BCE with the old positions ("before") and the ranked spots
("after") and counts groups whose position is in the sea at that year's sea level or on a lake, by the nearest 2.5′ terrain pixel
(a stricter and coarser test than the ranker's own, which interpolates). For 1900 CE it also writes the positions, and `site_check.py` tests
them against Natural Earth's exact land and lake polygons, which the baked image only approximates.

Measured 2026-11-19 (people are identical before and after in every year; so are the group counts):

| Year | Sea level | Groups | In the sea before → after | On a lake before → after |
|---|---|---|---|---|
| 1900 CE | 0 m | 2,605,987 | 42,738 (1.64 %) → 13,924 (0.53 %) | 10,294 → 2,738 |
| 1000 CE | 0 m | 2,035,793 | 26,020 → 7,875 | 5,690 → 1,291 |
| 0 CE | 0 m | 1,856,342 | 22,408 → 6,628 | 5,139 → 1,120 |
| 5000 BCE | −6 m | 1,338,350 | 6,179 → 709 | 4,069 → 830 |
| 10,000 BCE | −50 m | 1,170,094 | 1,141 → 72 | 3,413 → 706 |
| 21,000 BCE (modelled, people on land sub-cells) | −129 m | 1,156,358 | 867 → 38 | 6,317 → 3,895 |

**Re-measured 2026-11-20 after the score factor and full-cell spots** (same builder; groups and people identical to before in every year): in the sea 14,295 (1900 CE, was 13,924), 6,065 (1000 BCE; 20,410 with the old positions),
73 (10,000 BCE, was 72), 38 (21,000 BCE, was 38); on a lake 2,754, 990, 706, 3,895. Spots now reach the cell's edge, so a few more coastal ones fall on the shore (+2.7 % in 1900); the no-dry-spot cells are
unchanged in kind (3,088 cells in 1900). The 1900 build costs 29.9 s cold (23.3 s before: noise and a wider spread cost a little per candidate), 6.5 s for 1000 BCE.

**Against Natural Earth's exact polygons, 1900 CE:** in the sea 46,746 (1.79 %) → 10,508 (0.40 %), on a lake 8,392 → 1,636.

**The target was zero; it is not zero, and cannot be with this image.** What is left:

- About half the residual (5,555 of 10,508 groups in 1900) is in the ~3,970 cells where the baked coast leaves **no surely dry spot**: a
  small island, a spit, a delta tip or a cell whose land is under a 2.5′ pixel's half-land line. The cell's total must stay in the cell, so
  its groups take the driest doubtful spots. The other half sit within the coast's own precision. Of the 1900 residual groups the median is
  0.8 km (cells with no dry spot) and 0.25 km (the rest) from the nearest Natural Earth land, p90 2.3 km and 0.74 km.
- At **21,000 BCE** the modelled 0.5° image used to give each block's 36 sub-cells an equal share regardless of the coast, which put 17,862 groups in sub-cells that were
  wholly sea at −129 m. `gridData.ts` now gives a block's people only to its land sub-cells at the year's sea level
  ([prehistory population](prehistory-population.md), "Land sub-cells"): the remaining groups in wholly-sea sub-cells are the 302 people of the one
  block that is all sea at that level. The row above is measured with this mask (1,156,358 groups; 867 → 38 in the sea by the nearest-pixel test); the 21,000 BCE
  residual is now the same coast-precision and no-dry-spot cells as the other years (3,914 cells with no dry spot).
- Lakes below the 2.5′ pixel (under about 20 km²) are not in the image at all.

Frame time: the work is in the grid worker, once per year decode; nothing runs per rendered frame. In jest on an M-series Mac (load average
about 8) `prepareYearGrid` took 6.7 s before and 23.3 s after for the first year seen (1900 CE, 1.33 M cells cold: about 13 µs a cell, ranking
every cell once), then 5.1 → 6.0 s for 1000 CE (the cache already holds nearly every cell) and 4.8 → 5.0 s for 0 CE; a fully warm rebuild of
1900 CE is 7.1 s. So the experiment's first load costs about 17 s more in the worker, once per page, and later years cost under 1 s more.
Numbers are from a loaded machine and a Node worker, not the browser; they are for comparison, not a promise.

## Regularity

`siteRegularity.ts` measures how regular a set of group positions is, and `settlementRegularity.real.test.ts` runs it on the shipped data (same variables as "Measure"; `FOOTSTEPS_SITES_FILE`
names the output). Three numbers: the nearest-neighbour spread `cv` (0.52 for a random scatter, 0 for a lattice), the Clark-Evans ratio (1 random, above 1
more even than random; density is groups per occupied cell), and the **square order** (|mean exp(4iθ)| of the directions to nearest neighbours: about 0.11-0.13 for the
old random positions, near 1 for rows and columns). Box: Italy 7-19° E, 36-47.5° N at 1000 BCE; the Nile 29-35° E, 22-31.5° N at 1500 CE. The screenshots are zoom 7 flat and zoom 9.5 tilted 3D
(`scripts/verify-regularity.mjs`).

| Place, way of placing | Groups in box | cv | Clark-Evans | Square order | Spot candidates 0/3/12/15 |
|---|---|---|---|---|---|
| Italy 1000 BCE, default (no flag) | 40,373 | 0.745 | 0.95 | 0.018 | n/a |
| Italy, `?settlements=1&sites=0` | 17,511 | 0.767 | 0.99 | 0.134 | n/a |
| Italy, `?settlements=1` **before** | 17,511 | 0.669 | 0.94 | **0.450** | 14 + 15 + 15 + 21 = 65 % of first groups |
| Italy, `?settlements=1` **after** | 17,511 | 0.561 | 1.03 | **0.144** | 8 + 8 + 8 + 11 = 35 % |
| Nile 1500 CE, default | 5,288 | 1.086 | 1.09 | 0.022 | n/a |
| Nile, `?sites=0` | 3,433 | 1.292 | 1.03 | 0.113 | n/a |
| Nile, `?settlements=1` **before** | 3,433 | 1.128 | 1.10 | **0.420** | 14 + 14 + 14 + 23 = 65 % |
| Nile, `?settlements=1` **after** | 3,433 | 1.017 | 1.19 | **0.139** | 8 + 7 + 8 + 9 = 32 % |

(The default path has more groups in the box because it does not allocate cities and cells the same way; compare its shape, not its count.) The 2D measure that stood out is the
square order: the grid showed as nearest neighbours lying due east-west or north-south far more often than in a scatter (0.42-0.45 against 0.11-0.13), while the within-cell position (`alignX`, `alignY`) stayed low
because the four corners cancel. After the change the screenshots show a scatter with no rows in Italy and in the Nile's farmland, flat and in 3D
(`evidence/regularity-*-before.png` and `-after.png` in the job workspace).

**Group counts per cell stay exact, deliberately.** The task offered varying how many groups a cell draws (some 0, some 2-3) with totals conserved over a neighbourhood, if per-cell exactness forced a
lattice. It did not: with full-cell spots and the noise factor, one group a cell already measures random (square order 0.14, cv 0.56). Varying the count would move a zero-draw cell's people to
a neighbour's group, so cell totals, group ids (the year morph pairs marks by id) and the per-cell invariant the tests and hover card use would all go. The bigger option, a clustered point process over a block,
is written up as research 0012 follow-up 5 and not built.

## Limits

- Present-day coasts, lakes and rivers stand in for the past; nothing palaeo is invented. The Green Sahara and the exposed shelves' rivers are
  missing (see `docs/ops/water-distance.md`), so "far from water" in the Sahara, Arabia and the Thar between 11 and 5 ka is unreliable
  and the ranking there reduces to flat × coast.
- The coast is known to a 2.5′ pixel (about 4.6 km). A spot named "dry" can be on a beach or a spit a few hundred metres inside the sea.
- Slope is regional (2.4 km pixels, median-filtered); flat means "a plain", not "a terrace".
- Seasonal scenarios (`?seasons=1`) move mobile bands to illustrative gathering sites that are **not** checked against the sea.
- Candidate spots are a 4 × 4 jittered grid over the whole cell, so two groups of different cells can stand close across a cell edge (as close as the jitter allows); a cell with more groups than usable spots stacks them (rare: it takes 20 bands, 600 foragers in a cell).
