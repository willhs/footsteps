---
id: plan-0006
type: spec
purpose: "Implementation plan for the terrain colour tile pyramid (task 0006)."
tags: ["plan", "terrain", "tiles"]
related: ["./task.md", "../../ops/terrain-images.md", "../../ops/terrain-bench.md"]
---

# Terrain colour tile pyramid: implementation plan

## Overview

**Primary goal**: the terrain colour texel at zoom 8 drops from 64 screen px to ~1, at zoom 10 from 256 to ~4,
measured by `scripts/terrain-bench.mjs`, with no fps regression and no per-year tile burst when scrubbing.

**Approach**: one year-independent pyramid of the 500 m Blue Marble photo (`terrain/detail/{z}/{x}/{y}.webp`,
z3–8), plus the photo at the era image's 2048 × 1024 grid (`terrain/detail/ref.webp`). Per pixel, on the GPU:
`colour = detail × era ÷ ref`, where `era` is the existing cross-faded pair of era images. Because
`terrain_image.py` paints land as `photo × smooth ratio`, `era ÷ ref` is that ratio, and the result is the same era
picture with four to sixteen times finer detail. Where the era image is not photo-derived (ice sheets, exposed
shelves, era sea over today's land) the ratio falls outside the script's clip range and the era colour stays.

## Current State Analysis

- `useTerrainLayers.ts:146-259`: two `BitmapLayer`s (lower opaque, upper at opacity f) of the year pair, then
  `TerrainReliefLayer` (hillshade and DEM coast from zoom 5) or `Close3DLayer` (zoom ≥ 7.5, tilted).
- `TerrainReliefLayer.ts`: TileLayer over AWS Terrarium tiles; each tile's shader samples the two era textures
  (shared, uploaded once) with `tileIndex` → Mercator → lat/lon. The detail layer copies this pattern.
- `Close3DLayer.ts`: TileLayer over Terrarium tiles z7–13; `buildTerrainMesh` colours each vertex (every 4 px) with
  `ground.colourAt(lon, lat)` (`useTerrainLayers.ts:makeGround`, bilinear over the decoded era pixels).
- `terrain_image.py:frame`: `land_rgb = bm_hi × clip((era+20)/(bm_lo+20), 0.25, 2.5)` where `bm_hi` = the
  5400 × 2700 photo BOX-resized to 2048 × 1024; sea today = `bm_hi`; shelves and ice painted.
- Bench (`scripts/terrain-bench-lib.mjs`): `texelOf` throws on any kind but `era-image`; `classify` knows
  era images, DEM tiles and habitat lookups.

### Key discoveries
- Blue Marble 500 m tiles A1…D2 are 90° × 90° each (A = 180–90W, B = 90W–0, C = 0–90E, D = 90–180E; 1 = north);
  90° and the equator are tile boundaries at every zoom ≥ 2, so every z5 block reads one source file.
- The photo's ocean is a flat (2, 5, 20): open-ocean tiles are uniform and need not be written.

## Desired End State

Zooming into the UK at 50,000 BCE shows 500 m-scale texture (valleys, rivers, uplands) coloured by the era's
biome and ice, with the same year cross-fade; the close-up 3D ground carries the same detail. The bench shows
texel ~1 px to zoom 8 and 4 at zoom 10.

## What We're NOT Doing

- A per-year pyramid, sources finer than 500 m, Sentinel imagery.
- Changing `terrain_image.py`'s output or the era images.
- Publishing (after merge).

## Assumptions _(unattended)_

- Year-independent pyramid recoloured on the GPU (task.md Assumptions): per-year z8 sets are ~120× the bytes.
- z3–8: below z3 the era image is ≤ 2 px/texel; the source runs out at z8 (463 m/px).
- Lossy WebP q80 for tiles, q95 for `ref` (the ratio divides by it, so it must be close to the script's `bm_hi`).
- `ref` is regenerated from the same 5400 × 2700 file exactly as `terrain_image.blue_marble()` does, not from the
  500 m data, so `era ÷ ref` reproduces the script's ratio.
- Uniform tiles (every pixel within 6 levels of the ocean colour) are skipped; a 256 × 256 PNG manifest marks z8
  tiles that exist; a lower tile exists if any z8 descendant does.
- Era image stays the backdrop under the tiles and below zoom 3, and the fallback while tiles load.
- The relief layer draws above the detail layer, unchanged.
- Rollout: flag-free if the bench shows no fps regression and close-view time to detail does not get worse by more
  than the noise (~0.3 s warm); otherwise default off, `?terrain_tiles=1` on.

---

## Phase 1: Generator

- [ ] Create `footstep-generator/terrain_tiles.py`: per z5 block, reproject the 500 m photo to Mercator (row map +
  BOX horizontal resize), write z8 tiles that are not uniform, average 2×2 down to z5, then z4/z3 from the z5 mosaic;
  write `ref.webp`, `manifest.png`, `meta.json` (sizes, counts, bytes per zoom).
- [ ] Create `footstep-generator/tests/test_terrain_tiles.py`: Mercator maths (tile ↔ lat/lon), uniform-tile test,
  manifest parent rule.
- [ ] Run: `poetry run pytest footstep-generator/tests/test_terrain_tiles.py -q` — pass.
- [ ] Run the generator into `data/tiles/terrain/detail/`; record tile count and bytes per zoom.

## Phase 2: Client layer

- [ ] Create `footsteps-web/lib/terrainDetail.ts`: constants (zooms, URLs, version), `DetailManifest` (decode PNG
  bits, `has(z,x,y)`), `recolour(era, ref, detail)` (TS twin of the GLSL rule), `terrainTilesParam`.
- [ ] Create `footsteps-web/lib/terrainDetail.test.ts`: recolour identity at ref = era, ratio cases (ice, shelf,
  out-of-range), manifest parent rule.
- [ ] Create `components/footsteps/layers/TerrainDetailLayer.ts`: TileLayer z3–8, tiles absent from the manifest
  return null (no request), shader = era pair cross-fade × detail ÷ ref, base look (desaturate, tint) as the era
  layers.
- [ ] Wire into `useTerrainLayers.ts` between the era backdrop and relief/close3d; load `ref` and manifest once.
- [ ] Close-up 3D: `Close3DLayer` loads the covering detail tile (z = min(tile z, 8)) beside the heights and colours
  vertices with `recolour` through an optional `Ground.detail` hook.

## Phase 3: Bench and evidence

- [ ] `terrain-bench-lib.mjs`: classify `/terrain/detail/` as terrain (`detail-tile`), `texelOf` kind `tile-pyramid`;
  the bench picks it when detail tiles were requested. Pin in `lib/terrainBench.test.ts`.
- [ ] Bench before (this branch's base, tiles off) and after (tiles on), `--compare`; same machine, note load.
- [ ] Screenshots before/after: UK 50,000 BCE z7, Nile 3000 BCE z8, globe → workspace `evidence/`.
- [ ] Decide rollout (flag-free or `?terrain_tiles=1`), record why.

## Phase 4: Docs and wrap

- [ ] `docs/ops/terrain-images.md`: the pyramid, its inputs' real resolution (Krapp 0.5°, HYDE 5′, ETOPO 4′ — the
  ratio is smooth, only the photo is sharp), "imagined" label, bytes, the per-year trade-off, publish steps.
- [ ] `docs/ops/terrain-bench.md`: after numbers. `scripts/deploy-budgie.sh` rsyncs `detail/`; smoke checks one tile.
- [ ] AGENTS.md architecture line; legend note says the detail is the modern photo (imagined on past eras).
- [ ] Log/index fragments under `docs/log.d/`, `docs/index.d/`.
- [ ] Run lint, tsc, vitest, pytest for the generator; commit.

## Final Checklist

- [ ] All phases complete, tests green, docs updated, work committed.

## References

- Task: `docs/tasks/0006-terrain-tiled-colour-pyramid/task.md`
- `docs/ops/terrain-images.md` (2026-11-14), `docs/ops/terrain-bench.md` (baseline 2026-11-21)
