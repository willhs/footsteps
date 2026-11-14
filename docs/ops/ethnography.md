---
id: ethnography
type: reference
purpose: "The D-PLACE ethnographic export and the 'nearest known analog' function: sources, variables, method, limits, and how the day API prompt uses them"
---

# Ethnography: the nearest known analog for a place and way of life

Many of the [constants of human life](../philosophy/human-constants.md) have cross-cultural data in
[D-PLACE](https://d-place.org). This is a first test of one idea: for a place, a year and a way of life,
name the three recorded societies that lived most like it, with a score. It is **a comparison, not a
reconstruction**. The day API reads it for "Imagine their day" ([below](#in-the-day-prompt)); the map and portraits do not.

Code: `footstep-generator/anthropology/ethnography.py` builds the export, `deploy/budgie/api/analogs.py` ranks it (in the API directory so the
day API image ships it; `ethnography.py` re-exports it). It extends the anthropology atlas, see below.
Tests: `footstep-generator/tests/test_ethnography.py`.

```bash
poetry install
poetry run python footstep-generator/anthropology/ethnography.py fetch   # 5 zips (~17 MB) -> data/raw/dplace/
poetry run python footstep-generator/anthropology/ethnography.py         # -> deploy/budgie/api/ethnography.json.gz (0.2 MB, committed)
poetry run pytest footstep-generator/tests/test_ethnography.py -q
```

## The ethnographic present is not the past

Every result carries this, and the function cannot return one without it (`CAVEAT`):

> The ethnographic present (about 1850-1950) is not the past. These societies were described by
> outsiders, often under colonial pressure and with trade goods, missions and guns already in play.
> They show one way a kind of life has worked somewhere, not what happened here.

Each analog also says how many years after the asked year it was recorded (`gap_years`; 7,900 for
foragers in the Kalahari in 6000 BCE). 1,355 of the 1,404 societies are from 1800 or later (8 have no year); 41 are
older records, mostly 16th-18th century accounts of contact (Aztec, Inca, Huron) and five ancient ones (Babylonians 2000 BCE, Ancient
Egyptians 1400 BCE, Hebrews, Indo-Iranian, Romans). They say `historical account` instead of `ethnographic present`. A way of life before it is known anywhere
(farming before 9500 BCE, herding before 8500 BCE, cities before 3500 BCE) still gets analogs, with a warning.

## What the premise got wrong, and what already existed

- **Licence.** The task said CC BY 4.0. D-PLACE's datasets are **CC BY-NC 4.0** (ecoClimate CC BY-NC-SA 4.0), as
  the atlas README already notes. The export is a derived work, so it is **CC BY-NC-SA 4.0**; fine for this
  non-commercial site, keep the attribution (the file carries it).
- **The atlas already did part of this.** `footstep-generator/anthropology/build.py` decodes the Ethnographic Atlas and
  `deploy/budgie/api/atlas.py` picks, per 5° cell, the nearest society of the cell's way of life within 2,500 km, for
  dwelling, diet and settlement. It has no similarity score, no climate or biome matching, no SCCS or Binford, and ten
  variables. `ethnography.py` imports its zip reader and Ethnographic Atlas way-of-life rule (`build.way_class`) so the
  two cannot drift (a test checks every society the atlas uses has the same way of life here), and `build.fetch` now
  takes a download table. It does not touch the atlas data, the API or the app.

## Sources

| Dataset | Gives | Licence | Pinned |
|---|---|---|---|
| [Ethnographic Atlas](https://github.com/D-PLACE/dplace-dataset-ea) (Murdock et al. 1999), 1,291 societies | subsistence, settlement, houses, groups, politics, residence, high gods | CC BY-NC 4.0 | commit stamped in the file |
| [SCCS](https://github.com/D-PLACE/dplace-dataset-sccs) (Murdock & White 1969), 186 societies | war frequency, trade | CC BY-NC 4.0 | same |
| [Binford](https://github.com/D-PLACE/dplace-dataset-binford) (2001), 339 hunter-gatherer groups | mobility, camp size, moves per year, density | CC BY-NC 4.0 | same |
| [TEOW](https://github.com/D-PLACE/dplace-dataset-teow) (Olson et al. 2001) | biome at each society, present day | CC BY-NC 4.0 | same |
| [ecoClimate](https://github.com/D-PLACE/dplace-dataset-ecoclimate) (Lima-Ribeiro et al. 2015) | modelled 1900-1949 temperature and precipitation at each society | CC BY-NC-SA 4.0 | same |

`data/raw/dplace/*.zip` are GitHub `main` archives (the CLDF releases); `datasets.*.commit` in the export records the exact
commit read. Societies are merged across datasets by D-PLACE's `xd_id` (same society, possibly a different focal year), so
`!Kung` is one record with ids `EA Aa1`, `SCCS SCCS2`, `Binford B72`. 1,404 societies result: 1,289 of the Atlas's 1,291 (two have no usable subsistence data) plus 115 Binford
groups the Atlas lacks. Every society lists up to five of its source works (`sources`, resolved in `bib`; `n_sources` is the full
count) and every variable names its codebook entry (`variables.*.id`, with the code labels read from each dataset's `codes.csv`).

## The 29 columns (25 variables)

"Coverage" is societies with a value, of 1,404. The mix is five Atlas variables (share of subsistence from gathering, hunting,
fishing, herding, agriculture, as the middle of D-PLACE's percentage bands) so 25 variables in 29 columns.

| Constant ([human-constants](../philosophy/human-constants.md)) | Key (D-PLACE id) | Coverage |
|---|---|---|
| Food, Gathering resources | `gathering` `hunting` `fishing` `herding` `agriculture` (EA001-005) | 1,404 |
| Gathering resources | `dominant_activity` (EA042), `agriculture_intensity` (EA028) | 1,289 / 1,187 |
| Food | `major_crop` (EA029) | 1,178 |
| Animals | `domestic_animals` (EA040), `milking` (EA041) | 1,181 |
| Habitat | `settlement_pattern` (EA030) | 1,186 |
| Habitat | `house_plan` (EA079), `house_walls` (EA081), `house_roof` (EA083) | 1,195 / 1,080 / 1,158 |
| Groups | `community_size` (EA031) | 610 |
| Groups | `descent` (EA043), `marital_residence` (EA012) | 1,272 / 1,265 |
| Groups | `camp_size_aggregated` (B011), `cooperating_group` (B010): Binford foragers | 293 / 224 |
| Politics and philosophy | `levels_beyond_local` (EA033), `class_differences` (EA066) | 1,154 / 1,107 |
| Religion and ritual | `high_gods` (EA034) | 775 |
| War and conflict | `internal_war` (SCCS891), `external_war_attacking` (SCCS892) | 160 / 157 |
| Markets and trade | `trade_as_food` (SCCS1), `trade_in_subsistence` (SCCS732) | 183 / 93 |
| Daily schedule | `mobility` (B009), `moves_per_year` (B013) | 334 / 258 |
| Place, time, density | `density_per_km2` (B008) | 334 |

Ways of life: `foraging` 378, `fishing` 111, `herding` 98, `farming` 713, `urban` 104 (an indigenous town over 5,000 people, EA031 of
7 or 8; the Atlas has no category for cities, so the `urban` pool is Aztec, Inca, Babylonians, Hausa, Punjabi, ...). Non-Atlas groups
take foraging or fishing from Binford's "most important activity".

## How analogs are ranked

`nearest_analogs(export, lat, lon, year, way, biome=, temp_c=, precip_mm=, k=3)`; `describe()` prints the result with its caveat.

- **Pool:** societies of the asked way of life (`forager`, `fisher`, `herder`, `farmer`, `mixed` (as the atlas, farming), `city`).
- **Score** (0 to 1, a weighted mean of the parts that apply; a part the place or the society lacks is dropped and the rest rescaled):

  | Part | Weight | 1 means | 0 means |
  |---|---|---|---|
  | subsistence | 0.30 | all of the society's food is the asked way's activities (foraging: gathering+hunting) | none of it |
  | proximity | 0.25 | same spot; falls to 1/e at 4,000 km | far |
  | temperature | 0.15 | same annual mean | 10 °C apart |
  | precipitation | 0.15 | same annual total | 10x apart in (mm + 100) |
  | biome | 0.15 | same coarse family (tropical forest, savanna, desert, temperate forest, temperate grassland, mediterranean, boreal, tundra); half for neighbours | unrelated |

  TEOW (societies) and BIOME4 (the app's Krapp biomes) names both map to those families (`BIOME_FAMILIES`). Climate and biome are
  **inputs for the place and year** (for the app, from [habitat-lookup](habitat-lookup.md)), so a place in an ice age is matched on
  its ice-age climate against each society's 1900-1949 climate. Without them the ranking is way of life and distance only, and says so.
- **Why proximity counts although the task asked for biome, climate and subsistence:** climate and biome alone rank the Zuni (11,000 km
  away) first for Anatolian farmers in 7000 BCE. Neighbours share crops, animals and history; the weight is the largest judgement call
  here and is one constant (`WEIGHTS`).
- **Weights are judgement, not fitted.** There is no ground truth for "most similar", so no accuracy figure; the checks below are plausibility.

## Sanity checks: three places (climate from Beyer 2020 / Krapp 2021 via the habitat lookup)

Full output: `evidence/sanity-places.txt` in the job workspace; the same cases are in `test_ethnography.py`.

| Place and year | Way | Environment given | Top three |
|---|---|---|---|
| Kalahari, 20.5°S 21.5°E, 6000 BCE | foraging | tropical xerophytic shrubland, 22.2 °C, 249 mm | /'Auni-Khomani 0.89, G/wi 0.89, !Ko 0.88: San peoples, all fully mobile, camps of 21-54 people |
| Kazakh steppe, 48.5°N 70.5°E, 1000 BCE | herding | desert, 3.3 °C, 252 mm | Kazakh 0.84 (67 km, seminomadic, 3 levels above the community, frequent internal war), Khalka 0.72, Hazara 0.65 |
| Southern Mesopotamia, 31.5°N 46.5°E, 2500 BCE | city | desert, 23.7 °C, 168 mm | Babylonians 0.83 (a 2000 BCE history, towns over 50,000), Ancient Egyptians 0.74, Punjabi 0.73 |

Reading them: the first two are the answers an anthropologist would give, for the right reason (same desert, same mobile way of life).
The third works because the Atlas happens to hold two ancient states; remove them and a 1950 Punjabi town would be the "city". Where a way
of life is not in the sample near a place, the best score is low and the warning says so.

## In the day prompt

`deploy/budgie/api/grounding.py` + `day_api.prompt()` (prompt version 3). For a click, the atlas record gives the cell, era and way of life
(HYDE rule; "mixed" is farming); `Atlas.environment` gives the climate (modelled years: Krapp biome and Beyer temperature and rain, so an
ice-age cell is matched on its ice-age climate; HYDE years: only the present-day TEOW biome). The ranking runs at the cell centre, so one cell
and era always get the same societies, which keeps the day cache valid.

- `nearest_recorded_societies`: the top 3, each with `cite_as` ("like the Hadza (recorded 1910s)"), region, distance, score, how many years after
  the day it was recorded, and up to 6 recorded traits (settlement pattern, community or camp size, moves per year, dominant activity, crop,
  livestock, house walls). The caveat is included once. The system prompt asks the model to cite each society it used in `grounded_in`, to say in
  the uncertainty note that the analog is a later record, and not to copy named customs or events. The day stays labelled speculative.
- `typical_adult_time_use`: measured hours from [time_use.yaml](../../footstep-generator/anthropology/time_use.yaml) (research 0005), for foraging
  and farming only, with the study range, scope and sources. Herding, fishing and cities have no figure, so the key is left out and the model is
  told to give no hours. `recalled` figures and `sex_note` never reach the API (`time_use.py` filters them). The farming row is from Agta
  foragers who took up farming and says so.
- **No work is assigned by sex.** Neither source passes a sex difference to the prompt (the ethnography export holds no sex variables; the
  YAML's `sex_note` is dropped), and the system prompt forbids it.
- **Token budget.** The facts (user message) are held to `PROMPT_TOKEN_BUDGET` (2,000, estimated at 4 characters a token). Typical prompts are
  900-1,100 tokens; the largest modelled-era cells reach about 2,150 with three societies, so `fit_budget` drops the lowest-ranked society
  (keeping at least one) until it fits. A test samples 300 cells and eras.
- Deploy: push to `main` (the API image is built by `.github/workflows/deploy-budgie.yml`). The Dockerfile copies `analogs.py`, `grounding.py`, `ethnography.json.gz` and `time_use.json`
  (a test checks the list). Old cached days are not served (`PROMPT_VERSION` 3).

## Limits

- **Climate is a model of 1900-1949.** ecoClimate's CCSM run against Beyer 2020 BIO1 and BIO12 at the same 1,274 societies:
  temperature mean difference -0.7 °C (sd 2.3 °C, r = 0.97); precipitation about 16% high (log ratio +0.15, sd 0.37, r = 0.86 on logs). The unit is
  ml/m²/month, converted to mm a year (x12/1000); individual societies can be off by 2x (the !Kung read 1,044 mm; the real figure is nearer 500).
  Good enough to separate desert from forest, not to separate 400 mm from 600 mm. (`evidence/ecoclimate-vs-beyer.txt`.)
- **Most coded variables are coarse codes** ("Frequent", "Three levels"), one value per society, from one period and one community.
- **Sampling.** The Atlas is good for Africa and western North America and thin elsewhere; no society is recorded for much of Europe's
  deep past and none is a Paleolithic forager. Binford's foragers are 19th-20th century people pushed to marginal land.
- **SCCS values are matched by `xd_id`**, which can pair a different community or year than the Atlas coded.
- **Coverage varies** by variable (above); a missing code is left out, never zeroed.
- **Not used:** the Atlas's sex-difference variables (EA044-054, left out until gender is shown with care), games (EA035), the SCCS's other
  ~1,700 variables, and Pulotu (Pacific religion). See [human-constants](../philosophy/human-constants.md#what-d-place-can-ground).
