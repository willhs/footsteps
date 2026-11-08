---
id: deep-prehistory-sources
type: note
purpose: "Assess defensible human-presence sources for 100,000–10,000 BCE and recommend an uncertainty treatment."
scope: ["deep prehistory", "data sources", "uncertainty"]
non_goals: ["implementation", "new population estimates", "deployment"]
tags: ["research", "population", "palaeoclimate"]
related: ["../../philosophy/one-pager.md", "../revitalisation/state-of-the-project.md"]
---

# Human presence before HYDE: 100,000–10,000 BCE

Checked 9 November 2026 (NZDT). Recommendation: **proceed with an evidence atlas; do not extend population dots or a world population counter into deep prehistory.** No assessed source supplies a defensible, continuous global census grid for this interval. Dated occurrences, environmental reconstructions and explicitly labelled scenarios can tell a useful story without manufacturing one.

## Question

Which sources can support the promised 100,000 BCE start, what do they actually measure, and how should Footsteps show the gaps?

## Context

[Direct] The premise remains valid on repository baseline `cbf02ce`: the vision promises 100k BCE, but the slider starts at 10k BCE. Current `TARGET_YEARS` contains **30 dates, 10,000 BCE–1900 CE**, with nine dot-tile years ([constants.ts:3](../../../footsteps-web/lib/constants.ts#L3)). The older [revitalisation note](../revitalisation/state-of-the-project.md) discusses the deep-prehistory gap in §§3 and 7, but its 21-year/1000 CE endpoint is historical, not current. Its original commit is `6154927`; no existing deep-prehistory source assessment was found in tracked research or its history.

[Direct] A `-100000: 1000` entry exists in a table explicitly called “Fallback population estimates,” followed by fixed modern continental placement regions ([process_cities.py:16](../../../footstep-generator/process_cities.py#L16)). This is not a cited population reconstruction or evidence that pre-HYDE geography has been solved. The checked-in [HYDE 3.3 readme](../readme_HYDE_3.3.txt) explicitly begins at 10,000 BCE; the [HYDE 3.2 paper](https://essd.copernicus.org/articles/9/927/2017/) has the same early boundary. The question about which HYDE release reaches the present does not change that boundary.

Vision alignment: extending the timeline serves “Footsteps: extend the timeline both ways” only if “human presence” remains distinguishable from a population estimate. The [one-pager](../../philosophy/one-pager.md) already asks for accuracy and visible uncertainty.

## Scope

- **Investigate:** climate and range models, archaeological occurrences, genetic demographic histories, sea-level and ice reconstructions; coverage, resolution, licence, scriptable access and interpretive limits.
- **Out of scope:** writing ingestion/rendering code, rerunning dispersal models, deriving new census estimates, obtaining restricted site coordinates, or changing the live slider.

Confidence labels: **[Direct]** inspected primary source or payload; **[Supported]** a conclusion supported by primary research; **[Inferred]** our interpretation or recommendation; **[Speculative]** an untested proposal. A downloadable file and a credible scientific interpretation are separate claims.

## Findings

### The domain must preserve different kinds of evidence

[Inferred] Treat the central unit as a **source-backed evidence record**, not a person or settlement. Its common fields are source/version, evidence kind, taxon/attribution, geometry and spatial support, time interval/distribution and original dating convention, uncertainty, units, provenance and reuse licence. Keep these variants separate:

| Kind | Value/state | Invariant |
|---|---|---|
| Dated occurrence | Site → assemblage → sample/date; location precision; attribution may be uncertain | A dated deposit is not continuous occupation, and multiple dates are not multiple populations |
| Habitat/range scenario | Suitability index or simulated density; scenario and assumptions | Suitable habitat is not proof of occupation; simulated density is not observed population |
| Genetic demographic history | Effective population/coalescence rate for sampled ancestry and time interval | Effective population is not census population and has no recoverable ancient settlement coordinate |
| Environmental reconstruction | Climate, relative sea level, land or ice mask | An environmental boundary constrains interpretation; it does not locate people |

[Inferred] Distinguish **missing**, **outside coverage**, **not applicable** and **modelled zero**. Never encode all four as zero people. Do not blend sources into a single “confidence percentage” without a statistical model.

[Supported] Time conventions matter: calendar BP normally means before 1950, so 100,000 BCE is approximately **101.95 ka cal BP**, and 10,000 BCE is approximately **11.95 ka cal BP**. A 100 ka BP reconstruction is therefore not a 100,000 BCE reconstruction. Use explicit no-year-zero calendar conversion, retain original ages, and round display dates to source precision. Raw radiocarbon ages must be calibrated before conversion; they are not calendar BP. [IntCal20](https://doi.org/10.1017/RDC.2020.41) extends to 55,000 cal BP, not 100,000 years. Other dating methods and interpreted stratigraphic ages are needed earlier.

### Climate and human-range models

**[Direct] Beyer, Krapp & Manica (2020): best environmental foundation for the entire interval.** Terrestrial climate/vegetation fields cover the last 120 ka, at 0.5° spacing (roughly 56 km north–south), with 2 kyr steps at 120–22 ka and 1 kyr steps thereafter. Fields include temperature, precipitation, biomes and productivity. “High resolution” describes the downscaled product, not independently observed local conditions. It supplies environmental context, not human occupancy. [Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7360617/)

[Direct] The [version 4 data record](https://doi.org/10.6084/m9.figshare.12293345.v4) exposes NetCDF, example readers and **CC BY 4.0** in machine-readable metadata. Scriptable acquisition: [Figshare version API](https://api.figshare.com/v2/articles/12293345/versions/4), then its `files[].download_url`; the main file is [LateQuaternary_Environment.nc](https://ndownloader.figshare.com/files/22659026), 1,333,236,636 bytes, published MD5 `d23abb7ce8671433ea36a2cae814ebab`. Metadata was fetched; the 1.33 GB raster was not downloaded. Pin version, file ID and checksum. The [pastclim maintainer documentation](https://evolecolgroup.github.io/pastclim/reference/Beyer2020.html) describes a processed variant with ice masking and modern Black/Caspian outlines held constant: preserve that variant's provenance if used instead. Do not silently mix masks from different products.

**[Direct] Timmermann & Friedrich (2016): usable global scenario, not a default population layer.** The [paper](https://doi.org/10.1038/nature19365) models human dispersal over 125 ka with climate and sea-level forcing. The [density portal](https://climatedata.ibs.re.kr/data/human-dispersal-simulation/human-density) advertises millennial snapshots and individuals per 100 km². An actual [OPeNDAP metadata query](http://climatedata.ibs.re.kr:9090/dods/public-data/human-dispersal-simulation/human-density.dds) returned **120 × 180 × 360**, with 1° spacing and early/late-exit variables `human_density_a/b`. A subset of `mtime` returned **1–120 kyr BP**, so use the delivered range rather than assuming the advertised 125 ka is present. The artificial `time` axis is not a calendar: read `mtime`, retain missing-value flags, and normalize the -19.5°…339.5° longitude convention before mapping. These are observable access facts, not validation of its population estimates.

[Direct] Scriptable route: the OPeNDAP base above with `.dds`, `.das`, and constrained `.ascii` queries (curl needs `-g` for brackets), or a compatible NetCDF client. [ICCP's licence notice](https://climatedata.ibs.re.kr/) says both “Attribution 4.0” and “CC BY-NC,” then explicitly restricts reuse to noncommercial purposes. **Licence unresolved: do not treat it as unrestricted CC BY.** Clarify the exact grant before public ingestion. [Inferred] If cleared, show it as an optional named model/scenario, with no claim that calibration reproduces reality everywhere.

**[Direct] Timmermann et al. (2022): habitat comparator with an access gap.** The [paper](https://doi.org/10.1038/s41586-022-04600-9) produces species-specific suitability using climate and fossil/artefact evidence; its downscaled analysis uses 1° and 1 kyr means across 2 Ma. Suitability is not census density. Its supplementary occurrence table runs to 30 ka and excludes Australia/Americas, so it cannot alone validate global coverage. The article is CC BY 4.0, subject to third-party exclusions; that does not settle the server's conflicting data terms. The [current habitat portal](https://climatedata.ibs.re.kr/data/hominin-habitats) marks both data-access routes “to be updated,” maps indices 0001–2001 to 2 Ma–present, and warns the shared simulation omits CO₂ fertilization contrary to the paper's Methods. No current downloadable habitat raster was verified. **Hold as a comparator**, with access and version reconciliation required.

**[Direct] Shao et al. (2024), Our Way Model: regional method example.** Covers Aurignacian dispersal in Europe, **45–25 ka**, with a 125-member parameter ensemble; it does not describe all humans or the full period. The [paper and 2025 correction link](https://doi.org/10.1038/s41467-024-51349-y) document uncertainty and dependence on archaeological training data. [Figshare data v1](https://doi.org/10.6084/m9.figshare.26174980.v1) metadata confirms **CC BY 4.0** and a 5,544,864,415-byte `Data.zip`; scriptable [API](https://api.figshare.com/v2/articles/26174980/versions/1) gives the [download](https://ndownloader.figshare.com/files/47424661). The archive was not downloaded; native grid/output cadence were not verified. [Inferred] Useful later as a regional comparison, not a global fill. Consult the correction before reproducing figures.

### Archaeological occurrence sources

**[Direct] ROAD / ROCEEH: preferred early evidence catalogue.** Africa and Eurasia, **3 Ma–20 ka BP**; locality/assemblage/date records with source-linked ages and spatial precision, not regular population cells. The [database paper](https://doi.org/10.1371/journal.pone.0289513) explains its structure. [Official project](https://www.hadw-bw.de/en/roceeh) and [roadDB](https://github.com/sommergeo/roadDB) confirm data **CC BY-SA 4.0**; preserve attribution and share-alike terms on adapted data products rather than assuming an article's CC BY terms apply to the database. It leaves the ~20–11.95 ka endpoint gap, Sahul and the Americas uncovered.

[Direct] The [roadDB tutorial](https://www.sommergeo.com/roadDB/tutorial.html) documents `road_get_localities()`, `road_get_assemblages()` and `road_get_dates()` with age filters. The package reports snapshot **2026-09-18** and accesses a periodically refreshed remote copy; record query, package version, snapshot and exported results. The package itself is CC BY-SA 4.0. An existing [legacy API query](https://www.roceeh.uni-tuebingen.de/api/Africa-localities-lithics-hominins-paleofauna-120ka-1800ka.php) returned an HTML table with 475 results, proving endpoint access only: its 120–1800 ka interval is outside this task's window. Target-period roadDB queries were not executed. [Inferred] Retrieve intersecting age ranges and inspect their semantics before filtering; do not infer sapiens attribution from a cultural label or give every locality uninterrupted occupation.

**[Direct] p3k14c: complementary later evidence.** Global archaeological radiocarbon compilation with strongly uneven geographic sampling. The [2022 paper](https://doi.org/10.1038/s41597-022-01118-7) describes cleaning and the older-than-55,000-radiocarbon-BP exclusion. It cannot cover the early half of this task. The [download page](https://www.p3k14c.org/download/) provides public **uncalibrated** 2022.06 data with some locations generalized to administrative centroids; restricted true coordinates are not assumed available. The [codebook](https://www.p3k14c.org/codebook/) defines age, one-sigma error and `LocAccuracy` (0–3). Resolution is sample-level date uncertainty plus location precision, not a fixed grid or timestep.

[Direct] [Repository licence](https://github.com/people3k/p3k14c): **data CC0 1.0**, attribution requested; code MIT; text/figures CC BY 4.0. The [direct CSV](https://www.p3k14c.org/data/p3k14c_2022.06.csv) downloaded and parsed: **173,946 rows**, raw ages 30–54,940 radiocarbon BP. Cite this version, not the original publication's larger count. [Inferred] Calibrate with appropriate hemisphere/marine curves and reservoir corrections, deduplicate site/sample records across catalogues, retain multimodal age distributions, and exclude unusable location precision from local map views. Date frequency alone measures research and preservation as well as human activity; it is not population density.

**[Direct] KU Leuven Radiocarbon Palaeolithic Europe Database v33: useful corroboration, rights unresolved.** [Official release](https://ees.kuleuven.be/en/geography/projects/14c-palaeolithic) is March 2026, covering Europe/Siberia and sites older than 9,500 BP, with 14,379 site forms and 22,010 dates. Includes TL/OSL/ESR/U-series/AAR as well as radiocarbon; some dates constrain adjacent layers rather than occupation itself. Site/horizon granularity and coordinate precision vary. [Download page](https://ees.kuleuven.be/en/geography/projects/14c-palaeolithic/download) links Access ZIP and a reduced-column [v33 XLSX](https://ees.kuleuven.be/en/geography/projects/14c-palaeolithic/download/radiocarbon-palaeolithic-europe-database-v33-extract.xlsx); these are scriptable static-file routes, but workbook contents were not inspected. No explicit v33 reuse licence was found on those official pages. **Hold redistribution pending permission.** It partly overlaps p3k14c's source lineage; a second catalogue is not necessarily independent evidence.

### Genetic effective-population histories

**[Direct] PSMC (Li & Durbin, 2011).** Seven modern genomes yield inferred demographic histories roughly 10 ka–1 Ma, with model-dependent time bins and weak recent resolution; there is no ancient spatial grid. [Paper/author manuscript](https://pmc.ncbi.nlm.nih.gov/articles/PMC3154645/) and [scriptable software repository](https://github.com/lh3/psmc) describe text `.psmc` output and plotting/conversion tools. Software is **MIT**; a reusable release and data licence for the original seven fitted histories were not established. Do not confuse software permission with permission to redistribute input genomes or article figures.

**[Direct] MSMC (Schiffels & Durbin, 2014).** Analysis of 34 genomes from nine populations reaches approximately 200 ka–2 ka, with improved recent resolution but still model-dependent bins, not millennial observations or ancient locations. [Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC4116295/) and [software repository](https://github.com/stschiff/msmc) provide a scriptable toolchain, **GPL-3.0** software, and links to successors. Original fitted-history redistribution terms were not established. Both PSMC and MSMC would require licensed input data and computational inference if original derivatives cannot be reused; neither is an ingestion-ready map.

**[Direct] Relate (Speidel et al., 2019): preferred reusable derivative for optional context.** [Released histories v1.0.0](https://zenodo.org/records/3234689) describe 2,478 modern samples and 26 populations. The [direct ZIP](https://zenodo.org/records/3234689/files/coalescence_rates.zip?download=1) downloaded successfully (19,658 bytes); inspected contents include 26 `.coal` files and `popsize.RData`. The [record API](https://zenodo.org/api/records/3234689) explicitly records **CC BY 4.0** for data. Epochs are irregular intervals in generations: the record uses 28 years/generation and derives diploid effective sizes from 0.5/coalescence rate. Software has [separate terms](https://myersgroup.github.io/relate/index.html); do not infer that its software licence is CC BY. The released derivative avoids needing to run that software for an explanatory chart.

[Supported] These curves concern genetic ancestry and coalescence under assumptions about mutation rates, generation lengths, migration and structure. They cannot uniquely identify census totals, let alone where people lived. [PSMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3154645/), [MSMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4116295/). [Inferred] Never multiply effective population by a universal conversion factor, sum modern descendant-group curves into a world total, or place ancestors at present sample coordinates. Keep genetics as explanatory context, not a constraint that supposedly validates a population map.

### Sea level, palaeocoasts and ice

**[Direct] Spratt & Lisiecki: recommended full-period sea-level context.** [Version 2 (2025)](https://doi.pangaea.de/10.1594/PANGAEA.979830) replaces the discussion-paper dataset with final published data: **CC BY 3.0**, scalar global sea level across 0–798 ka BP, 1 kyr rows and uncertainty bounds. Both the [direct PANGAEA TSV](https://doi.pangaea.de/10.1594/PANGAEA.979830?format=textfile) and [NOAA source text](https://www.ncei.noaa.gov/pub/data/paleo/paleocean/by_contributor/spratt2016/spratt2016-noaa.txt) downloaded; the latter has 799 rows. The [paper](https://cp.copernicus.org/articles/12/1079/2016/) reports average one-sigma uncertainty around 9–12 m. The old [854045 record](https://doi.pangaea.de/10.1594/PANGAEA.854045) now reports licence unknown and points to its replacement: do not copy its old metadata into a new pipeline.

[Inferred] Sea level plus modern bathymetry can illustrate exposed shelves, but cannot recover exact ancient coastlines: local glacial-isostatic displacement, tectonics and sedimentation matter. A global sea-level curve is neither a relative-sea-level grid nor an ice-margin reconstruction. Its uncertainty should not disappear when drawing a crisp line on the globe.

**[Direct] PaleoMIST 1.0: useful physical reconstruction with insufficient early coverage.** The [data record](https://doi.pangaea.de/10.1594/PANGAEA.905800) provides global ice margins/thickness, deformation, sea-level change and palaeotopography in **1° and 0.25° NetCDF**, at **2.5 kyr intervals, 80 ka BP–present**. Data licence is **CC BY 4.0**; [JSON-LD metadata](https://doi.pangaea.de/10.1594/PANGAEA.905800?format=metadata_jsonld) was fetched, and the [direct 3.5 GB ZIP](https://hs.pangaea.de/Maps/Global_Ice_Sheets/Gowan_ice_reconstruction.zip) is linked. Full archive contents were not inspected. [Study](https://doi.org/10.1038/s41467-021-21469-w). [Inferred] This cannot provide the 100,000 BCE backdrop: 80 ka BP is only about 78,000 BCE. Do not freeze its earliest frame across the missing ~22 kyr or stitch it to another model without checking boundary discontinuities. It is a later optional refinement within its actual range.

**[Direct] ICE-6G_C: exclude as the full-span baseline.** The [author distribution page](https://www.atmosp.physics.utoronto.ca/~peltier/data.php) advertises topography snapshots for **26–0 ka**, at 1 kyr and then 0.5 kyr steps, with gridded sea-level/displacement fields. Its indexed primary text was accessible, but a live web fetch returned 502; redistribution licence and native grid spacing were not verified. Static downloads are advertised there, not proven acquired here. Its separately listed ICE-5G 122–27 ka files explicitly warn that pre-LGM ice margins are unrealistic. Do not treat that listing as a credible 100k ice solution or assume citation requests grant redistribution rights.

[Inferred] Use the long-span climate product's documented land/ice convention only after inspecting its actual masks; the processed pastclim variant above is one documented route. This is a condition for a future physical-geography layer, not a verified full-span palaeocoast solution. Spratt v2 can already inform a separately labelled sea-level context curve. Do not promise exact coastlines for every slider date from these findings.

### Access verification and limits

[Direct] The investigation fetched real metadata/data rather than relying solely on landing-page claims: Beyer/Our Way Figshare JSON; ICCP DAP dimensions, attributes and `mtime`; public p3k14c CSV and row profile; ROAD legacy API response; Relate ZIP and licence metadata; Spratt TSVs; and PaleoMIST JSON-LD. Payloads and research observations are preserved in the Manager workspace's `evidence/` directory, outside git. Their small-file access is verified; end-to-end ingestion and scientific validation are not.

[Direct] Nature browser redirects failed for some papers, so PMC author manuscripts and primary dataset APIs supplied the evidence where available. ROAD's target-period R query was documented but not run; the legacy query demonstrates connectivity only. The regional workbook and multi-GB model archives were not parsed. No UI or application behaviour changed. Blast radius is documentation only: no runtime schema, dependency, data file or renderer is changed by this recommendation.

## Conclusions

[Inferred] A continuous numerical population surface from 100k to 10k BCE is **NO-GO on the assessed evidence**. An explicitly incomplete atlas of dated presence is feasible. ROAD plus p3k14c supplies a useful starting catalogue, not complete world coverage. Beyer climate fields provide full-period environmental context. Global population counts should remain unavailable before HYDE rather than be extrapolated from suitability, site counts or genetic effective population.

## What We Don't Know

- Complete, globally balanced evidence for Sahul, the Americas and submerged continental shelves was not established. Search covered ROAD, p3k14c and the European/Siberian catalogue; their advertised scopes must stay visible.
- Licence clarification for ICCP data and KU Leuven v33, and current downloadable 2022 habitat products, remain unresolved. These rule those sources out of immediate public ingestion, not completion of this research.
- Large climate/Our Way archives were assessed through primary papers and repository metadata, not loaded end to end. Target-period roadDB retrieval, age semantics, calibration quality and cross-catalogue duplication need a later ingestion experiment.
- No empirical uncertainty field supports a single worldwide “confidence” scalar. Scenario spread and sample date uncertainty do not include all research, preservation or model bias.

## Recommendations

### An honest fog of history

[Speculative] Use a restrained **evidence mode** before 10,000 BCE, labelled persistently “Dated evidence of human presence — incomplete record.” This is a proposed design, not a tested UI.

1. **Known evidence:** small hollow site marks with spatial footprints reflecting coordinate precision; aggregate at globe scale as evidence clusters labelled with record counts, never people. Clicking exposes the original date range/method, taxon or “attribution uncertain,” source and interpretation. Do not imply one sample is one camp.
2. **Temporal uncertainty:** show the selected date as a coarse window. An interval overlapping the window means “may date to this period,” not continuous occupation. Where calibrated distributions exist, expose them; do not invent uniform probabilities for simple min/max bounds. Cosmetic fading may soften transitions but must not imply evidence of migration or annual precision.
3. **Unknown areas:** low-contrast neutral stipple/hatching, explicitly labelled “No mapped evidence; people may have been here.” It represents record incompleteness, not a measured probability or human absence. Do not use animated smoke, luminous clouds, or a global darkness value that pretends uncertainty is uniform. Distinguish missing coverage from searched areas; do not claim a survey where none is documented.
4. **Models:** keep inferred habitat/range as a separately keyed, muted outline or hatch, with scenario name, native resolution and “modelled, not observed” label. Do not paint all suitable territory as inhabited. A climate layer without an occupancy model says “environmental conditions,” not “human range.”
5. **Physical geography:** subdued sea/land and ice masks with model date and source. Hide unsupported precision on zoom. Do not present sea-level contours on today's topography as exact ancient shorelines or render sites on submerged shelves as impossible.
6. **Counter and boundary:** show “Population estimate unavailable” in evidence mode. At 10,000 BCE make an explicit legend/mode transition to “HYDE modelled population”; offer evidence for comparison, but never interpolate units across the boundary. HYDE is also a reconstruction, not a census made in 10,000 BCE.
7. **Taxa:** use Homo sapiens as the primary narrative, but explicitly identify non-sapiens and uncertain evidence rather than erasing contemporaries or calling all archaeological sites modern humans. Keep uncertain attribution visible without requiring the user to configure an expert taxonomy panel.

### Decision and next work

| Candidate approach | Decision | Tradeoff |
|---|---|---|
| Back-project HYDE dots / tune global counts to genetics | Reject | Visually continuous but unsupported units and geography |
| One global habitat/dispersal model as historical truth | Reject | Full spatial coverage hides scenario and calibration dependence |
| Dated evidence + separately labelled environment/models | Recommend | Incomplete coverage is visible; no pre-HYDE population counter |
| Keep 10k BCE minimum until evidence ingestion passes | Safe release choice | Smaller promise, honest current capability |

[Inferred] Select **ROAD + public p3k14c for dated evidence, Beyer v4 for full-span environmental context, and Spratt v2 for sea-level context**. Relate is optional explanatory material. Hold ICCP public layers and KU Leuven redistribution for licence clarification; keep PaleoMIST within its 80 ka range. No assessed source earns a pre-HYDE population counter.

[Inferred] Next, scope a small ingestion experiment for ROAD plus p3k14c: freeze versions and licences, export overlapping date intervals, calibrate a reviewed sample, reconcile duplicate sites, inspect taxonomic/location uncertainty, and map coverage gaps. A later feature spec should make absence/missing distinctions and the HYDE mode boundary acceptance criteria. Do not extend the production slider until this succeeds. This note completes source selection research; it does not claim ingestion, scientific validation or UI validation has happened. No follow-up task or implementation is created by this research-only dispatch.
