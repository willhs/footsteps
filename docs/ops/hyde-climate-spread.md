---
id: hyde-climate-spread
type: reference
purpose: "Method, choices and limits of the climate-adjusted spread of HYDE 3.5 people (Green Sahara, exposed shelves); an opt-in dataset not wired into the app"
---

# HYDE, adjusted for the climate then

HYDE 3.5 spreads early people with **today's** land suitability. It keeps the Sahara thin through the African
Humid Period (the Nile and the Maghreb hold most of what is there) and puts almost nobody on ground that is
sea now: Doggerland, Sundaland, Beringia, the Sahul shelf. The terrain images show all of those as dry (and the
Sahara as green). `footstep-generator/hyde_climate_spread.py` writes an **adjusted** copy of HYDE's people for
10,000–4,000 BCE. HYDE's own images and files are untouched, and **nothing in the app reads the adjusted set yet**.
It is a model on top of a model: any screen that shows it must say "adjusted spread".

```bash
poetry run python footstep-generator/hyde_climate_spread.py --verify     # 7 years, ~1 min -> data/tiles/grid_adjusted/
poetry run python footstep-generator/hyde_climate_spread.py --strength 0.5 -8000
poetry run python footstep-generator/evidence/sahara_share.py            # radiocarbon check (needs p3k14c built)
poetry run pytest footstep-generator/tests/test_hyde_climate_spread.py -q
```

Inputs are the ones `prehistory-population.md` and `terrain-images.md` already list (Beyer 2020, Krapp 2021, ETOPO1,
Natural Earth rivers and lakes, HYDE 3.5, Spratt sea level). Output: `humans_{year}.webp` in `grid_image.py`'s
encoding at HYDE's 4320 × 2160 (same decoder, ~0.9 MB each), and `spread_report.json`.

## Method

Per HYDE year, per macro-region (ten continent-scale boxes, `REGIONS`; Sundaland sits with mainland Southeast Asia,
Sahul with Wallacea, Doggerland with Europe, Beringia with North America), on the 0.5° grid:

1. **Capacity then and now.** The modelled pre-HYDE capacity (`prehistory_population.Model`: Miami NPP from Beyer
   climate → Tallavaara forager density × habitat rules × ice-free land, shelf exposed by low sea level counts as
   land) at the HYDE year and at 1950. Both are scaled by the share of each block the map draws dry (ETOPO1 above
   Spratt sea level, the coast the terrain image uses), so no one is put on the sea.
2. **Green Sahara.** Beyer's climate and Krapp's biomes leave the Sahara a desert at every step (Krapp: 90% desert
   biome at 8 ka BP), which is why `terrain_image` paints it green by hand. The spread does the same with the same
   weight and extent (`sahara_weight`, `sahara_extent`): NPP is raised toward that of today's rain belt moved
   `SAHARA_SHIFT_DEG` = 8° north, at the humid period's strength. It only ever raises NPP.
3. **Shift.** `shift = Q·then/Σthen − Q·now/Σnow` per cell, where Q is the region's HYDE total.
   `new = max(0, hyde + STRENGTH·shift)`, rescaled so the region keeps Q exactly. A cell is moved only by what
   changed in the climate and coast, since HYDE's own pattern (rivers, cities) is in `hyde` and cancels in `then − now`.
4. **Back to 5′.** A block that lost people loses the same share in every HYDE cell in it. A block that gained
   spreads the gain evenly over its dry 5′ cells at that year's sea level, so new people look like 0.5° tiles.

## How strong (the open call)

