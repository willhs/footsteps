---
id: ice-sheets
type: ops
purpose: "The dated ice sheets behind ?ice=1 (PaleoMIST 1.0 margins): source and licence, the epoch rule, the masks and manifest, how each consumer reads them, how to regenerate and measure them"
scope: [terrain, placement, close-up, hover]
tags: [modelled, experimental]
related: ["past-water.md", "site-terrain.md", "close-up-scene.md", "terrain-images.md", "../research/0014-past-terrain/research.md", "../tasks/0013-ice-sheets-dated-extent/task.md"]
---

# Ice sheets at their dated extent (`?ice=1`)

Off by default until Will has reviewed it on prod. With `?ice=1` the Laurentide (with the Cordilleran, Innuitian and Greenland ice),
Fennoscandian (Eurasian complex) and Patagonian ice sheets are drawn at the extent a dated reconstruction gives for the year, and groups are
kept off them.

## Source

**PaleoMIST 1.0**: Gowan, Zhang, Khosravi et al. 2021, *A new global ice sheet reconstruction for the past 80 000 years*, Nature
Communications 12: 1199, doi:10.1038/s41467-021-21469-w. Data: PANGAEA doi:10.1594/PANGAEA.905800, **CC BY 4.0** (the dataset's PANGAEA
metadata, read 2026-11-22). Research 0014 ranked it the best explicitly licensed source; ICE-6G and GLAC-1D were not used (licences
unverified), nor Dalton et al. 2020 for North America, because PaleoMIST covers all three sheets under one licence.

- The archive is one 3.7 GB zip (`Gowan_ice_reconstruction.zip`, 3,706,381,549 bytes). The server answers byte ranges, so
  `ice_sheets.py` reads the zip's directory remotely and fetches only `margins/<region>/readme` and `margins/<region>/<age>.gmt` for
  Eurasia, North_America, North_America_a1 and Patagonia (136 files, about 55 MB), into `data/paleomist_src/` (not in git). zipfile checks
  each member's CRC-32 as it reads it; `footstep-generator/ice_sheets_sources.json` pins each file's sha256, and a re-run fails if one changes.
- The file server answers 500/503 now and then (research 0014 saw the same); the script retries.

### What each region's margins rest on (the archive's readmes)

| Region | Basis |
|---|---|
| Eurasia | **DATED-1** most-credible time slices (Hughes et al. 2016, Boreas 45: 1-45) at 25, 20, 15 and 10 ka; 27.5, 22.5, 17.5 and 12.5 ka set between them by Gowan; 2.5-7.5 ka modern (GLIMS); before 30 ka other cited reconstructions |
| North America | Gowan's margin compilation for PaleoMIST (dated sites listed in the readme). A second scenario "a1" keeps more ice in MIS 3 only |
| Patagonia | Ehlers et al. 2011 LGM limit held 30-18 ka, GLIMS modern outlines from 13 ka, contour-interpolated between |

So the hover's "after DATED-1, most credible" is exact at 25/20/15/10 ka and an in-between line at the other epochs. DATED-1's own minimum
and maximum envelopes are not drawn.

## The masks

`footstep-generator/ice_sheets.py` rasterises each (epoch, region) margin to the app's 2.5′ world grid (8640 × 4320, row 0 north, column 0
180° W): a pixel is ice when its centre is inside a margin polygon (outer rings minus holes; shapely `contains_xy`). Each is cropped to its
ice plus 2 pixels and written as a lossless WebP (red 255 = ice) in `footsteps-web/public/ice/`, with `ice_sheets.json`:

- `source` (citation, dataset DOI, licence, archive URL and bytes), `rule`, `outside`, `regions` (basis), `uncertainty`, `left_out`;
- `epochs`: for each age 0-80 ka every 2.5 ka, its window of app years and its `patches` (`id`, region, file, x0/y0/width/height,
  bytes, sha256, ice pixels, area km²);
- `alternative_a1`: where North America's a1 scenario differs (only 37.5-55 ka; up to 2.1 million km² at 42.5 ka); measured, not drawn;
- `bytes`, `digest`.

**Bytes: 99 patches, 361,532 bytes (353 KB) for all 33 epochs.** One epoch is fetched at a time when the flag is on: the 22.5 ka epoch
(20,000 BCE) is 12.4 KB, 17.5 ka 12.7 KB. Patch ids run 101-199 (past-water epochs are below 100), so one id names one exclusion everywhere.

