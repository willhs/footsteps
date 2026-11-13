---
id: food
type: reference
purpose: "Method, outputs and limits of the food-over-time lookup (cited domestication table + spread fronts + HYDE land use + forager staples); not wired into the app"
---

# Food over time: which domesticates were around each place

Food is one of the human constants ([human-constants](../philosophy/human-constants.md)). The atlas has one "staple
crop" from the ethnographic present. This dataset adds a time-aware view: for a 5° cell and an era, which crops and
domestic animals could be there, whether HYDE sees any farming, and what foragers lived on where it does not.
It is **modelled from a hand-compiled, cited table**, and **nothing in the app reads it yet**.
Code: `footstep-generator/food/`. Tests: `footstep-generator/tests/test_food.py`. Findings: [research 0008](../research/0008-food-over-time/research.md).

```bash
poetry install
poetry run python footstep-generator/food/build.py            # -> data/food/food.json.gz (35 KB) + claims.csv; ~5 s
poetry run python footstep-generator/food/build.py check      # probes (wheat in the Levant, maize not in Europe ...)
FOOTSTEPS_DATA=/path/to/checkout/data poetry run python footstep-generator/food/build.py   # a worktree has no data/
poetry run pytest footstep-generator/tests/test_food.py -q
```

Inputs are the habitat tiles in `data/tiles/habitat/` (`bp_{ka}.webp` for biome, `use_{year}.webp` for HYDE cropland and
grazing), made by [habitat_lookup.py](habitat-lookup.md). The cited table needs no download: it is the Python in
`food/crops.py` and `food/animals.py`. Everything under `data/` is git-ignored.

## The model

A **domesticate** (`food.model.Taxon`) is a list of dated **claims**: "by *ka* thousand years BP (calibrated), this
domesticate was present in these boxes". Claims are either an `origin` (an independent domestication centre) or a
`spread` (arrival by diffusion). 34 domesticates (19 crops, 15 animals), 529 claims.

| Rule | Detail |
|---|---|
| Presence is the **union** of claims | Present at a cell centre iff some claim's box holds it and `ka × 1000 ≥ 1950 − year`. Order does not matter; a wide late box never suppresses a narrow early one. Presence is monotone: nothing is ever lost (see limits). |
| An **era** is a snapshot at its year | The 30 HYDE years (−10000, −9000 … 1800, 1900), the atlas's `ERAS`. A year takes the latest era at or before it (the atlas's `era_of` bucket). |
| A 5° **cell** is "in" a box when its centre is | Cells follow the atlas (`cell_of`). Boxes are coarse (`food/regions.py`). |
| Every taxon has an origin; no spread is older than the oldest origin | Enforced at import. Origins must be `dated`. |
| **Basis** and **confidence** | `dated` (a published date for this domesticate near this place): medium, **high if `checked`**. `historic` (a written record, e.g. horses to Mexico 1519 CE): high. `front` (an estimate for a diffusion front, rounded from a published range): **low**. |
| `checked` | The figure agreed with a web search-result summary (abstract, news release or review page) read in this session. **No claim was read from the paper itself.** 19 of 529 claims are checked; the rest are recalled from the literature and say so in their `source`. |

## Output

`data/food/food.json.gz` (35 KB) and `claims.csv` (the flat cited table, one row per claim):

| Key | Content |
|---|---|
| `eras`, `levels`, `era_rule` | the 30 years; the land-use level thresholds; the snapshot rule in words |
| `taxa[]` | `id`, `name`, `kind` (crop/animal), `group`, `centre`, `origin_ka`, `needs`, `note`, and every `claims[]` entry with `ka`, `kind`, `boxes`, `basis`, `confidence`, `checked`, `source` |
| `foragers` | `biomes` (Krapp class 1-28 → `plants`, `animals`, `plant_weight`, `note`) and `coastal` |
| `biome_names` | Krapp class names (from `habitat_meta.json`) |
| `cells` | `"lat0,lon0"` (south-west corner) → `first` (taxon id → index of the first era present; omitted when it never arrives by 1900), `crop` and `graze` (one digit per era: HYDE level 0 none, 1 trace, 2 some, 3 heavy), `biome` (one base-36 character per era, the commonest land biome; `0` all sea, `s` land ice), `coast` (one 0/1 per era). 1,370 land cells. |