`STRENGTH` = 1.0, the full climate-implied shift (`--strength 0..1`; 0 is HYDE). Why not less: the radiocarbon
check (`evidence/sahara_share.py`, p3k14c, one count per site per millennium) puts 28–47% of dated African sites
in the Sahara box from 9,000 to 3,000 BCE, against 12% at 0 CE. HYDE gives that box 8–10% of Africa's people;
the adjusted spread gives 15% (9,000 BCE) rising to 21–23% (8,000–4,000 BCE). Dated sites are not people
(research effort, deflated surfaces), so the radiocarbon share is an upper bound on the shift, and even the full
shift stays well under it. This is a choice, not a fit: the strength is not set per region from a radiocarbon curve
(the optional step in the task), because dates per region confound population with survey effort.

| Place (people) | HYDE 10,000 BCE | adjusted | HYDE 8,000 BCE | adjusted | HYDE 5,000 BCE | adjusted |
|---|---|---|---|---|---|---|
| Sahara box (15–30°N, 17°W–35°E) | 17,600 | 18,400 | 38,400 | 100,900 | 131,300 | 333,700 |
| North Sea floor (Doggerland) | 800 | 9,900 | 1,200 | 9,600 | 4,000 | 17,000 |
| Sundaland shelf | 2,700 | 23,800 | 4,300 | 22,300 | 8,300 | 26,500 |
| Beringia shelf | 80 | 430 | 90 | 1,800 | 130 | 1,200 |
| All shelf (mostly sea today) | 150,800 | 545,000 | 249,600 | 633,600 | 665,800 | 993,900 |
| People moved (of the world) | 15% | | 13% | | 10% | |

Before reading these: at 10,000 BCE ~15% of the world's people move, and the number is lower later, but it never
falls to zero while the climate differs from 1950's. Most of the 10,000 BCE movement is the capacity model's pattern
(Beyer's glacial-end climate vs 1950's), not the Sahara.

## Which years

10,000 to 4,000 BCE (7 images). The humid period ends ~3,500 BCE and Spratt sea level is within a few metres of
today's by 6,000 BCE, so later the shift is the capacity model's own noise: at 1,000 BCE 5.5% of people move and at
0 CE 4.5% with no Sahara or shelf to explain it. `--years` makes any HYDE year (1900 CE moves 0.1%: the climate is 1950's), but the default stops where the signal does. The people in HYDE's later years are
historical estimates, not a land-suitability spread, and are not adjusted.

## Known limits

- **A model of a model.** HYDE's early spread is itself an allocation. The adjustment says "capacity moved, so did people",
  at the NPP-fit's resolution (0.5°, ~55 km): new people look blocky next to HYDE's 5′ detail.
- **Sahara shift is set by hand.** `SAHARA_SHIFT_DEG` = 8° (rain reached ~23°N vs ~15°N now, Kuper & Kröpelin 2006;
  from memory, not checked against the paper). No palaeo-lakes, rivers or oases beyond today's courses (Lake Mega-Chad
  is drawn on the terrain but gives the spread nothing).
- **The Nile is not boosted.** Present-day rivers stand in for the past; the Nile cancels in `then − now`, so its
  people only lose share as the desert gains.
- **Doggerland has ~10,000 people at 10,000 BCE** (about 3% of Europe's HYDE total). Published Mesolithic figures for
  it are a few thousand; the capacity model does not know Doggerland was a wetland, only that it was land.
- **Regions are boxes.** Moves stay inside a box; the Arabian Peninsula west of 52°E sits with Africa
  (west Asia's box takes the rest) and Central America with South America.
- **No ice-sheet or Lake-Agassiz detail** beyond Krapp's ice mask; the Americas lose little because HYDE already has them small.
- **Totals match HYDE exactly** (regional totals are kept to float rounding; the WebP quantisation is within `grid_image.TOTAL_RTOL`).

## Wiring it in (not done)

The app loads `/grid/humans_{year}.webp`. Using the adjusted set needs a choice first (Will's call): replace those for
10,000–4,000 BCE, or a toggle that loads `data/tiles/grid_adjusted/` from another path. Either way the counter note and the legend
must say "adjusted spread", and HYDE's people stay the **measured** class in `vision.md` only where unadjusted.