Areas at the LGM epochs (million km²): Eurasia 3.93 (25 ka), 5.23 (22.5), **5.59 (20)**, 4.37 (17.5); North America 16.5, 17.8, 18.3, 17.9
(with Greenland and the Cordilleran ice); Patagonia 0.50. DATED-1 gives the Eurasian complex its maximum, 5.5 million km², at 21 ka
(Hughes et al. 2016); our 20 ka mask (DATED-1's 20 ka slice through PaleoMIST) is 5.59.

**Reproduced against the published grid** (`ice_sheets.py --verify`, `compare_with_grid`): PaleoMIST's own `reconstruction_1_degree.nc`
`ice_thickness` (> 0, nodes at whole degrees) against our masks (a node is ice when half the 2.5′ pixels of the 1° box centred on it are),
over the nodes either calls ice inside our patches' boxes:

| Epoch | Nodes | Agree | Ours only | Grid only |
|---|---|---|---|---|
| 25 ka | 4,791 | 85.1% | 0 | 714 |
| 20 ka | 5,553 | 88.5% | 0 | 636 |
| 15 ka | 4,210 | 85.5% | 0 | 610 |
| 12.5 ka | 3,248 | 82.1% | 0 | 580 |

No node we call ice is ice-free in the grid. At 20 ka, 588 of the 636 grid-only nodes are within one node of our ice (the grid counts a
partly iced cell as ice); the other 48 are small ice caps it smears (Alaska ranges, Svalbard, the Greenland fringe).

### Dates and the rule between epochs

Calendar BP from 1950 (app year = 1950 − BP). **A year shows the nearest native epoch**, |BP − epoch| ≤ 1.25 ka: epoch E holds for app
years 1950 − E − 1249 … 1950 − E + 1250. The windows tile with no gaps; edges move in 2.5 ka steps and are never interpolated. So 20,000 BCE
(21,950 BP) shows 22.5 ka, 15,000 BCE shows 17.5 ka, 25,000 BCE 27.5 ka, 10,000 BCE 12.5 ka. Before 81,249 BP (app year −79299) there is
no reconstruction: the layer draws nothing and the note says "unknown, not ice-free".

## Consumers (`footsteps-web/lib/iceSheets.ts`)

- **Earth image** (`hooks/useTerrainLayers.ts`): one `BitmapLayer` per patch over the terrain relief: ice white (slightly translucent),
  a solid blue-grey 2-pixel edge drawn inside the margin, `magFilter: nearest` so the edge stays sharp. Not under the close-up (its ground is the ice).
- **Close-up** (`lib/close3d.ts` `withIce`, `buildTerrainMesh(..., ice)`; `Close3DLayer` prop `ice`): a vertex whose bilinear ice share
  is ≥ 0.5 is ice: Krapp biome 28 (snow white, the ground shader's ice cover, no plants), never sea or past water; where the bed is below the
  year's sea (Barents, Baltic, Hudson Bay) the ice is drawn flat at sea level. **No ice-surface height**: PaleoMIST has thickness under
  CC BY 4.0, but this build keeps height out (follow-up).
- **Groups** (`siteRanking.ts`): ice patches are extra exclusions in the same `epochs` list as past water (`gridData.ts` appends
  `iceIds(year)` when `?ice=1`). A spot an ice pixel touches is never used; a cell with no usable spot is `unresolved` (its people stay in
  the totals, its groups are not drawn, the note counts them). An ice patch and a past-water epoch can share a cell (LGM proglacial lakes):
  every matching exclusion is live and the per-cell cache key packs their ids. Masks load per epoch (`loadIceAt`) before the year's Units are built.
- **Hover card** (`hooks/useIceAt.ts`, `lib/hoverCard.ts` row `ice`): on an ice pixel, "Ice sheet (PaleoMIST 1.0, 22.5 ka)" with
  "Eurasia: after DATED-1, most credible · nearest 2.5 ka epoch, edges step, not interpolated · modelled".
- **Note** (`SupportingText`, `data-testid="ice-note"`): "Ice sheets (experimental): PaleoMIST 1.0, 22.5 ka · groups kept off the ice"
  (or the unresolved count); Grid places nobody, Dots is a static archive and says the ice is not applied.

Flag off: none of this loads or runs (`pnpm visual` unchanged).

## Regenerate

```bash
poetry run python footstep-generator/ice_sheets.py            # fetch once (range reads), rasterise, write public/ice/
poetry run python footstep-generator/ice_sheets.py --verify   # also compare 20 and 15 ka with PaleoMIST's 1-degree thickness grid
poetry run pytest footstep-generator/tests/test_ice_sheets.py -q
```

`--pin` rewrites `ice_sheets_sources.json`: only when the source has changed on purpose and been reviewed.

## Measure

```bash
FOOTSTEPS_ICE_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_ICE_OUT=/abs/out pnpm --dir footsteps-web exec jest --runInBand ice.real
pnpm --dir footsteps-web build && node footsteps-web/scripts/ice-shots.mjs --out /abs/out
```

`ice.real.test.ts` builds the real Units for every 1 ka year 25,000-10,000 BCE with and without the ice and checks: no group on an ice
pixel (nearest-pixel test of the mask files, not the ranker's bilinear one), placed + unresolved people = flag-off people, and no group
outside the ice regions moved. Results (2026-11-22): see the table below.

| Year | Epoch | Groups off | On ice (off) | On ice (on) | Unresolved groups (people) | People off = placed + unresolved | Outside moved |
|---|---|---|---|---|---|---|---|
| -25000 | 27.5 ka | 1,102,277 | 1,204 | 0 | 1,455 (929) | 3,159,883 = 3,159,883 | 0 |
| -24000 | 25 ka | 1,101,776 | 1,144 | 0 | 1,447 (761) | 3,287,490 = 3,287,490 | 0 |
| -23000 | 25 ka | 1,111,031 | 4,673 | 0 | 4,948 (1,020) | 3,420,424 = 3,420,424 | 0 |
| -22000 | 25 ka | 1,155,962 | 7,691 | 0 | 7,870 (1,955) | 3,558,486 = 3,558,486 | 0 |
| -21000 | 22.5 ka | 1,156,358 | 12,363 | 0 | 12,419 (3,056) | 3,702,465 = 3,702,465 | 0 |
| -20000 | 22.5 ka | 1,147,383 | 7,856 | 0 | 7,947 (2,754) | 3,852,271 = 3,852,271 | 0 |
| -19000 | 20 ka | 1,136,553 | 11,096 | 0 | 10,913 (2,863) | 4,003,218 = 4,003,218 | 0 |
| -18000 | 20 ka | 1,136,398 | 11,103 | 0 | 10,936 (3,964) | 4,065,407 = 4,065,407 | 0 |
| -17000 | 20 ka | 1,142,426 | 14,164 | 0 | 13,960 (5,625) | 4,128,748 = 4,128,748 | 0 |
| -16000 | 17.5 ka | 1,151,096 | 11,590 | 0 | 11,502 (3,800) | 4,192,819 = 4,192,819 | 0 |
| -15000 | 17.5 ka | 1,175,246 | 16,456 | 0 | 16,252 (5,967) | 4,258,303 = 4,258,303 | 0 |
| -14000 | 15 ka | 1,331,727 | 5,803 | 0 | 5,826 (1,183) | 4,324,649 = 4,324,649 | 0 |
| -13000 | 15 ka | 1,910,007 | 119,646 | 0 | 119,028 (11,252) | 4,441,832 = 4,441,832 | 0 |
| -12000 | 15 ka | 1,923,616 | 124,145 | 0 | 123,479 (23,240) | 4,525,923 = 4,525,923 | 0 |
| -11000 | 12.5 ka | 1,922,924 | 70,458 | 0 | 71,796 (6,172) | 4,575,963 = 4,575,963 | 0 |
| -10000 | 12.5 ka | 1,170,094 | 22,978 | 0 | 22,589 (6,420) | 4,591,842 = 4,591,842 | 0 |

Unresolved people are at most 0.5% of the world (12,000 BCE: 23,240 of 4.53 million): modelled people in cells the margins call all ice (the
prehistory model follows Krapp's biomes, not these margins). A flag-on build of one year's Units took 6.6-38 s in Node (the first year
includes the ranker's cold cache).

`ice-shots.mjs` takes Scandinavia 20,000 BCE, the Great Lakes 15,000 BCE, Patagonia 20,000 BCE and a close-up of the Laurentide's 17.5 ka
edge in north-west Ohio (15,000 BCE, where Krapp's biome is tundra), each flag off and on, with the hover card over the ice.

## Known limits

- A reconstruction every 2.5 ka, not an observation; the nearest-epoch rule makes edges jump at window boundaries.
- Eurasia's in-between epochs and North America's whole history are Gowan's compilations; DATED-1 min/max and the a1 scenario are not drawn.
- The Earth image under the overlay still carries Krapp's 0.5° ice biome, which does not match the margins exactly; the overlay is on top.
- Antarctica is left out (no people; the ice biome covers it; an 8640-pixel-wide patch).
- Prehistory people are modelled on Krapp's biomes, not these margins, so some modelled people sit in cells the margins call all ice:
  they are counted `unresolved`, never moved or dropped.
