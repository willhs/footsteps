---
id: plan-0016
type: spec
purpose: "Implementation plan for imagined fields, gardens and paths around settlements behind ?fields=1."
tags: ["plan", "close-up", "fields"]
related: ["./task.md"]
---

# Fields, gardens and paths: implementation plan

## Overview

**Primary goal**: with `?fields=1`, the close-up (zoom ~11.5+) shows each group's land: field strips, fallow, pasture, gardens,
terraces, corrals, grazed ground, trodden clearings and worn paths, draped on the 3D ground, at ≥ 45 fps at zoom 13-15.

**Approach**: a pure generator (`lib/fields.ts`) turns the groups in view (the same list the shelters use) plus a few per-group
numbers (cropland share, grazing share, water distance and its downhill direction) into a flat list of `LandPatch` quads. The
close-up layer drapes the patches of each elevation tile into one or two meshes per tile (cached like the ground mesh), sampling the
ground surface exactly as the ground mesh triangulates it, dropping any piece over water, past water or ice, and turning steep field
plots into contour terraces.

## Current state

- `useGridLayer.ts:341-364` builds the groups (`ShelterGroup`) and towns in view for the shelters, at the nearer data year, once per
  snapped view box (0.02°), only while people are drawn (`blend.people > 0`).
- `Close3DLayer.ts` draws shelters per tile on the tile's heights (`standingOn`), never on water; meshes are built under an 8 ms per
  frame budget and cached per tile in a `WeakMap`.
- `lib/close3d.ts buildTerrainMesh`: vertex every `MESH_STEP`=2 px, quads split `a,c,b / b,c,d` (diagonal from NE to SW corner),
  water flat at sea level, ice ground at `max(h, sea)`.
- HYDE land use per 0.5° cell for a HYDE year: `/habitat/use_{year}.webp` (`useHabitatLookups`, `readLandUse`).
- Crops per 5° cell and era: `/food/food.json` (`useFood`, `lib/food.ts`).
- Fresh-water distance per 5′ cell: `/water/water_distance.webp` (metres = 2,000 km × (code/255)²), read only in the grid worker.
- Notes: `close3dNote(plants, ground)` in `lib/close3d.ts`, shown by `SupportingText.tsx`.

## Data shape

```ts
type LandKind = 'field' | 'fallow' | 'pasture' | 'terrace' | 'garden' | 'corral' | 'grazed' | 'clearing' | 'path';
/** One ground-hugging quad (corners anticlockwise, lon/lat). `wash`: drawn see-through over the ground (grazed, clearing). */
type LandPatch = { kind: LandKind; corners: [number, number][]; rgb: [number, number, number]; wash: boolean };
/** A group in view and what the land round it says (per group, from the lookups). */
type LandGroup = { lon; lat; kind: UnitKind; people; crop: number; grazing: number; water: WaterHere | null };
type WaterHere = { metres: number; dir: [number, number] | null }; // distance to fresh water, unit vector east/north towards it
type LandContext = { year: number; summer: boolean; crops: (lon, lat) => CropId[] };
landPatches(groups: LandGroup[], towns: TownInView[], ctx): LandPatch[]
```

Invariants: a pure function of its inputs (seeded by `groupSeed(lon, lat)`); a plot belongs to the nearest group (Voronoi), so two
villages' fields never overlap; expected field area = cropland share × farmed disk (clamped at 1 per block); `corners` always 4.
Paths are quads too (a ribbon per segment), with a width set at drape time so they stay a pixel or two wide.

## Design options

| Option | Exposes | Verdict |
|---|---|---|
| A. Paint fields into the ground mesh's vertex colours | nothing new | rejected: vertices ~70 m apart at z13, fields would blur into blobs |
| B. Per-tile texture under the ground | texture coords that `?ground=1` already uses | rejected: replaces the ground colour, clashes with GroundDetail |
| C. Separate draped quad meshes per tile, sampled on the ground's own triangles, lifted a little | `land` prop on Close3DLayer | **chosen**: sharp edges, cached per tile like the ground, water/ice test per piece |

Generation on the main thread, once per view box and cached per group (an LRU keyed by group, year, season), rather than in the
worker: the inputs are main-thread lookups (land use 0.5°, food 5°) and a small window of the water image; the worker would need
the food table and a new message type for the same work.

## Assumptions

- Fields live only in the close-up 3D (no flat-map version): see task.md Assumptions.
- Farmed radius 2 km, intensity falling off as 1 − (d/R)² (Chisholm 1962: most cultivated land lies within ~1 km of the farmstead,
  little beyond 2-3 km; Vita-Finzi & Higgs 1970 use a 5 km catchment for farmers). Imagined layout, cited radius.
- Block probability = min(1, 2 × crop × (1 − (d/R)²)): the mean of 1 − (d/R)² over the disk is ½, so the expected farmed share of the
  disk equals HYDE's cropland share until a block saturates (crop > ~0.5 near the centre).
