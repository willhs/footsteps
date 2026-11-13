---
id: research-0004-ground-view
type: research
purpose: "How the hover card can show what a spot looked like on the ground (scene and animals), and which option to build"
date: 2026-11-14
---

# A window onto the ground: images and animals for a hovered spot

## Question

The hover card for a spot at the slider's year should give "a little window into what it would look like on the ground", maybe with animals. What are the options (curated photos, AI images, a procedural scene, hybrids), what animal data exists and what is feasible at 0.5-1 degree and 1 ka steps, and which should we build?

## Context

[Vision](../../philosophy/vision.md): everything on screen is measured, modelled or imagined; imagined content is labelled "speculative", grounded in facts shown next to it, and "every pixel carries data or clearly labelled imagination". [Human constants](../../philosophy/human-constants.md) lists Animals as "No" (sources: biomes, HYDE grazing, D-PLACE livestock) and Habitat as "partly".

Confidence tags: **[Direct]** I ran it or read it first-hand this session. **[Supported]** a source says so but I did not read the primary text. **[Inferred]** my reasoning from direct findings. **[Speculative]** a guess, needs a test.

### Premise check (the task notes vs the repo and the live site)

| Task note | What I found |
|---|---|
| "existing OpenRouter key on the budgie API" | **True now.** `GET /api/day/health` returned `live: true` on 14 Nov [Direct, `evidence/api-health-2026-11-14.json`]. [Task 0003](../../tasks/0003-anthropology-database/task.md) found it absent on 10 Nov, so it was added since. But `day_api.py` only does **text** chat completions with a JSON schema and a SQLite text cache [Direct, `deploy/budgie/api/day_api.py:154-189`]. There is no image call and no image store. |
| "PHYLACINE 1.2 present-natural ranges (CC BY)" | **Wrong licence.** The project page says "Creative Commons 0" and names v1.2.1 as the version to use; the Dryad record is the old v1.2.0 and states no dataset licence [Direct, fetched]. CC0 means no attribution is required, though we should credit it anyway. |
| a hover card exists or is planned to extend | **None yet.** The app has a click tooltip (`PopulationTooltip.tsx`, auto-closes after 5 s) and the click panel "What we know here" ([grounding-facts](../../ops/grounding-facts.md)) [Direct]. |
| prior ground-view or fauna work | **None.** `megafauna` appears once in the repo, in [research 0003](../0003-p3k14c-earliest-dates-by-region/research.md), as contamination in radiocarbon dates [Direct, grep]. |
| IUCN as a modern-range source | Possible but not needed: PHYLACINE ships "Current" ranges too (see 5.5). |

## Method

- **PHYLACINE 1.2.1:** sparse-cloned `Data/Traits` and `Data/Ranges/Present_natural` from GitHub, read all 5,831 GeoTIFFs with `tifffile`, and counted. Script: [`phylacine_summary.py`](phylacine_summary.py). Output: `evidence/phylacine-summary.txt`.
- **Wikimedia Commons:** queried the live API for category sizes and the licence of the first 50 JPEGs in eight biome categories (365 files). The first 50 are alphabetical, not a random sample, so read the licence mix as rough [Direct, `evidence/commons-and-phylopic-survey.txt`].
- **PhyloPic:** queried its API for silhouettes of 21 relevant genera and their licences [Direct, same file].
- **Image-model prices:** OpenRouter's own comparison blog (prices measured 11 Sep 2026, so two months old and "a hint rather than a budget line" by its own words) and its image-model collection page (updated Nov 2026) [Direct, fetched].
- **Not reachable:** the full text of Sandom 2014 and Faith & Surovell 2009 (PubMed Central showed a bot check; Europe PMC and the Royal Society returned 403/500 for most of it). Those two are tagged **[Supported]** from search summaries and the part of Sandom's text that loaded.

## Findings

### 1. Curated, openly licensed photos (Wikimedia Commons)

