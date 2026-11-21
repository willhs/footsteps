---
id: terrain-images
type: reference
purpose: "Sources, method and regeneration of the per-era Earth terrain images"
updated: 2026-11-21
---

# Terrain images

`footstep-generator/terrain_image.py` writes `data/tiles/terrain/earth_{year}.webp`:
one 2048 × 1024 equirectangular image (north up, 180W at the left, ±90° latitude)
per terrain year, lossy WebP q90, ~190–225 KB each (cap 400 KB; the script lowers
quality if one is over). These are pictures, not encoded numbers, so lossy is fine.

Terrain years (`TERRAIN_YEARS` in `footsteps-web/lib/constants.ts`, same list in the
script): every 1,000 years from 100,000 BCE to 1000 BCE, then every 100 years from
0 to 1900 CE. Every HYDE slider year is a terrain year, so each one carries its own
farmland. The client cross-fades the two terrain years either side of the slider
time (`useTerrainLayers.ts`): an opaque lower image plus the upper at opacity `f`.
The slider reaches 100,000 BCE. Before 10,000 BCE (no HYDE people) terrain is always on.

## Sources (all gitignored under `data/raw/`)

| Input | Path | Licence / credit |
|---|---|---|
| Krapp et al. 2021 biomes, pastclim repackage (`Krapp2021_biome_v1.2.2.nc`, 18 MB): BIOME4 class per 0.5° cell every 1 ka to 800 ka BP; sea = no data; 28 = land ice; time in years BP (0 = 1950) | `data/raw/krapp2021/` | CC-BY 4.0, Zenodo record 8415273 |
| NASA Blue Marble Next Generation, July 2004, 5400 × 2700 | `data/raw/bluemarble/world.200407.3x5400x2700.jpg` | NASA Earth Observatory |
| ETOPO1 elevation, 4 arc-min subsample (ERDDAP `etopo180`) | `data/raw/etopo/etopo_4min.nc` | NOAA NCEI, public domain |
| HYDE 3.5 land use | `data/tiles/grid/landuse_{year}.png` (`grid-images.md`) | HYDE 3.5 |
| Spratt & Lisiecki v2 sea level (`climate-series.md`) | `data/raw/spratt2025/` | CC BY 3.0, PANGAEA 979830 |

```bash
mkdir -p data/raw/krapp2021 data/raw/bluemarble data/raw/etopo data/tiles/grid
curl -L -o data/raw/krapp2021/Krapp2021_biome_v1.2.2.nc \
  https://zenodo.org/api/records/8415273/files/Krapp2021_biome_v1.2.2.nc/content
curl -L -o data/raw/bluemarble/world.200407.3x5400x2700.jpg \
  https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg
curl -o data/raw/etopo/etopo_4min.nc \
  'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc?altitude%5B(-90.0):4:(90.0)%5D%5B(-180.0):4:(180.0)%5D'
# Land use: generate (grid-images.md) or copy the published ones:
for y in $(sed -n '/TARGET_YEARS = \[/,/\];/p' footsteps-web/lib/constants.ts | grep -oE -- '-?[0-9]+'); do
  curl -fsS -o data/tiles/grid/landuse_$y.png https://footsteps.willhs.me/grid/landuse_$y.png
done
poetry run python footstep-generator/terrain_image.py          # all years, ~1.5 min
poetry run python footstep-generator/terrain_image.py -6000    # one year
```

## Method

1. **Palette.** The median Blue Marble colour of each present-day Krapp biome, taken
   only from cells with little 1900 land use: Blue Marble (2004) shows modern farms,
   and a naive palette would paint 10,000 BCE Europe as fields. Biomes missing today
   (e.g. boreal parkland) borrow the mean of two neighbours (`FALLBACK`).
2. **Step colour.** For each Krapp step, a colour per 0.5° cell: the step's biome
   colour plus today's regional deviation from its own biome (with the modern farm tint
   removed); half the deviation where the biome changed.
3. **Frame.** A calendar year (BP = 1950 − year) interpolates the two bracketing
   steps' colour, land and ice fractions. Land colour = Blue Marble × (smoothed era
   colour ÷ smoothed Blue Marble), so today's detail stays and only the broad colour
   moves. Land that is sea or ice today is painted flat with a little grain.
