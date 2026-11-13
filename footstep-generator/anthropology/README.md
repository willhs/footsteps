# Anthropology atlas

Basic facts about how people lived, per 5° cell × era, for the person portrait and the
"Imagine their day" prompt. Served by the day API:

```
GET /api/anthropology?lat=-20&lon=21&year=-8000
```

Every field is `{"value", "source", "note"?}`. `source` is a dataset name (several joined by
`; `), `model` (gap-filled by Claude), `derived` (confidence only) or `none` (unknown).
The rules that turn data into fields live in `deploy/budgie/api/atlas.py`; this directory
builds the data they read (`deploy/budgie/api/anthropology.json.gz`, committed, ~0.3 MB).

## Cells and eras

- Cells: 5° squares keyed by their south-west corner (`"-20,20"`).
- Eras: 1,000-year buckets before 1 CE, 100-year after, floored (2500 BCE → 3000–2000 BCE,
  1850 → 1800–1899). These are exactly the 30 HYDE years, 10,000 BCE–1900.
- Coverage: 904 land cells (any HYDE people or land use in any era) × 30 eras. Open ocean and
  Antarctica return 404.

## Sources, in priority order

| Source | Gives | Licence |
|---|---|---|
| [HYDE 3.5](https://landuse.sites.uu.nl/hyde-project/) population + land use (`data/tiles/grid/humans_*.webp`, `landuse_*.png`) | way of life (shares of cropland, grazing, irrigation), people, typical settlement | Open data; cite Klein Goldewijk et al. |
| [D-PLACE Ethnographic Atlas](https://github.com/D-PLACE/dplace-dataset-ea) (1,291 societies, mostly 1850–1950) | settlement pattern, house walls/roof/plan, staple crop, livestock, milking | **CC BY-NC 4.0** |
| [D-PLACE TEOW](https://github.com/D-PLACE/dplace-dataset-teow) | present-day biome at the nearest society | CC BY-NC 4.0 |
| [Seshat Equinox 2020](https://zenodo.org/records/6629022) (35 sites, per century) | polity names, language family, settlement hierarchy, largest settlement, metals, writing, markets | **CC BY-NC-SA 4.0** |
| Claude Haiku via OpenRouter | clothing, hair and adornment, tools by role, skin and hair palettes, and anything above that is missing | generated; speculative |

The atlas is a derived work of CC BY-NC and CC BY-NC-SA data, so it is **CC BY-NC-SA 4.0**:
fine for this non-commercial site; keep the attribution in `sources` (the API returns it).
The task notes called D-PLACE CC-BY; the current D-PLACE datasets are CC BY-NC.

## How the rules use the data

- **Way of life** (HYDE): farming when the cell has ≥ 0.1 ha of cropland per person; herding
  when ≥ 5% of its land is grazed and grazing is ≥ 20× cropland; both → mixed; neither →
  foraging. Eras ≥ 1800 with a D-PLACE fishing society within 500 km turn foraging into fishing.
- **Settlement** (HYDE): from way of life and the *lived* density (people-weighted: the people
  per km² the average person lives among, so empty desert does not dilute it). Eras ≥ 1800 with a
  same-way-of-life D-PLACE society within 500 km use its recorded settlement pattern instead.
- **Ethnographic analogue** (D-PLACE): the nearest society with the cell's way of life, within
  2,500 km, gives dwelling and (for farmers and herders) diet. Before 1800 the note says it is an
  analogue from the 19th–20th c.; confidence is low or medium.
- **Climate** (TEOW): biome at the nearest society within 1,000 km; flagged as present-day, and
  colder/drier before 8000 BCE.
- **Seshat**: the cell holding a Seshat site gets polity and technology for eras the site covers.
- **Model gap-fill**: on the first request for a cell × era, if a key is set and the day API's
  daily cap allows, one Haiku call fills the `none` fields from the real facts. Cached in the
  API's SQLite (`anthro` table); data always wins over the model; polity is never model-filled.
- **Confidence** (`derived`): high for a Seshat site in CE eras or a recent nearby ethnography;
  medium for CE eras with an analogue; low otherwise.

## Rebuild

```bash
# HYDE images: generate with grid_image.py, or copy the published ones from budgie
rsync -az --include='humans_*.webp' --include='landuse_*.png' --exclude='*' \
  will@budgie:projects/deep-footsteps/deploy/budgie/app/grid/ data/tiles/grid/
poetry run python footstep-generator/anthropology/build.py fetch   # D-PLACE + Seshat zips -> data/raw/
poetry run python footstep-generator/anthropology/build.py         # -> deploy/budgie/api/anthropology.json.gz
poetry run pytest footstep-generator/tests/test_anthropology.py -q
API_ONLY=1 scripts/deploy-budgie.sh
```

Changing the record's meaning for existing cells? Bump `VERSION` in `build.py`: the gap-fill
cache key includes it, so old model answers are not reused.

Not used yet: D-PLACE's Binford hunter-gatherer dataset (better forager detail for the deep past).

## Life-course research priors (not integrated)

`demography.yaml` contains modelled living-age shares, life expectancy at birth and at
15 (remaining years), and fertility scenarios for foragers, early farmers, established
agrarian populations and urban residents. Each metric has a range and source IDs;
editorial scenarios are distinguished from reported analogue summaries. These are not
jointly calibrated life tables and must not drive births, deaths or population totals.
The builder, API and frontend do not read this file yet.

See [life-course research](../../docs/research/0006-life-course/research.md) for evidence,
limitations, an age-sampling follow-up proposal and the life-course visual idea.
Validate with `poetry run python docs/research/0006-life-course/validate.py` from the repo root.
