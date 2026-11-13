---
id: habitat-lookup
type: reference
purpose: "Sources, encoding, regeneration and limits of the hover card's habitat, climate and land-use lookups"
---

# Habitat lookup (the hover card)

`?hover=1` on the web map shows a small card that follows the cursor: what that spot
was like at the slider's year. It is off by default. Desktop only (a precise pointer that
can hover), never while a mouse button is down, and one update per animation frame. It is
also hidden while the view zooms or pans, and re-aimed when it settles.

`footstep-generator/habitat_lookup.py` packs the data it needs, per 0.5° cell, into small
lossless WebPs under `data/tiles/habitat/` (gitignored, served at `/habitat/`). Nothing is
fetched until the cursor first rests on the map with `?hover=1`.

## What the card says, and what kind of claim each line is

| Line | Source | Label |
|---|---|---|
| Place: lat/lon, rounded to 0.1° | cursor position | none (a position, not a claim). No region name: nothing in the repo maps a point to a name, and a lookup table of continents would be wrong at the edges |
| Habitat: Krapp biome name, or Open sea / Land ice; global sea level | Krapp et al. 2021 (the same `biome` reading as `terrain_image.biome`); `lib/climate.ts` | modelled |
| Climate: annual mean temperature, annual precipitation, change vs today | Beyer, Krapp & Manica 2020 `BIO1`, `BIO12` | modelled |
| People: head count in the cell | the decoded population image (`groundingFacts`): HYDE 3.5 from 10,000 BCE, the pre-HYDE model before | measured / modelled |
| Way of life: Farming, Herding and grazing, Foraging | HYDE land use (cropland and grazing share), HYDE years only, only where people are counted | modelled |

Nothing on the card is imagined yet (the "glimpse of the ground" is not built). People and way
of life are the only warm-coloured lines.

## Files

`bp_{ka}.webp`, `ka` = 0..102 (`maxKa` in `footsteps-web/public/habitat_meta.json`): one per
1,000-year Krapp step, years before 1950. 720 × 360 RGB, north up, column 0 = 180W, lossless,
70–90 KB each (cap 120 KB). Per pixel:

| Channel | Meaning | Decode |
|---|---|---|
| R | Krapp BIOME4 class: 0 sea, 1–27 biome, 28 land ice | direct |
| G | Beyer `BIO1`, annual mean temperature; 0 = no data | `-50 + (g - 1) × 0.5` °C |
| B | Beyer `BIO12`, annual precipitation; 0 = no data | `expm1((b - 1) / 254 × log1p(10000))` mm/yr |

`use_{year}.webp`, the 30 HYDE years: R cropland share, G grazing share of the cell (0–255 =
0–1), B 0. HYDE's 5′ cells mean-pooled 6 × 6 into 0.5° (21–57 KB for 1000 CE+; 10,000–8,000 BCE are
all-zero and under 1 KB).

`habitat_meta.json` (committed) holds the encoding constants and the 28 biome names, read
from the Krapp file's own attribute. The client imports it, so the constants live in one place;
`tests/test_habitat_lookup.py` fails if the file and the encoder disagree, and both test suites
check the same golden byte pairs.

## Which step a year uses

The nearest 1,000-year step: `ka = round((1950 - year) / 1000)`, clamped to 0..102
(`habitatStep` in `lib/habitat.ts` mirrors `year_to_ka`). 80,000 BCE is 82 ka, 20,000 BCE is
22 ka, and every year from 1000 CE is 0–1 ka. Unlike the terrain image, which cross-fades the two
bracketing steps, the card shows the nearest step only: the numbers are a lookup, not a picture.
A climate figure can therefore be up to 500 years from the slider year.

Beyer's steps are 2 kyr before 22 ka BP and 1 kyr after. Each Krapp step takes the nearest
Beyer step, the younger when two are equally near (23 ka reads the 22 ka field). "Today" is
Beyer's 0 BP field.

## Regenerate

Inputs are the same files as the terrain and climate docs ([terrain-images.md](terrain-images.md),
[climate-series.md](climate-series.md)): `data/raw/krapp2021/`, `data/raw/beyer2020/` (1.3 GB),
and the HYDE `data/tiles/grid/landuse_{year}.png` ([grid-images.md](grid-images.md)).

```bash
poetry run python footstep-generator/habitat_lookup.py            # all 103 steps + 30 land-use years, ~3 min
poetry run python footstep-generator/habitat_lookup.py --ka 0 82  # just some steps
poetry run pytest footstep-generator/tests/test_habitat_lookup.py -q
```

If you change the encoding, regenerate everything and bump `HABITAT_VERSION` in
`lib/habitat.ts` (Cloudflare caches `/habitat` for a day).

## Publish

```bash
GRID_ONLY=1 scripts/deploy-budgie.sh    # also rsyncs data/tiles/habitat/ to app/habitat/
scripts/smoke.sh https://footsteps.willhs.me   # checks all 103 bp_*.webp and 30 use_*.webp
```

The Caddyfile serves `/habitat/*` with the same one-day cache as `/grid` and `/terrain`.

## Known limits

- Land vs sea is Krapp's 0.5° mask. The drawn coast is sharper (ETOPO1 above the year's sea
  level, [terrain-images.md](terrain-images.md)), so within ~50 km of a coast the card can say
  "Open sea" over a pixel the picture shows as land, or the reverse.
- Antarctica (south of 60°S) has no Beyer data: habitat shows, climate is left out.
- Beyer's cells cover the land that existed at each step, so some Krapp land cells have no climate.
  The card leaves the line out rather than guess.
- Temperature is clipped at −50 °C and precipitation at 10,000 mm/yr (nothing in the source
  reaches either). Precipitation is quantised on a log scale: within ±2%.
- Way of life is a display class from the share of the 0.5° cell that HYDE puts under crops or
  grazing, with coarse thresholds (`wayOfLife` in `lib/habitat.ts`). It does not say how any one
  group lived, and 0.5° averages hide a lone village.
- The people count is the cell under the cursor (about 10 km for HYDE, 55 km for the model);
  an empty pixel means zero in the image, not proof that no one was there.
- Not built: a region name, animals, and a picture of the ground.
