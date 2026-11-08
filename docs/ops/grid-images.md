---
id: grid-images
type: reference
purpose: "Define population and land-use grid PNG encodings and publication checks"
---

# Grid images

`footstep-generator/grid_image.py` reads ASCs from `data/raw/hyde-3.5/`
and writes images to `data/tiles/grid/`. Both directories are gitignored.
Each image is 4320 × 2160, one pixel per 5 arc-minute HYDE cell, north to
south and west to east, starting at 90N / 180W. Use decoded bytes directly,
without colour correction or lossy resizing.

Population (`humans_{year}.webp`, lossless WebP, RGB): compute
people = density × spherical cell area in km² (Earth radius 6371.0088 km).
Encode level `q = round(log1p(people) / log1p(5000000) * 1023)`, clipped to
1..1023 where people > 0 and 0 where there are none. R is the high byte of `q`,
G the low byte, B zero. Decode with `expm1((256*R+G) / 1023 * log1p(5000000))`
(zero stays zero). Negative source values become zero.

Why 1023 levels, not 65535: the 16-bit PNGs were ~3 MB each because their low
byte was noise. Lossless WebP alone only reaches ~75% of that (2.2 MB for year 0);
1023 levels give ~35% (about 1 MB) with every cell within ±0.76% of HYDE
(cells under 0.008 people round up to the first level, ~0.015 people). A year's
decoded total is within 3×10⁻⁴ of the HYDE total (worst
year measured in `docs/log.md`). `--verify` checks all of this per pixel.
HYDE's own uncertainty is orders of magnitude larger. Land use below is unchanged.

Land use (`landuse_{year}.png`): R = `cropland`, G = `grazing`,
B = `tot_irri`. HYDE inputs are **km² per cell**, not percentages.
`grazing` already totals pasture and rangeland; do not add those again.
Irrigation is a subset of cropland, so RGB channels do not sum to one.
Divide each area by the spherical area of the full cell (not land-only area),
clip to [0,1], and round `share * 255` to the nearest integer (ties to even).
Decode `share = byte / 255`, or `area_km2 = share * cell_area_km2`.
Maximum error is half a step: 0.5/255 of cell area (about 0.196 percentage
points). Values smaller than half a step disappear. NODATA becomes zero,
indistinguishable from no recorded land use. Invalid/misaligned grids fail;
only overshoots within half a step are clipped. RGB does not encode uncertainty.

## Generate and verify

Source ASCs for the 30 slider years are on the NAS. Copy just the required
land-use grids (no population downloads needed for land-use generation):

```bash
mkdir -p data/raw/hyde-3.5
rsync -az --include='cropland*.asc' --include='grazing*.asc' --include='tot_irri*.asc' --exclude='*' admin@192.168.69.217:/volume2/deep-footsteps/data/raw/hyde-3.5/ data/raw/hyde-3.5/
YEARS=$(sed -n '/TARGET_YEARS = \[/,/\];/p' footsteps-web/lib/constants.ts | grep -v '//' | grep -oE -- '-?[0-9]+')
python3 footstep-generator/grid_image.py --landuse $YEARS
python3 footstep-generator/grid_image.py --landuse --verify $YEARS
# Population images (needs popd_*.asc too):
python3 footstep-generator/grid_image.py $YEARS
python3 footstep-generator/grid_image.py --verify $YEARS
```

Run these commands in bash (zsh does not split `$YEARS`). Dependencies: NumPy
and Pillow. The verifier checks all pixels/channels against the ASCs, dimensions,
RGB mode, and a 5 MB per-file ceiling. Positive years use `AD`, negative years
use `BC`, and year zero uses `0AD` in source filenames.

## Publish

```bash
GRID_ONLY=1 scripts/deploy-budgie.sh
scripts/smoke.sh https://footsteps.willhs.me
```

The regular deploy also syncs both image types. Grid publishing adds/updates
generated images without deleting existing years; superseded `humans_*.png` are
removed after sync. This allows a land-use-only checkout to publish safely.
Caddy serves the files at `https://footsteps.willhs.me/grid/` with a one-day cache. Smoke checks file
signatures (WebP/PNG) for all 30 population and land-use images, plus the
existing PMTiles and app checks. The client does not consume land-use images yet.
