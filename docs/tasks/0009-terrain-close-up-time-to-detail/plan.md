---
id: plan-0009
type: spec
purpose: "Implementation plan for halving the close-up 3D time to detail and clearing the ?terrain_tiles=1 regressions."
tags: ["plan", "terrain", "close3d", "performance"]
related: ["./task.md", "../../ops/terrain-bench.md"]
---

# Close-up time to detail: implementation plan

## Overview

The tilted zoom-10 view waits ~7 s cold for ~110 Terrarium elevation tiles from AWS S3 (HTTP/1.1, so six at a time,
~0.3-0.5 s each from NZ) and builds one ground mesh per tile on the main thread. Fewer, earlier requests and
meshes built a few per frame should cut the cold time to about a third and remove the long tasks, without changing
what the ground shows.

**Primary Goal**: tilted zoom 10 <= 3 s cold, <= 1.5 s warm, no main-thread task > 50 ms while tiles stream.

**Approach**: (1) start the elevation requests as soon as the close-up is on, not after the era images and habitat
lookup are decoded; (2) fetch one zoom coarser and halve the mesh step, so the ground keeps exactly its vertex
spacing with a quarter of the requests; (3) coarsen far tiles of the tilted view by screen size, with skirts so
mixed zooms leave no cracks; (4) build at most a frame's budget of meshes per frame; (5) skip the colour pyramid's
fetch where it cannot add detail at zoom 4, or make it not delay the era image.

## Current State Analysis

- `components/footsteps/layers/Close3DLayer.ts:139` TileLayer, `tileSize: 256`, `maxRequests: 6`, no zoomOffset:
  tile zoom = round(zoom) + 1, so zoom 10 → z11 tiles, each meshed at `step` 4 (65 × 65 vertices, ~305 m apart at 46°N).
- deck.gl 9.1 `tile-2d-traversal.ts:211`: below 60° pitch every tile is taken at the full zoom (no distance LOD);
  the close-up pitch is 55°, so the far rows get as many z11 tiles as the near ones (bench: `demTileZooms {11: ~110}`).
- `hooks/useTerrainLayers.ts:370`: `Close3DLayer` is created only once `ground` exists (both era images decoded to
  pixels and the habitat lookup loaded), so no elevation request starts before those arrive.
- `Close3DLayer.ts:151`: `updateTriggers.getTileData: colourTiles`: when the pyramid manifest arrives after the
  layer mounted, every tile is fetched again.
- `Close3DLayer.ts:166`: every tile that arrives is meshed in the same `renderLayers` pass (`buildTerrainMesh`,
  ~4k vertices × closures per vertex), so a burst of tiles is one long task.
- `useTerrainLayers.ts:73` `eraPixels`: `getImageData` of two 2048 × 1024 images on the main thread.
- With `?terrain_tiles=1` zoom 4 waits for the pyramid tiles (+0.4-0.7 s, `terrain-bench.md`).

## Desired End State

Bench `--compare` before vs after (same build machine, back to back): tilted zoom 10 cold <= 3 s, warm <= 1.5 s,
no long task while streaming, zoom 4 with tiles no slower than without, fps unchanged; screenshots show the same
ground. `pnpm visual` passes (or moved pixels are explained and re-baselined on purpose).

## What We're NOT Doing

- Turning the pyramid on by default (operator steer: Will decides; the flag stays).
- A different DEM host (budgie/Cloudflare) or a worker + IndexedDB height cache (later goal ideas).
- Changing the flat map's relief layer (its own DEM requests are not in this task's targets).

## Assumptions _(unattended runs: decisions made without the user)_

- Same vertex spacing is the fidelity bar: a z(n-1) tile at step 2 samples the ground every ~305 m as a z(n) tile at
  step 4 does, so the coast at the year's sea level and the relief are drawn from the same spacing.
- Far-tile coarsening keeps screen-space vertex spacing no coarser than the screen centre's (a tile is merged into
  its parent only while the parent would still be no wider on screen than a centre tile).
- Skirts (edge vertices dropped down) hide cracks between tiles of different zooms; they are invisible from above.
- Bench numbers on a loaded machine: compare before/after taken back to back at similar load, cite the load column.
- Zoom 4 with tiles: decided after measuring which part of the +0.4-0.7 s is the pyramid's chain (recorded in decisions.tsv).

---

## Phase 1: Heights stream at once

- [x] `Close3DLayer` accepts `ground: Ground | null`; with no ground it fetches tiles and draws nothing.
- [x] `useTerrainLayers` creates `Close3DLayer` whenever `close3d` is on (zoom from 7.5), not only once `ground` exists.
- [x] The pyramid manifest is awaited inside `getTileData` from the URL flag (`terrainTilesParam`), and the
      `getTileData` update trigger is dropped, so a late manifest no longer refetches every tile.

## Phase 2: Coarser tiles, same vertex spacing

- [x] `zoomOffset: -1` on the DEM TileLayer, `minZoom` 6, mesh `step` 2 (a `MESH_STEP` constant used by
      `buildTerrainMesh`, `tileWater`, `lakeVertices`, `standingOn`, `plantsForTile` with 4× the candidates).
- [x] Unit test: `buildTerrainMesh` on a z(n-1) tile at step 2 has the same vertex spacing in metres as z(n) at step 4.

## Phase 3: Far tiles coarser, no cracks

- [x] `lib/demLod.ts`: `coarsenFar(indices, widthPx, maxPx)` merges four siblings into their parent while the parent
      would be no wider on screen than `maxPx`, up to two levels; pure, unit tested.
- [x] `DemTileset extends _Tileset2D` overrides `getTileIndices` with `coarsenFar`, using `viewport.project` of tile corners.
- [x] `buildTerrainMesh` adds skirts round each tile; test the vertex and index counts.

## Phase 4: No long tasks

- [x] Mesh building in `renderSubLayers` is capped at a per-frame budget (~8 ms); tiles over the budget are built on
      the next frames (`setNeedsRedraw`), nearest first.
- [x] Profile the remaining long tasks (era pixel decode, habitat, deck uploads) with the bench and fix the largest.

## Phase 5: `?terrain_tiles=1` regressions

- [x] Measure zoom 4 on/off and the tilted fps; fix the zoom-4 wait (skip or don't block) and record the choice.

## Phase 6: Measure, document

- [x] Added during implementation: elevation tiles sharded over the bucket's two hostnames (`DEM_TILE_URLS`), and a "long tasks while streaming" bench metric (decisions.tsv).

- [x] Run: bench before/after `--zooms 4,8,10,12`, tiles off and on; `--compare` both.
- [x] Screenshots before/after: Alps z10 3D, Doggerland z10 3D, UK 50,000 BCE z7 (into the workspace `evidence/`).
- [x] Run: `pnpm lint`, `tsc --noEmit`, `pnpm test --runInBand`, `pnpm build` — pass; `pnpm visual` — 7/10 pass, the 3 flat Rome scenes fail identically on the untouched before build (legend text vs older baselines; not this change).
- [x] `docs/ops/terrain-bench.md` new numbers and pyramid pass/fail; `close-up-scene.md` tile notes; log fragment.

## Phase 7: Wrap (commit & finalize)

- [x] Run: `git status` — only intended paths changed
- [x] Commit (Manager job: commit only, no merge, no push)

## References

- Task: `docs/tasks/0009-terrain-close-up-time-to-detail/task.md`
- `docs/ops/terrain-bench.md` (baseline and pyramid runs, 2026-11-21)
