---
id: past-water
type: ops
purpose: "The dated past-water scenarios behind ?pastwater=1 (Mega-Chad, European LGM lakes and rivers, Mesopotamian coast stages): what each models, its sources, licence, dates and datum, the epochs every consumer shares, how groups are kept out of the water, how to regenerate and measure them"
scope: [terrain, freshwater, placement, close-up]
tags: [modelled, experimental]
related: ["terrain-images.md", "water-distance.md", "site-terrain.md", "close-up-scene.md", "../research/0014-past-terrain/research.md", "../tasks/0011-past-water-lgm-europe-mesopotamia/task.md"]
---

# Past water: dated scenarios (`?pastwater=1`)

Three scenarios, each a manifest in `footsteps-web/public/pastwater/` with its own dated epochs:

| Scenario | Evidence | Epochs (calendar BP from 1950 → app years) | Water | Script |
|---|---|---|---|---|
| Mega-Chad highstand | modelled (329 m DEM contour) | id 1: 11,500–5,000 BP → -9550…-3050 | lake, fresh (assumed), 329 m plane | `past_water.py` |
| European LGM lakes and rivers | published vectors (CRC806), levels estimated | id 2: 26,500–19,000 BP → -24550…-17050, one snapshot | lakes wet; rivers and fresh lakes fresh; a level per lake | `past_water_lgm.py` |
| Mesopotamian coast stages | **interpreted**: traced from a published figure | ids 3/4/5: 8,000–6,501 / 6,500–5,500 / 4,500–3,500 BP → -6050…-4551 / -4550…-3550 / -2550…-1550 | sea (not fresh), at the year's sea level | `past_water_mesopotamia.py` |

Outside its epochs a scenario says nothing: **geography unknown, not dry.** The Mega-Chad sections below were the first build; the
European and Mesopotamian sections follow it, then what every scenario shares.


Research 0014 found that Footsteps drew Lake Mega-Chad (a box-and-elevation approximation, faded by `sahara_weight`) while placing
groups and counting freshwater distance against **today's** Natural Earth water. This is the first build of its ranked fix: **one modelled
lake, one epoch**, read by every consumer, behind `?pastwater=1` (off until Will has reviewed it on prod). Flag off, nothing changes: the
default images, distance image, ranker and close-up are byte-for-byte what they were.

## Mega-Chad: what is modelled (and what is not)

| | |
|---|---|
| Lake | every 2.5′ pixel joined to Lake Chad (seed 13.0 N, 14.3 E) through pixels at or below **329 m** (4-connected flood fill, lid 5–26 N, 6–27 E that the flood must not reach) |
| Height | AWS Terrarium zoom 6, mean of 3 × 3 samples per pixel: the DEM `site_terrain.py` bakes and the close-up draws |
| Datum | **metres above the geoid (mean sea level) as in Terrarium/ETOPO1.** Not relative to the year's global ocean level: the lake plane is 329 m whatever the sea does |
| Level | 329 m: the height `terrain_image.py` already used (Drake & Bristow 2006, *The Holocene* 16: 901–911, who put the spill into the Benue at ~330 m) |
| Dates | highstand by ~11.5 ka BP, held to ~5 ka BP (Armitage, Bristow & Drake 2015, *PNAS* 112: 8543). **Calendar BP from 1950**: 11,500 BP = app year **-9550**, 5,000 BP = **-3050** (not -11500 / -5000), both ends inclusive |
| Check | area **358,873 km²** against the 361,000 km² Armitage et al. give for the early-to-mid-Holocene lake (-0.6 %); the fill at 320 m gives 324,000 km² and at 333 m 395,000, and never leaves the basin |
| Water | **fresh, assumed.** The overflowing lake is counted as drinkable at the highstand; shore salinity and stage during the interruptions the lake is known to have had are not modelled |
| Outside the window | **scenario inactive: geography unknown, not dry lakebed.** -12000 and 0 are the controls: the app draws and places exactly as without the flag, and its note says so |
| Not modelled | stage changes inside the window, sediment and tectonics since (the shore can be km off on flat ground), any other palaeo-lake, Green Sahara rivers |

