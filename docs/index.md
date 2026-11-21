# Footsteps of Time: docs index

> **Agents**: Read this file before starting any significant work.

One line per doc, grouped by section, taken from each doc's `purpose`. Start with the vision, then the ops doc for the area you touch.
New docs: add a line under the right `## Section` (jobs write theirs to `docs/index.d/<job-id>.md`; see `docs/log.d/README.md`).

**Numbering.** Each of `research/`, `tasks/` and `work/tasks/` has its own series, so the same number means different things in different
places (research 0011 is settlement patterns, task 0011 is past water). Two research folders share **0005**: `0005-time-use` and
`0005-world-population-estimates`. They are not renamed because other docs, scripts and the log link to both paths; say the full folder
name when citing either. Task 0005 (`tasks/0005-settlement-patterns`) is a third, unrelated 0005. `work/tasks/0001-0003` are an older,
separate series from `tasks/0001-0003`.

## Start here

- [`philosophy/vision.md`](philosophy/vision.md) — the one current vision for Footsteps of Time (measured vs modelled vs imagined, and what it is not)
- [`log.md`](log.md) — newest-first record of implementation and documentation changes (per-job fragments in `log.d/`)
- [`log.d/README.md`](log.d/README.md) — how to write a per-job log fragment, and why `log.md` and this index are not edited directly

## Ops: how each part works, is regenerated and is checked

- [`ops/ages.md`](ops/ages.md) — how the people layer draws ages from modelled life-course profiles by way of life (research 0006)
- [`ops/climate-series.md`](ops/climate-series.md) — sources, method and regeneration of the global sea-level and temperature series
- [`ops/close-up-scene.md`](ops/close-up-scene.md) — how the close-up 3D ground is drawn, and what `?ground=1` adds
- [`ops/ethnography.md`](ops/ethnography.md) — the D-PLACE ethnographic export and the "nearest known analog" function behind the day prompt
- [`ops/fauna.md`](ops/fauna.md) — the large-animal ranges dataset (PHYLACINE + a cited extinction table), read by the anthropology atlas
- [`ops/food.md`](ops/food.md) — the food-over-time lookup (domestication table, spread fronts, land use, forager staples), an opt-in hover row
- [`ops/grid-images.md`](ops/grid-images.md) — population and land-use grid image encodings and publication checks
- [`ops/ground-view.md`](ops/ground-view.md) — the hover card's painted ground view: scenes, prompt template, regenerating, labels and limits
- [`ops/grounding-facts.md`](ops/grounding-facts.md) — the "What we know here" panel in Units mode and how its counts are summed
- [`ops/habitat-lookup.md`](ops/habitat-lookup.md) — the hover card's habitat, climate and land-use lookups: sources, encoding, regeneration, limits
- [`ops/hyde-climate-spread.md`](ops/hyde-climate-spread.md) — the climate-adjusted spread of HYDE people (Green Sahara, exposed shelves) behind `?spread=1`
- [`ops/languages.md`](ops/languages.md) — the Glottolog language baseline (about 1500 CE) and the cited expansions table behind `?langs=deep`
- [`ops/other-humans.md`](ops/other-humans.md) — the other-kinds-of-human layer: how it is drawn, where its numbers come from, how sure they are
- [`ops/past-water.md`](ops/past-water.md) — the dated past-water scenarios behind `?pastwater=1` (Mega-Chad, European LGM, Mesopotamian coast)
- [`ops/prehistory-population.md`](ops/prehistory-population.md) — the modelled pre-HYDE population (100,000-11,000 BCE): method, sources, choices, limits
- [`ops/routine.md`](ops/routine.md) — how people at street zoom follow a daily routine, its sources, and the URL flags
- [`ops/settlements.md`](ops/settlements.md) — the settlement model (the default Units view): cities, settlement mixes, households, farm layouts
- [`ops/site-terrain.md`](ops/site-terrain.md) — where a group sits inside its cell: the baked terrain image, the ranking rule, how to measure it
- [`ops/terrain-bench.md`](ops/terrain-bench.md) — the terrain benchmark: how to run it, what each number means, baseline against the goal
- [`ops/terrain-bench/baseline-5943d1f.md`](ops/terrain-bench/baseline-5943d1f.md) — terrain benchmark baseline table at commit 5943d1f
- [`ops/terrain-bench/close-compare.md`](ops/terrain-bench/close-compare.md) — close-up time to detail, before and after task 0009 (headless, interleaved)
- [`ops/terrain-bench/tiles-compare.md`](ops/terrain-bench/tiles-compare.md) — `?terrain_tiles=1` on vs off at commit 5a31a5a
- [`ops/terrain-images.md`](ops/terrain-images.md) — sources, method and regeneration of the per-era Earth terrain images
- [`ops/tour.md`](ops/tour.md) — the `?tour=1` guided tour: its nine stops, where each number comes from, and the first-draft wording
- [`ops/visual-regression.md`](ops/visual-regression.md) — screenshot regression over ten fixed scenes: running it, updating baselines, why CI skips it
- [`ops/water-distance.md`](ops/water-distance.md) — the baked distance-to-fresh-water image that group placement reads
- [`ops/ice-sheets.md`](ops/ice-sheets.md) — PaleoMIST 1.0 dated ice-sheet masks behind `?ice=1`: source, licence, method, regeneration, checks

