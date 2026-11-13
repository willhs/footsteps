---
id: research-0008-food-over-time
type: research
purpose: "A cited table of crop and livestock domestication centres and spread fronts, exported as a 5-degree per-era lookup with HYDE land use and forager staples; how good it is and how the hover card or a 'what's on the plate' view could use it"
date: 2026-11-14
---

# Food over time: what people could eat where, from domestication and spread

## Question

The atlas has one "staple crop" field from the ethnographic present ([human constants](../../philosophy/human-constants.md), Food: "Partly"). Can we build a time-aware view of what people could eat where: a cited table of domestication centres and dates, their spread by region, and a compact lookup of "which domesticates were present in this 5° cell at this era", combined with HYDE land use and forager staples by biome? How good is it, and how could the hover card or a "what's on the plate" concept use it?

Confidence tags (as in [research 0004](../0004-ground-view/research.md)): **[Direct]** I ran it or read it first-hand this session. **[Supported]** a web summary of the source says so (abstract, news release, review page); I did not read the paper. **[Recalled]** from memory of the literature, not checked. **[Inferred]** my reasoning. **[Speculative]** a guess.

## Answer

**Yes for "what could be there, and from when"; no for "how much of the diet".** The lookup works end to end and is small (35 KB gzipped, 1,370 land cells, 34 domesticates, 30 eras) [Direct]. It answers the task's question and keeps the cited table, the HYDE land use and the forager staples as three separate fields, so a viewer can say which part is sourced and which is modelled. But the **dates are mostly recalled, not read**: 328 of the 529 claims are low-confidence diffusion-front estimates, 94 are dated finds, 107 are written-record dates, and only **19 were even confirmed against a web summary** [Direct, counted from the table]. Use it for a labelled "modelled" panel, not as a source. Verdict for the Food constant: **have it** for what was available where (and a data-driven replacement for the hand-drawn crop outlines in [exploration 02](../../design/explorations/02-on-the-plate.html)); **cannot get it** from this alone for plate shares or calories.

## Premise check

| Task note | What I found |
|---|---|
| "Sources: Larson et al. 2014, Fuller, Zeder, Purugganan" | None of the papers' full texts was available to me. I confirmed a handful of dates against search-result summaries (Zeder 2008, Fuller et al. 2009, Denham et al. 2003, Lombardo et al. 2020, Merrill et al. 2009, Librado et al. 2021, Peters et al. 2022, Almathen et al. 2016, Kadwell et al. 2001, Winchell et al. 2018) [Supported]. Everything else is from memory of those authors and others (Bellwood, Pinhasi, Diamond, Crosby) [Recalled]. Each claim's `source` says which. |
| "Farming into Europe 7-4 ka BP" | Roughly right for the centre and north-west, but the front is older at its start: Greece and the Balkans ~8.5-9 ka, central Europe (LBK) 7.5 ka, Britain 6.0, southern Scandinavia 5.9, eastern Baltic ~4.8, northern Fennoscandia ~4 [Recalled; Pinhasi et al. 2005 gives ~1 km/yr, Supported]. |
| "Bantu expansion" | Sources I found disagree and are mostly encyclopaedia mirrors: Cameroon ~4-3.5 ka, Great Lakes ~3-2.5 ka, South Africa by ~300 CE (1.65 ka) [Supported, weak]. The table uses 2.0 / 1.9 / 1.8 / 1.65 for the sorghum-millet-cattle package at the Great Lakes, East African coast, Zambezi, South Africa; iron and farming may not travel together [Recalled]. |
| "Austronesian spread" | Taiwan ~5 ka, Philippines ~4.2 ka, Lapita Remote Oceania ~3-3.3 ka [Supported, one mixed-quality search]; Fiji/Samoa ~2.8, eastern Polynesia ~1.2, Hawaii ~0.9, New Zealand ~0.8 ka [Recalled]. |
| "Maize northward" | Balsas 8.7 ka [Recalled; Piperno 2009, Kistler 2018], Oaxaca cobs 6.2, Southwest US **4.05 ka (2100 cal BCE)** [Supported, Merrill 2009], Eastern Woodlands ~2.1, Iroquoia and the Upper Midwest ~1.0 [Recalled]. |
| "No food code exists" | None on main: `footstep-generator/food/` is new. The only food data in the repo is the atlas's D-PLACE staple field and HYDE land use via the habitat tiles [Direct]. |

