---
id: plan-0002
type: spec
purpose: "Implementation plan for per-era Earth terrain images and their cross-faded display."
tags: ["plan", "terrain", "rendering", "pipeline"]
related: ["./task.md"]
---

# Terrain v1 Implementation Plan

## Overview

Build one natural-colour Earth image per terrain step offline, and show the two steps
either side of the slider time cross-faded under the people.

**Primary Goal**: 10,000 BCE / 6000 BCE / 1000 CE / 1900 each look like their era from
space, each image <= ~400 KB, live on footsteps.willhs.me.

**Approach**: keep Blue Marble's detail and real colours where the era's land matches
today's, and move only the *low-frequency* colour by the change in biome (palette sampled
from Blue Marble per present-day biome). Coastlines come from ETOPO1 thresholded at a
per-step sea level fitted to Krapp's land mask.

## Current State Analysis

- `footsteps-web/components/footsteps/layers/backgroundLayers.ts:96` `createTerrainLayer`:
  Esri World Imagery `TileLayer`, `desaturate 0.1`, `tintColor 215`.
- `hooks/useBackgroundLayers.ts`: terrain on → terrain layer; off → flat sea + continents.
- `FootstepsViz.tsx`: `onTerrain: showTerrain` switches people to night lights; `animate`
  only when terrain is on; legend block at the bottom left.
- `lib/time.ts` `bracket(time)` over `TARGET_YEARS` (-10000..1900).
- No terrain pipeline exists (premise holds). HYDE land use is already encoded as
  `landuse_{year}.png` (R crop, G grazing; `docs/ops/grid-images.md`) and published.
- Krapp2021 biome file (checked): `biome(time, lat, lon)` int32, 800 steps of 1 ka,
  time in years BP (0 = 1950 CE), 0.5° grid south-up, sea = int32 min, ice = biome 28.

### Key Discoveries
- Blue Marble July 2004 already shows modern farmland, so a palette sampled naively from
  it would paint 10,000 BCE Europe as fields: sample the palette only from cells with
  little 1900 land use, and remove the modern farm tint before applying the era's.
- BitmapLayer cross-fade: an opaque lower image plus the upper at opacity `f` is an exact
  lerp (unlike the additive glow, where two layers brightened mid-fade).

## Data shapes

Python (`terrain_image.py`):
- `Step` = one Krapp step at `bp` years: `colour (360,720,3) float` (natural colour per
  cell, before farming), `land (360,720) bool`, `ice (360,720) bool`. Invariant: north-up,
  column 0 = 180W, same as HYDE/Blue Marble.
- Frame year `y` (calendar; BP = 1950 - y) → linear interpolation of the two bracketing
  steps' colour, land fraction and ice fraction, and of the fitted sea level.
- `TERRAIN_YEARS` = every 1000 years from -100000 to -1000, then 0..1900 by 100
  (so every HYDE `TARGET_YEAR` is a frame and gets its own farmland).

Client:
- `TERRAIN_YEARS` in `lib/constants.ts`; `terrainBracket(time) → {y0, y1, f}` in
  `lib/time.ts` (same contract as `bracket`).
- `useTerrainLayers(time, globe)`: cache `Map<year, ImageBitmap>`; loads the bracket pair
  plus neighbours; returns `[lower(y0, opaque), upper(y1, opacity f), coastline]`, holding
  the last fully loaded pair while a new one loads (no blank frames).

## Design options