## Research: question, evidence, verdict (check the status line at the top of each: several recommendations are built)

- [`research/0001-deep-prehistory-sources/research.md`](research/0001-deep-prehistory-sources/research.md) — defensible human-presence sources for 100,000-10,000 BCE and an uncertainty treatment
- [`research/0002-pre-hyde-population-model/research.md`](research/0002-pre-hyde-population-model/research.md) — how to make a labelled, modelled estimate of people, 100,000-10,000 BCE
- [`research/0002-pre-hyde-population-model/timmermann2016/comparison.md`](research/0002-pre-hyde-population-model/timmermann2016/comparison.md) — independent check of the model against Timmermann & Friedrich 2016
- [`research/0003-p3k14c-earliest-dates-by-region/research.md`](research/0003-p3k14c-earliest-dates-by-region/research.md) — what the p3k14c radiocarbon compilation says about when people reached each region
- [`research/0004-ground-view/research.md`](research/0004-ground-view/research.md) — how the hover card can show what a spot looked like on the ground (built: `ops/ground-view.md`)
- [`research/0005-time-use/research.md`](research/0005-time-use/research.md) — time-use studies by way of life, feeding the day API, and a day-clock concept (one of two 0005 research folders)
- [`research/0005-world-population-estimates/research.md`](research/0005-world-population-estimates/research.md) — sourced historical world-population estimates and an honest counter range (the other 0005 research folder)
- [`research/0006-life-course/research.md`](research/0006-life-course/research.md) — honest demographic priors and age sampling (built in `4ae7ab2`)
- [`research/0007-languages-over-time/research.md`](research/0007-languages-over-time/research.md) — what language family can honestly be shown per cell and era (built in `9331154`, `0d4d440`)
- [`research/0008-food-over-time/research.md`](research/0008-food-over-time/research.md) — a cited table of crop and livestock domestication centres and spread fronts (built: `ops/food.md`)
- [`research/0009-model-vs-evidence/research.md`](research/0009-model-vs-evidence/research.md) — the modelled pre-HYDE population against radiocarbon evidence, with proposals P1-P10 (all built but P7 and P10)
- [`research/0010-aadr-ancient-dna-samples-by-region/research.md`](research/0010-aadr-ancient-dna-samples-by-region/research.md) — what the AADR ancient-DNA table says about when people reached each region
- [`research/0011-settlement-patterns/research.md`](research/0011-settlement-patterns/research.md) — sources, decisions and limits for the settlement experiment (built, now the default Units view)
- [`research/0012-group-structure/research.md`](research/0012-group-structure/research.md) — where groups sit in a cell, nested levels, farmer hierarchy, polities (tasks 1-4 built)
- [`research/0013-arrivals-deep-past-source-check/research.md`](research/0013-arrivals-deep-past-source-check/research.md) — the 2026-11-19 source check of the memory-only entries in `arrivals.yaml` and `deep_past.yaml`
- [`research/0014-past-terrain/research.md`](research/0014-past-terrain/research.md) — open past terrain, sea-level and inland-water sources; ranks 1, 3, 4 built behind `?pastwater=1`
- [`research/hosting/hosting-claude.md`](research/hosting/hosting-claude.md) — superseded 2025-08 note on cheap hosting paths
- [`research/hosting/hosting-codex.md`](research/hosting/hosting-codex.md) — superseded 2025-08 note on near-zero-cost hosting (GitHub Pages + R2)
- [`research/interpolation/gpu-interpolation-guide.md`](research/interpolation/gpu-interpolation-guide.md) — a guide to GPU interpolation of population between years (not built)
- [`research/revitalisation/state-of-the-project.md`](research/revitalisation/state-of-the-project.md) — superseded: the original outage investigation and revitalisation plan

## Tasks: spec (`task.md`) and plan (`plan.md`) per piece of work

