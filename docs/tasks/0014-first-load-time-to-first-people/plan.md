---
id: plan-0014
type: spec
purpose: "Implementation plan for measuring and cutting the cold first load (time to first people)."
tags: ["plan", "performance", "first-load"]
related: ["./task.md"]
---

# First load: measure and cut — Implementation Plan

## Overview

**Primary Goal**: fewer JS bytes and an earlier first people frame on a cold visit, desktop and fast 4G, with identical pixels.

**Approach**: measure first (marks in the app + a Playwright script), then cut in verifiable steps, re-measuring each,
then one before/after table.

## Current State Analysis

Baseline build (main 675a6b3): `/` First Load JS 683 kB (Next's report); 14 initial scripts, 2.4 MB raw, ~690 KB gzip.
A one-off module report (`BUNDLE_REPORT`, new opt-in in `next.config.js`) of the initial chunks shows:

- `apache-arrow` 752 KiB, `@loaders.gl/gltf` 126, `/textures` 138, `/draco` 37, `ktx-parse` 49, `/schema(-utils)` 120 KiB
  (unminified) — all pulled by `@deck.gl/mesh-layers` (aliased to its CommonJS build, so nothing shakes), which only
  `layers/Close3DLayer.ts` (`SimpleMeshLayer`) imports, statically, through `hooks/useTerrainLayers.ts`.
- `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react` are aliased to CommonJS too (since the project's first commit; the
  mesh-layers alias, 00a6197, keeps one luma.gl shader assembler). `wgsl_reflect` (210 KiB, WebGPU) rides in with luma.
- App modules behind flags but statically imported: `useTour`/`TourPanel`/`lib/tour.ts` (`?tour=1`), `PopulationChart`
  (`?chart=1`), `TimeNavigator` (`?bar=old`), `AnimalsLayer` (`?figures=1`), evidence layer and marks (`?evidence=1`),
  `TerrainDetailLayer` (`?terrain_tiles=1`), dwellings/shelters (`?shelters=1`, in Close3DLayer).
- Dots code is already lazy (`useHumanLayers`, b45fc5c) — the pattern to follow.
- The grid worker starts on the first `loadGrid` call, in a `useEffect` after hydration; the default year's
  `/grid/humans_-1000.webp` and `/terrain/earth_*.webp` start only then.

### Key Discoveries
- `FootstepsViz.tsx:164` `close3d` is true only zoomed in (≥ 7.5) on the flat map.
- `useTerrainLayers.ts:286` mounts `Close3DLayer` before its ground is ready, so a short wait for the module is a state the
  layer already has (ground pending: flat images only).

## Desired End State

`node scripts/first-load.mjs` prints and writes a table; `docs/ops/first-load.md` holds before/after; the initial JS no
longer carries mesh-layers/gltf/arrow or the opt-in features; `pnpm visual` passes.

## What We're NOT Doing

- Changing images, data, defaults or anything drawn.
- Replacing deck.gl's CommonJS aliases unless the visual run proves the ESM build draws identically.

## Assumptions

- Fast 4G = 9 Mbps / 1.5 Mbps / 150 ms RTT + 4× CPU (see task.md).
- "First globe frame" = the first deck.gl frame after the Earth image layers are handed to deck (or the plain sea when
  terrain is off); "first people" = the first frame after the people layers (firelight / grid / units, or Dots) for the
  year are handed to deck. Marks: `performance.mark('footsteps:first-globe' | 'footsteps:first-people')`.
- Close-up module: loaded when the close-up is reached, and also prefetched on idle after first people, so zooming in
  later does not wait.
- Before numbers come from a build of main plus the marks only (the marks change nothing drawn).
- Three runs per profile, median reported.

---

## Phase 1: Measure

- [ ] `lib/firstLoadMarks.ts` (`markOnce`), `DeckGLView` `onAfterRender` prop, FootstepsViz sets the two marks
- [ ] `scripts/first-load.mjs`: serve `out/` + data (serveStatic/dataRoots) or `--base URL`; profiles desktop/fast4g;
      fresh context per run; bytes by kind via CDP (incl. worker), JS parsed via resource timing; marks; long tasks; `--json`
- [ ] Build main+marks, run desktop and fast4g locally and against prod → before numbers (evidence/)
- [ ] Remove `scripts/measure-first-load.mjs` (superseded); update references

## Phase 2: Cut

- [ ] Close3DLayer (and shelters hover) dynamic: `lib/lazyModule.ts` + `useLazyModule`; idle prefetch after first people
- [ ] Opt-in features dynamic: tour, chart, old bar, animals, evidence, terrain detail
- [ ] deck.gl ESM experiment: drop CJS aliases, measure, keep only if `pnpm visual` passes
- [ ] Preload default year grid WebP + terrain images in `app/layout.tsx`; start the grid worker at module load
- [ ] Re-measure after each cut (bundle report + first-load.mjs)

## Phase 3: Verify

- [ ] `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test -- --runInBand`, `pnpm build`
- [ ] `pnpm visual` — all scenes pass
- [ ] Flag sweep: each flag's chunk loads with the flag, not without (script `--flags`)

## Phase 4: Docs & Wrap

- [ ] `docs/ops/first-load.md` (method, before/after table, biggest remaining costs); AGENTS.md/footsteps-web/AGENTS.md lines
- [ ] `docs/log.d/<job>.md`, `docs/index.d/<job>.md`
- [ ] Commit

## References

- Task: `docs/tasks/0014-first-load-time-to-first-people/task.md`