- **Licences are workable but mostly share-alike.** Of 365 sampled JPEGs: CC BY-SA 65%, CC BY 15%, public domain 10%, CC0 8%, other 2%. Only about 35% need no share-alike [Direct]. CC BY-SA obliges a credit line and, if we crop or recolour, licensing that adapted image the same way [Supported: Commons:Reusing content outside Wikimedia]. Each file's licence sits in `imageinfo`/`extmetadata`, so a build script can filter to CC0, public domain and CC BY and keep the credit string [Direct, API works].
- **Resolution is fine**: 299 of 365 (82%) are at least 1,600 px wide [Direct].
- **Coverage follows Commons' naming, not our biomes.** Large pools: Deserts 921 files, Mangroves 484, Savannas 252, Glaciers 189. Small: Steppes 78, Tundra 89. Category names we would expect returned nothing or almost nothing: "Temperate deciduous forests", "Mediterranean scrubland", "Polar deserts" (missing), "Prairies" (1 file), "Pampas" (0) [Direct]. Mapping Krapp's 28 BIOME4 classes to Commons needs hand curation.
- **How many:** one to three per biome is 30-80 images for the habitat alone. A "way of life" photo (foraging, herding, farming) is the harder half.
- **The honesty problem is large [Inferred].**
  - A photo is today's land. Much of it is farmed, fenced or grazed; the map's own terrain work removes the modern farm tint for this reason ([terrain-images](../../ops/terrain-images.md)).
  - Biomes that have no modern analogue (mammoth steppe, glacial desert, drowned shelves) have no photo at all.
  - For ways of life, the only photos are of living or 19th/20th-century peoples. Using them as stand-ins for 40,000 BCE foragers is the stereotype the vision and human-constants docs warn against, and the day API already forbids.
  - It fits none of the three kinds. It is "measured today", so it would need a fourth label such as "photo, today".
  - Credits on every image add small print the vision says to avoid.
- **Good for:** a deliberate "here today" contrast. Not good as the main picture for a past year.

### 2. AI-generated images

**Prices and latency (OpenRouter, 1024x1024, measured 11 Sep 2026, blog)** [Direct, fetched; re-check before budgeting]:

| Model | Cost per image | Latency |
|---|---|---|
| GPT Image 2 | $0.006-0.0135 (default quality); $0.21 at high quality | 12 s default; 123 s at high (one run) |
| FLUX.2 Klein 4B | $0.014 | not given |
| FLUX.2 Pro | $0.030 | not given |
| Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | $0.034 | "roughly 4 seconds" (vendor claim) |
| Seedream 5.0 Lite | $0.035 (2K minimum) | not given |
| Nano Banana 2 (Gemini 3.1 Flash Image) | $0.067 | not given |
| Gemini 3 Pro Image | $0.134 | not given |

- **How to call it.** Gemini image models work through the same `chat/completions` endpoint the day API already uses, with `modalities: ["image","text"]`. FLUX, Seedream, GPT Image and others use a separate `POST /api/v1/images` endpoint, which the blog says is where new models land [Direct, fetched]. So a small new function in `day_api.py`, not a rewrite.
- **Pre-generated vs on demand.**
  - On demand is **4-12+ seconds**, so it cannot sit behind a hover. It could sit behind a click ("Imagine this place"), like the day.
  - The prompt key would be biome x era band x way of life, which has only a few hundred distinct values (below). On-demand traffic would fill the same few hundred cache slots, so it saves nothing over generating them once. Only a key that includes place or animals would stay open-ended, and that is the expensive, hard-to-label version.
  - Pre-generating gives static WebP files served by Caddy (as the grid and terrain images already are), instant, free to run, and every one can be looked at before it ships.
