---
id: plan-0011
type: spec
purpose: "Implementation plan for the European LGM and Mesopotamian past-water scenarios behind ?pastwater=1."
tags: ["plan", "terrain", "freshwater", "placement"]
related: ["./task.md", "../../ops/past-water.md"]
---

# Past water: European LGM and Mesopotamian scenarios — implementation plan

## Overview

Mega-Chad is wired as *the* scenario: one manifest imported by `lib/pastWater.ts`, one mask and one distance patch, one
epoch number passed through the ranker. Two more scenarios (one with three stages, one whose lakes have many levels)
do not fit a single global mask. Redesign as if several scenarios had been there from day one: **an epoch is the unit**
(id unique across scenarios, a mask patch, an optional distance patch, a water level rule), a scenario is a manifest
grouping epochs with its sources and uncertainty, and a year has a set of active epochs.

**Primary Goal**: the two new scenarios read by every consumer, flag off unchanged, checks in the task's Success Criteria pass.

## Current State Analysis

- `footstep-generator/past_water.py`: Mega-Chad build, `EPOCHS`, `epoch_at`, `load_lake` (reads `manifest["mask"]`).
- `footstep-generator/past_water_check.py`: counts positions in the Mega-Chad mask and a fresh DEM flood fill.
- `footstep-generator/terrain_image.py:317-328, 402-405`: `pastwater_lake`, `pastwater_years`, paint at full strength.
- `footsteps-web/lib/pastWater.ts`: imports `mega_chad.json`; `pastWaterEpoch(year) → number`; `loadPastWater` → `{lake, water}`;
  `lakePlaneFor` → `{level, key, wetAt}`; `pastWaterNote` hard-codes Mega-Chad words.
- `components/footsteps/layers/siteRanking.ts:96-110`: one region box from the two patches; `liveFor(row, col, epoch)`;
  `scenarioAt`/`codeAt` read the one lake/patch; cache stores the epoch per cell (Uint8).
- `settlementUnits.ts:35,65,77`: `epoch` param; `unresolved` present when epoch ≠ 0.
- `hooks/gridData.ts:338`: `epoch: pastWaterEpoch(year)`; `hooks/useTerrainLayers.ts:166-178`: close-up plane.
- `lib/close3d.ts:292-300, 363-378`: `lakeVertices` (mask AND DEM below level), one `lake.level` for drawn/shore.

## Design

Caller usage:

```ts
const epochs = pastWaterEpochs(year);                  // e.g. [1, 4] at -4000: Mega-Chad highstand + Mesopotamia ~6 ka
ranker.spotsFor(cellId, seaLevel, count, epochs);       // each cell sees at most one active epoch (regions of epochs that overlap in time are disjoint)
const plane = lakePlaneFor(layers, year, seaLevelAt(year)); // { key, levelAt(lon, lat, h) → metres | null }
pastWaterNote(year, mode, unresolved);                 // names the active scenarios, or "no scenario: geography unknown, not dry"
```

Options considered:
1. **Composite global mask** (merge all scenarios into one mask/patch per "frame" of the timeline): one number still, but
   every frame boundary of any scenario re-ranks every past-water cell worldwide and the files multiply per frame. Rejected.
2. **Epoch as the unit, active set per year** (chosen): each epoch owns its patches and region; the ranker resolves a cell's
   epoch from the active set; the cache keeps one byte per cell. Disjointness of time-overlapping regions is a tested invariant.

Water level rule per epoch (`level` in the manifest):
- `{"kind": "plane", "m": 329, "clip_to_dem": true}` Mega-Chad (as now).
- `{"kind": "pixel"}` LGM: the mask's green/blue carry the lake's level, `G*256+B-32768` m: the median ETOPO height of
  the lake polygon's shore pixels (one level per polygon); the mask says where the water is, no DEM clip.
- `{"kind": "sea"}` Mesopotamia: water at the year's sea level (it is the Gulf).

## What We're NOT Doing
- No Black Sea (no data), no default change, no deploy, no population image regeneration.
- No per-scenario split of `unresolved` (one total; the note names the active scenarios).

## Assumptions
- Epoch ids: Mega-Chad 1, LGM 2, Mesopotamia 3/4/5 (stages a/b/c). Unique across scenarios so a cached byte names one.
- All patches of all scenarios are fetched once with the flag on (measured; LGM is the largest). Lazy per-epoch loading
  is a follow-up if the size matters.
