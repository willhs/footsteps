---
id: terrain-images
type: reference
purpose: "Sources, method and regeneration of the per-era Earth terrain images"
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
The slider still starts at 10,000 BCE; the older images are published for later.

## Sources (all gitignored under `data/raw/`)

| Input | Path | Licence / credit |
|---|---|---|
| Krapp et al. 2021 biomes, pastclim repackage (`Krapp2021_biome_v1.2.2.nc`, 18 MB): BIOME4 class per 0.5° cell every 1 ka to 800 ka BP; sea = no data; 28 = land ice; time in years BP (0 = 1950) | `data/raw/krapp2021/` | CC-BY 4.0, Zenodo record 8415273 |
| NASA Blue Marble Next Generation, July 2004, 5400 × 2700 | `data/raw/bluemarble/world.200407.3x5400x2700.jpg` | NASA Earth Observatory |
| ETOPO1 elevation, 4 arc-min subsample (ERDDAP `etopo180`) | `data/raw/etopo/etopo_4min.nc` | NOAA NCEI, public domain |
| HYDE 3.5 land use | `data/tiles/grid/landuse_{year}.png` (`grid-images.md`) | HYDE 3.5 |

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
4. **Coast.** ETOPO1 above a per-frame sea level, inside Krapp's uncertain coastal band
   (land fraction 0.02–0.98); the sea level is fitted so ETOPO and Krapp agree on land
   area in that band. Krapp decides land and sea elsewhere; ice counts as land.
5. **Ice.** Krapp ice, blurred and edge-noised, painted white (Blue Marble's own ice
   where there is ice today).
6. **Green Sahara (literature, not the model).** Krapp/BIOME4 under-greens the African
   Humid Period, so desert cells 18W–35E, 9–31N are pulled toward savanna (south of
   ~21N) and grassland (north), weighted by `sahara_weight`: eases in 9750→8250 BCE and
   out 4250→2750 BCE (full ~8250–4250 BCE). Lake Mega-Chad = Chad-basin land
   (10.5–19.5N, 12.5–20.5E) between 150 m and 329 m (Drake & Bristow 2006 highstand
   shoreline), with the same weight. Guide: Li, Dallmeyer et al. 2025 megabiomes.
7. **Farmland.** Calibrated to reality: Blue Marble (July 2004) is a photo of farmed
   Earth, so step 2's removed "farm look" (photo minus natural colour) is put back in
   proportion to how farmed a cell was then versus 1900 (`farm_weight`), with
   farmed fraction `min(1, crop + 0.35 × grazing)`. A cell as farmed as in 1900 shows its
   real photo colour; nothing is tinted beyond what the photo shows. An earlier
   invented field tan overstated farming (greener July crops read as tan sheets).

The client dims the images (`tintColor` 230, `desaturate` 0.1), draws a faint modern
coastline (`world-simple.geojson`, Natural Earth 110m land, stroked) and puts the
source note in the legend.

## Publish

```bash
GRID_ONLY=1 scripts/deploy-budgie.sh     # grid + terrain images, no app build
scripts/smoke.sh https://footsteps.willhs.me   # checks terrain/earth_{year}.webp too
```

## Known limits

- Krapp is 0.5°: ice-sheet and biome edges are soft; coasts are sharper (ETOPO).
- Isostatic depression is not modelled beyond what Krapp's mask carries.
- The modern coastline line is Natural Earth 110m, coarse when zoomed in.