- **Combinations [Inferred from code and docs].**
  - Biome classes: 28 (the Krapp palette array is `(29, 3)` with id 0 = sea, `terrain_image.py:218`) [Direct]. About 22-24 are populated land.
  - Before 10,000 BCE the only way of life is foraging (the anthropology atlas starts at the HYDE years), so about 24 biomes x 1 = **~24**.
  - From 10,000 BCE: ways of life are foraging, farming, herding, mixed, fishing (`footstep-generator/anthropology/README.md`); say 3 era bands (to 3000 BCE, to 1500 CE, to 1900). 24 x 5 x 3 = 360 raw, **roughly 150-200 sensible** once impossible pairs (farming on ice, fishing inland) are dropped.
  - So **about 200 images per style**. With 3 candidates each for curation: ~600 generations: **$20-40** at $0.034-0.067. Retries and prompt tuning: budget **$50-100** total [Speculative]. Will's time choosing among them is the real cost.
- **Grounding the prompt.** Facts we have for a spot and year: Krapp biome, land temperature anomaly and sea level ([climate series](../../ops/climate-series.md); note both are global means, not per cell), way of life, and (new, section 5) a list of large animals. A prompt template: "Ground-level view, {biome name}, {temp anomaly} colder than today, {way-of-life trace: smoke from a hearth / small fields / grazing herd}, no people in the foreground, painterly not photographic". That keeps people out of the frame, which also avoids invented clothing, bodies and ornament stereotypes [Inferred; matches the day-API rule].
- **Animals in AI images: keep them out of the pixels.** Models draw a mammoth passably and a glyptodont badly. Naming species in the prompt also multiplies the key (biome x animal set), and the picture would claim more than the data does. Animals go in as data (section 5), next to the image.
- **Labelling.** A fixed corner tag "Imagined" (vision wording: "speculative"), plus the facts line beside it: "Tundra (Krapp 2021, modelled) | 6 C colder than today (Beyer 2020) | foraging (modelled)". Generated files carry a model name and prompt version in a sidecar JSON so any image can be traced. Gemini's outputs carry an invisible SynthID watermark [Direct, OpenRouter page].
- **Unchecked:** the provider terms on commercial and redistributed use of generated outputs. This is a personal, non-commercial site, so low risk, but not read.

### 3. A procedural vignette (SVG or canvas)

- **What it is.** A layered scene drawn in the browser from data: sky colour and cloud cover from climate; a horizon line; vegetation silhouettes chosen from about 8-10 archetypes that Krapp's 28 biomes collapse into (ice, tundra, boreal conifer, temperate forest, grass/steppe/savanna, shrub, desert, tropical forest, wetland); sea at the horizon from sea level; a hearth, huts or fields for the way of life [Inferred design].
- **Strengths.** Instant, zero bytes of image, works at every one of the 100+ slider years, and each element maps to a datum, so it is honestly **modelled** rather than imagined. It fits "not decoration" best.
- **Weaknesses.** It will look like a diagram, not a window. Clip-art risk is high; the quality depends on drawing skill, not budget. It needs per-cell biome ids in the browser, which we do not have: terrain images are blended colours, not ids (`terrain_image.py` computes `biome(bp)` internally). A small palette-indexed id image per terrain year (128 images) would fix that. It would also feed the habitat line of the hover card, so it is shared work [Inferred].
- **Cost.** About 3-5 days for a good-looking v1 [Speculative]; no run cost.

### 4. Hybrids

| Hybrid | Verdict |
|---|---|
| Procedural scene as the always-on base, AI image shown over it when one exists | Two systems to build and keep consistent. Worth it only if the AI pilot is liked but coverage has gaps. |
| AI landscape (imagined) + data-driven animal row (modelled) + facts line | **Recommended.** One image system, one data system, each labelled for what it is. |
| Photo of "today here" beside the AI image | A nice honest contrast, but adds credits and clutter. Defer. |
| Procedural scene with PhyloPic animal silhouettes | The strongest "modelled" version; the fallback if AI images disappoint (see prototype 3). |

### 5. Animals: what exists and what is feasible

#### 5.1 PHYLACINE 1.2.1 (the core dataset) [Direct unless noted]

