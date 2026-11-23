---
id: task-0015
type: spec
purpose: "Close-up light, sky and water behind ?sky=1: the real sun lights the relief, distance haze and a sky at the horizon, animated water with glint and shore foam."
tags: ["task", "close-up", "shader", "sky", "water"]
related: ["../../ops/close-up-scene.md", "../../ops/flags.md", "../../ops/routine.md", "../../ops/visual-regression.md"]
created: 2026-11-24
updated: 2026-11-24
---

# Close-up light, sky and water behind `?sky=1`

Vision alignment: Footsteps: the close-up scene (what you'd see standing there).

## Goal

Zoomed right in (zoom 12-18, the tilted close-up 3D), the scene is lit by the local sun clock, fades into a sky-coloured
haze with a sky above the horizon, and water moves and catches the sun. Off by default behind `?sky=1`; no default changes.

## Context

Checked against the code on 2026-11-24 (commit 52c145b):

- The ground's light is baked per vertex: sun from the north-west, 45° up (`lib/close3d.ts` `SUN`, `buildTerrainMesh`), and the
  mesh layer is lit flat (`Close3DLayer.ts`: `material ambient 1, diffuse 0`). The sun clock (`lib/sunTime.ts`, `lib/solarClock.ts`,
  `?utc=`, `?warp=`) drives the people's routine and the Day/night shading only.
- Water is the vertex colour (SHALLOW→DEEP by depth) on a flat plane at the year's sea level or the `?pastwater=1` lake level.
- **Premise correction:** the close-up pitch is fixed at 55° (`pitchForZoom`) and deck.gl's default field of view is 36.9°, so the top
  of the screen looks 16.6° below the horizon: today the tilted view never shows a horizon or a hard edge. A sky can only be seen if
  the camera tilts further. deck.gl clips at 10× the camera-to-centre distance (`@math.gl/web-mercator` `horizonDistance`), which is
  where the mesh would end once the horizon is in frame.
- **Premise correction:** `?ice=1` has no meltwater geometry (`lib/iceSheets.ts` is a mask: ice ground only). Water next to the ice
  is the sea or a `?pastwater=1` lake, which the water shader covers like any other open water.

## Scope

### Must Do
- `?sky=1` flag (registry row in `scripts/flags-lib.mjs` and `docs/ops/flags.md`).
- Sun direction and colours from the local sun clock at the view centre: warm low sun at dawn and dusk, moonlit blue-grey at night with
  a low floor; the relief lit in the shader (no baked hillshade with the flag on).
- Distance haze growing with distance, coloured from the sky's horizon colour; a sky gradient above the horizon so the 3D view
  fades into sky instead of ending.
- Water: moving ripple normals, sun glint, a lighter shallow band and a soft foam line at the shore; on sea and past-water lakes.
- `?still=1` freezes the water (shader clock) like everything else.
- Close-up note says the light and sky are imagined.
- Measurements: fps panning at zoom 14 tilted, with and without the flag; before/after screenshots at the named scenes.

### Won't Do
- Shadows cast by relief, clouds, stars, moon phase, seasons beyond what the sun clock already gives.
- Haze or relighting of the flat map, people, fires, shelters (drawn elsewhere).
- Default flips.

## Constraints
- Flag off changes no pixel (`pnpm visual` passes unchanged).
- Aim ≥ 45 fps panning at zoom 14 tilted on this Mac.

## References
- docs/ops/close-up-scene.md, docs/ops/flags.md, docs/ops/visual-regression.md, docs/ops/terrain-bench.md, docs/ops/routine.md
- Steady task: 787e4113-4ae5-4a7a-ab5e-666f62d0f892

## Success Criteria
- [ ] Before/after screenshots: Nile 3000 BCE z14 midday and dusk (`?utc=`), Bay of Naples 100 CE z13, Alps 1000 BCE z13, Doggerland 10,000 BCE z12.
- [ ] fps panning at zoom 14 tilted, with and without the flag, reported (aim ≥ 45 fps).
- [ ] Flag off changes no pixel (`pnpm visual` passes).
- [ ] tsc, lint, tests, build pass.
- [ ] flags.md registry row and docs/ops/close-up-scene.md section; docs log entry.

## Assumptions
- With `?sky=1` the close-up tilts further from zoom 11 (55° → 74° by zoom 12.5), so the horizon and sky are in frame; at 55° there is
  no horizon to draw a sky at (Context). Behind the flag, so no default changes.
- Light uses one sun for the whole view (the view centre's), not per pixel: a view is at most ~100 km across.
- At night the light is an imagined moon opposite the sun, fixed strength (no phase).
