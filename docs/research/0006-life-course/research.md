---
id: research-life-course
type: note
purpose: "Define honest demographic priors and propose age sampling and a life-course view"
scope: ["demography", "people generation"]
non_goals: ["changing people.ts", "reconstructing individual lifespans"]
tags: ["research", "modelled"]
---

# Life course: who is alive, and how long might they live?

## Question

What age structure, mortality and fertility priors can support believable people for foragers, early farmers, established agrarian populations and pre-modern cities?

## Context

[Direct] Commit `0ebc06d02b95170055b7f2a67405661721616db5` already rejects undersized groups and makes the first displayed person an adult. That resolves the reported solitary toddler separately. It does **not** source or differentiate age structure: [people.ts](../../../footsteps-web/components/footsteps/layers/people.ts) lines 45–61 still sample six fixed age bands for every group; lines 115–119 apply the adult-first rule. The task is valid as research, not another group-size fix.

[Direct] `GroupInView` carries position, kind and population, but no year or subsistence. The generator only draws bands and villages, with caps of 160 per group and 40,000 per view. Urban residence is therefore a future demographic context, not a currently rendered people category.

This supports the [vision](../../philosophy/vision.md): demographic profiles are **modelled**, while an individual person and their day remain speculative.

## Scope

Investigate broad pre-transition priors, including source limitations. Deliver [demography.yaml](../../../footstep-generator/anthropology/demography.yaml) as a research data contract and propose a separate implementation. No app, API, generated atlas or deployment changes. Profiles are contextual categories, not global eras assigned by date alone.

## Findings

### Mortality and fertility evidence