- **What:** 5,831 mammal species from the last ~130,000 years, including extinct ones. Licence **CC0** (project page). Use v1.2.1 (GitHub release, DOI 10.5281/zenodo.3690867); v1.2.0 on Dryad has known errors.
- **Ranges:** `Present_natural/<Binomial>.tif`, one per species. Measured from the tags: **360 x 142 cells, 96.5 km square cells, Behrmann equal-area (standard parallel 30), 0/1 presence, covering 90N to about 60S** (no Antarctica). Sea is 0, with no separate land mask. "Present natural" means where the species would live **today without strong human impact**. For extinct species it is **"not the fossil ranges"**: it is where the species "would be expected to occur now given today's climate" (project page quote). The projection method is in the 2018 paper's metadata PDF, which I could not read.
- **Traits:** body mass (`Mass.g`), diet (plant/vertebrate/invertebrate shares), life habit (terrestrial/marine/freshwater/aerial), and IUCN status with a custom **`EP`** code for "extinct in prehistory" (270 species, e.g. Diprotodon). **No extinction or last-occurrence date** [Direct, columns read].
- **Counts:**

| Size class | Species | Prehistorically extinct (EP) | Recently extinct (EX/EW) | Extant |
|---|---|---|---|---|
| >= 10 kg | 710 | 216 | 18 | 476 |
| >= 44 kg | 455 | 169 | 11 | 275 |
| >= 100 kg | 310 | 127 | 10 | 173 |
| >= 1,000 kg | 87 | 40 | 1 | 46 |

  Non-marine species of 44 kg or more: **337** (this includes *Homo sapiens* and a few domestic forms such as the dromedary, which must be dropped).
- **Density:** 16,186 of 51,120 cells hold at least one such species; where any are present, the mean is 15 and the 90th percentile is 29 (maximum 46).
- **Spot checks (large species in the cell, how many are prehistorically extinct):** Great Plains 36 (27); Serengeti 31 (7); Amazon 25 (18); N France 20 (11); Kalahari 20 (4); Tibet 9 (1); Siberia 7 (3, incl. mammoth and cave lion); Murray-Darling 7 (6, incl. Diprotodon and *Thylacoleo*); N Greenland 0. The pattern matches the literature below: the Americas and Australia lose most, Africa least.
- **Size on disk:** the presence matrix for 337 species over the 16,186 populated cells is **34.5 KB** bit-packed and zlib-compressed. Whole thing fits in the page; lookups need no API.

#### 5.2 What "present natural" gets wrong for a past year [Inferred from the project page and Lorenzen 2011]

It is a **counterfactual for today's climate**, so for the ice-age years on our slider it is wrong in a known direction. The woolly mammoth range here covers 3,294 cells across northern Eurasia and North America; in a glacial year mammoths are widely held to have lived on cold steppe much further south, and ice sheets covered some of the cells (general knowledge, not checked against a source here [Speculative]). Lorenzen et al. 2011 found each species responded to climate in its own way [Supported], so there is no single fix.

Two ways to handle it:

1. **Accept and label it.** Show "large animals whose natural range includes this area", wording that does not say "were seen here at this date".
2. **Gate by biome.** For each species take the modern Krapp biomes its present-natural range overlaps, then at year Y keep the species only where that cell's Krapp biome at Y is in its set. That moves mammoths south onto glacial steppe for free, from data we already have. It is a crude niche model and must be labelled **modelled** [Speculative, needs a test against known finds].

#### 5.3 When did they disappear? (no per-species date table exists in PHYLACINE)