## What I built

`footstep-generator/food/` (method and schema: [food](../../ops/food.md)):

- `crops.py`, `animals.py`: 19 crops and 15 animals, each a list of claims (`ka`, boxes, basis, confidence, `source`).
- `regions.py`: 88 named boxes (lon/lat) the claims point at.
- `exchange.py`: the Columbian-exchange fronts shared by crops and animals.
- `foragers.py`: one forager entry per Krapp biome class (28), plus a coastal addition.
- `build.py`: pools the habitat tiles to 5° cells, computes each domesticate's first era per cell, writes `food.json.gz` and `claims.csv`. `lookup.py`: `plate(d, lat, lon, year)`.
- 55 tests (52 pass without data; 3 more need the real habitat tiles and pass when they are present) [Direct].

**Data shape** (principle: model the domain): a domesticate is a set of dated claims; presence is the union of the claims holding a cell's centre; an era is a snapshot at its HYDE year. Presence is therefore monotone, order-free, and a wide late claim can never hide a narrow early one. I considered "first matching box wins" (the pattern in `fauna/losses.py`); it makes the answer depend on table order, and the table is long, so I chose the union. The cost is that an over-wide early box overrides a correct late one (caught by a test when the Eastern Woodlands maize box swallowed Iroquoia, and by a probe that put maize in the Levant through an over-wide Africa box; both fixed).

### Domestication centres and first dates (the cited table, origin claims only)

Calibrated ka BP. "Confidence" is that of the origin claim: `high` = dated and confirmed against a web summary, `medium` = dated but recalled. Full claims with sources: `data/food/claims.csv` after a build, or the Python tables.

| Domesticate | Centre | First domestic date, ka | Confidence |
|---|---|---|---|
| Wheat | Fertile Crescent | 10.5 | medium |
| Barley | Fertile Crescent | 10.5 | medium |
| Lentil, pea, chickpea | Fertile Crescent | 10.5 | medium |
| Asian rice | Lower Yangtze (japonica); Ganges (indica line) | 6.9 (Tianluoshan; process 6.9-6.6); Ganges ~4.5 | high |
| Foxtail, broomcorn millet | North China | 8.7 | medium |
| Sorghum | Sudan (Butana) | 4.5 (cultivation evidence 5.5-5.0) | high |
| Pearl millet | Sahel | 4.5 | high |
| African rice | Inland Niger Delta | 2.5 | medium |
| Maize | Balsas valley, Mexico | 8.7 | medium |
| Potato | southern Peru / Titicaca | ~8 | medium (poorly dated) |
| Cassava | SW Amazon (Llanos de Moxos) | 10.35 | high |
| Squash | Oaxaca, SW Amazon, Ecuador; separately Eastern Woodlands (~5) | 10.25-10.0 | high |
| Common bean | Mesoamerica and Andes (two domestications) | 2.5 (AMS-dated; probably older) | medium |
| Sweet potato | tropical America | ~5 | medium (weak) |
| Taro | New Guinea (and SE Asia) | 10 (used) / 6.9-6.4 (cultivated) | high |
| Banana | New Guinea | 6.7 | high |
| Yams | W Africa, New Guinea, SE Asia | ~5 | medium (weak) |
| Sugarcane | New Guinea | ~6 | medium (weak) |
| Soybean | N China | ~3.5 (disputed) | medium |
| Dog | Eurasia, place unknown | ≥ 14.5 | medium |
| Sheep / Goat | SE Anatolia / Zagros | 10.5 / 10.2 | high |
| Cattle (taurine) | Upper Euphrates | 10.3 | medium |
| Zebu | Indus (Mehrgarh) | ~8 | medium |
| Pig | SE Anatolia; separately China | 10.3; 8.5 | medium |
| Horse | Botai ~5.5 (not the modern lineage); Don-Volga 4.2 | 5.5 / 4.2 | medium / high |
| Donkey | NE Africa | ~6 | medium |
| Dromedary / Bactrian | SE Arabia / Iran-Turkmenistan | ~3.5 (range 4.5-3) / ~4.8 | medium |
| Llama and alpaca | Central Andes | ~6 | high |
| Guinea pig | Andes | ~6 | medium |
| Chicken | mainland SE Asia (Thailand) | 3.5 (the 2022 redating; was ~10 ka) | high |
| Water buffalo | Yangtze (swamp), Indus (river) | ~7 / ~5, debated | medium (weak) |
| Turkey | Mexico, US Southwest | ~2 | medium |