| Option | Exposes | Verdict |
|---|---|---|
| A. Two BitmapLayers (opaque lower, upper at opacity f), ids by frame year | nothing new; textures persist per year | **chosen**: exact lerp, no shader code, uploads once per frame year |
| B. One custom layer with two textures and a mix uniform (like GlowLayer's RG pair) | a new layer class with a second sampler binding | more code; packing two RGB images into one texture costs a JS repack per transition |
| C. Snap to nearest step | – | rejected by Will (blend) |

Pipeline colour model: (1) paint pure palette per biome → flat, blocky at 0.5°;
(2) **Blue Marble detail × shifted low-frequency colour** → chosen, real texture and exact
present-day look; (3) per-pixel biome classification from Blue Marble → no paleo mapping.

## What We're NOT Doing

- Extending the slider before 10,000 BCE; tiles; ICE-6G/PaleoMIST ice.
- Changing the plain (terrain off) map.

## Assumptions

- Images stay undimmed (natural colour); the dim/desaturate is a client tint so it can be
  tuned without regenerating.
- Lossy WebP is fine here: terrain pixels are a picture, not encoded numbers.
- Coastline: ETOPO1 4 arc-min (NOAA, public domain) thresholded at a per-step sea level
  chosen so its land area inside Krapp's coastal band matches Krapp; Krapp decides land
  away from that band.
- Frame years are calendar years; Krapp steps (BP) are interpolated linearly.
- Green Sahara weight eases in 9750→8250 BCE and out 4250→2750 BCE (centres 9000 and
  3500 BCE). Region 18W–35E; savanna south of 21N, grassland to 27N, fading out by 31N;
  applied only on desert/xeric cells. Mega-Chad = Chad-basin land below 330 m (Drake &
  Bristow 2006 shoreline ~329 m), scaled by the same weight.
- Farmland: weight = crop + 0.35·grazing (rangeland in deserts should not tan them),
  toward a tan sampled from heavily cropped cells and nudged warmer.
- Modern coastline: stroke of the existing `world-simple.geojson` (ne_110m land) as a
  faint path; coarse but it is a reference line.
- 2D map mode uses the same images (bounds ±90 with LNGLAT image coordinates); checked in
  the browser.

---

## Phase 1: Pipeline

### Tasks
- [ ] Write `footstep-generator/terrain_image.py` (load, palette, steps, frames, Sahara, farmland, encode)
- [ ] Write `footstep-generator/tests/test_terrain_image.py` for the pure helpers (year↔BP bracket, sea-level fit, Sahara weight, farm blend)
- [ ] Generate all frames into `data/tiles/terrain/`

### Success Criteria
- [ ] Run: `poetry run pytest footstep-generator/tests/test_terrain_image.py -q` — pass
- [ ] Every `earth_*.webp` <= 400 KB (script prints sizes; max reported)
- [ ] Look at 10,000 BCE (Doggerland, Beringia, Laurentide/Fennoscandian ice), 6000 BCE (green Sahara, Mega-Chad), 1000 CE, 1900 (farmland)

## Phase 2: Client

### Tasks
- [ ] `TERRAIN_YEARS` in `lib/constants.ts`, `terrainBracket` in `lib/time.ts` + tests
- [ ] `hooks/useTerrainLayers.ts` (image cache, pair hold, two bitmap layers, coastline)
- [ ] Replace Esri in `useBackgroundLayers.ts`; delete `createTerrainLayer`
- [ ] Legend source note in `FootstepsViz.tsx` when terrain is on
- [ ] Copy frames to `footsteps-web/public/terrain/` for dev (gitignored)

### Success Criteria
- [ ] Run: `pnpm --dir footsteps-web lint`, `exec tsc --noEmit`, `test -- --runInBand` — pass
- [ ] Browser: scrub across steps, no flash; night lights readable on Sahara and ice; 2D and globe

## Phase 3: Deploy

### Tasks
- [ ] `scripts/deploy-budgie.sh` syncs `data/tiles/terrain/` to `app/terrain/` (also under GRID_ONLY); Caddy caches `/terrain/*`
- [ ] `scripts/smoke.sh` checks `terrain/earth_{year}.webp` for every TARGET_YEAR (RIFF/WEBP)
- [ ] `docs/ops/terrain-images.md`: sources, licences, regeneration
- [ ] Deploy and run smoke against footsteps.willhs.me

### Success Criteria
- [ ] Run: `scripts/smoke.sh https://footsteps.willhs.me` — exit 0
- [ ] Screenshots before/after in the workspace `evidence/`

## Phase 4: Wrap (commit & finalize)

- [ ] Run: `git status` — note files
- [ ] Commit (Manager job: commit only)
- [ ] Run: `git status` — clean

## Final Checklist

- [ ] All phases complete
- [ ] Documentation updated

## Documentation Updates

- [ ] `docs/ops/terrain-images.md` (new), AGENTS.md architecture line for terrain

## References

- Task: `docs/tasks/0002-terrain-per-era-earth-images/task.md`
- Krapp et al. 2021, Sci Data 8:228 (via pastclim, Zenodo 8415273, CC-BY 4.0)
- NASA Blue Marble Next Generation, July 2004 (NASA Earth Observatory)
- Drake & Bristow 2006 (Mega-Chad shoreline); Li, Dallmeyer et al. 2025 (Holocene megabiomes)