4. **Coast.** ETOPO1 above the year's global sea level, inside Krapp's uncertain coastal
   band (land fraction 0.02–0.98). The sea level is Spratt & Lisiecki v2, capped at today's
   (`climate_series.sea_level_at`), the same number as the slider's readout. Krapp decides
   land and sea elsewhere; ice counts as land. (Until Nov 2026 the level was fitted so ETOPO
   matched Krapp's land share in the band; that came out 15–30 m below Spratt in glacial
   times, adding 1–2 M km² of shelf.)
5. **Ice.** Krapp ice, blurred and edge-noised, painted white (Blue Marble's own ice
   where there is ice today).
6. **Green Sahara (literature, not the model).** Krapp/BIOME4 under-greens the African
   Humid Period, so desert cells 18W–35E, 9–31N are pulled toward savanna (south of
   ~21N) and grassland (north), weighted by `sahara_weight`: eases in 9750→8250 BCE and
   out 4250→2750 BCE (full ~8250–4250 BCE). Lake Mega-Chad = Chad-basin land
   (10.5–19.5N, 12.5–20.5E) between 150 m and 329 m (Drake & Bristow 2006 highstand
   shoreline), with the same weight. Guide: Li, Dallmeyer et al. 2025 megabiomes.
   **That lake is a box-and-elevation approximation and fades with `sahara_weight`; with `?pastwater=1` it is replaced by the shared, basin-connected
   highstand of `past_water.py` (`terrain_image.py --pastwater` writes `data/tiles/terrain/pastwater/`, 7 frames, -9000…-3000): [past water](past-water.md).**
7. **Farmland.** Calibrated to reality: Blue Marble (July 2004) is a photo of farmed
   Earth, so step 2's removed "farm look" (photo minus natural colour) is put back in
   proportion to how farmed a cell was then versus 1900 (`farm_weight`), with
   farmed fraction `min(1, crop + 0.35 × grazing)`. A cell as farmed as in 1900 shows its
   real photo colour; nothing is tinted beyond what the photo shows. An earlier
   invented field tan overstated farming (greener July crops read as tan sheets).

The client dims the images (`tintColor` 230, `desaturate` 0.1) and puts the source note in the legend.
The faint modern coastline (`world-simple.geojson`, Natural Earth 110m land, stroked) is off since
2026-11-20 (coarse straight segments close in; inland in the Ice Age); `?coast=1` draws it.

### High-zoom relief (2026-11-14)