### Spread fronts the tests check (arrival ka at the region)

| Package | Chain |
|---|---|
| Wheat, barley (Europe) | central Anatolia 9.5 → Greece/Balkans 8.5 → W Mediterranean 7.8 → central Europe (LBK) 7.5 → Atlantic France 7.0 → Britain/Ireland 6.0 → S Scandinavia 5.9 → E Baltic 4.8 → N Fennoscandia 4.0 |
| Maize | Balsas 8.7 → Oaxaca 6.2 → Southwest US 4.05 → Eastern Woodlands 2.1 → Upper Midwest, Iroquoia 1.0 → Europe, China, Africa after 1492 CE |
| Sorghum / pearl millet / cattle (Bantu) | Sudan 4.5 → Great Lakes 2.0 → East coast 1.9 → Zambezi 1.8 → South Africa 1.65 |
| Chicken, dog, pig, taro (Austronesian) | Island SE Asia 3.2 → Lapita Melanesia 3.0 → Fiji/Samoa 2.8 → eastern Polynesia 1.2 → Hawaii 0.9 → New Zealand 0.8 (dog; the pig and chicken only after Cook, 1769 CE) |
| Horse | Don-Volga 4.2 → Near East 3.8 → Egypt 3.5 → China 3.3 → Britain 3.0 → the Americas 1493 CE → Plains ~1700 CE |
| Columbian exchange | Old World crops and livestock reach Spanish America 1493-1520 CE, eastern North America ~1610, western ~1750, Australia 1788; potato Spain 1570s, cassava West Africa 1500s |

## How good is it

**Confidence by claim**: 94 `dated` (medium; 19 of these confirmed against a web summary make `high`), 328 `front` (low), 107 `historic` (high, but these are *first documented arrival*, not common use). The `front` estimates are the weakness and also most of the content [Direct].

**Where HYDE agrees and disagrees** [Direct, from the built file]:

- Of the cells where HYDE shows any cropland, **97% have at least one crop claimed at year 0 and at 1400 CE, 74% at 3000 BCE**. The uncovered ones are mainly Siberian and Kazakh steppe (HYDE puts trace cropland there; the table has pastoral peoples, with cereals arriving with Russian colonisation in the 1600s) and Pacific/Australian trace cells. The first pass was far worse (133 uncovered cells at year 0, 184 at 1400 CE), which is how I found and filled gaps in Arabia, the Maghreb, Russia, northern Mexico, lowland South America, Burma, Angola and Iceland; the coverage check is now a test.
- In several core areas HYDE's first cropland coincides with the claimed arrival (Levant and Zagros wheat: both from 8000 BCE; Britain: both 4000 BCE). **That agreement is probably not independent evidence**: HYDE models agriculture from population and regional start dates, which I believe already use these domestication timelines [Speculative; I did not check Klein Goldewijk et al.].
- In others HYDE lags the table by thousands of years (Balsas maize: table 6000 BCE, HYDE 2000 BCE; Peruvian potato: 6000 BCE vs 2000 BCE) or leads it (Yangtze: HYDE cropland from 6000 BCE, rice from 4000 BCE in the lookup because the rice date, 6.9 ka, falls just after the 5000 BCE snapshot) [Direct]. The lookup shows both and does not reconcile them.
- Claimed crops in cells HYDE shows empty: 208 cells at 2000 BCE, 171 at year 0. Mostly desert, mountain and steppe cells inside coarse boxes. This is the over-reach of `available`, which is why `grown` exists.

