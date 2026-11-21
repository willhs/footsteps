---
id: plan-0013
type: spec
purpose: "Implementation plan for dated ice sheets behind ?ice=1."
tags: ["plan", "terrain", "ice", "placement"]
related: ["./task.md", "../../ops/ice-sheets.md", "../../ops/past-water.md"]
---

# Ice sheets behind `?ice=1` — implementation plan

## Overview

PaleoMIST 1.0 (Gowan et al. 2021, PANGAEA doi:10.1594/PANGAEA.905800, CC BY 4.0) ships ice margins as GMT polygon files per region
(Eurasia, North_America, Patagonia, Antarctica) every 2.5 ka from 80 ka to 0, plus ice thickness grids. The archive is 3.7 GB but the
server serves byte ranges, so the build reads the zip's directory remotely and fetches only the margin files (zip CRC-32 checked on
read, then sha256 pinned). Margins become masks on the app's 2.5′ world grid, one patch per (epoch, region), and every consumer reads
those patches: a flat overlay layer, the close-up ground, the site ranker and the hover card.

## Current state

- Past water (`lib/pastWater.ts`, `siteRanking.ts`, `settlementUnits.ts`, `gridData.ts`) already has the pattern: patches on the 2.5′
  grid, ids per epoch, a ranker region per patch, `unresolved` counting, a real-data test (`pastWater.real.test.ts`).
- The ranker resolves exactly one live epoch per cell (`setLive`) and caches its id in a byte per cell.
- The close-up mesh (`lib/close3d.ts buildTerrainMesh`) colours vertices with `groundColour`; Krapp biome 28 already means ice there.
- The hover card rows are pure (`lib/hoverCard.ts`).

## Design

Core data shape (`lib/iceSheets.ts`, manifest `public/ice/ice_sheets.json`):

```ts
type IcePatch = Patch & { id: number; region: 'Eurasia' | 'North_America' | 'Patagonia'; file: string; bytes: number; sha256: string; pixels: number; area_km2: number };
type IceEpoch = { bp: number; from_year: number; to_year: number; patches: IcePatch[] };   // windows tile the covered years, no gaps or overlaps
type IceMask = Patch & { id: number; wet: Uint8Array };                                       // 1 = ice, same as a past-water LakeMask
iceEpochAt(year) → IceEpoch | null;  iceIds(year) → number[];  iceShareAt(masks, lon, lat) → 0..1;  iceLabel(year, lon, lat) → string | null
```

Invariants: patch ids are unique and disjoint from past-water epoch ids (101+); an epoch's window is the years nearest its age
(`|BP − epoch| ≤ 1.25 ka`), so exactly one epoch holds at any year from 81,249 BP to the present, none before; outside, ice is
"no reconstruction", not "no ice".

Options for the ranker:
1. Separate ice code path in the ranker (own regions, own cache byte): duplicates `setLive`/`scenarioAt`/`unresolved`.
2. **Ice patches as more exclusion epochs** (chosen): `SiteLayers.ice` adds regions with a mask and no distance patch; the ids ride in
   the same `epochs` list `spotsFor` already takes. Because an ice patch and a past-water epoch (LGM proglacial lakes) can share a cell,
   `setLive` collects every matching region (wet = any of them) and the cache key packs up to 4 ids. Freshwater distance comes from the
   first live region with a distance patch, as before.

Options for the Earth image:
1. Repaint the terrain WebPs per epoch (`terrain_image.py --ice`): many MB, couples to terrain years.
2. **Overlay** (chosen, as the task asks): one `BitmapLayer` per patch, RGBA built in the browser from the mask (white interior,
   a darker blue-grey two-pixel edge), bounds from the patch. No extra download beyond the masks.

Close-up: `buildTerrainMesh` takes `ice: IceCover | null` (`{ key, shareAt }`); a vertex with share ≥ 0.5 is ice: never sea (marine
ice drawn flat at sea level), coloured ice white, cover "ice" in the shader. No ice-surface height (PaleoMIST gives thickness under CC
BY, but the task keeps height out; follow-up).

## Phases

### Phase 1 — source and masks (Python)
- [x] `ice_sheets.py`: range-read the archive directory, fetch margin + readme members to `data/raw/paleomist/`, pin sha256; parse
      GMT (`# @P` perimeters, `# @H` holes); rasterise to 2.5′ patches per (epoch, region); manifest with source, licence, rule,
      uncertainty, per-region basis, bytes, sha256.
- [x] Reproduce a published epoch: compare the 20 ka mask with the 1° `reconstruction_1_degree.nc` thickness (> 0) and the DATED-1
      Eurasian area at ~21 ka; record agreement in the manifest/doc.
- [x] Tests (`tests/test_ice_sheets.py`): GMT parse with a hole, rasterise, epoch windows tile without gaps, manifest matches files.
- Verify: `poetry run pytest footstep-generator/tests/test_ice_sheets.py -q`; bytes measured.

### Phase 2 — the app reads it
- [x] `lib/iceSheets.ts` (+ test): manifest types, `iceParam`, `iceEpochAt`, `iceIds`, `loadIce`, `iceShareAt`, `iceLabel`, `iceNote`.
- [x] Ranker: `SiteLayers.ice`, multi-live regions, packed cache key; `inPastWater` covers ice too (renamed `inScenario`).
- [x] Worker/gridData: `ice` flag, ids appended to `epochs`, ranker cache keyed by both flags.
- [x] Overlay layer in `useTerrainLayers` (flat and under the close-up), `Close3DLayer`/`buildTerrainMesh` ice surface.
- [x] Hover row and the note in `SupportingText` (Dots: not applied).
- Verify: jest (lib + ranker + close3d), tsc, lint.

### Phase 3 — proof
- [x] Real-data test `ice.real.test.ts`: years −25000…−10000 every 1 ka, no group in an ice pixel, totals unchanged, outside regions unmoved.
- [x] Screenshots on/off (Scandinavia −20000, Great Lakes −15000, Patagonia −20000) with a script like `pastwater-shots.mjs`.
- [x] `pnpm visual` flag off unchanged; build; Python suite.
- [x] `docs/ops/ice-sheets.md`, AGENTS.md line, log/index fragments.

## Assumptions

- PaleoMIST over DATED-1/Dalton: one CC BY source for all three sheets, with DATED-1 already inside it for Eurasia (its readme: the 25,
  20, 15, 10 ka margins follow DATED-1's most-likely time slices; 27.5/22.5/17.5/12.5 are intermediates). DATED-1's own min/max
  envelopes are not drawn; the manifest says so. Dalton 2020 is not used.
- Rule between epochs: nearest native epoch (2.5 ka), never interpolated; the hover and note name the epoch.
- Coverage: all 33 epochs 0–80 ka (bytes permitting), so the flag is consistent across the slider; before 80 ka: no reconstruction.
- Antarctica is left out: nobody lives there and the Earth image's ice biome already covers it; an 8640-pixel-wide patch would exceed
  common texture limits. Stated in the manifest.
- North America's alternative "a1" margins differ only in MIS 3 (pre-30 ka, per its readme); recorded as uncertainty, not drawn.
- Ice on today's sea floor (Barents, Hudson Bay) is drawn as ice in the close-up at sea level, since the mask says grounded ice.
- Dots is static: the note says ice is not applied there.