`TerrainReliefLayer.ts` overlays cool-toned hillshade, fading in over zoom 5–7.
It fetches 256px [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
in [Terrarium encoding](https://github.com/tilezen/joerd/blob/master/docs/formats.md),
through zoom 15 (nominal ~30 m at the equator); actual source resolution varies,
and ocean bathymetry is much coarser. No modern satellite tiles are fetched.
Credit: [Mapzen and upstream elevation providers](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Elevation is independent of the selected year. The viewport tile cache is capped
at 100 tiles with six requests in flight, and survives scrubbing. A composite owns
only two shared GPU era textures; individual tiles never upload global images.
The fragment shader calculates slopes in metres with latitude correction and
uses a one-sided derivative at tile borders. Neutral flat ground adds no shade.

The water mask comes from the **displayed era colours** (blue oceans/lakes), not
a modern coastline or a separate sea-level cutoff. Each endpoint is masked before
cross-fading: exposed shelves receive bathymetric relief while blue sea stays flat.
This follows the image's Spratt/Krapp coast and ice overrides at its existing
resolution. It is a colour-derived mask, not a new exact land classification.
Modern bed topography is an approximation for past terrain, especially under ice.

**Sharp past coasts (2026-11-14).** From zoom 5 (full by 6.5) the relief layer redraws land
and sea near the Earth image's coast from the elevation tiles at the year's global sea level
(`seaLevelAt`, the readout's number): about 2 km per pixel at zoom 6 instead of the image's
~20 km. Only within ~3 image pixels of a coast; land and sea colours come from the nearby
image pixels. Guards: ground more than ~60–120 m above sea level never turns image water into
land (lakes stay); ice is left alone; off when sea level is within ~1.5–4 m of today (polders
and deltas sit below 0 m, and today's coast gains little); off in the Caspian and Dead Sea
boxes (inland water below sea level). Modern elevation stands in for past ground: no
isostasy, sediment or erosion, so it is the global sea level on today's terrain.

Fine, world-anchored grain fades in over zoom 6–8, with derivative filtering to
avoid subpixel shimmer. Sand/grass/forest-like classes are inferred from era
colour, **not** a high-resolution biome map; this grain is illustrative and does
not locate real plants, fields or settlements. Snow suppresses it. The legend
states this distinction. A new per-era image pyramid was rejected because it
would increase generation work and scrub bandwidth; a separate elevation cutoff
was rejected because it would disagree with Krapp's land/ice overrides.

To capture the requested Alps/coast scenes (20,000 BCE and 1500 CE at zoom 6/8/10),
an exposed Channel shelf, all people modes, and scrub timings on a real GPU:

```bash
# Serve a production export first; data can also be supplied locally.
DATA_ORIGIN=https://footsteps.willhs.me node footsteps-web/scripts/verify-terrain.mjs \
  http://localhost:4600 /absolute/path/to/evidence/terrain
```

`DATA_ORIGIN` is a verification-only browser route for fresh checkouts. Production
still serves era/population data from the same origin. The script asserts that
scrubbing issues zero further DEM requests and records browser errors.
Set `BASELINE_ORIGIN=https://footsteps.willhs.me` to record the same scrub against
the deployed version. Timings use a headed Chromium with Metal, not software
rendering. The existing query-driven view-state hydration mismatch is retained
separately as `knownHydrationErrors`; shader and other runtime errors fail the run.

## Detail tiles: the colour pyramid (2026-11-21)

Close in, the 2048 × 1024 era image is ~19.6 km per pixel (64 screen px per texel at zoom 8, 256 at zoom 10).
`footstep-generator/terrain_tiles.py` writes `data/tiles/terrain/detail/`, served at `/terrain/detail/`:

- `{z}/{x}/{y}.webp`: 256 px Web Mercator tiles, zoom 3 to 8, of NASA Blue Marble Next Generation (July 2004) at
  **500 m** (86,400 × 43,200, eight 21,600² JPEGs `world.200407.3x21600x21600.{A1..D2}.jpg`), lossy q80. Alpha is
  today's land (Natural Earth 10m land minus lakes, the pinned v5.1.2 files `site_terrain.py` uses) ramped from 0 at
  today's shore to 255 about 4 km inland. Tiles that are all open ocean are not written.
- `manifest.png`: 256 × 256, which z8 tiles exist (a lower tile exists if any z8 tile under it does), so the
  browser never requests a missing tile. `ref.webp`: the 5400 × 2700 photo BOX-resized to 2048 × 1024, exactly the
  `bm_hi` `terrain_image.py` multiplies. `meta.json`: tile counts and bytes per zoom.

**One pyramid for every year.** `terrain_image.py` paints land as `photo × smooth era ratio`, so in the browser
`era ÷ ref` is that ratio and `detail × era ÷ ref` is the same era picture with the 500 m photo's detail
(`recolour` in `footsteps-web/lib/terrainDetail.ts`; `layers/TerrainDetailLayer.ts` is its shader, and the close-up
3D ground colours its vertices with the TypeScript twin). Each endpoint of the year pair is recoloured, then
cross-faded exactly as the era images are, so scrubbing fetches no tiles. Where the era pixel was not
photo-derived the ratio leaves the script's clip range (0.25–2.5) and the era colour stays: era ice over today's
ice-free ground, painted exposed shelves, era sea. Below today's sea level (from −1.5 m) era land over today's sea or
shore keeps the era colour too (the alpha ramp), so the Ice Age shows neither today's sea nor a hard modern coastline.
The weight is averaged over five taps (0.75 era pixel apart), so the edge of the detail fades over ~30 km instead of
following the era image's 20 km pixel grid.

**What is sharp and what is not.** Only the photo is finer than the era image. The era's colour change comes from
Krapp biomes (0.5°, ~55 km), HYDE land use (5′, ~9 km) and the era coast (ETOPO 4′ / Krapp, ~7 km); inside
`era ÷ ref` they stay at their own resolution. So the fine texture on a past era (valleys, river plains, field
patchwork, towns in July 2004) is **today's ground, imagined for then**; the legend says so. Biome and ice edges are
no sharper than before; the past coast below today's is still the relief layer's DEM coast from zoom 5.
**Behind `?terrain_tiles=1`, off by default** until Will has looked. The first benchmark (`terrain-bench.md`, 2026-11-21)
showed zoom-4 time to detail +0.4–0.7 s and tilted pan fps down by up to ~15. Task 0009 (`terrain-bench.md` "Close-up time
to detail") cleared the tilted costs: the flat tiles are no longer drawn under the close-up 3D, and the close-up fetches each
ground tile's colour tile with its heights. Below zoom 4.5 the flat map draws the pyramid one zoom coarser (2 screen px per
texel from a quarter of the tiles, `detailZoomOffset`). Zoom 4 still reaches full detail ~0.37 s after the era image alone
(0.57 s against 0.20 s, headless); flipping the default is Will's call.

**Bytes.** The whole pyramid is 138 MB (47,662 tiles), for every terrain year at once: per terrain year it adds
nothing beyond the ~200 KB era image the year already has, so the total for the 120 `TERRAIN_YEARS` is 138 MB.
A pyramid per terrain year (the task's first idea) would be about 120 × that (~16.6 GB), and every scrub across a
terrain step would fetch a new set of tiles; recolouring one set in the shader costs nothing per year. Per zoom:

| zoom | tiles | MB | mean KB/tile |
|---|---|---|---|
| 3 | 64 | 0.4 | 5.8 |
| 4 | 223 | 1.2 | 5.2 |
| 5 | 740 | 3.6 | 4.9 |
| 6 | 2,573 | 11.0 | 4.3 |
| 7 | 9,290 | 32.2 | 3.5 |
| 8 | 34,772 | 89.6 | 2.6 |
| ref + manifest | 2 | 0.29 | |

The texel the tiles give is one screen pixel up to zoom 7, 2 at 8, then the z8 tiles stretch: 8 px at zoom 10 and 32 at
12 (the era image: 64, 256, 1024). The goal's 2 px at zoom 12 needs a source near 10 m (Sentinel-2 class); not done.

Regenerate (inputs are not in git):

```bash
mkdir -p data/raw/bluemarble/500m && cd data/raw/bluemarble/500m
for t in A1 A2 B1 B2 C1 C2 D1 D2; do
  curl -fsSO https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x21600x21600.$t.jpg
done; cd -
poetry run python footstep-generator/terrain_tiles.py     # ~4 min, 4 workers, fetches Natural Earth if missing
```

Bump `DETAIL_VERSION` in `lib/terrainDetail.ts` when the tiles change (Cloudflare caches `/terrain` for a day).
`node footsteps-web/scripts/terrain-detail-shots.mjs footsteps-web/out <dir>` takes before/after screenshots (tiles off/on).

## Publish

```bash
GRID_ONLY=1 scripts/deploy-budgie.sh     # grid + terrain images + detail/ pyramid, no app build
scripts/smoke.sh https://footsteps.willhs.me   # checks terrain/earth_{year}.webp and the pyramid (warns if unpublished)
```

## Known limits

- Krapp is 0.5°: ice-sheet and biome edges are soft; coasts are sharper (ETOPO).
- Isostatic depression is not modelled beyond what Krapp's mask carries. The coast uses
  one global sea level against today's elevation, so regional sea level (ice loading,
  rebound) is not modelled.
- The modern coastline line (`?coast=1`) is Natural Earth 110m, coarse when zoomed in.
- The colour pyramid sharpens texture, not the era's own boundaries: biome and ice edges stay at Krapp's 0.5°, and the
  past coast below today's is the relief layer's DEM coast, not the tiles. Past 500 m (zoom 8) the tiles stretch.
- Relief does not sharpen the underlying 2048 × 1024 era coast or biome boundaries.
  Blue-dominance masking can fade relief in mixed coastal pixels; exact categorical
  masking would require an additional generated land/ice mask.
- Close globe view currently loses much of the base era colour; this was also
  reproduced on the deployed baseline during verification. Map-view screenshots
  demonstrate the high-zoom colour/relief combination; globe screenshots alone
  do not prove era-colour fidelity.