Land-use levels use the mean HYDE share of the cell's **land**: none = every land pixel zero, trace < 1%, some < 10%, heavy ≥ 10%.

`food.lookup.plate(d, lat, lon, year)` keeps four questions apart because their sources and confidence differ:

| Field | Meaning | Source |
|---|---|---|
| `available` | domesticates whose claims put them in the cell by then | the cited table |
| `grown` | the subset HYDE makes plausible: crops need cropland, livestock need cropland or grazing land, dogs need nothing | table + HYDE |
| `land_use` | HYDE cropland and grazing levels | HYDE 3.5, modelled |
| `forager` | the biome's broad forager staples, plus `coastal` when the cell meets the sea | Binford 2001 / Kelly 2013 generalisations, recalled |
| `confidence` | per available taxon: the confidence of the oldest claim holding the cell | table |

`available` without `grown` is informative, not an error: it means the table says the crop had arrived but HYDE shows no
farming there. HYDE is modelled from population, so this gap measures HYDE's limits for the earliest farming
(for example the Levant at 8000 BCE has wheat in the table and HYDE cropland of "none"/"trace").

## Checks

`build.py check` runs eight probes. `test_food.py` covers: eras and cells agree with the atlas; the claim rules; the
fronts run in order (Anatolia → Balkans → Mediterranean → Rhine → Britain → Scandinavia → Baltic; Balsas → Oaxaca →
Southwest → Eastern Woodlands; Sahel → Great Lakes → Zambezi → Cape; Island SE Asia → Lapita → Fiji/Samoa → eastern
Polynesia → Hawaii); no New World crop reaches the Old World before the Columbian exchange; no horse in the Americas
before 1493 CE; the modern horse at the Don-Volga 4.2 ka; chickens no older than the 2022 redating; the pooling
helpers on synthetic arrays; and the whole pipeline over a synthetic world in `tmp_path`. With real habitat tiles
present it also checks sample places and that fewer than 10% of HYDE-cropland cells at year 0 have no crop claimed.

## Limits (read before using it)

- **Most dates are recalled, not read.** 328 of 529 claims are `front` estimates (low confidence); only 19 were
  confirmed even against a web summary. Treat any single date as a range of a few hundred to a few thousand years.
- **Regions are hand-drawn boxes on a 5° grid** (about 550 km). A front is a step at a box edge. Mountains, deserts
  and coasts are not respected: `available` covers every land cell in a box, including desert and mountain cells
  where nobody farmed. HYDE gating (`grown`) removes only the cells HYDE shows no use in.
- **No losses.** Presence never retreats: the green Sahara pastoralists, Levantine camels, Norse Greenland and the
  Maya collapse are not modelled. Wild-plant and pre-domestic cultivation (the ~1-3 ka before the domestic form) are
  not shown: a crop appears at its first *domestic* date.
- **Presence is not importance.** A cell lists wheat and a pulse and a dog alike. No calories, shares or staples.
- **HYDE is modelled from population**, so it cannot confirm early farming: it shows none before ~8000 BCE and little
  to ~5000 BCE. It also misses Pacific horticulture and low-density swidden. Where `available` has crops and HYDE is
  zero, trust neither strongly.
- **Forager staples are generalisations** (Binford 2001, Kelly 2013) written from memory: a biome gives example foods
  and a rough plant weight, not a diet. They use the Krapp biome of the era (so ice-age Europe is steppe-tundra), not
  Binford's effective temperature.
- **Gaps in the animal and crop list**: oats, rye, teff, finger millet, olive, grape, date palm, coconut, quinoa, cotton and
  the other fibre crops; yak, reindeer, ducks and geese, cat, silkworm, honeybee. See research 0008.
- **Licences.** The cited table is facts and short citations. Derived cells use HYDE 3.5 (CC BY 3.0) and Krapp 2021
  (CC BY 4.0); credit both if shown.
