---
id: food
type: reference
purpose: "Method, outputs and limits of the food-over-time lookup (cited domestication table + spread fronts + HYDE land use + forager staples); opt-in hover row"
---

# Food over time: which domesticates were around each place

Food is one of the human constants ([human-constants](../philosophy/human-constants.md)). The atlas has one "staple
crop" from the ethnographic present. This dataset adds a time-aware view: for a 5° cell and an era, which crops and
domestic animals could be there, whether HYDE sees any farming, and what foragers lived on where it does not.
It is **modelled from a hand-compiled, cited table**, and the hover card reads it only with **`?food=1`**.
Code: `footstep-generator/food/`. Tests: `footstep-generator/tests/test_food.py`. Findings: [research 0008](../research/0008-food-over-time/research.md).

```bash
poetry install
poetry run python footstep-generator/food/build.py            # -> data/food/food.json.gz (35 KB) + claims.csv; ~5 s
poetry run python footstep-generator/food/build.py check      # probes (wheat in the Levant, maize not in Europe ...)
FOOTSTEPS_DATA=/Users/will/projects/deep-footsteps/data poetry run python footstep-generator/food/build.py --out data/food
poetry run python footstep-generator/food/export_web.py --input data/food/food.json.gz
# Writes footsteps-web/public/food/food.json (gitignored, ~272 KB).
poetry run pytest footstep-generator/tests/test_food.py -q
```

Inputs are the habitat tiles in `data/tiles/habitat/` (`bp_{ka}.webp` for biome, `use_{year}.webp` for HYDE cropland and
grazing), made by [habitat_lookup.py](habitat-lookup.md). The cited table needs no download: it is the Python in
`food/crops.py` and `food/animals.py`. Everything under `data/` is git-ignored.

## The model

A **domesticate** (`food.model.Taxon`) is a list of dated **claims**: "by *ka* thousand years BP (calibrated), this
domesticate was present in these boxes". Claims are either an `origin` (an independent domestication centre) or a
`spread` (arrival by diffusion). 34 domesticates (19 crops, 15 animals), 531 claims (45 origins).

| Rule | Detail |
|---|---|
| Presence is the **union** of claims | Present at a cell centre iff some claim's box holds it and `ka × 1000 ≥ 1950 − year`. Order does not matter; a wide late box never suppresses a narrow early one. Presence is monotone: nothing is ever lost (see limits). |
| An **era** is a snapshot at its year | The 30 HYDE years (−10000, −9000 … 1800, 1900), the atlas's `ERAS`. A year takes the latest era at or before it (the atlas's `era_of` bucket). |
| A 5° **cell** is "in" a box when its centre is | Cells follow the atlas (`cell_of`). Boxes are coarse (`food/regions.py`). |
| Every taxon has an origin; no spread is older than the oldest origin | Enforced at import. Origins must be `dated`. |
| **Basis** and **confidence** | `dated` (a published date for this domesticate near this place): medium, **high if `checked`**. `historic` (a written record, e.g. horses to Mexico 1519 CE): high. `front` (an estimate for a diffusion front, rounded from a published range): **low**. |
| `checked` | The figure was read in the source's abstract or text, and the DOI or URL is in `source` (a test enforces it). 56 of 531 claims are checked, including 37 of the 45 origins. Anything not checked gives `unverified`, the reason: its own for a dated claim (a test enforces that too), a default for a front or a historic date. See "Verification pass" below. |

## Output

`data/food/food.json.gz` (35 KB) and `claims.csv` (the flat cited table, one row per claim):

| Key | Content |
|---|---|
| `eras`, `levels`, `era_rule` | the 30 years; the land-use level thresholds; the snapshot rule in words |
| `taxa[]` | `id`, `name`, `kind` (crop/animal), `group`, `centre`, `origin_ka`, `needs`, `note`, and every `claims[]` entry with `ka`, `kind`, `boxes`, `basis`, `confidence`, `checked`, `unverified` (why it is not checked; empty when it is), `source` |
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
| `forager` | the biome's broad forager staples, plus `coastal` when the cell meets the sea | Binford 2001 / Kelly 2013 generalisations; could not verify (books) |
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

- **The origins are now mostly read; the fronts are not.** 37 of the 45 origin claims have their figure checked against an
  abstract or text. The other 8 and the 325 unchecked `front` estimates (low confidence) could not be verified, and
  neither could the 107 historic arrivals (well-known written-record dates). Treat any single date as a range of a few
  hundred to a few thousand years.
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
- **Forager staples are generalisations** (Binford 2001, Kelly 2013) that could not be verified (books): a biome gives example foods
  and a rough plant weight, not a diet. They use the Krapp biome of the era (so ice-age Europe is steppe-tundra), not
  Binford's effective temperature.
- **Gaps in the animal and crop list**: oats, rye, teff, finger millet, olive, grape, date palm, coconut, quinoa, cotton and
  the other fibre crops; yak, reindeer, ducks and geese, cat, silkworm, honeybee. See research 0008.
- **Licences.** The cited table is facts and short citations. Derived cells use HYDE 3.5 (CC BY 3.0) and Krapp 2021
  (CC BY 4.0); credit both if shown.

## Opt-in hover row

