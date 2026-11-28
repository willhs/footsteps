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
existing PMTiles and app checks. The client loads each HYDE year's `landuse_{year}.png` beside its `humans_{year}.webp` and classes
every populated cell as foraging, farming, herding or urban (below).

## Way of life (how the client reads land use)

`footsteps-web/lib/waysOfLife.ts` decides, per populated 5′ cell, in this order: people ≥ 40,000 → urban
(a glow); cropland share ≥ 2% → farmer; grazing share ≥ 10% → herder; otherwise forager, except that a
cell with ≥ 600 people is settled (farmer) because nobody forages at ~7 people/km². Foragers are drawn
as bands (~30 people), farmers as villages (~300), herders as camps (~60); far out, each firelight mark
takes its cell's colour. Years before HYDE (the modelled images) have no land use, so everyone forages.
The class is a display reading of HYDE, not a record of any one group. If `landuse_{year}.png` is missing
the people still load and are classed by head count alone (console warning). Shares of the world's people
by class at 10,000 BCE, 1000 BCE and 1900 CE, and the threshold choices, are in `docs/log.md`.

**Gated by what had arrived** (2026-11-28). HYDE allocates land use and people from per-capita rules, so a cell can show
cropland before any crop reached it. `classifyCell` takes two more inputs from `lib/domesticatesGate.ts`: whether any crop,
and any herd animal (sheep, goat, cattle, zebu, horse, donkey, camels, llama, water buffalo), had reached the 1° cell by
that HYDE year, from the food table's dated claims (`footstep-generator/food/gate.py` → `lib/domesticatesGate.json`, 9 KB,
regenerate when `crops.py`/`animals.py` change; `test_food_gate.py` checks it is current). Without a crop, cropland is not
read as farming; without a herd animal, grazing is not read as herding; a crowded cell with neither stays foragers (the
Northwest Coast, the Calusa and Jōmon villages were dense foragers). Reindeer are not in the table, so Arctic herding reads
as foraging. Checked on the served images: HYDE's grazing is already 0 in Australia before 1900 and in eastern North
America before 1700, so the gate mostly changes trace cropland and the crowded-cell fallback.

**Herders are sparse; a little land use is still farming** (2026-11-28). On the served images Germany at 1000 CE had 2,331
cells (31%) with grazing ≥ 10%, no cropland and a median of ~350 people, drawn as herder camps; the steppe's grazing cells hold
13 (Mongolia) to 44 (Sahel). A grazing cell with ≥ 150 people (`PASTORAL_MAX_CELL`, ~1.8/km²) where crops are known is now
mixed farming. Below the old thresholds, grazing ≥ 2% is herding and cropland ≥ 0.5% farming, so Poland and England at
1000 CE (46% and 35% of cells "foragers" with some land use) and Tibet at 1400 (95%) are no longer foragers. Counts per
region are in research 0015.

**Islands before their first settlers** (2026-11-28). HYDE spreads each modern country's people over its land at every
date, so the served images put people on Iceland and the Faroes from 10,000 BCE, on Galápagos (never settled before 1535),
the Canaries, Madagascar, Hawaii and the Caribbean before their first settlers. `lib/firstSettlement.ts` lists those islands
with a cited first-settlement year; `gridDataFrom` leaves their cells empty before it. Counts per island and year are in
`docs/research/0015-world-model-audit/research.md`. The grid has no cells on the Azores or East Polynesia (Tahiti) even in
1900: `lib/missingIslands.ts` spreads a rough, cited head count over a few 5′ cells of the Society Islands, the Marquesas, Rapa
Nui and the Azores from their settlement, only where the image has none (modelled; the counts are approximate). Not fixed:
Greenland is empty in 800 CE though Dorset people lived there.

## After 1900 (rough modern years)

HYDE stops at 1900. `footstep-generator/modern_population.py` writes `humans_1950/2000/2025.webp` by scaling
HYDE's 1900 image per UN region (six lon/lat boxes) to UN WPP 2024 totals, so world and regional totals are
right but where people live is 1900's pattern. It also copies `landuse_1900.png` and `habitat/use_1900.webp`
to the new years. The app lists them as `MODERN_YEARS` and labels those years "rough". To rebuild and publish:

    python footstep-generator/modern_population.py   # reads data/tiles/grid/humans_1900.webp, ~1 min
    GRID_ONLY=1 scripts/deploy-budgie.sh