[Supported] [Gurven & Kaplan (2007)](https://www.gurven.anth.ucsb.edu/sites/secure.lsit.ucsb.edu.anth.d7_gurven/files/sitefiles/papers/GurvenKaplan2007pdr.pdf), Table 2, gives hunter-gatherer e0 values of 21–37 and e15 of 28.6–42.5 remaining years. These are recent analogues, not prehistoric measurements. Figure 9 reports mean forager TFR 5.7, with wide variation. Low e0 does not imply adults usually died at 30. These observations constrain the forager prior, not a universal ancestral life table.

[Supported] [Bocquet-Appel (2011), Science](https://doi.org/10.1126/science.1208880), interprets increased cemetery juvenile proportions around farming adoption as a fertility rise of about two births per woman. This supports a younger-population scenario; it does not measure our five living-age shares or establish an absolute Neolithic TFR. His [agricultural transition synthesis](https://doi.org/10.1086/659243) concerns local transitions, so there is no defensible worldwide date switching every farmer to a new profile.

[Direct] [Landers (1987)](https://doi.org/10.1017/S0025727300071088), Table 10, reconstructs London Quaker mortality. Male/female e0 midpoints in 1700–49 are 20.6/21.9; in 1750–99, 29.7/29.9. England comparisons span roughly 32–40 over the listed periods. Table 10 reports **e30**, not e15. [Inferred] The urban prior allows a mortality penalty and a larger young-adult share through migration; neither effect has a universal size. Religious, regional and recording selection make London an anchor, not a template for Rome or every city.

[Supported] [Wrigley & Schofield (1983)](https://doi.org/10.1080/00324728.1983.10408745) pool 13 English parish reconstitutions, 1600–1799, to examine fertility, mortality and marriage. Only the abstract was available in this search; no numerical TFR was transcribed from it. Our agrarian and urban fertility envelopes are editorial scenarios. Marital fertility must not be substituted for all-women TFR.

### Siler models: mortality is not the age distribution

[Supported] [Siler (1979)](https://doi.org/10.2307/1936612) introduces competing mortality risks. The human implementation in Gurven & Kaplan uses a declining childhood hazard, constant background risk and rising adult hazard. A useful parameterization is

`mu(a) = A exp(-B a) + C + D exp(E a)`.

[Inferred] Integrating the hazard gives survivorship `l(a) = exp(-integral_0^a mu(x) dx)`. Remaining life expectancy is `e(x) = integral_x^infinity l(a) da / l(x)`. For a closed stable population growing at rate `r`, living-age density is proportional to `exp(-r a) l(a)`. Death-age density is instead proportional to `l(a) mu(a)` for a birth cohort. These distributions answer different questions.

There is no fitted Siler parameter set in this deliverable. e0 and e15 alone do not identify five hazard parameters, fertility timing, growth or migration. Do not fabricate a survival curve from the YAML summary metrics. A future calibrated model must reproduce its life-table targets and use a separate migration treatment for cities.

### Skeletal palaeodemography

[Supported] [Wood et al. (1992), The Osteological Paradox](https://doi.org/10.1086/204084), identifies selective mortality, hidden frailty and demographic nonstationarity as obstacles to inference. Burial practice, preservation, infant underrepresentation and adult age-estimation uncertainty further complicate a cemetery's age profile. Pathology may reflect survival with disease, rather than simply worse health.

[Supported] [Fitting to a Distribution of Deaths by Age… (2005)](https://doi.org/10.1086/444367) explains why cemetery mean age at death equals e0 only under restrictive stationarity and migration assumptions. Thus a high juvenile death fraction can reflect fertility change; it is not directly the fraction of living children. These caveats limit inference without making skeletal evidence useless. Publisher access was limited; the accessible abstract supports the stationarity point, not extraction of a life table.

### Prior construction and limitations

[Inferred] All five-bin age vectors in YAML are **editorial scenarios**, chosen to sum to one, include substantial childhood and retain older adults. They are not digitized censuses, skeletal counts or fitted stable populations. Early farming is illustrated with more children; urban residence with more young adults. Their differences are hypotheses to test, not measured rankings of societies.

| Profile | Living shares: 0–4 / 5–14 / 15–29 / 30–49 / 50+ | e0 | e15 remaining | TFR |
| --- | --- | --- | --- | --- |
| Forager | 14 / 24 / 26 / 24 / 12% | 30 (21–37) | 38 (28–43) | 5.7 (3.5–8) |
| Early farmer | 18 / 27 / 25 / 21 / 9% | 27 (20–35) | 35 (28–43) | 6.5 (5–8.5) |
| Agrarian | 15 / 24 / 25 / 24 / 12% | 32 (25–40) | 38 (30–45) | 5 (4–7) |
| Urban | 13 / 20 / 32 / 25 / 10% | 25 (20–35) | 33 (25–42) | 4.5 (3–7) |

Except the forager analogue summaries, these central metrics and broadened ranges are low-confidence editorial synthesis. Every YAML metric has source IDs and a range; age-share provenance always includes `EDITORIAL2026`. This is a usable prior library, not new historical evidence. Ranges are sensitivity envelopes, not statistical confidence intervals or independent uniform distributions. The central shares sum to one; arbitrary combinations of endpoints will not.

Life-table metrics, TFR and snapshot shares have **not** been jointly calibrated. Never use them together to simulate population growth, births or deaths as if consistent demographic schedules. HYDE/modelled map head counts remain authoritative. Regional epidemics, famine, warfare, migration and sex differences are not represented. These priors should not be extended into modern public-health transitions by a date-only rule.

## Conclusions

[Inferred] Use these explicitly modelled priors for a follow-up age-sampling experiment. They improve provenance and allow sensitivity checks, but the evidence does not justify precise per-cell demographic claims. Do not display an individual's predicted death age or present an editorial early-farmer life expectancy as measured.

## What We Don't Know

- No retrieved source supplies the exact five living-age bins for all four categories. All such shares remain scenarios.
- Early-farmer e0/e15, pastoralist and fishing-specific profiles, and ancient urban migration schedules are unresolved. Searches covered Neolithic fertility, skeletal life-table methods, Siler models and historical English mortality/fertility; none produced a global cross-era dataset.
- Wrigley full numerical tables and Siler original full text were not accessible through the publisher search. Siler's operational formulation was checked in Gurven & Kaplan; no parameters were copied from an inaccessible source.
- No local evidence identifies when a cell has completed a demographic transition. The atlas's way-of-life classification is not a mortality observation.
- A uniform draw within a broad bin is an approximation, especially for infants and the open 50+ interval.

## Recommendations

### Follow-up proposal: age sampling (no people.ts edits here)

1. Compile the YAML into a small validated JSON/TypeScript asset at build time. Keep one source of truth; do not fetch YAML per hover or duplicate constants. Preserve profile IDs and modelled provenance in the generated schema.
2. Pass an explicit demographic context into `peopleForGroups`: year, selected profile ID and provenance. A band is not proof of foraging, nor a village proof of farming. Resolve way of life from atlas facts; keep fishing, herding and mixed contexts explicitly unsupported until researched rather than silently equating them to farmers. Unknown contexts need an explicit product decision and label before rollout.
3. Select early-farmer versus established agrarian only with regional transition evidence. Do not introduce a universal BCE cutoff. Keep urban selection independent of subsistence and require urban residence evidence; current city glow does not draw individual people.
4. For each non-anchor person, use the central age-share CDF, then draw integer ages within `[0,5)`, `[5,15)`, `[15,30)`, `[30,50)`. Proposed provisional 50+ tail: `age = 50 + floor(-12 * log(1-u))`, rejecting ages above 100. This is an **editorial** declining tail, not a fitted mortality model. It allows 80+ without equal probability at every older age. Keep this tail choice in generated model metadata and review sensitivity to scales 8 and 16 before adoption. Sampling living ages must never use a death-age histogram.
5. Preserve `0ebc06d`'s minimum-group guard, adult-first display anchor, caps, positions and IDs. Give age sampling its own deterministic random stream keyed by stable group/person identity, so a changed number of age draws cannot move people or alter sex. Do not reseed by every slider year: persist each person's quantile while the profile changes. The adult anchor is an intentional display bias; exclude it from statistical checks or evaluate its conditional distribution separately. Do not claim the displayed truncated group is an unbiased census or a reconstructed family.
6. Proposed verification: fixed-seed repeatability; all ages nonnegative; five-bin frequencies within sampling tolerance over many independent non-anchor people; rare 80+ retained; tail sensitivity; unchanged adult anchor, minimum sizes and truncation; same IDs/coordinates when changing profile. Check boundaries at 5/15/30/50 and context selection. Then inspect bands/villages with real data across Units/Grid/Dots and label the card “Modelled age structure; individual speculative.” Existing role thresholds (13/55) need an explicit review rather than changing them incidentally.

The YAML has no runtime consumers today: the blast radius is documentation and a future data contract. A future consumer must not bypass profile selection or mistake ranges for observed uncertainty. No frontend build or live-data smoke check is applicable to this research-only change.

### Life-course visual idea

[Speculative] A compact “People alive” strip with five proportional segments uses the same living-age shares as sampling, with age labels and accessible numeric text. A separate pair of text callouts reads “At birth: about 21–37 years” and “Having reached 15: about 28–43 more years” for the forager analogue. Label the whole panel **Modelled · analogue evidence**, and expose source and range on demand. Other profiles must say **scenario** for editorial life-expectancy ranges.

Do not draw a survival curve until a complete life table is calibrated. The strip shows a population snapshot; it must not animate people dying as the timeline advances or imply that a 30-year-old has reached their expected lifespan. Childhood, learning, caregiving and older adulthood can accompany the strip as qualitative constants, without assigning universal marriage, work or parenthood ages. This offers quantitative context without turning a speculative person into a medical prediction.

### Verification

Run `poetry run python docs/research/0006-life-course/validate.py` to parse the YAML and check profile coverage, source references, bins, normalization, ranges and demographic units. Run `git diff --check`. No people-generation integration is implemented or claimed; the sampling and visual checks above are acceptance criteria for the follow-up proposal.
