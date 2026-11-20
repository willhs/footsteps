---
id: past-water
type: ops
purpose: "The dated Mega-Chad highstand behind ?pastwater=1: what is modelled, its dates and datum, the one mask and epoch every consumer shares, how groups are kept out of the lake, how to regenerate and measure it"
scope: [terrain, freshwater, placement, close-up]
tags: [modelled, experimental]
related: ["terrain-images.md", "water-distance.md", "site-terrain.md", "close-up-scene.md", "../research/0014-past-terrain/research.md"]
---

# Past water: a dated Mega-Chad highstand (`?pastwater=1`)

Research 0014 found that Footsteps drew Lake Mega-Chad (a box-and-elevation approximation, faded by `sahara_weight`) while placing
groups and counting freshwater distance against **today's** Natural Earth water. This is the first build of its ranked fix: **one modelled
lake, one epoch**, read by every consumer, behind `?pastwater=1` (off until Will has reviewed it on prod). Flag off, nothing changes: the
default images, distance image, ranker and close-up are byte-for-byte what they were.

## What is modelled (and what is not)

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

## One geometry, one epoch

`footstep-generator/past_water.py` writes to `footsteps-web/public/pastwater/` (committed, **9.3 KB** with the manifest):

| File | Bytes | Holds |
|---|---|---|
| `mega_chad_mask.webp` | 646 | the lake on the 2.5′ world grid (8640 × 4320), cropped to a 196 × 207 patch; red 255 = lake |
| `mega_chad_water.webp` | 8,016 | freshwater distance (`water_distance.py`'s encoding) on the HYDE 5′ grid, a 219 × 248 patch: `min(static image, distance to the lake)`; the 36,249 cells that change |
| `mega_chad.json` | ~4 KB | epochs, level, datum, patch windows, sha256 of both patches, area, sources, uncertainty, the freshwater assumption, the Earth years the flag repaints |

Everything reads these. Nothing keeps its own copy of the lake:

| Consumer | How it uses the scenario |
|---|---|
| Earth picture | `terrain_image.py --pastwater` paints the mask at full strength where `epoch_at(year)` holds, nowhere else, instead of the box lake: 7 frames (-9000…-3000, ~190 KB each) in `data/tiles/terrain/pastwater/`, deployed by the existing terrain rsync as `/terrain/pastwater/earth_{year}.webp`; `useTerrainLayers.ts` swaps the URL for those years |
| Wet exclusion | `siteRanking.ts`: with the epoch, a terrain pixel in the mask is lake. A spot the lake touches at all (share above 0) is never a "doubtful shore spot" |
| Freshwater distance | `siteRanking.ts` `codeAt`: the patch's code inside its window, the static image elsewhere (they agree on the patch's edge) |
| Close-up lake plane | `lib/close3d.ts` `lakeVertices`: a vertex is lake water when the mask says lake **and** the DEM is below 329 m; its surface is 329 m, not `seaLevel`. A basin below 329 m outside the mask stays dry (it was never joined to the lake) |

## Epochs and caches

`epoch_at(year)` (Python) and `pastWaterEpoch(year)` (TS, `lib/pastWater.ts`, reading the manifest) are 0 (no scenario) or the epoch's id.
Both are tested against -9550 / -3050.

The ranker's per-cell cache keys on the sea state **and** the epoch. A cell with no sea around it used to keep one list at every sea level;
a cell inside the patches' region (both patches plus 3 cells) now also stores the epoch it was ranked for, so crossing -9550 or -3050 re-ranks it
even though the global sea level is nearly the same; a cell outside the region always ranks as epoch 0 (identical to the flag off, and cached
once). `SiteRanker.inPastWater(cellId)` says which. The worker's year-keyed Units cache is right as it stands because the epoch is a function of
the year; the flag is fixed per page load (the worker is configured once).

## Population: kept, never forced, never silently dropped

World and cell headcounts are untouched (`GridData.total`, per-cell people, HYDE/prehistory images are not regenerated). The Units builder
(`settlementUnits.ts`) places a group on a ranked dry spot; a cell the lake covers has **no usable spot**, so its groups are **not drawn**
and are counted in `Units.unresolved = { groups, people }` (present whenever an epoch is in force, even at 0). The Units note says it
("3,263 groups unplaced (all lake)"); the hover text adds that their people are still in the totals. Grid mode places nobody (it shows people
per cell), so cells under the lake keep their dots there and the note says so. **Dots is a static archive** (PMTiles): its positions do not
follow the model, and with the flag on its note says "Past water: not applied to Dots". With `?settlements=0` or `?sites=0` there is no ranker and
the note says groups are not being kept out of the lake.

## Measure

