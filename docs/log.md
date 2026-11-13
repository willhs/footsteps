---
id: docs-log
type: note
purpose: "Record implementation and documentation updates"
---

## [2026-11-14] add | Ethnographic "nearest known analog" (D-PLACE)

`footstep-generator/anthropology/ethnography.py`: Ethnographic Atlas + SCCS + Binford + TEOW biome + ecoClimate merged by `xd_id` into 1,404
societies with 25 variables (`ethnography.json.gz`, 0.2 MB, committed), and `nearest_analogs` (3 most similar societies for a place, year and
way of life; score from subsistence, distance, temperature, precipitation, biome). Licence is CC BY-NC, not CC BY as the task said. Extends the
existing atlas (shares its zip reader and way-of-life rule) rather than duplicating it; not wired into the app or API. Method, limits and three
sanity checks: [ethnography](ops/ethnography.md); which constants it grounds: [human-constants](philosophy/human-constants.md#what-d-place-can-ground).

## [2026-11-14] add | Units by way of life (HYDE land use read by the app)

The client now loads `landuse_{year}.png` beside `humans_{year}.webp` and classes each populated 5′ cell
(`footsteps-web/lib/waysOfLife.ts`): people >= 40,000 urban; cropland >= 2% of the cell farmer; grazing >= 10%
herder; else forager, except a cell with >= 600 people is settled (farmer). Kind of group follows: bands (30),
villages (300), new herding camps (60), city glow; colour follows too, in the far-out firelight and the legend.
Share of the world's people by class under that rule (measured from the images, `grid_image.py` encoding):

| year | forager | farmer | herder | urban |
|---|---|---|---|---|
| 10,000 BCE | 98.0% | 2.0% | 0% | 0% |
| 5000 BCE | 90.5% | 9.2% | 0.3% | 0% |
| 1000 BCE | 33.4% | 64.4% | 2.1% | 0.1% |
| 1 CE | 17.7% | 79.8% | 2.3% | 0.2% |
| 1000 CE | 16.3% | 78.8% | 4.8% | 0.1% |
| 1900 CE | 2.0% | 83.0% | 3.0% | 12.0% |

The 2% farmers at 10,000 BCE are 37 cells over the density floor, not cropland (HYDE land use is all zero then).
Thresholds are coarse display choices, not findings; HYDE's cropland is itself a model. The hover card's
`wayOfLife` (0.5° cell, 5% crop) still has its own thresholds and can disagree with a 5′ mark. Years before HYDE
have no land use, so everyone is drawn as a forager.

## [2026-11-14] add | Food over time (crop and livestock domestication and spread)

`footstep-generator/food/`: a cited table of 19 crops and 15 domestic animals (domestication centres, first dates, 529
dated spread claims in 88 named boxes, the Columbian exchange), pooled with HYDE land use and the Krapp biome (from the habitat
tiles) into `data/food/food.json.gz` (35 KB, gitignored): for each 5 degree cell and HYDE era, which domesticates were
present, whether HYDE sees farming, and forager staples by biome. 328 of 529 claims are low-confidence front estimates
and only 19 were confirmed even against a web summary. Not wired into the app. Method and limits: [food](ops/food.md);
findings and how the hover card or a "what's on the plate" view could use it: [research 0008](research/0008-food-over-time/research.md).
## [2026-11-14] add | HYDE people adjusted for the climate then (not wired into the app)

`footstep-generator/hyde_climate_spread.py`: moves HYDE 3.5 people within ten macro-regions by habitable capacity then vs
1950 (reusing the pre-HYDE capacity model, plus the terrain's Green Sahara), keeping each region's total. 10,000-4,000 BCE,
`data/tiles/grid_adjusted/`. Sahara 8% -> 22% of Africa's people from 8,000 BCE; the North Sea floor, Sundaland and the Sahul
shelf gain people. Radiocarbon check: 28-47% of dated African sites are in the Sahara box then. Strength 1.0 is a choice.
Method and limits: [hyde-climate-spread](ops/hyde-climate-spread.md). `terrain_image.sahara_extent` and
`Model.climate_npp/adjust_npp` were factored out for it (no behaviour change).

## [2026-11-14] update | High-zoom terrain relief

Era colours now carry a cached Terrarium hillshade overlay from zoom 5, including
exposed shelves, plus illustrative surface grain. Source credits, colour-mask
limits and the real-GPU verification command are in [terrain images](ops/terrain-images.md).

## [2026-11-14] add | Large-animal ranges over time (fauna dataset)

`footstep-generator/fauna/`: PHYLACINE 1.2.1 present-natural ranges (CC0, not CC BY as the task said) for 329 land
mammals (>= 44 kg plus 14 key smaller ones), a cited extinction/extirpation table, and a land-ice mask, exported as
`data/fauna/fauna.json.gz` (122 KB, gitignored): species per 1 degree cell for each 1 ka step, 100,000 BCE to 1900.
Only 21 of 157 prehistorically extinct species have a species-level date; the rest take a regional window (tagged
`regional`). Not wired into the app. Method and limits: [fauna](ops/fauna.md).

## [2026-11-09] update | Halve first-load bytes

Default view (Units, 1000 BC), cold cache, Chromium, gzip like Caddy
(`footsteps-web/scripts/measure-first-load.mjs`):

| | before | after |
| --- | --- | --- |
| first paint (HTML+JS+CSS+first image) | 3,390,837 B | 1,602,224 B (47%) |
| settled, incl. both neighbour-year prefetches | 9,135,148 B | 3,963,663 B (43%) |
| population image, 1000 BC | 2,855,783 B | 1,145,942 B |
| JS | 473,136 B | 444,761 B |

- Population images are now `humans_{year}.webp`: lossless WebP of a 1023-level
  log scale (was 16-bit PNG). Lossless WebP of the old pixels only reached ~75%
  (year 0: 2.17 MB); the 16-bit low byte was noise, so levels were coarsened
  instead. Every cell is within ±0.76% of HYDE and decoded year totals within
  1.3×10⁻⁴ (worst: 10,000 BCE; most years under 3×10⁻⁵). Populated cells are
  unchanged. Screenshots differ in 0.03% of pixels; Units dot count moved
  2,019,963 → 2,021,566 (+0.08%). Chromium and Firefox decode every checked file
  identically to Pillow (`scripts/verify-webp-decode.mjs`).
- Dots-only code (PMTiles, MVT loader, tile-metrics worker) loads on first use of
  Dots mode (~28 kB gz out of the default bundle).
- Not done: tiling by view and cropping polar rows. Rows 0–128 are already empty and
  compress to nothing (cropped WebP was 0.1% smaller), and Units/morphing needs the
  whole world, so tiles would add requests without saving bytes.
- Caddy now sends a one-day `Cache-Control` for `/grid/`.

## [2026-11-09] update | Blend decoded grid years

Units and Grid now retain the displayed snapshot during loads and blend prepared
years over 300 ms. A Web Worker decodes, seeds and prepares binary rendering
attributes for neighbouring years in advance; the cache
retains five snapshots. An interrupted blend finishes before taking the latest
decoded request, keeping two GPU datasets and continuous brightness. GPU uploads
are staged in hidden chunks before a fade starts. Units draws a single union of
stable unit IDs, interpolating colours/radii on the GPU and keeping persistent
bands at full brightness. See the
[usage and verification instructions](../README.md#-how-to-use).