| Source | What it gives | Use |
|---|---|---|
| Faith & Surovell 2009, PNAS 106:20641 | North America: 35 genera; 16 have secure last dates inside 12-10 ka radiocarbon years BP (about 13.8-11.4 cal ka); the other 19 have no dates in the window and are argued to be sampling gaps. 1,955 occurrences of 31 genera. Per-genus table in the supplement (Tables S2, S3) [Supported, abstract only; paper unreachable] | N America dates, with the "synchronous" claim contested |
| Saltré et al. 2016, Nature Comms 7:10511 | Australia: 659 megafauna ages; extinction peak ~42.1 ka (interval 36.7-48.1), ~13.5 ka after human arrival [Supported, search summary] | Australia window |
| Bartlett et al. 2016, Ecography 39:152 | A global database of last-appearance dates of megafaunal genera from the literature; accepted manuscript at centaur.reading.ac.uk/41370 [Supported, abstract] | **Best candidate for a per-genus table.** I did not check whether the table itself is published. |
| Sandom et al. 2014, Proc R Soc B 281:20133254 | 177 species of 10 kg or more, in 229 TDWG countries, 132-1 ka BP; severity of loss follows where hominins arrived, with at most a weak Eurasia-only climate link. Data are in supplementary spreadsheets [Direct for the methods text that loaded] | **Presence by country, not dates** [Inferred]; good as a sanity check on which regions lost most |
| Stuart, Donovan & Stringer 2015, Geol J 50 | Review; says American dates are still too few to show clear patterns [Supported, snippet] | Honest uncertainty note |
| Faurby & Svenning 2015, Divers Distrib 21:1155 | The method behind present-natural ranges; losses in Australia and the Americas mostly prehistoric, Africa's mostly historic [Supported, abstract] | Method citation |

**Feasible:** a per-species table of about 170 prehistorically extinct large species, each with an extinction window and a quality tag (dated genus / regional default). That is manual curation from the papers above, perhaps 1-2 days with an LLM to extract and a human check [Speculative]. Species without a date get their region's window (Australia ~42 ka; N America ~13-11 ka; elsewhere wide). **The limit is evidence, not compute.**

#### 5.4 Resolution: 0.5-1 degree and 1 ka steps

- **Space:** the native cell is 96.5 km, about 0.87 degrees of latitude and wider in longitude as you go north (about 1.7 degrees of longitude at 60N). **1 degree is the honest ceiling. 0.5 degrees would be the same cell shown four times**, fine for a hover lookup (nearest cell), wrong to draw as if it were finer [Inferred].
- **Time:** a species is shown at year Y if the cell is in its range and Y is before its extinction window (and, for the few that appear late, after it). That is one comparison per species per hover, for any year, so 1 ka steps (and the 100-year steps after 0) cost nothing extra [Inferred].
- **Near the present:** PHYLACINE also ships `Current/` ranges. Use present-natural to about 1500 CE and blend to `Current` for 1800-1900. That misses real earlier losses (lions leaving Europe, aurochs by 1627). Say so in the caption [Speculative; check against a few cases].

#### 5.5 Modern ranges from IUCN, and the licence

IUCN Red List spatial data needs written permission for commercial use, defined as use by or for a for-profit or use that generates revenue; I did not find the redistribution clause, and sources disagree between CC BY, CC BY-SA and custom terms [Supported, secondary summaries only]. PHYLACINE's `Current` ranges already cover the same job as one CC0 file. **Do not ingest IUCN directly for v1.** Small risk to note: PHYLACINE is CC0, but if its current ranges are built from IUCN maps, the upstream terms may still matter; I did not read the metadata PDF to confirm [Speculative].

#### 5.6 Showing animals

- **Data only first:** "Large animals here then: mammoth, woolly rhino, reindeer..." (top 4-6 by mass, extinct-soon ones marked) with a caption "natural range (modelled)". No pictures needed to be honest.
- **Silhouettes later:** PhyloPic has silhouettes for most of the headline species. Of the 21 genera I queried (first page of results each), all 21 had at least one image and **15 had at least one CC0 or public-domain one** [Direct]. The six without: *Megatherium*, *Elasmotherium* and *Camelops* (BY-NC only), *Coelodonta* (BY-SA only), *Bos* and *Toxodon* (BY only). Non-commercial images are best avoided on a public site, and BY/BY-SA ones need a credit; a CC0/PD-only filter leaves gaps to fill by hand.

## Comparison