```bash
# Python: dates, connectivity, area, the committed patches, outside-region invariance, shore distance against brute force
TERRARIUM_DIR=$PWD/data/terrarium poetry run pytest footstep-generator/tests/test_past_water.py footstep-generator/tests/test_terrain_image.py -q
# Regenerate (fetches ~20 zoom-6 Terrarium tiles; always pass --tiles: the default is under data/raw)
poetry run python footstep-generator/past_water.py --tiles data/terrarium
poetry run python footstep-generator/terrain_image.py --pastwater
# Real-data placement: counts and positions, then the check that does not use the ranker
FOOTSTEPS_PASTWATER_REAL=1 FOOTSTEPS_DATA=$PWD/data/tiles FOOTSTEPS_PASTWATER_OUT=/abs/out pnpm --dir footsteps-web exec jest --runInBand pastWater.real
poetry run python footstep-generator/past_water_check.py /abs/out --tiles data/terrarium
```

Results of 2026-11-21 (real HYDE 3.5 and prehistory images, real site terrain; the full-world Units build, Node):

| Year | Epoch | Groups off → on | In the lake off → on | Unresolved | World people | Outside the region moved |
|---|---|---|---|---|---|---|
| -6000 | 1 (highstand) | 1,272,868 → 1,269,605 | 3,410 → **0** | 3,263 groups, 9,552 people | 13,545,370; placed + unresolved = 13,545,370 | 0 of 1,245,992 |
| -12000 | 0 (control) | 1,923,616 → 1,923,616 | 4,344 → 4,344 (unchanged: inactive) | none | 4,525,923 | 0 |
| 0 | 0 (control) | 1,856,342 → 1,856,342 | 3,557 → 3,557 (unchanged: inactive) | none | 238,738,698 | 0 |

"In the lake" is a nearest-2.5′-pixel test of the mask file, and again in Python (`past_water_check.py`) both against the committed mask and
against a fresh flood fill of the DEM: the same counts, 0 placed at -6000. The controls keep the groups they always had in the (unknown) basin.
Build time of the full world at -6000: 21.1 s off, 21.3 s on (the ranker cost is the same; 1.9 M cells cached either way). The cache adds one
byte per cached cell for the epoch.

Transfer: the flag fetches 8.7 KB of patches once per thread (the grid worker and, in the close-up, the page); the repainted Earth frames replace the
ordinary ones for -9000…-3000, so they add no extra fetch (the standard pair is not fetched); flag off fetches nothing new. The manifest (~4 KB) is in
the bundle. Decoded patches are about 95 KB per thread.

Flag-off parity: the existing placement measure (`settlementSites.real.test.ts`, ranker without the past-water layers) gives the numbers
`site-terrain.md` recorded: in the sea 14,295 (1900), 6,065 (1000 BCE), 73 (10,000 BCE); on a lake 2,754, 990, 706. The ordinary -6000 and -12000
Earth frames regenerate byte-identical.

Real-browser checks (1280 × 800, real data, dev server): `units_-6000_flagoff/on`, `grid_-6000_flagoff/on`, `dots_-6000_flagoff/on`,
`units_-12000_flagon_control`, `units_0_flagon_control` at lat 14, lon 15.5, zoom 5.5, and the close-up `close_-6000_flagoff/on`,
`close_-12000_flagon_control` at lat 13.0, lon 18.0, zoom 10.5 (the lake's east shore: water at 329 m, none of the groups in it). Notes seen:
"Mega-Chad lake (experimental): modelled, 11.5–5 ka BP. 3,263 groups unplaced (all lake)" at -6000 (the same 3,263 as the Node run);
"Mega-Chad: scenario inactive here (geography unknown, not dry)" at -12000 and 0; "Past water: not applied to Dots" in Dots. No Dots archive
exists in this environment (`public/pmtiles` is empty), so Dots was checked for its note only, not for dots.

## Limits and what comes next

- A Terrarium-derived 329 m contour, 2.4 km pixels; the close-up cuts it with the finer DEM, so its shore follows the 329 m contour where the mask allows.
- Plant marks (`?plants=1`, off by default) do not know the lake; shelters are only placed where the ranker found dry ground.
- The Earth image colours near the shore still come from the 10′ painted frame.
- Other palaeo-water (Agassiz, Black Sea, Persian Gulf, the Mesopotamian delta, the European LGM snapshot) is research 0014 ranks 3-5.
- Production rollout is a separate step after Will reviews the flag. `scripts/deploy-budgie.sh` now rsyncs `terrain/pastwater/` (nothing was deployed by this change); a missing frame falls back to the ordinary image.
- The close-up shore is stair-stepped where the 2.4 km mask edge meets the finer DEM (visible in the screenshot below): modelled, not surveyed.
