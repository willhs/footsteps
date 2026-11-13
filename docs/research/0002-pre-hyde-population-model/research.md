---
id: research-0002-pre-hyde-population-model
type: research
purpose: "How to make a labelled, modelled estimate of how many people lived where, 100,000–10,000 BCE"
date: 2026-11-12
---

# A modelled population before HYDE (100,000–10,000 BCE)

## Question

How would we best estimate how many people lived where before HYDE starts (10,000 BCE), at roughly 0.5° and every 1,000 years, so the map can show a clearly labelled best guess?

## Context

[Research 0001](../0001-deep-prehistory-sources/research.md) (9 Nov) covered datasets: climate (Beyer 2020, Krapp 2021), sea level (Spratt v2), site catalogues (ROAD, p3k14c), genetics (Ne is not census) and the Timmermann & Friedrich 2016 dispersal model. It concluded there's no evidence base for a *measured* population surface and recommended an evidence-only view.

The [vision](../../philosophy/vision.md) (12 Nov) allows *modelled* layers if they're labelled. So this note asks the next question: what is the most defensible model? Sources below came from a web research pass on 12 Nov. Items marked **unverified** came from secondary sources or memory.

## Findings

### 1. Forager density follows plant productivity

- **Tallavaara, Eronen & Luoto 2018, PNAS** ([PMC5819417](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819417)).
  - **Data:** about 300 ethnographic hunter-gatherer groups (Binford 2001, Kelly 2013).
  - **Main predictor:** net primary productivity (NPP) from the Miami model, which needs only mean annual temperature and precipitation.
  - **Fit:** a piecewise regression where density rises with NPP up to about 1,360 g/m²/yr, then levels off. NPP alone explains 44% of the variation.
  - **Other predictors:** biodiversity (matters below the break) and pathogens (lower density above it). With them the model reaches cross-validated R² 0.46.
  - **Data:** script, rasters and the forager table are on [Zenodo](https://zenodo.org/record/1069786) under **CC BY 4.0**. Present-day only; no hindcast.
- **Tallavaara et al. 2015, PNAS, Europe** ([PMC4500234](https://pmc.ncbi.nlm.nih.gov/articles/PMC4500234/)).
  - **Method:** a niche model on 127 groups, run with 1,000-year climate steps.
  - **Densities:** 2.8–5.1 people/100 km² on occupied land.
  - **Europe totals:** about 330k at 30 ka, 130k at the LGM (23 ka), 410k at 13 ka.
- **Kavanagh et al. 2018, *Nature Human Behaviour*.** Explains 77% of the variation across 220 forager societies and hindcasts global density 21k–4k BP. Data access unverified.
- **Eriksson et al. 2012, PNAS** ([PMC3479575](https://pmc.ncbi.nlm.nih.gov/articles/PMC3479575)).
  - **Model:** carrying capacity as a piecewise function of Miami NPP, under a 120 ka climate model. The dispersal it fits matches the archaeology.
  - **Data:** none released.
- **Ordonez & Riede 2022** (Europe, 21k–8k BP) and a 2021 bioRxiv global machine-learning density model exist. Neither is checked.

**Takeaway:** "density ≈ f(NPP)" is the standard, published, reproducible core. Its coefficients are CC BY.

### 2. World totals: published ranges, wide and partly unverified

| When | Range | Source |
|---|---|---|
| ~130 ka | 100–300k (census, from genetics) | Sjödin 2012, secondhand |
| ~70 ka | 0.3–1 M | our synthesis, not a published consensus |
| ~40 ka | 1–3 M | synthesis; Biraben ~1.5 M at 50–40 ka **unverified** |
| LGM (~21 ka) | Old World 3.0–8.3 M (forager densities) or 2.1–3.0 M (carnivore densities); Sahul ≤ ~47k | Gautney & Holliday 2015, secondhand |
| ~12 ka | 4–6 M | synthesis; Deevey 5.3 M at 10 ka **unverified** |
| 10,000 BCE | 4.6 M | HYDE 3.5 (our grid) |

- **Sahul disagreement:** carrying-capacity work (Bradshaw et al. 2021) allows up to ~6.5 M. That is more than 100× Gautney's figure. It's an upper bound, not an estimate.

### 3. When people got where (Homo sapiens)

| Region | Arrival (central, range) | Confidence |
|---|---|---|
| Africa | throughout | high |
| Levant/Arabia (early, non-lasting exits) | 120–80 ka | medium |
| Main out-of-Africa exit | ~50 ka (Neanderthal admixture 50.5–43.5 ka, Iasi 2024; Sümer 2025) | high |
| South Asia | ~50–45 ka | memory, unverified |
| Sahul (Australia/New Guinea) | 50–47 ka, or 65 ka at Madjedbebe (disputed) | contested |
| Europe | ~47–45 ka (possibly 54 ka at Mandrin) | memory, unverified |
| East Asia | ~40 ka | memory, unverified |
| Siberia / Arctic | ~45 ka (Ust'-Ishim) / ~32 ka (Yana) | memory, unverified |
| Japan | ~38 ka | memory, unverified |
| Tibetan plateau | 40–30 ka (possibly Denisovans) | medium |
| Americas | White Sands footprints 23–21 ka (Pigati 2023), widespread after ~16–14 ka | footprints debated |

**Other people:**
- **Neanderthals:** to ~41–39 ka (Higham 2014).
- **Denisovans:** to ~48–32 ka at Baishiya (unverified).
- ***H. floresiensis*:** tools to ~50 ka (unverified).

Before ~45 ka a "people" map is also a map of other hominins.

### 4. Existing gridded reconstructions

- **Timmermann & Friedrich 2016:** the only global gridded density for this period.
  - **Grid:** 1°, 1 ka steps, 1–120 ka BP, early-exit (`a`) and second (`b`) scenarios.
  - **Licence:** the portal says **CC BY-NC**. That's fine for a personal non-commercial site, but it ties Footsteps to non-commercial use. No published scenario totals and no newer release found.
- **GLUES** (9500–2000 BC) and **KK10** (8 ka onward) only overlap HYDE.
- **Eriksson 2012:** no data release.
- Nothing else found.

## Conclusions

[Inferred] Build our own layer. It's small, transparent and CC BY all the way down:

1. **Potential density per 0.5° cell, every 1 ka.**
   - Compute Miami NPP from palaeo temperature and precipitation, then apply Tallavaara 2018's NPP-only fit.
   - Beyer 2020 already ships NPP and biomes (CC BY, 1.33 GB, 2 ka steps before 22 ka). The local Krapp file is biomes only.
   - Biodiversity and pathogen predictors don't exist for the past, so use NPP alone.
2. **Mask:** ice and sea from the terrain pipeline (Krapp masks, ETOPO and sea level). Also zero out cells outside the ethnographic climate range (very cold or arid).
3. **Who was there:**
   - Arrival isochrones from the table in section 3, with each region ramping up over about 2–5 ka after arrival.
   - Before ~50 ka, only Africa plus brief Levant/Arabia pulses.
   - Contested dates (Sahul, Americas) get a central choice plus a documented alternative.
4. **Scale to a documented total curve:**
   - One global multiplier per step, anchored at HYDE's 4.6 M at 10,000 BCE.
   - Low/central/high bands from the section 2 table. Show the band in the counter ("~2–5 million, modelled").
5. **Join HYDE:** over 12k–10k BCE, blend cell by cell toward HYDE's 10,000 BCE grid aggregated to 0.5°, so the hand-over doesn't pop.
6. **Draw it as modelled:**
   - Same people rendering (glow, bands), since a 0.5° cell is far coarser than HYDE's 5′.
   - Label "Modelled: productivity × dispersal, scaled to published totals", with a legend link to this note.
   - Contrast stays honest: real dated sites (p3k14c, ROAD) later sit on top as evidence marks.
7. **Compare, don't ship, Timmermann:** download it locally as a check (do the two models agree on where people were at 40 ka and the LGM?). Don't redistribute it unless the licence question is settled.

## What we don't know

- Gautney & Holliday's exact numbers and the per-biome densities in Tallavaara 2018's supplement (needs the full texts).
- Whether Kavanagh 2018 data is reusable.
- The dispersal dates marked "memory, unverified" need checking before they become isochrones.
- How much the NPP fit, trained on recent foragers, transfers to glacial climates and CO₂ levels (Beyer's NPP includes CO₂ effects; check).
- How the pre-HYDE pattern should look at street zoom when cells are 0.5°.

## Recommendations

- **First:** a prototype `footstep-generator/prehistory_population.py` producing one WebP per 1,000 years in the same encoding as `grid_image.py`, at 0.5°. Fewer than 100 files, small.
- **Then:** check it against Timmermann at a few dates (done: [timmermann2016/comparison.md](timmermann2016/comparison.md)), verify the arrival table, and decide the low/central/high totals with Will.
- **Separately:** the dated-evidence layer from research 0001 (p3k14c is CC0 and already parsed once).