| | Photos | AI pre-generated | AI on demand | Procedural scene |
|---|---|---|---|---|
| Looks like a window | yes, but of today | yes | yes | weak (diagram) |
| Honest label | "today" (new kind) | Imagined | Imagined | Modelled |
| Hover speed | fine (static) | instant (static) | **4-12+ s, no** | instant |
| Build | 3-5 days curating + credits | 1-2 days pipeline + review time | 1-2 days, plus store and cap | 3-5 days |
| Run cost | $0 | $0 | $0.03-0.07 per new key, capped | $0 |
| Main risk | share-alike credits; stereotype of living peoples | stereotypes, hallucinated detail | spend, latency | looks cheap |
| Coverage of past-only biomes | none | yes | yes | yes |

## Conclusions

1. **No single option wins; the honest, cheap combination is AI landscape plus a data row.** A pre-generated AI image per biome x era band x way of life, tagged "Imagined" with the facts beside it, gives the "window" feel. A separate animal row built from PHYLACINE gives the data. Animals stay out of the AI pixels.
2. **On-demand generation does not pay for itself.** The key space is only a few hundred values, so the cache fills fast and the 4-12 s wait never fits a hover.
3. **Photos should not be the main picture** for a past year. Use at most as a labelled "today" contrast later.
4. **Animals are more feasible than the task notes feared.** One CC0 dataset fits in 35 KB and needs no server. The weak spots are species dates (needs curation) and ice-age ranges (needs the biome gate or a plain caption).
5. **Cross-cutting dependency:** the card needs per-cell biome ids and per-cell climate in the browser. Today's terrain images are colours and the climate series is global only. This is shared with the hover card's habitat line and is the first build item, whichever option wins.

## Recommendation

Build the **hybrid in the comparison table above**:

- **Hero:** pre-generated, static, ~400x225 WebP landscape per biome x era band x way of life, corner-tagged **Imagined**, with the facts line under it. Generated by a script (not at runtime) so each image can be reviewed before shipping. People are not in the foreground.
- **Animals:** a short text row of large animals, biggest first, from PHYLACINE x a curated extinction table, captioned **Modelled: natural range, not fossil finds**.
- **Skip for v1:** photos, runtime generation, IUCN, silhouettes, glacial biome gating (keep as a later upgrade).
- Keep the procedural scene as the fallback if Will does not like the AI pilot.

**Rough cost [Speculative apart from the image prices]:**

| Part | Build | Run |
|---|---|---|
| Biome-id + climate rasters for the browser (shared) | 1-2 days | ~4 MB static |
| Image generator script + 200 images + review | 2 days, $50-100 | static ~5-8 MB (400 x ~20 KB) on budgie; $0 |
| Fauna lookup + extinction table | 3-4 days | 35 KB data, $0 |
| Hover card UI with labels | 1-2 days | $0 |
| **Total** | **~7-10 days** | **$0 ongoing** |

## Risks

- **Taste.** "Will likes it" is the done test and AI landscape style is subjective. The pilot is built to find out cheaply.
- **Stereotypes in generated people, clothing and bodies.** Mitigation: no figures in the foreground, a human review pass, same rules as the day API.
- **A false sense of precision.** A lovely image of 40,000 BCE steppe looks like knowledge. Mitigation: the Imagined tag is always on; the facts line names the real inputs.
- **Present-natural ranges in ice-age years** (5.2): wrong in a known direction. Mitigation: caption, and the biome gate later.
- **Extinction dates are thin, especially in South America, Eurasia and Africa** [Supported]. Mitigation: quality tag per species; show windows, not years.
- **Prices drift.** The image prices are two months old and the source says to treat them that way.
- **Licence loose ends:** provider terms for generated-image reuse (unread); IUCN upstream terms in PHYLACINE's current ranges (unread).
- **Hover payload creep.** Image + species data + facts must arrive in about a frame. Prefetch by biome; fall back to a flat biome colour while loading.

## What We Don't Know