`?food=1` fetches `/food/food.json?v=1` on first hover. Up to four possible foods,
with two crops and two food animals preferred, carry individual confidence and
“checked” or “not verified” labels; the whole row is modelled. Availability
comes from the arrival table, not HYDE's farming gate: early Levantine farming
is otherwise hidden by HYDE's sparse cropland. Presence does not establish a staple diet.
Dogs are excluded. Without domesticates, and always before 10,000 BCE, the current
hovered Krapp biome supplies broad forager foods, all low confidence and not verified.
No row appears over sea or ice, while loading, or when the lookup is unavailable.

After merge, copy the generated file and publish from the main checkout:

```bash
mkdir -p /Users/will/projects/deep-footsteps/footsteps-web/public/food
cp footsteps-web/public/food/food.json /Users/will/projects/deep-footsteps/footsteps-web/public/food/food.json
cd /Users/will/projects/deep-footsteps
GRID_ONLY=1 scripts/deploy-budgie.sh
```

The deploy sync preserves server files and skips absent local exports. Raw food
and web exports stay uncommitted. The default card neither loads nor shows food.

## Verification pass (2026-11-19)

Every origin and every other dated claim was looked up (Crossref and Europe PMC abstracts; a research agent for
pages the abstracts did not cover, whose quotes were kept only where an abstract or page text carried them). Fronts and
historic dates were not looked up one by one. Result: **56 claims checked** (was 19), **8 origins and 35 other dated
claims marked "could not verify" with a reason**, and the values and citations below fixed. All rows except dingo, dromedary,
rice and the citations change the era in which a domesticate first appears on the map; the evidence is in each claim's `source`.

| Domesticate | Was | Now | Why |
|---|---|---|---|
| Potato | 8.0 ka, Andes | 5.0 ka | No directly dated find is older than ~5.4 ka (starch, Rumold & Aldenderfer 2016) or ~4 ka (tubers, Ugent 1982) |
| Common bean | Andes 2.5 ka | Andes 5.0 ka | AMS dates give domesticated beans in Peru "by about 4400 BP" (Kaplan & Lynch 1999); Mesoamerica stays 2.5 ka |
| Cassava | Mesoamerica 4.6 ka | 6.5 ka | Pope 2001 dates the pollen 4600 cal BC; the table read it as 4.6 ka |
| Broomcorn millet | origin 8.7 ka; Europe 6.0 ka | origin 10.0 ka; Europe 3.6 ka | Lu 2009: Cishan 10.3-8.7 ka; Filipovic 2020: directly dated grains put Europe at 16th century BCE at the earliest |
| Sorghum | 4.5 ka | 5.0 ka | Winchell 2018: Kassala seed impressions of the 4th millennium BCE with some domestication traits |
| Wheat in China | NW China 4.5 ka | lower Yellow River 4.6 ka, Gansu/Xinjiang 3.9 ka | Long 2018: the 4.6 ka date is the lower Yellow River, not Gansu |
| Sweet potato | Andes 5.0 ka | Andes 4.0 ka | The Chilca roots are undated; the datable Casma roots are ~2000 BCE (Ugent 1981) |
| Soybean | Korea/Japan 3.5 ka | 5.0 ka (as an origin) | Lee 2011: AMS-dated large seeds in Japan by 5000 cal BP |
| Donkey | Egypt 6.0 ka | Egypt and Horn 7.0 ka | Todd 2022: one African domestication ~5000 BCE |
| Water buffalo | Yangtze 7.0 ka; Indus 5.0 ka | Indus 4.5 ka; SE Asia 3.0 ka | Larson & Fuller 2014; north China buffalo were wild (Yang 2008) |
| Guinea pig | 6.0 ka | 5.0 ka | Larson & Fuller 2014 (~5 ka); Lord 2020 (southern Peru / northern Chile) |
| Dog (Americas) | West 11.0 ka | 10.0 ka | Perri 2021: earliest confirmed American dogs are ~10 ka |
| Dingo | 3.5 ka | 3.35 ka | Balme 2018: bones dated 3348-3081 years ago |
| Dromedary | 3.5 ka | 3.0 ka | Almathen 2016: "late second millennium BCE" |
| Chicken | Africa 1.0 ka only | Ethiopia 2.75 ka added | Peters 2022 abstract: Ethiopia by ~800 BCE; the 1.0 ka sub-Saharan figure is now unverified |
| Rice (Ganges) | an independent origin | a spread | Choi 2017 and Fuller 2011: indica is japonica by introgression |
| Citations | Kwak 2009 "PNAS", Kaplan & Lynch "J Ethnobiol", Lee 2011 "Plant Physiol", Hather & Kirch "Atiu", Balme "Aust Archaeol", Cucchi 2011 "PNAS" | Crop Sci, Econ Bot, PLoS ONE, Mangaia, Sci Rep, J Archaeol Sci | Found while looking up the DOIs |

Could not verify, with the reasons in `unverified`: the lentil/pea/chickpea founder pulses (no abstract dates them),
the Mehrgarh crop and animal dates, the Lapita plants and animals, the Neolithic Europe site dates (LBK, Britain, Funnel
Beaker), West African yam (no archaeological date exists, Scarcelli 2019), sugarcane (the ~8 ka figure is genomic
inference), sweet potato (Chilca roots are undated), the Bactrian camel's place of origin (the date is supported, the
Iran/Turkmenistan place is doubted), the Saharan cattle (contested), eastern North American squash, and the Turkana,
Cape, Near East horse, Hyksos and Anyang dates. The forager table is generalisations from books and could not be verified.

Published data: the built `food.json.gz` and the web export are git-ignored. After this lands, publish with
`GRID_ONLY=1 scripts/deploy-budgie.sh` from the home network (see above).
