---
id: plan-0001
type: spec
purpose: "Implementation plan for choosing the people view by zoom and making 1900 smooth."
tags: ["plan", "rendering", "performance"]
related: ["./task.md"]
---

# People view by zoom — Implementation Plan

## Overview

Replace "draw every unit everywhere" with three zoom regimes that cross-fade:

| Zoom | Draws | Cost |
|---|---|---|
| < 4.8 | **glow**: the year's population image as one GPU texture, colour ramp in a shader | constant per year |
| 4.8 – 5.8 | glow fades out, units fade in | glow + viewport units |
| ≥ 5.8 | **units** (bands, villages, city glow) for the viewport + margin only | ~100k–1M marks |
| ≥ 7 | units get larger, distinct marks and become clickable | same |

**Primary goal**: 1900 pan/zoom ≥ 50 fps (baseline 10–33 fps).

## Current State Analysis

- `hooks/useGridLayer.ts`: loads a year (worker), builds a morph union of two years'
  units (`hooks/unitMorph.ts`) per `zoomBucket` (3 buckets) and uploads it chunked
  (`layers/GridYearLayer.ts`). A bucket change rebuilds and re-uploads all marks because
  alpha (`BAND_ALPHA`, `VILLAGE_ALPHA`) and `UNIT_MIN_PX` are per bucket.
- `layers/unitMorphVertex.ts` uses `layer.opacity` as the year-morph progress, so layer
  opacity can't also carry a zoom fade.
- `FootstepsViz.tsx`: Units/Grid/Dots button always visible, default Units.
- Worker already decodes and builds units off the main thread (task's Do item 3 done).

## Core data shape

```ts
type PeopleMode = 'auto' | 'units' | 'grid' | 'dots';   // ?mode= debug override; auto is default
type ViewBlend = {            // pure function of (zoom, mode)
  glow: number;               // 0..1 layer opacity of the density texture
  units: number;              // 0..1 layer opacity of unit marks (0 ⇒ units not built)
  minPx: number;              // unit radiusMinPixels, continuous in zoom
  brightness: number;         // unit alpha multiplier (uniform)
  pickable: boolean;          // close zoom: marks are clickable
};
type Region = { west: number; south: number; east: number; north: number }; // degrees, 1°-snapped
// Invariant: Region ⊇ viewport; it only changes when the viewport leaves it or it is
// > 4× the padded viewport (zoomed in), so panning inside it costs nothing.
type GlowImage = { data: Uint8Array; width: number; height: number }; // r8: 255·log1p(p)/log1p(MAX), rows ±85°
```

Unit morph points now carry `info: { kind, people }` (CPU only) for picking, and their
colours carry full alpha; zoom brightness is a uniform.

## Design options

1. **Chosen — glow texture + region-culled units in the existing worker.** One r8
   texture per year in a `BitmapLayer` subclass (colour ramp injected into
   `DECKGL_FILTER_COLOR`, additive blend so year cross-fades sum exactly). Units are
   sliced per Region from the worker's per-year `Units` (rows are contiguous in the
   sorted ids, so slicing is two binary searches per row).
2. deck `TileLayer` of unit tiles. Gives culling and caching for free, but the year
   morph would have to be rebuilt per tile and per year pair; more moving parts and many
   small uploads. Rejected.
3. Aggregate units into fewer marks at mid zoom (LOD of units). Still pays per-mark cost
   at world zoom and changes the meaning of a mark. Rejected.

## What we're NOT doing

- Retiring Dots or its tiles. Changing grid encoding. Per-group stories ("meet these
  people") beyond naming the clicked group.

## Assumptions

- Zoom thresholds 4.8 / 5.8 / 7: at 4.8 a ~9 km cell is ~3.3 px (units read as noise
  below that); tuned visually.
- Glow ramp uses the units palette (band orange → village pale → city cyan) by people
  per cell, so the hand-off to units does not change colour.
- `?mode=units` keeps "units at every zoom" for comparison; the mode button only shows
  when `?mode=` is in the URL.
- "Dots drawn" metric is unchanged (the year's unit count); changing it is unrelated.
- Globe view uses the same mercator-derived region with a larger margin.
- Deploying to budgie from the branch is authorised by the task's done-when.

---

## Phase 1: Data — glow image and region slices in the worker

- [x] `hooks/gridData.ts`: add `glow: GlowImage` to `YearGrid` from the decoded pixels
- [x] `hooks/unitRegion.ts`: `sliceUnits(units, cellWidth, region)` + tests
- [x] `hooks/unitMorph.ts`: drop zoomBucket, full alpha, add `info`; update tests
- [x] `hooks/gridWorker.ts` / `gridLoader.ts`: morph requests carry `region`
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand` — green

## Phase 2: Layers

- [x] `layers/GlowLayer.ts`: BitmapLayer subclass, r8 texture, ramp, additive
- [x] `layers/MorphScatterplotLayer.ts`: `progress` and `brightness` uniforms
- [x] `layers/GridYearLayer.ts`: pass progress/brightness/minPx/pickable; picking info

## Phase 3: View choice

- [x] `hooks/peopleView.ts`: `viewBlend`, `nextRegion`, `viewportRegion` + tests
- [x] `hooks/useGridLayer.ts`: glow frames + units scenes keyed by region
- [x] `FootstepsViz.tsx`: mode `auto`, debug button, legend, click on group
- [x] Run lint, tsc, jest — green

## Phase 4: Prove it

- [x] `pnpm build`, serve `out/`, `node scripts/measure-view.mjs` — ≥ 50 fps pans, screenshots
- [x] Tune thresholds/ramp from screenshots; record in decisions.tsv
- [ ] Deploy `scripts/deploy-budgie.sh`; `scripts/smoke.sh` green

## Phase 5: Wrap

- [x] Update `footsteps-web/AGENTS.md` rendering notes
- [x] Commit