- Mesopotamia region: 44.0–49.5 E, 29.8–33.5 N (head of the Gulf). Outside it the figure is today's coast generalised.
- Fig 6 is georeferenced from its graticule ticks (76.17 px per degree, both axes: plate carrée); blue = water; black
  outlines/arrows are filled from their neighbours; green tidal zones are land with channels, not open water.
- Rivers are rasterised onto the HYDE 5′ cells they cross (densified to ~1 km); lakes onto 2.5′ pixels whose centre
  is inside (lakes smaller than a pixel vanish; counted in the manifest).
- Source files are downloaded by the build scripts into the git-ignored `data/pastwater_src/` and checked by sha256;
  the derived patches are committed as Mega-Chad's are.
- The Earth paint multiplies the mask by the frame's land share, so a scenario never repaints sea; Mega-Chad lies
  inland, so its frames do not change. Marine water is painted sea colour, lakes lake colour.
- Real-data checks read `data/tiles` of the primary checkout read-only (`FOOTSTEPS_DATA`), as job 0009 did.

---

## Phase 1: Shared multi-scenario machinery (Python)

- [ ] `past_water.py`: manifest v2 (per-epoch `mask`, `distance`, `level`, `water`), `SCENARIOS`, `load_manifest(name)`,
      `active_epochs(year) → list[(manifest, epoch)]`, `load_mask(epoch)` (wet bool + level metres), keep `epoch_at` for Mega-Chad
- [ ] Regenerate Mega-Chad in v2: `poetry run python footstep-generator/past_water.py --tiles data/terrarium` — patch sha256 unchanged
- [ ] `terrain_image.py`: `pastwater_paint(year)` (union of active epochs, × land share, sea/lake colour), `pastwater_years()` over all scenarios
- [ ] `past_water_check.py`: per positions file, its year's active epochs; mask count per epoch; Mega-Chad DEM fill; LGM source-polygon test
- [ ] Run: `poetry run pytest footstep-generator/tests/test_past_water.py footstep-generator/tests/test_terrain_image.py -q`

## Phase 2: European LGM scenario

- [ ] `footstep-generator/past_water_lgm.py`: download + sha check, rasterise lakes (2.5′, per-polygon shore level), rivers + fresh lakes → distance patch, manifest `lgm_europe.json`
- [ ] Tests: dates (-24550..-17050), Caspian area order of magnitude, no Black Sea, saline lakes not in the distance, patch sha in manifest
- [ ] Run the build and tests; record sizes

## Phase 3: Mesopotamian coast stages

- [ ] `footstep-generator/past_water_mesopotamia.py`: download Fig 6 + sha check, georeference, extract blue per panel inside the region, three epochs, manifest `mesopotamia.json`
- [ ] Tests: stage windows, stage b wet at Lagash-side bay (31.5 N 46.8 E), dry at Baghdad, nothing outside the region box
- [ ] Run the build and tests; record sizes

## Phase 4: Frontend

- [ ] `lib/pastWater.ts`: scenarios from the three manifests, `pastWaterEpochs`, `loadPastWater` (all epochs), `lakePlaneFor(layers, year, sea)`, note
- [ ] `siteRanking.ts`: per-epoch regions, `epochs` argument; `settlementUnits.ts`, `gridData.ts`, `useTerrainLayers.ts`
- [ ] `close3d.ts`: per-vertex water level
- [ ] Tests: pastWater.test.ts (epochs, disjoint regions, note), siteRanking.test.ts, close3d.test.ts
- [ ] Run: lint, tsc, jest

## Phase 5: Real data, pictures, docs

- [ ] `pastWater.real.test.ts` over -20000, -26000, -6000, -4000, -2000, -12000, 0; `past_water_check.py` on its positions
- [ ] Earth frames: `terrain_image.py --pastwater` for the new years (local only)
- [ ] Screenshots flag on/off: Po plain + Caspian at -20000, Basra -4000; close-up of one
- [ ] `pnpm visual`, `pnpm build`, full Python tests
- [ ] `docs/ops/past-water.md`, log fragment

## Phase 6: Wrap (commit & finalize)

- [ ] Run: `git status`; commit (Manager job: commit only)
