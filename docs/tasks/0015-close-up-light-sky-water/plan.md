---
id: plan-0015
type: spec
purpose: "Implementation plan for the close-up light, sky and water behind ?sky=1."
tags: ["plan", "close-up", "shader", "sky", "water"]
related: ["./task.md", "../../ops/close-up-scene.md"]
---

# Close-up light, sky and water — implementation plan

## Overview

**Primary goal:** with `?sky=1`, the close-up is lit by the local sun, hazes into a sky at the horizon, and its water moves and
glints; flag off is pixel-identical.

**Approach:** one pure model (`lib/sky.ts`: sun clock → `SceneLight`), one shader extension (`layers/skyLight.ts`) on the ground
mesh that does light, haze and water per fragment, a CSS sky backdrop behind the deck canvas, and a steeper close-up tilt so the
horizon is in frame. The mesh is built unshaded when lit.

## Current State Analysis

- `lib/close3d.ts:155` `SUN` and `:448-451` bake a NW hillshade into vertex colours; `Close3DLayer.ts` lights the mesh flat.
- `lib/close3d.ts:62` `pitchForZoom`: 55° from zoom 10. deck.gl fovy 36.87° → top ray 16.6° below horizon: no horizon today.
- `@math.gl/web-mercator` `getProjectionParameters`: far plane = min(furthest ground, 10 × camera distance) → mesh ends there once the
  horizon is in frame; what is behind shows the DeckGLView backdrop div (`views/DeckGLView.tsx:121`).
- Water vertices: `texCoords` layer = `COVER_WATER` (−1) only when built with `cover` (`?ground=1`).
- Shader-uniform pattern: `layers/NightExtension.ts` (uniform block module + `draw` → `shaderInputs.setProps`); shader clock
  `animSeconds` (`lib/still.ts`), frozen by `?still=1`.
- The sun clock reaches FootstepsViz as `now` (`useSolarClock`); background layers are cloned there with the night props
  (`FootstepsViz.tsx:182-186`).

## Design

**Data shape** (`lib/sky.ts`):

```ts
type Rgb01 = [number, number, number];
export type SceneLight = {
  key: string;            // changes when the light visibly changes (rounded), for update triggers
  sun: Rgb01;             // unit vector to the light (sun by day, imagined moon at night), east-north-up
  direct: Rgb01;          // direct light colour × strength
  ambient: Rgb01;         // sky fill light (the floor)
  zenith: Rgb01;          // sky colour overhead
  horizon: Rgb01;         // sky colour at the horizon = haze colour
  glint: number;          // 0..1 strength of the specular on water
};
export function sceneLight(lon: number, lat: number, ms: number): SceneLight;
```

Colours come from one keyframe table over the sun's altitude in degrees (−18, −8, −3, 0, 4, 10, 25, 90), linearly interpolated —
a table, not branches. Below the horizon the direct light turns to a moon opposite the sun's azimuth, ~35° up.

Design alternatives:

| Option | Sky | Cost | Pick |
|---|---|---|---|
| A. Shader extension on the ground + CSS backdrop sky + steeper tilt | backdrop shows wherever nothing is drawn: above the horizon and past the far plane | one extension, no new geometry | **chosen**: smallest surface; haze blends to the backdrop's horizon colour |
| B. Sky as a deck layer (a vertical wall at the far distance) | depth-tested wall | extra geometry, camera maths in JS per frame | no: more moving parts, same picture |
| C. Keep 55° and fake a sky band at the top of the screen | a gradient over the ground | none | no: it would paint sky over ground that is visible, a lie about the view |

## What we're NOT doing
Shadows, clouds, stars, moon phases; haze on people/fires/shelters/flat map; default flips.

## Assumptions
- Tilt with `?sky=1`: 55° up to zoom 10, smooth to 74° by zoom 12 (horizon ~7% below the top of the frame). One constant, `SKY_PITCH`.
  (Changed while building: first 11→12.5, but Doggerland at z12 then showed no horizon.)
- Added while building: the camera is lifted by the ground height (`hooks/useGroundLift.ts`, `cameraLift`) and the elevation TileLayer
  gets `zRange`, because at 74° deck.gl's sea-level camera stood inside the Alps; only with the flag.