Alpha fading is **not** a lake stage. The old paint faded the lake in and out with `sahara_weight`; under the flag the lake is the full
highstand inside the window and absent outside it. (The Earth images are cross-faded between their 1,000-year frames, as everything is; that
blend is a picture, the dates are the manifest's.)

## European LGM lakes and rivers (`past_water_lgm.py`)

| | |
|---|---|
| Source | Verheul, Zickel, Becker & Willmes 2015, *LGM major inland waters of Europe – GIS dataset*, CRC806-Database, doi:10.5880/SFB806.14: `LGM_Lakes.zip` (227,113 B, 80 polygons) and `LGM_River.zip` (77,498 B, 94 lines), WGS84, compiled from published maps (Ehlers et al. 2011, Harrison et al. 1991, Toucanne et al. 2010, Grosswald 1980, Torfstein et al. 2013 …); some river reaches are GEBCO flow routes |
| Licence | **CC-BY** (metadata PDF; dataset page: "attribution required, commercial use, derivations allowed"); the version is not stated. Verified 2026-11-21; both zips pinned by sha256 in the script, downloaded into git-ignored `data/pastwater_src/` |
| Dates | the dataset's LGM interval, 26,500–19,000 yBP = app years **-24550…-17050**. **One snapshot**, held unchanged and never interpolated toward the Holocene; -26000 and -12000 say "no scenario" |
| Lakes | wet: every 2.5′ pixel whose centre is inside a polygon: **95,433 pixels, 1,363,670 km²** (the Caspian outline alone ~806,000 km², the Aral ~369,000). 33 of the 80 polygons (mostly small Alpine lakes) are smaller than a pixel and vanish |
| Level | per lake, the median ETOPO1 height of its shore pixels, carried in the mask (green × 256 + blue − 32768 m). An estimate for the close-up only: the Polish ice-dammed lakes come out 30–60 m below the altitudes their sources state, Lake Lisan at −263 m where its LGM stand was nearer −160 m, the Caspian at 9 m |
| Fresh water | rivers and every lake except the Caspian, Aral, Sarygamysh and Lisan (brackish to hypersaline) are fresh, assumed: freshwater distance = min(static image, distance to them), **58,865 cells** nearer. Rivers are never wet (a line is not a 4.6 km pixel) |
| Not in the data | **the Black Sea** (no polygon: the Steady task's Black Sea example cannot change; research 0014 found only competing levels), modern lakes under the ice (Natural Earth water is never removed), the ice sheets |

## Mesopotamian coast stages (`past_water_mesopotamia.py`)

| | |
|---|---|
| Source | Giosan & Goodman 2025, *PLOS ONE* 20(8): e0329084, **CC BY 4.0**. Its SI tables (DOCX) are geochemistry and radiocarbon dates, **not coastlines**; the stages exist only as **Fig 6** (three map panels on a 2° graticule). The geometry is traced from that figure: **interpreted**, attributed |
| Tracing | the panels' blue at 2.5′ (≥ half of the figure under a pixel), georeferenced to the graticule ticks (plate carrée, 76.17 px per degree on both axes, residuals < 1 px); black outlines and arrows filled from their neighbours; the green tidal-freshwater zones are land with channels, left out. Figure pinned by sha256 |
| Region | **44.0–49.5 E, 29.8–33.5 N**, the head of the Gulf; outside it the panels are today's coast generalised, and the app's own sea is better |
| Stages | a "~8000 BP" on the panel, "7,000 years ago" in the caption: 8,000–6,501 BP (**-6050…-4551**, both readings); b ~6 ka: 6,500–5,500 BP (**-4550…-3550**), the bay open past Ur and Lagash, over Basra; c ~4 ka: 4,500–3,500 BP (**-2550…-1550**), a closed remnant bay. Areas 51,432 / 51,270 / 15,779 km² (including the Gulf inside the region). 5,500–4,501 BP is between stages: no scenario |
| Water | **sea, not fresh**: it keeps groups out and gives no freshwater distance (no distance patch). Its level is the year's sea level; the close-up flattens the later delta sediment under it to the sea |

## Basin of Mexico lakes (`past_water_texcoco.py`)

| | |
|---|---|
| Why | without it the Basin of Mexico is dry land (Natural Earth is today's water), so at 1400 the Valley's towns stand on Lake Texcoco's bed |
| Lake | the same flood as Mega-Chad: 2.5′ pixels joined through pixels at or below the level to a seed in Lake Texcoco (19.45 N, 99.0 W), inside 18.8–20.6 N, 99.8–98.2 W, Terrarium zoom 6 averaged 3 × 3 |
| Level | **2270 m, calibrated, not surveyed**: the lakes stood at ~2236–2240 m, but the smoothed relief lifts the narrow floor and at 2240 m the fill is a few pixels. 2270 m is the lowest level reaching all five lakes (Zumpango, Xaltocan, Texcoco, Xochimilco, Chalco): 1,598 km², inside the ~1,000–2,000 km² usually given at contact (asserted) |
| Islands | Tenochtitlan and Tlatelolco's pixels are carved out so the city keeps its people; causeways, chinampas and the smaller islands are not modelled |
| Dates | one epoch, 4,000–350 BP (**-2050…1600**): Formative shore villages to the eve of the Desagüe (1607). After 1600 the lakes shrank over three centuries: not modelled, so no scenario |
| Water | Texcoco saline, Zumpango and Xaltocan brackish, Xochimilco and Chalco fresh: the distance patch counts only lake pixels south of 19.34 N (304 km²); the whole mask keeps groups out |
| Close-up shore | the 2.5′ mask drew straight diagonal bands in the close-up, and the plane clipped to today’s DEM left Mexico City’s buildings and fill as fragments in the water. The close-up uses `texcoco_shore.webp` instead (manifest `shore`): Terrarium zoom 11 on a 7.5″ grid, smoothed ~0.5 km, flooded from the seed at 2250 m (lowest level reaching all five lakes; 1,158 km²), Tenochtitlan and Tlatelolco carved as discs of 1.6 and 1.0 km, kept within a pixel of the coarse mask. Its water is flat at 2250 m, not clipped to the DEM. Groups still use the coarse mask |
| Picture | `terrain.years` is empty: the Earth images are not rebaked for a lake of a few globe pixels; the close-up draws it as a plane at 2270 m clipped to the DEM |

## Every scenario: one manifest each, epochs as the unit

Each script writes to `footsteps-web/public/pastwater/` (committed, **113 KB** in all):

| File | Bytes | Holds |
|---|---|---|
| `mega_chad.json`, `_mask.webp`, `_water.webp` | 4,061 + 646 + 8,016 | the lake on the 2.5′ world grid (196 × 207 patch); freshwater distance on the HYDE 5′ grid (219 × 248 patch, 36,249 cells changed) |
| `lgm_europe.json`, `_mask.webp`, `_water.webp` | 6,735 + 4,134 + 82,990 | lakes and their levels (1,501 × 913 patch); freshwater distance (845 × 540 patch) |
| `mesopotamia.json`, `_{a,b,c}_mask.webp` | 6,350 + 176 + 172 + 128 | each stage's water (132 × 89 patch); no distance patch |

A manifest (schema version 2) has the scenario's sources, licence, datum, uncertainty and digest, and its **epochs**: an id unique across
scenarios (1 Mega-Chad, 2 LGM, 3/4/5 Mesopotamia), the calendar-BP window and app years, `water` (words), `paint` (lake or sea), `level`
(`plane` 329 m clipped to the DEM; `pixel` from the mask; `sea`), `mask` and `distance` (or null) with window, bytes and sha256.
`active_epochs(year)` (Python) and `pastWaterEpochs(year)` (TS, `lib/pastWater.ts`) give the ids holding at a year; both are tested on the same
table of window ends. **Epochs that hold at the same time never reach the same 5′ cell** (both test suites check it), so a cell sees at most one.

| Consumer | How it uses the epochs |
|---|---|
| Earth picture | `terrain_image.py --pastwater` paints every active epoch's mask at full strength, lakes in lake colour (over the frame's own water too), marine stages in sea colour only where the frame draws land: 15 frames (-24000…-18000, -9000…-3000, -2000; 188–224 KB each, 2.9 MB) in `data/tiles/terrain/pastwater/`; `useTerrainLayers.ts` swaps the URL for those years. Mega-Chad's frames are painted exactly as before |
| Wet exclusion | `siteRanking.ts`: in a cell inside an active epoch's region, a terrain pixel in its mask is water. A spot it touches at all is never a "doubtful shore spot" |
| Freshwater distance | `siteRanking.ts` `codeAt`: the epoch's patch inside its window, the static image elsewhere |
| Close-up water | `lib/close3d.ts` `lakeVertices`: per vertex, the level `LakePlane.levelAt(lon, lat, h)` gives: Mega-Chad where its mask says lake **and** the DEM is below 329 m; an LGM lake wherever its outline is, at its own level; a Mesopotamian stage at the year's sea. Shore colour is measured from the nearest such level |

### Caches

The ranker's per-cell cache keys on the sea state **and** the epoch id in force in the cell (one byte). A cell outside every active
epoch's region (its patches plus 3 cells) ranks as epoch 0, identical to the flag off. `SiteRanker.inPastWater(cellId)`: inside any epoch's
region. The worker's year-keyed Units cache is right because the epochs are a function of the year.

## Population: kept, never forced, never silently dropped

World and cell headcounts are untouched (`GridData.total`, per-cell people, HYDE/prehistory images are not regenerated). The Units builder
(`settlementUnits.ts`) places a group on a ranked dry spot; a cell modelled water covers has **no usable spot**, so its groups are **not drawn**
and are counted in `Units.unresolved = { groups, people }` (present whenever an epoch is in force, even at 0). The Units note names the active
scenarios and says it ("Past water (experimental): LGM lakes and rivers, 26.5–19 ka BP. 13,908 groups unplaced (all water)"); the hover text adds
that their people are still in the totals, each scenario's summary and every scenario's window. With no epoch: "Past water: no scenario at this
date (geography unknown, not dry)". Grid mode places nobody (it shows people per cell), so cells under the water keep their dots there and the note says so. **Dots is a static archive** (PMTiles): its positions do not
follow the model, and with the flag on its note says "Past water: not applied to Dots". With `?settlements=0` or `?sites=0` there is no ranker and
the note says groups are not being kept out of the modelled water.

## Measure

```bash
# Python: dates, ids, regions, the committed patches against their manifests, LGM mask against the source polygons, Mega-Chad geometry
TERRARIUM_DIR=$PWD/data/terrarium poetry run pytest footstep-generator/tests/test_past_water.py footstep-generator/tests/test_past_water_scenarios.py footstep-generator/tests/test_terrain_image.py -q
# Regenerate (Mega-Chad fetches ~20 zoom-6 Terrarium tiles: always pass --tiles; the others download their pinned sources into data/pastwater_src/)
poetry run python footstep-generator/past_water.py --tiles data/terrarium
poetry run python footstep-generator/past_water_lgm.py
poetry run python footstep-generator/past_water_mesopotamia.py
poetry run python footstep-generator/past_water_texcoco.py --tiles data/terrarium
poetry run python footstep-generator/terrain_image.py --pastwater
# Real-data placement: counts and positions, then the check that does not use the ranker (exit 1 if a flag-on group is in modelled water)
FOOTSTEPS_PASTWATER_REAL=1 FOOTSTEPS_DATA=$PWD/data/tiles FOOTSTEPS_PASTWATER_OUT=/abs/out pnpm --dir footsteps-web exec jest --runInBand pastWater.real
poetry run python footstep-generator/past_water_check.py /abs/out --tiles data/terrarium
# Screenshots flag off and on (after pnpm build): Po and Caspian at -20000, Black Sea, Basra -4000 / -2000, a close-up
node footsteps-web/scripts/pastwater-shots.mjs --out /abs/shots
```

Results of 2026-11-21 (real HYDE 3.5 and prehistory images, real site terrain; the full-world Units build, Node):

| Year | Epochs | Groups off → on | In modelled water off → on | Unresolved | People off = on + unresolved | Outside the regions moved |
|---|---|---|---|---|---|---|
| -20000 | 2 LGM | 1,147,383 → 1,133,475 | 14,242 → **0** | 13,908 groups, 5,694 people | yes | 0 of 867,793 |
| -6000 | 1 Mega-Chad + 3 Meso ~7–8 ka | 1,272,868 → 1,269,045 | 4,002 (3,410 + 592) → **0** | 3,823 groups, 19,286 people | yes | 0 of 1,001,522 |
| -4000 | 1 Mega-Chad + 4 Meso ~6 ka | 1,441,222 → 1,437,295 | 4,119 (3,483 + 636) → **0** | 3,927 groups, 74,279 people | yes | 0 of 1,156,621 |
| -2000 | 5 Meso ~4 ka | 1,663,194 → 1,663,048 | 168 → **0** | 146 groups, 33,361 people | yes | 0 of 1,346,362 |
| -26000, -12000, 0 | none (controls) | unchanged | – | none | yes | 0 (positions identical) |

"In modelled water" is a nearest-2.5′-pixel test of each active epoch's mask file, and again in Python (`past_water_check.py`): against the
masks, Mega-Chad also against a fresh DEM flood fill and the LGM against the source polygons themselves, the same counts, 0 with the flag on.
Build time of the full world, off → on: -20000 18.4 → 20.7 s, -6000 11.3 → 16.2 s, -4000 6.5 → 6.8 s, -2000 9.2 → 13.2 s (one run each,
machine busy; the epoch check per cell is a loop over at most 5 regions).

Transfer: the flag fetches **105 KB** of patches once per thread (the grid worker and, in the close-up, the page): 83 KB of it the LGM
distance patch. Lazy per-epoch loading would cut that to what a year needs; not done. The repainted Earth frames replace the ordinary ones for
their years, no extra fetch; flag off fetches nothing new. The three manifests (~17 KB) are in the bundle.

Flag off: `pnpm visual` passes on this tree (the ranker without past-water layers is unchanged; the Python LGM and Mesopotamian scripts touch
no default file).

Real-browser screenshots (1280 × 800, static build, real data, Units; `scripts/pastwater-shots.mjs`): `po-20000`, `caspian-20000`,
`blacksea-20000` (unchanged: no Black Sea in the data), `basra-4000`, `basra-2000` and the close-up `basra-close-4000`, each `_off` and `_on`.
The Mega-Chad-only shots of the first build (lat 14, lon 15.5, zoom 5.5; close-up at 13.0 N, 18.0 E) still hold: its files did not change.

## Limits and what comes next

- A Terrarium-derived 329 m contour, 2.4 km pixels; the close-up cuts it with the finer DEM, so its shore follows the 329 m contour where the mask allows.
- Plant marks (`?plants=1`, off by default) do not know the lake; shelters are only placed where the ranker found dry ground.
- The Earth image colours near the shore still come from the 10′ painted frame.
- Other palaeo-water (Agassiz, the Black Sea, the exposed Persian Gulf floor) is research 0014 rank 5 and beyond.
- The LGM is one map for 7,500 years and its lake levels are estimates; the Mesopotamian stages are a schematic figure traced at 2.5′.
- The LGM frames (-24000…-18000) and -2000 are new: a deploy must run `terrain_image.py --pastwater` in the primary checkout before rsync; until then the app falls back to the ordinary frames.
- Production rollout is a separate step after Will reviews the flag. `scripts/deploy-budgie.sh` now rsyncs `terrain/pastwater/` (nothing was deployed by this change); a missing frame falls back to the ordinary image.
- The close-up shore is stair-stepped where the 2.4 km mask edge meets the finer DEM (visible in the screenshot below): modelled, not surveyed.
