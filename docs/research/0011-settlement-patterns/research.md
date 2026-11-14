---
id: settlement-patterns-research
type: note
purpose: "Sources, model decisions and limits for the flagged settlement experiment."
---

# Settlement patterns: source audit and method

Research date: 2026-11-14. Steady task: `33fe4184-9337-42ff-88a2-7800c8a3ff45`.

## Premise check

The existing Units implementation uses target sizes of 30/60/300, but actual group
populations are equal shares of the cell, with capped group counts. Under 15 people,
stochastic whole groups conserve population in expectation rather than per cell.
Urban classification uses a 40,000-person cell threshold. Thus “every group is one
fixed size” is not literally true; lack of varied group sizes and named cities is.
EA030, EA031, B010, B011 and B013 already exist in the committed ethnography export.

## Sources and confidence

### Historical cities

[Reba, Reitsma & Seto (2016)](https://doi.org/10.1038/sdata.2016.34) geocodes
Chandler (2250 BCE–1975 CE), Modelski Ancient (3700 BCE–1000 CE), and modern
additions. These are city-centre points, not urban footprints. Geographic certainty
does not measure population-estimate error. Sparse coverage and differing urban
definitions prevent treating the catalog as a complete urban census.

The generator pins two CC BY 4.0 CSVs:

| Source | Download | MD5 |
| --- | --- | --- |
| Chandler V2 | [5407640](https://ndownloader.figshare.com/files/5407640) | `aeff29534fb11c4f320cd79fbcba9c8b` |
| Modelski Ancient V2 | [5356132](https://ndownloader.figshare.com/files/5356132) | `f5757dbeeeacb6dc33c26522866eff57` |

Licences and file identities were checked against the [Chandler metadata](https://api.figshare.com/v2/articles/2059494)
and [Modelski metadata](https://api.figshare.com/v2/articles/2059497). Both CSVs use
CP1252. Values are already people; blank cells mean missing observations, never zero.
Post-1900 observations are outside the app's current scope and excluded.

**Model choice:** coordinates rounded to 0.01° identify a common city claim across
sources. Chandler wins same-year collisions; Modelski supplies other dates. This is
a reproducible precedence rule, not a verdict that Chandler is more accurate.
Coordinate deduplication can merge distinct nearby settlements or miss aliases with
different geocodes; historical city identity remains uncertain. The browser may
interpolate only between nearby dated observations (at most 500 years), never outside
the observed lifespan. Interpolated population and catchment allocation are modelled.

### HYDE urban/rural availability

A read-only NAS inventory found **60 files: 30 `urbc_*` and 30 `rurc_*`**, including
10,000 BCE, year 0 and 1900 CE, under
`/volume2/deep-footsteps/data/raw/hyde-3.5/`.
Evidence: workspace `evidence/hyde-urban-rural.txt`. This establishes file presence,
not semantic validation of their values. This experiment keeps the existing decoded
population budget and does not silently substitute unexamined urban/rural grids.

### Regional settlement profiles

The committed D-PLACE export supplies EA030 settlement pattern and EA031 community
size. Their categories include nomadic, seminomadic, semisedentary, impermanent,
dispersed homesteads, hamlets, villages/towns and complex permanent settlements.
EA031 is categorical, not a measured mean. The generator uses representative sizes
30, 75, 150, 300, 700, 2500, 15000 and 75000; these are explicit model parameters.

For each 5° cell and app way of life, the existing `nearest_analogs` scorer selects
three societies with observed EA sizes and patterns, ranking subsistence and distance. Their
normalized scores weight the mixture; they are similarity scores, not probabilities
of historical truth. Fishing societies join the app's forager category. Regional
profiles are not time-varying reconstructions: the population grid supplies which
way of life exists, and the analog supplies a possible settlement pattern. EA030
does not report annual moves: this field remains null rather than guessed.

### Deep-time forager variety

[Binford's D-PLACE v3.2 release](https://zenodo.org/records/17580172) is derived from
*Constructing Frames of Reference* (2001). Its [variable definitions](https://github.com/D-PLACE/dplace-dataset-binford/blob/v3.2/cldf/variables.csv)
distinguish B010 dispersed consumer groups, B011 annually aggregated camps/villages,
B012 periodic regional aggregation and B013 residential moves per year. For sedentary
societies B010 describes mobile task groups, so it must not become village size.
The available table contains **no storage or climate variables**. Climate is joined
through the export's ecoClimate fields. D-PLACE reuse is
[CC BY-NC 4.0](https://d-place.org/sources/dplacedatasetbinford).

The climate table uses only Binford societies with usable size/mobility and climate
observations. Holding geography and subsistence contributions equal makes the
existing analog scorer's climate terms determine rank. Temperature bins span
−20–35 °C by 5 °C and precipitation 0–3000 mm/year by 250 mm. Each bin carries the
three closest analogs. This is an environmental analogy, **not a validated predictive
regression or Binford's original environmental-frames equations**.

Mobile societies contribute equal-weight dispersed and aggregation scenarios; no
source gives their duration, so the 50/50 split is explicitly invented. Sedentary
societies contribute B011 size alone. The scenarios divide one population budget;
seasonal camps never add people. Storage remains **unknown (`null`)**. Climate alone
cannot identify salmon rivers, ancient coastlines or wild-cereal patches. Rich-resource
foragers can be represented through sedentary/fishing analogs, but their precise
resource geography is unvalidated and is not claimed to be reconstructed here.

## Archaeological checks and limits

| Case | Source-grounded expectation | What the model can establish |
| --- | --- | --- |
| Ohalo II, about 23 ka cal BP | Plant assemblages support year-round occupation in a lakeshore setting: [Snir et al. 2015](https://doi.org/10.1016/j.jas.2014.09.023) | A model must permit prolonged-residence foragers well before agriculture; climate alone does not locate this lakeshore |
| Mezhyrich, about 18 ka cal BP | One structure's refined chronology permits brief/repeated occupations; durable remains do not prove permanent residence: [Chu et al. 2025](https://ore.eu/article/view/996) | Aggregation is plausible; no measured group count or annual move rate is supplied. The paper has mixed open peer-review assessments |
| Incipient Jōmon | Late-Pleistocene pottery processed aquatic resources: [Craig et al. 2013](https://www.nature.com/articles/nature12109), [Lucquin et al. 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6077741/) | Aquatic foragers belong in the analog pool; pottery must not trigger a whole-Japan sedentary switch |
| Natufian | Site-specific food procurement and seasonality vary: [Shubayqa 1 study](https://doi.org/10.1080/00758914.2017.1368820) | Permit diverse settlement modes; no Levant-wide binary transition is justified |

These are qualitative falsification checks, not fitted validation targets or claims
that a rendered group is an excavated settlement. Use calibrated BP carefully:
calendar year = 1950 − cal BP.

[Research 0009](../0009-model-vs-evidence/research.md) already compares regional
model population against calibrated p3k14c occupation evidence. It reports strong
research-effort bias, many province centroids, no hominin attribution and absent
pre-Holocene Japanese coverage. Site counts cannot validate camp population,
mobility, storage or precise settlement locations. Because this experiment conserves
the original population budget, those regional population comparisons remain the
appropriate baseline; moving people into modelled groups does not supply new
archaeological support. Before roughly 50 ka radiocarbon cannot test the model.

## Decision and reproducibility

**GO for a labelled comparison experiment; NO-GO for claiming recovered historical
settlement locations beyond the named city observations or a fitted storage model.**
Confidence is high in data availability and budget conservation as an engineering
invariant, moderate in broad variety, and low in local historical size/mobility.

```bash
python3 footstep-generator/anthropology/settlements.py --fetch
poetry run python footstep-generator/anthropology/settlements.py --check-sites ../evidence/settlement-sites.json
poetry run pytest footstep-generator/tests/test_settlements.py -q
```

The catalog records source file hashes, the ethnography export hash, society IDs,
names, record years and bibliography keys. Raw source CSVs are not committed.
The build output is captured in workspace `evidence/catalog-build.txt`.
The optional site diagnostic reads actual habitat WebP pixels and reports selected
climate bins, analog identities, sizes and moves. It is a scenario inspection, not
a test that archaeological sites had those populations or mobility patterns.