- Added while building: lit meshes count Terrarium's exact-0 m sea fill as sea (`tileWater(..., zeroIsSea)`), because the Bay of
  Naples drew as land; only with the flag, so flag-off pixels do not move.
- One light per view, from the view centre (task.md).
- Haze: `1 − exp(−d / 60 km)`, plus a ramp to full haze from 55% to 97% of the far-plane depth (clip w, from the projection matrix) so the mesh meets the backdrop's
  horizon colour with no edge.
- Water ripples: two scrolling value-noise layers with wavelengths ≥ 3 px (like `groundDetail.ts gFbm`), so they do not shimmer.
- Foam: the band where the interpolated cover layer crosses −0.75 (the shoreline rule `groundDetail.ts` already uses), broken by
  noise and pulsing with the shader clock.
- The light changes once per sun-clock second at most; the light is a layer prop, the clock-driven ripple time is read in `draw`.

---

## Phase 1: Model and flag

- [x] `lib/sky.ts`: `skyParam(search)`, `sunVector(lon, lat, sun)`, `sceneLight(lon, lat, ms)`, `skyBackdrop(light, pitch, height)` (CSS gradient), `SKY_NOTE`.
- [x] `lib/close3d.ts`: `pitchForZoom(zoom, sky = false)` with `SKY_PITCH`; `close3dNote(plants, ground, sky = false)` adds "light imagined".
- [x] `lib/sky.test.ts`: noon sun high and south-ish in the north; dusk warm (red > blue) and low; night: direct is blue-grey and dim, ambient floor > 0; sun vector unit length; pitch unchanged without the flag.
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand lib/sky lib/close3d` — pass.

## Phase 2: Unshaded mesh

- [x] `buildTerrainMesh(..., lit = false)`: when lit, land colour has no hillshade (mottling kept unless `cover`) and texCoords are emitted (`{1, -1}` water, `{1, 0}` land unless `cover`).
- [x] Test: lit mesh has texCoords and its flat-land colour equals the unshaded ground colour; the unlit mesh is unchanged.
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand lib/close3d` — pass.

## Phase 3: Shader and wiring

- [x] `components/footsteps/layers/skyLight.ts`: `SkyLight` LayerExtension (uniform block `sky`: sun, direct, ambient, horizon, glint, time, farM, mPerCommon, enabled); light × albedo, water (ripple normals, glint, shallow band, foam), haze last.
- [x] `Close3DLayer`: `light?: SceneLight | null` prop; mesh built `lit` when set; ground layer gets `[GroundDetail?, SkyLight]` and `light` prop; key includes `l`; light key in renderSubLayers triggers.
- [x] `useTerrainLayers`: nothing (light is cloned in FootstepsViz like the night props).
- [x] `FootstepsViz`: `skyOn` from URL; pitch via `pitchForZoom(zoom, skyOn)`; clone `close3d` with `light: sceneLight(viewState.longitude, viewState.latitude, now)` when close-up and skyOn; `DeckGLView backdrop` from `skyBackdrop`.
- [x] `DeckGLView`: optional `backdrop` CSS background replacing the radial gradient.
- [x] `SupportingText`/note: label "light imagined" with the flag.
- [x] Run: `pnpm --dir footsteps-web exec tsc --noEmit` and `pnpm --dir footsteps-web lint` — clean.

## Phase 4: Look and measure

- [x] `scripts/sky-shots.mjs` (six scenes, off/on, still) and `.gitignore` `footsteps-web/sky-shots/`.
- [x] `scripts/terrain-bench.mjs`: `--zooms` may name zooms outside the default list (so `--zooms 14` works).
- [x] Build; run sky-shots; look at every pair; tune constants.
- [x] Run terrain-bench at nile z14 3d with `--query sky=1` and without; record fps.

## Phase 5: Docs

- [x] `scripts/flags-lib.mjs` FLAGS row; `docs/ops/flags.md` row; `docs/ops/close-up-scene.md` section with the measured cost; AGENTS.md line; `docs/log.d/<job>.md`, `docs/index.d/<job>.md`.

## Phase 6: Checks and wrap

- [x] Run: `pnpm --dir footsteps-web lint`, `exec tsc --noEmit`, `test -- --runInBand`, `build`, `visual` — all pass, visual 0 failures.
- [x] Commit (Manager job: commit only).