- [`tasks/0001-people-view-by-zoom/task.md`](tasks/0001-people-view-by-zoom/task.md) ([plan](tasks/0001-people-view-by-zoom/plan.md)) — choose the people view by zoom and make 1900 smooth
- [`tasks/0002-terrain-per-era-earth-images/task.md`](tasks/0002-terrain-per-era-earth-images/task.md) ([plan](tasks/0002-terrain-per-era-earth-images/plan.md)) — per-era Earth images under the people layer
- [`tasks/0003-anthropology-database/task.md`](tasks/0003-anthropology-database/task.md) ([plan](tasks/0003-anthropology-database/plan.md)) — a sourced anthropology record per 5-degree cell and era, served by the day API
- [`tasks/0004-simpler-elegant-time-bar/task.md`](tasks/0004-simpler-elegant-time-bar/task.md) ([plan](tasks/0004-simpler-elegant-time-bar/plan.md)) — one quiet, non-linear time bar
- [`tasks/0005-settlement-patterns/task.md`](tasks/0005-settlement-patterns/task.md) ([plan](tasks/0005-settlement-patterns/plan.md)) — compare modelled settlement patterns against the old Units view
- [`tasks/0006-terrain-tiled-colour-pyramid/task.md`](tasks/0006-terrain-tiled-colour-pyramid/task.md) ([plan](tasks/0006-terrain-tiled-colour-pyramid/plan.md)) — a tiled zoom pyramid for the terrain colour
- [`tasks/0007-adjusted-hyde-spread-flag/task.md`](tasks/0007-adjusted-hyde-spread-flag/task.md) ([plan](tasks/0007-adjusted-hyde-spread-flag/plan.md)) — show the climate-adjusted HYDE spread behind `?spread=1`
- [`tasks/0008-languages-cited-expansions/task.md`](tasks/0008-languages-cited-expansions/task.md) ([plan](tasks/0008-languages-cited-expansions/plan.md)) — cited language expansions as a hover line behind `?langs=deep`
- [`tasks/0009-terrain-close-up-time-to-detail/task.md`](tasks/0009-terrain-close-up-time-to-detail/task.md) ([plan](tasks/0009-terrain-close-up-time-to-detail/plan.md)) — halve the close-up 3D time to detail
- [`tasks/0010-guided-tour/task.md`](tasks/0010-guided-tour/task.md) ([plan](tasks/0010-guided-tour/plan.md)) — a nine-stop guided tour behind `?tour=1`
- [`tasks/0011-past-water-lgm-europe-mesopotamia/task.md`](tasks/0011-past-water-lgm-europe-mesopotamia/task.md) ([plan](tasks/0011-past-water-lgm-europe-mesopotamia/plan.md)) — European LGM and Mesopotamian past-water scenarios behind `?pastwater=1`
- [`tasks/0012-pre-hyde-research-0009-rest/task.md`](tasks/0012-pre-hyde-research-0009-rest/task.md) ([plan](tasks/0012-pre-hyde-research-0009-rest/plan.md)) — research 0009 P5, P6, P8 and the rest of P9 in the pre-HYDE model
- [`work/tasks/0001-time-slider-mobile-labels.md`](work/tasks/0001-time-slider-mobile-labels.md) — done (2025-09): stop the TimeSlider's labels overlapping on small screens
- [`work/tasks/0002-static-export.md`](work/tasks/0002-static-export.md) — done (2025-09): serve footsteps-web as a static Next.js export
- [`work/tasks/0003-anthrome-overlay.md`](work/tasks/0003-anthrome-overlay.md) — paused (2025-09): prototype anthrome overlay tiles and a UI toggle
- [`tasks/0013-ice-sheets-dated-extent/task.md`](tasks/0013-ice-sheets-dated-extent/task.md) ([plan](tasks/0013-ice-sheets-dated-extent/plan.md)) — ice sheets at their dated extent behind `?ice=1`, on the Earth image and the close-up

## Design

- [`design-system.md`](design-system.md) — practical UI rules that match the design philosophy (last revised 2025-09)
- [`design/explorations/index.md`](design/explorations/index.md) — ten design explorations for the constants of human life, with a feasibility verdict each
- [`philosophy/design-philosophy.md`](philosophy/design-philosophy.md) — Will's design philosophy: the experience wanted and the design system that follows
- [`philosophy/human-constants.md`](philosophy/human-constants.md) — the constants of human life Footsteps could show, beyond where and how many
- [`philosophy/one-pager.md`](philosophy/one-pager.md) — historical: the original one-page pitch, superseded by the vision
