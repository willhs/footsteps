---
id: task-0009
type: spec
purpose: "Halve the close-up 3D time to detail (tilted zoom 10: ~7 s cold to <= 3 s), remove long main-thread tasks while tiles stream, and clear the ?terrain_tiles=1 regressions."
tags: ["terrain", "close3d", "performance", "benchmark"]
related: ["../../ops/terrain-bench.md", "../../ops/close-up-scene.md", "../../ops/terrain-images.md", "../0006-terrain-tiled-colour-pyramid/task.md"]
created: 2026-11-21
updated: 2026-11-21
---

# Terrain: halve close-up time to detail and clear the ?terrain_tiles=1 regressions

## Goal

A `scripts/terrain-bench.mjs --compare` against a before run on the same machine shows tilted zoom 10 reaching full
detail in <= 3 s cold and <= 1.5 s warm (or the gap and its cause written down), no main-thread task > 50 ms while
tiles stream (or the remaining ones named), and no fps or zoom-4 regression with `?terrain_tiles=1`.

## Context

The terrain benchmark (`docs/ops/terrain-bench.md`, baseline 2026-11-21) says the weak spots of the goal
"Footsteps: detailed terrain, sharp and fast at every zoom" are time to detail and long tasks, not fps:
tilted zoom 10 takes 6.7-7.1 s cold, 1.7-2.2 s warm, longest main-thread task 164 ms, and fetches ~110 elevation
tiles at tile zoom 11 where the same view flat needs ~45. The colour pyramid behind `?terrain_tiles=1` made zoom 4
wait for its tiles (+0.4-0.7 s) and lowered some tilted fps, so it is off by default.

Vision alignment: On a new endeavour — Want to reach my potential with software.

## Scope

### Must Do
- Profile with the benchmark, then fix the biggest causes of time to detail and long tasks in the close-up 3D
  (`components/footsteps/layers/Close3DLayer.ts`, `lib/close3d.ts`, `components/footsteps/hooks/useTerrainLayers.ts`).
- Clear the `?terrain_tiles=1` zoom-4 and fps regressions, or name what remains.
- Before/after screenshots: Alps z10 tilted, Doggerland z10 tilted, UK 50,000 BCE z7.
- `docs/ops/terrain-bench.md` gets the new numbers and whether the pyramid now passes every target.

### Won't Do
- Turn the colour pyramid on by default (operator steer 2026-11-21: Will decides defaults; keep `?terrain_tiles=1`).
- Change anything measured or labelled: sea level, era colour, the "imagined" texture note, vertex spacing of the ground.
- Host DEM tiles on budgie/Cloudflare (a separate goal idea).

## Success Criteria
- [ ] Bench compare: tilted zoom 10 cold <= 3 s and warm <= 1.5 s, or the gap and its cause written down
- [ ] No main-thread task > 50 ms while streaming, or the remaining ones named
- [ ] No fps or zoom-4 regression with `?terrain_tiles=1`; pyramid stays behind the flag, pass/fail written down
- [ ] Screenshots before/after (Alps z10 3D, Doggerland z10 3D, UK 50,000 BCE z7)
- [ ] Frontend checks, `pnpm visual` and `pnpm build` pass; terrain-bench.md and the log updated

## Assumptions
- Bench runs happen on Will's MacBook while other jobs run; before and after are taken back to back at similar load
  instead of against the committed baseline alone, and the committed baseline is cited alongside.
- The colour pyramid is not in the primary checkout's data; the bench uses the scene-area tiles mirrored from prod
  (read-only) into the worktree's git-ignored `public/terrain/detail/`.

## References
- `docs/ops/terrain-bench.md`, `docs/ops/terrain-images.md`, `docs/ops/close-up-scene.md`
- Steady task: 941b0e5d-979d-46f7-824f-d5d9812d250a