- Fallow 20 % and pasture 10 % of the farmed blocks (imagined, a two/three-field rotation look).
- Terraces where the DEM slope at a plot is 8-25°; steeper plots are dropped (not farmed). Imagined.
- Herders: corral radius 18-30 m by camp size; grazed wash out to 300 m + 1.2 km × grazing share. Imagined.
- Paths: towards fresh water only when it is 100 m-3 km away (beyond that the track is drawn 3 km long); between groups within 4 km,
  each group to its nearest one or two. Imagined.
- Path width at drape: max(5 m, 1.3 × the tile's metres per screen pixel at its zoom), so a track stays visible at z12-13.
- Season: summer look unless `?seasons=1` picks the hemisphere's winter (see task.md).
- (Decided while building.) Cropland comes from the 5′ HYDE land-use image the grid worker classes ways of life by, not the hover card's 0.5°
  average (which blurs a river valley into the desert). A village's farmed area is its cell's cropland × its share of the cell's people
  (people per cell from the year's grid), packed round it as far as 60 % of the ring holds it, never past 2 km; at least 0.5 ha per
  villager, because early HYDE cells are often farmer by head count with ~0 cropland (Kaplan et al. 2009 use 0.2-1 ha per person).
  This replaces the block probability rule above; expected area still scales linearly with cropland.
- (Decided while building.) Grazed grass is painted into the ground's vertex colours rather than drawn as a translucent mesh.

---

## Phase 1: Generator (`lib/fields.ts`) and its tests

- [x] `lib/fields.ts` (built as `components/footsteps/layers/fields.ts`, beside `shelters.ts` whose helpers it uses): types, `fieldsParam`, crop colours by crop and season, `landPatches` (farmers, towns, herders, foragers, paths), Voronoi ownership.
- [x] `lib/food.ts`: `cropsAround(data, lon, lat, time)` returns the crop ids around a 5° cell at an era.
- [x] `lib/fields.test.ts` (built as `components/footsteps/layers/fields.test.ts`): deterministic; field area scales with cropland (ratio of means within 15 %); 0 crop gives no fields; herders get a corral and grazed wash, foragers a clearing only; paths head towards water; neighbours' fields never overlap.
- [x] Run: `pnpm --dir footsteps-web test -- --runInBand components/footsteps/layers/fields` — pass (17 tests).

## Phase 2: Drape in the close-up

- [x] `layers/fieldsDrape.ts` `drapeLand(heights, bbox, z, land, sea, lake, ice)`: per tile, sub-divide each patch whose centre lies in the tile, sample the ground's own triangles, drop pieces on water/past water/ice, make steep fields terraces along the contour; returns `{ solid, wash }` meshes.
- [x] Tests: a patch over sea is dropped; a patch on flat ground sits at ground height + lift; a steep field turns into a terrace.
- [x] `Close3DLayer.ts`: `land` prop; per tile cached drape built under the same frame budget; the shapes' mesh fading in with people. Deviation: washes are painted into the ground's vertex colours and drawn as a second copy of the ground (a translucent overlay mesh z-fought and showed holes; see decisions.tsv).
- [x] Run: tests + tsc.

## Phase 3: Wire the flag

- [x] `useGridLayer.ts`: share the groups-in-view memo between shelters and fields; return `landGroups` (`?fields=1`).
- [x] `hooks/useLand.ts`: land use (5′ HYDE image, not the 0.5° habitat lookup: see Assumptions), food, water window, people per cell → `LandGroup`s → `landPatches`, cached per group.
- [x] `FootstepsViz.tsx`: `fieldsParam`; pass `land` to the close3d layer; `SupportingText`: note says fields and paths imagined.
- [x] `close3dNote` gains `fields`; its test.
- [x] `scripts/flags-lib.mjs` + `docs/ops/flags.md` row.
- [x] Run: tsc, lint, tests.

## Phase 4: Prove it

- [x] `scripts/fields-shots.mjs`: the four scenes on and off (real data), screenshots to the evidence dir.
- [x] `scripts/measure-view.mjs`: a close-up mode (`CLOSE=lat,lon,year`, `QUERY`, `--serve`) measuring pan fps at zoom 13, 14, 15; run headed with and without `fields=1` (headless is throttled to ~14 fps on this machine).
- [x] Run: `pnpm --dir footsteps-web build` then `pnpm --dir footsteps-web visual` — flag off changes no pixel (10/10 PASS, within the 1024 px noise limit).

## Phase 5: Docs and wrap

- [x] `docs/ops/close-up-scene.md` section "`?fields=1`".
- [x] Log + index fragments.
- [x] decisions.tsv; commit.

## Documentation updates

- [x] `docs/ops/close-up-scene.md`, `docs/ops/flags.md`, `AGENTS.md` close-up line.
