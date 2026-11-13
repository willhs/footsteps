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