**Forager staples** are broad generalisations by biome (Binford 2001; Kelly 2013; Lee 1979; Bailey et al. 1989) written from memory [Recalled]. They support one claim well: plant share falls and animals/fish rise toward the pole (tested). They do not give a diet.

## Gaps

1. **Dates not read from sources.** The highest-value fix: read the primary papers for the ~40 claims that set most cells (Neolithic Europe, the Indus, China, the Bantu package, maize in the Southwest/Andes, Austronesian), and upgrade `front` to `dated` or correct them.
2. **Losses.** Presence never retreats. The green Sahara pastoralists, camels in the Levant, Norse Greenland and the Maya collapse are absent; so are pre-domestic cultivation (a crop shows only from its first domestic date).
3. **Resolution.** Boxes on a 5° grid ignore mountains, deserts and coasts. A finer grid needs per-crop climate envelopes (Beyer temperature and precipitation are already in the habitat tiles), which I did not attempt because the envelope numbers would be unsourced.
4. **Importance.** Nothing says wheat mattered more than a pulse. D-PLACE EA001-EA005 subsistence shares and EA029 staples (already in the atlas) are the natural complement.
5. **Missing taxa.** Oats, rye, teff, finger millet, olive, grape, date palm, coconut, quinoa, cotton, sunflower; yak, reindeer, duck, goose, cat, honeybee, silkworm. Queued in the table's style: a new `Taxon` and its claims, nothing else changes.
6. **HYDE circularity and blind spots** (above): Pacific horticulture and swidden are invisible to it.
7. **Uneven source quality.** Several searches returned encyclopaedia mirrors and blogs (Bantu, Austronesian). Those figures are tagged weak.
8. **Dog and the Americas.** Dogs are listed from the first dated finds per region; the dog's true entry into the Americas (≥ 15 ka) is not shown, and no gating by land use applies to dogs, so they appear in every inhabited land cell inside a box.

## How the app could use it (not built: "don't wire it into the app")

- **Hover card line.** `plate(...)` already returns what the card needs: "Crops: wheat, barley, lentil. Kept: sheep, goat, cattle, dog." with a tag from `confidence` (`dated` / `estimate`), and when `available` but not `grown`, "…arrived here by now, but HYDE shows no farming" (honest about the gap). The forager line for cells with no farming: "Likely wild foods: acorns and nuts, deer, river fish" with "modelled" attached. The cost is fetching one 35 KB file once and ~100 lines of TypeScript mirroring `lookup.plate` (eras and the 5° cell convention are the atlas's, so the cell key matches `atlas.cell_of`).
- **"What's on the plate" (exploration 02).** The map's "main food" outlines, today hand-drawn, can come from the data: for each cell, group the available crops into the labelled outlines ("wheat & barley", "rice", "millet", "maize", "taro & yam", "milk & meat") and let them grow with the slider; each outline can cite its claims. The plate *slices* (shares of calories) still need the D-PLACE subsistence fields and a model; this dataset does not supply them.
- **Over-time band.** The share of land cells with any farming (HYDE) and with domesticates available is a measurable curve: wild-only to farmed.
- **Safeguards.** Show the basis; never print a single date without "about"; keep `available` visibly separate from `grown`; label Columbian-exchange arrivals as first documented, not common.

## Recommendation

Keep it as a modelled dataset behind the hover card (`?hover=1`) first, labelled modelled, with `confidence` shown. Before it goes in front of anyone beyond Will, spend one pass on gap 1 (read the primary sources for the claims that set the most cells), since it is a pure data-quality task with no design risk. Do not use it for calorie shares. Decision for Will: whether the Food constant graduates as a hover-card line (cheap, this data) or as the full plate view (needs D-PLACE shares and a design pass).

## Reproduce

```bash
poetry run python footstep-generator/food/build.py            # needs data/tiles/habitat (habitat-lookup.md)
poetry run python footstep-generator/food/build.py check
poetry run pytest footstep-generator/tests/test_food.py -q
```