- Whether Will likes the AI style. No images were generated here (the task said no app code and this is research); prototype 1 settles it.
- The exact extinction window for most of the 169 extinct large species. Searched: PHYLACINE columns (none), Sandom (country presence), Bartlett (database exists, table not located).
- PHYLACINE's range projection method and whether `Current` is IUCN-derived. The metadata PDF would not load as text.
- Full text of Sandom 2014 results and Faith & Surovell 2009. Their pages showed a bot check or 403; claims rest on search summaries and the part of Sandom that loaded.
- Latency of the cheaper image models; only vendor claims and one GPT Image run exist.
- Whether the Commons sample (alphabetical first 50) represents each category's quality.
- Whether PBDB, FAUNMAP, Neotoma or the NOW database would give usable fossil occurrences. I did not look; they are the next step beyond PHYLACINE's counterfactual ranges.
- Whether the browser can hold the biome-id rasters smoothly (not measured).

## Recommendations: the prototypes worth building next

1. **Image pilot (about a day, $3-10).** A throwaway script that makes about 30 images (10 biomes x glacial foraging / Holocene farming x one model; or 2 models on 5 biomes), writes a contact-sheet HTML with the "Imagined" tag and facts line, and lets Will pick a model and style. Go/no-go for the AI path. Output stays out of the app.
2. **Fauna lookup (2-3 days, $0).** `PHYLACINE -> fauna.bin` plus a hand-curated `extinction.csv` for the ~170 extinct large species, and a pytest of known cases. Expected values come from my general knowledge and must be confirmed against the sources above before they become assertions: the Great Plains has mammoths and ground sloths at 15,000 BCE and none at 5,000 BCE; the Murray-Darling has *Diprotodon* at 60,000 BCE and not at 20,000 BCE; Siberia keeps mammoths to around 10,000 BCE; the Serengeti loses little. Then try the biome gate on the mammoth and compare to published glacial range maps (Lorenzen 2011 has models).
3. **Procedural scene (3-4 days, optional).** One SVG/canvas component fed by biome id, temperature and sea level, shown beside the AI image in the same mock, so Will can choose or combine. Only build after 1, and only if 1 is not clearly liked.

Prerequisite for all three in the app: biome ids per terrain year in the browser (the shared item in the cost table).

Then open a task via `/spec-task` for the hover-card build once prototype 1 has a verdict.

## Sources

- PHYLACINE 1.2: <https://megapast2future.github.io/PHYLACINE_1.2> (CC0, v1.2.1), <https://github.com/MegaPast2Future/PHYLACINE_1.2>, <https://datadryad.org/dataset/doi:10.5061/dryad.bp26v20> (v1.2.0); Faurby et al. 2018, Ecology, doi:10.1002/ecy.2443.
- Faurby & Svenning 2015, Diversity and Distributions 21:1155, doi:10.1111/ddi.12369.
- Sandom et al. 2014, Proc R Soc B 281:20133254, doi:10.1098/rspb.2013.3254 (Europe PMC XML partial).
- Faith & Surovell 2009, PNAS 106:20641, doi:10.1073/pnas.0908153106.
- Bartlett et al. 2016, Ecography 39:152, doi:10.1111/ecog.01566; <https://centaur.reading.ac.uk/41370>.
- Saltré et al. 2016, Nature Communications 7:10511; Stuart, Donovan & Stringer 2015, Geological Journal 50; Lorenzen et al. 2011, Nature 479:359.
- OpenRouter: <https://openrouter.ai/blog/insights/image-generation-models-compared/>, <https://openrouter.ai/collections/image-models>.
- Wikimedia Commons: <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>; PhyloPic: <https://www.phylopic.org/articles/image-usage>, API <https://api.phylopic.org>.
- IUCN terms: secondary summaries only (none read at source).
- Repo: `deploy/budgie/api/day_api.py`, `footstep-generator/terrain_image.py`, `footstep-generator/climate_series.py`, `footstep-generator/anthropology/README.md`, [research 0003](../0003-p3k14c-earliest-dates-by-region/research.md), [task 0003](../../tasks/0003-anthropology-database/task.md).
