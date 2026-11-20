---
id: past-terrain
type: note
purpose: "Evaluate open past terrain, sea-level and inland-water sources and choose a bounded first build"
scope: [terrain, ice, isostasy, sea-level, freshwater, coastlines]
non_goals: [application-changes, deployment, definitive-palaeogeography]
tags: [research, modelled]
related: ["ops/terrain-images.md", "ops/site-terrain.md", "ops/water-distance.md"]
---

# Past terrain and water

Research date: 2026-11-21 (NZ). Steady `a2895bfe-9aeb-42f5-9c29-266db75d4bcd`.
Vision alignment: **Footsteps of Time: vision** — a plausible, explicitly modelled landscape for ordinary lives; no claim to measured settlement locations or authoritative local geography.

## Question

Which public sources can replace modern terrain plus global sea level with past ice surfaces, land height, regional sea level, lakes, drainage and delta/coast geography? What can we build first, at S/M size, behind a URL flag?

## Context

**[Direct: code] The premise is mostly correct, but Mega-Chad is already painted.**
`footstep-generator/terrain_image.py:311` computes a box-limited, elevation-threshold lake at roughly 329 m, weighted by `sahara_weight` (`:91`, fade-in −9750…−8250; fade-out −4250…−2750 calendar years). It is composited at `:383`. This is an independently generated visual approximation, not a supplied dated lake polygon. Green Sahara vegetation is also an existing overlay (`:296`). Neither supplies past water to the settlement pipeline.

**[Direct: code]** `terrain_image.py:209` reads modern ETOPO1; its `sea_level` (`:291`) shares the global sea-level series. `footsteps-web/lib/climate.ts:8` interpolates that series without a location argument. `footstep-generator/site_terrain.py:160` decodes Terrarium; its generated 2.5′ image encodes present sea depth/share, modern lake presence and slope. `water_distance.py:135` reads present Natural Earth water, optionally adding caller-supplied GeoJSON; `:291` writes one year-independent image. A palaeo-water GeoJSON alone would change distances but would not exclude camps inside the added lake.

**[Direct: code]** `footsteps-web/components/footsteps/hooks/gridData.ts:181` loads the static site image, and `:203` loads static water distances. `components/footsteps/layers/siteRanking.ts:86` caches rankings using modern terrain and the global sea level. `footsteps-web/lib/close3d.ts:224` builds relief from Terrarium heights plus a scalar sea plane; the caller is `components/footsteps/layers/Close3DLayer.ts:80`. Neither reconstructs ice thickness or GIA. Changing only a colour image cannot correct these heights.

**[Direct: git]** `2028734d69d4a6477f5eb4d63e843a1f9c43ad22` disables the modern coastline stroke unless `?coast=1`; it does not add past coast geometry, water or terrain. This research remains needed. Repository README/ops docs are current references; this checkout has no `docs/index.md` or research template, so this note uses the research skill's fallback sections.

## Scope

- Investigate public data, actual access, licence, spatial/temporal resolution, bytes, integration and residual uncertainty.
- Distinguish downloadable model fields from observations, schematic figures and data available only by request.
- Research only. No application, production data or deployment changes. No raw archives committed.

## Findings

Labels: **[Direct]** observed in source/code/HTTP metadata; **[Supported]** supported by a primary publication; **[Inferred]** engineering judgment; **[Speculative]** an untested reconstruction. All proposed past geography is **modelled**, even where observations constrain it. Public download does not by itself grant redistribution rights.

### 1. Global ice, land height and regional sea level

**[Direct: catalogues; inferred costs]** These are distinct releases, not interchangeable “1° back to 26 ka” products. MB/GB below are decimal; estimates are explicitly marked. HEAD confirms transfer metadata, not a checksum or valid NetCDF payload.

| Source / access | Grid and dates | Licence and size | Integration, cost and limits |
| --- | --- | --- | --- |
| [ICE-6G_C VM5a, PMIP4 release](https://pmip4.lsce.ipsl.fr/doku.php/data:ice_ice6g_c) | 2160 × 1080, 10′; 48 epochs, 0–26 ka BP; 0.5 ka to 21 ka, then 1 ka | Public LSCE download; **data redistribution licence not established** on inspected page. 0 ka file HEAD: **37,340,092 bytes**; ~1.79 GB for 48 similarly sized files is an estimate | `Topo`, `Orog`, land/ice masks; surface includes grounded ice. Offline adapter → terrain coast/colour and ice-surface mesh; separate bed correction requires thickness/datum verification. **M** for a bounded preview; coherent global replacement across all consumers exceeds M. Grid spacing does not establish 10′ accuracy; no dated lakes, sediment or channel change. |
| [GLAC-1D, PMIP4 release](https://pmip4.lsce.ipsl.fr/doku.php/data:ice_glac_1d) | 360 × 360: **0.5° latitude × 1° longitude**; 261 steps, 26–0 ka BP at 100 yr. Separate 140–122 ka series does **not** cover 100–26 ka | Public LSCE download; **redistribution licence not established**. Deglacial `TOPicemsk…nc` HEAD: **811,823,560 bytes**; companion thickness/drainage files extra, sizes not measured | HDC surface, HDCB distinct floating-ice treatment, ICEM fractional ice. Thickness and drainage-pointer companions useful. **M** source adapter/limited preview. Not a ready paired bed-and-geoid history; inspect files before treating elevation relative to contemporary sea as absolute land uplift. Meltwater routing is not perennial local river geometry. |
| **ANU family**: [PMIP3 description](https://wiki.lsce.ipsl.fr/pmip3/doku.php/pmip3:design:pi:final:icesheet), [later ANU-ICE description](https://zenodo.org/records/5560862) | Merged global model described at 1°, mainly 0.5–1 ka; regional versions differ. **No verified single full global history/span** obtained | Full-history payload, size and reusable licence **not verified**. The readily downloadable Zenodo deformation bundle is 12.7 MB plus 77.6 KB readme | ANU is a family, not a pinned drop-in product. The Zenodo grids are **present deformation/geoid rates (mm/yr)**, not past land/sea-height epochs. Do not integrate today's uplift rate backwards over 26 kyr. Not suitable for a headless first build without acquiring an identified licensed history. |
| **[PaleoMIST 1.0](https://doi.pangaea.de/10.1594/PANGAEA.905800)** | Global 1° and 0.25° products; **0–80 ka**, 2.5 ka epochs | **CC-BY-4.0**, publisher-listed **3.5 GB** archive. Metadata readable; archive HEAD returned **503**, so payload not inspected | Ice thickness, deformation/sea-level change, palaeotopography and reconstruction scripts: strongest explicitly open combined candidate found. **M** to ingest native epochs and prove datum/geometry on a limited preview; global integration later. Does not cover 100–80 ka; 2.5 ka is too coarse for abrupt lake drainage or exact settlement-era coasts. |

The PMIP native-release distinction matters: older 1° ICE-6G distributions and this 10′ PMIP repackaging should not share a manifest identifier. PMIP pages publish checksums; eventual ingestion must pin the actual file digest and inspect variable attributes. **[Inferred]** Cite-request text on an author's page and a wiki-wide content licence are insufficient to assert a reusable licence for every binary. The inability to verify these licences is a dataset-selection result, not a blocker to finishing this research.

**[Supported]** PaleoMIST's [primary paper](https://doi.org/10.1038/s41467-021-21469-w) describes alternative Laurentide configurations and notes that coarse time stepping fits near-field deglacial sea levels less well than an interpolated 500-year experiment. Its apparent finer grid is not independent fine-scale evidence. Preserve model/version and scenario; do not imply that a single reconstruction resolves uncertainty. Do not fill 80–100 ka by freezing its oldest ice sheet.

### 2. Domain contract before any height logic

**[Inferred: proposed contract]** Use one `GeoFrame(model, version, scenario, calendarYear)` with coverage, source epoch(s), age scale, horizontal CRS, vertical datum, and field semantics. The fields are conceptually:

| Field | Meaning / invariant |
| --- | --- |
| `bedHeight`, `bedChange` | Solid surface, including submerged bed; never assume a modern ice-surface DEM is bedrock. |
| `iceThickness`, `iceSurface`, `iceKind` | Grounded/floating/no ice/unknown. Grounded surface = bed + thickness; floating geometry needs its own treatment. |
| `seaSurface`, `relativeSeaLevel`, `heightAboveSea` | Different representations. State which one the source actually supplies and its present baseline. Never subtract global sea level from terrain already expressed relative to its contemporary sea. |
| `waterGeometry`, `waterLevel`, `waterState` | Geometry plus dated freshwater/saline/brackish/unknown classification; dry and unobserved are separate. Wet exclusion is independent of drinking-water proximity. |
| `validity`, `uncertainty`, `provenance` | Unknown outside coverage; dates are observations/intervals/model epochs, not arbitrary annual truth. Raster resampling never increases evidence resolution. |

For absolute bed `B` and sea surface `S` in a common datum, dry-ground height is `B − S`. For a verified relative-sea-level-change field `R = (S(t)−B(t))−(S(0)−B(0))`, height above sea is present height above sea **minus R**. That equation already includes regional land/sea movement. It cannot separately identify bed uplift. An ice surface or a floating shelf needs additional source fields; it cannot be inferred from R alone.

Convert **calendar BP from 1950**, e.g. 20 ka BP → app year −18050, not −20000. Radiocarbon BP needs calibration before this conversion. Align source longitude seams, pole registration and no-data masks explicitly. Smooth numeric fields only within valid coverage; categorical water transitions require stated chronology rather than fading alpha interpreted as partial freshwater.

### 3. Lakes, rivers and delta/coast records

**[Direct/Supported: linked primary sources; inferred integration costs]** No single open global product found supplies all these as dated high-resolution polygons. “Unknown size” below means no identified ready GIS payload was verified, rather than a zero-cost dataset.

| Gap and source | Licence/access; resolution and dates; size | Pipeline use, cost, and what remains unknown |
| --- | --- | --- |
| **Mega-Chad**: [Armitage, Bristow & Drake 2015, institutional publication record](https://kclpure.kcl.ac.uk/portal/en/publications/west-african-monsoon-dynamics-inferred-from-abrupt-fluctuations-o/); [primary conference abstract](https://meetingorganizer.copernicus.org/EGU2015/EGU2015-13963.pdf) | Dated shoreline evidence, irregular sampling; highstand by ~11.5 ka until ~5 ka BP. No reusable polygon-series licence or GIS payload size verified. Publication access does not license tracing every figure | Constrain the existing ~329 m model, then share dated wet geometry between appearance, lake exclusion and freshwater distance. **M** for a bounded shared-model trial. Existing box/elevation cutoff is not basin connectivity; recent sediment, spillways and interruptions remain uncertain. Do not silently turn the current smooth humid-period weight into measured lake stage. |
| **Green Sahara**: [NOAA Sahara–Sahel database](https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/noaa-recon-11928/html), DOI 10.25921/qg69-f575 | Public TXT/XLS, cite contributors; no explicit CC grant verified, do not presume third-party investigator data are public domain. Irregular lake/wetland observations, catalogue 10.2–1.5 ka cal BP; text describes broader Holocene records in 10–28°N. TXT HEAD **764,494 bytes** | Validation points for regional wet intervals, not shoreline polygons. **S** to ingest evidence; **M per bounded basin** to model water geometry. Records distinguish differing east/west histories; do not fill all Saharan depressions during one uniform humid interval. |
| **Lake-status validation**: [PMIP2 GLSDB](https://pmip2.lsce.ipsl.fr/synth/lakestatus.shtml) | Public, requested citations; specific binary redistribution licence not verified. Site status/dating-quality codes, 599 modern sites; snapshots 6 ka and 18 ka **radiocarbon** BP (LGM approximately 21 ka calendar BP). Listed **12 KB** compressed text / **36 KB** zipped XLS | Small independent check of wet/dry assumptions. **S** evidence ingest, no geometry or lake-level metres. Preserve dating-quality filters and original age scale. Not a global lake mask. |
| **Agassiz / glaciated North America**: [Godbout et al. 2023 data descriptor](https://doi.org/10.1038/s41597-023-02566-5) | Open descriptor; downloadable data licence, total bytes and payload not verified here. Regional 1 km derived rebound/palaeotopography; roughly 26–0 ka at source-model 0.5–1 ka steps, model dependent | Input to lake-stage reconstruction, **not** an Agassiz extent time series. **M** source feasibility/stage prototype, beyond M for defensible full stages. Need stage elevations, changing ice dams, outlets and rebound tilt. Interpolated 1 km output does not give 1 km independent GIA accuracy. A modern DEM bathtub is unsuitable. |
| **Black Sea**: [Yanchilina et al. 2017 primary paper](https://io-bas.bg/downloads/PublikaciaDimitrov-main.pdf), [Yanko-Hombach et al. 2014 institutional record](https://dspace.onu.edu.ua/items/b1b1f1c4-ca03-4821-9324-c1f787b35ae9) | Primary cores/seismic interpretations of latest Pleistocene/Holocene; no dated polygon-series resolution/licence/payload identified. 2014 repository PDF listed **6.94 MB** (paper, not GIS) | Competing pre-reconnection levels: at least ~120 m below present versus around 40 m below. **M** scenario/evidence overlay only; do not pick a definitive flood animation. Basin sill, salinity and chronology matter; neither global ocean level nor “lake” alone establishes drinkable freshwater. |
| **European LGM inland water / shelf drainage**: [Verheul et al. 2015 CRC806 primary metadata](https://crc806db.uni-koeln.de/data/Z/Z2/InlandWaters_CRC806-Database%20%281%29.pdf), DOI 10.5880/SFB806.14 | Metadata says **CC-BY**, version not established. Heterogeneous vector source scales; one LGM reconstruction assigned 26.5–19 ka, not annual frames. Listed river ZIP **80 KB**, lake ZIP **230 KB**. Indexed metadata readable; direct metadata HEAD **500**, payload unverified | Best small ready-geometry candidate found for Europe. Reproject/validate then `--extra-water` can consume derived GeoJSON; lake exclusion needs the same polygons. **S** ingest, **M** integrated flagged snapshot. Some gaps are GEBCO-derived flow routes, not observed channels or perennial discharge. No Persian Gulf or all-period coverage. |
| **Exposed shelves, including Persian Gulf**: GLAC-1D drainage pointers (same PMIP source above); [GEBCO 2024](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2024-grid) as a modern routing input | GLAC companion licence and bytes unresolved; its filename is `GLAC1DdrainagePointerF26ka.nc`. GEBCO has attribution/terms of use, global 15″ grid, 43,200 × 86,400 samples; ~7.46 GB for one int16 field **estimated**, not measured transfer size; modern, no time series | **M** regional routing experiment after datum/GIA correction, not measured palaeorivers. Extract candidate networks on exposed land; screen against regional geological evidence and hydrology before adding freshwater. Present bathymetry includes later sediment/erosion, straits and filled valleys. No ready licensed dated Persian Gulf network was verified. |
| **Holocene Mesopotamian delta/coast**: [Giosan & Goodman 2025](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0329084) | **CC-BY**, data in manuscript/SI; regional Holocene, principally ~8–4 ka BP context. Modern 30 m Copernicus input aggregated to 100 m; schematic dated reconstruction **not 100 m past-coast accuracy**. SI download bytes not measured; no ready coastline-series size established | **M** for a bounded, attributed interpretive overlay with epoch intervals. Core/facies chronology and delta stages can constrain masks; not enough to manufacture a full height field. Avulsion, sedimentation, subsidence and tides remain local. A “~200 km shift” is not a universal offset to apply around Mesopotamia. |

### 4. Where each kind of correction must enter

**[Inferred from the confirmed consumers]** One independently edited raster per feature would create contradictions. A future adapter should emit a shared frame/mask, with consumers using its identity:

| Consumer | Ice/GIA/RSL family | Lake/drainage/delta family |
| --- | --- | --- |
| `terrain_image.py` | Coast from model height relative to its own sea; ice colour from matching model mask. Reconcile/replace Krapp ice override in the flagged mode instead of letting it overwrite the new coast | Paint the same dated water geometry used for exclusion; do not treat RGB blue as the scientific water contract |
| `site_terrain.py` | Current compact depth/share format cannot encode uplift, signed local highstands and changing ice. Generate separate flagged per-epoch channels/masks rather than stuffing these into the modern bytes | Dated lake/estuary exclusion must override modern lake bits; preserve salinity separately |
| `water_distance.py` | Land/ice masks constrain where routes and water sources are meaningful | Generate distances for an explicit epoch/geometry digest. Existing `--extra-water` is spatial addition only: add epoch validity and water class, avoid unioning every era forever |
| `lib/close3d.ts` + `Close3DLayer.ts` | Apply verified low-frequency bed change to a compatible modern **bed** reference, or use the model surface directly under former ice; use matching regional sea representation. Sampling a coarse delta onto fine vertices adds appearance, not accuracy | Lakes require independent local water planes and clipping; a 329 m lake must not be flattened to global sea level. Delta polygons alone do not justify invented local elevations |
| `gridData.ts`, `siteRanking.ts`, Units/land-subcell consumers | Cache keys must include model/scenario/epoch, not only global sea-level state. Excluding reconstructed ocean/ice may leave no candidate spots; retain counts and explicitly report unresolved placement | Water exclusion and proximity must come from the same frame. Lake-filled cells must never silently force a camp into water or lose their population |

This is the blast-radius finding: source ingestion alone is small; a coherent geography replacement is not. Browser caches, worker messages, represented population totals and land-subcell allocation are affected even if the visible change starts as a coastline. No such changes are made in this task.

### 5. Cost and serving budget

**[Inferred: planning arithmetic, not benchmarks]** These data require no paid API or ongoing application server. Expected cost is local download/storage, offline Python generation and static hosting. Keep source archives outside git; reserve several GB for PMIP/PaleoMIST input and additional working arrays. Run one epoch at a time rather than materialising an upsampled 80 ka world cube.

A 1° 360 × 180 float32 field is 0.259 MB; four fields across 33 epochs are **34.2 MB raw**, excluding masks/metadata. At 0.25° the same arithmetic is **547 MB**. A HYDE 4320 × 2160 uint8 distance plane is **9.33 MB raw per epoch**; present compressed distance is ~872 KB, but past compression must be measured. A 2.5′ 8640 × 4320 byte mask is **37.3 MB raw**; use regional patches/deduplicated epochs for one basin. Compressed transfer and GPU cost cannot be inferred from these raw counts. Fetch only the current/bracketing frames when the flag is enabled, bound the decoded cache, measure generated bytes before expanding coverage.

## Conclusions

**[Supported]** We can improve broad ice-sheet surfaces and GIA-aware geography with public model products, but cannot presently claim detailed global geography throughout 100,000 BCE–1900. PaleoMIST is the best explicitly licensed integrated candidate found; PMIP ICE-6G_C and GLAC-1D are useful comparisons with clearer payload access than licensing. ANU is not yet a verified reusable full-history download. Coarse model geometry does not become detailed evidence by draping modern texture on it.

**[Inferred]** Lakes and deltas need regional work. A shared Mega-Chad model would fix a concrete inconsistency already in the app before importing uncertain global height semantics. This is a bounded first build, not a verdict that its existing chronology and bathtub geometry are scientifically complete.

## What We Don't Know

- **[Direct: access]** LSCE HEAD probes returned 200 and payload lengths for ICE-6G_C 0 ka and GLAC-1D deglaciation. No full binary was downloaded, no NetCDF attributes or checksums validated. Peltier's author page returned web 502. PMIP browser fetches sometimes timed out; direct shell metadata fetches worked.
- **[Direct: access]** PANGAEA catalogue worked, archive HEAD returned 503. CRC806 indexed primary metadata supplied file sizes/licence; direct HEAD returned 500 and browser opens timed out. These sources were not bypassed or claimed downloaded.
- **[Direct: access]** Nature/PMC attempts hit identity redirects or reCAPTCHA; ScienceDirect Black Sea pages returned 403. Institutional primary paper copies and repository abstracts support the comparisons. Full North American archive licence, exact bytes/epoch coverage and all variables still need inspection; do not budget it as a verified Agassiz dataset.
- **[Direct: search]** Searched for ICE-6G_C/GLAC-1D/ANU licence and download histories; found no explicit binary redistribution grant for the first two, no full reusable ANU history. Searched Agassiz stage data, Green Sahara/Black Sea extents, shelf drainage and Mesopotamian reconstructions; no ready licensed global dated polygon set found. This is not proof none exists.
- **[Inferred]** A source's vertical datum, reference epoch, whether its topography includes ice, and whether sea-level response is already included must be tested from the actual payload before any browser height integration. Do not double-count RSL, add thickness to ice-surface DEMs, or interpret present uplift rates as historical displacement.
- **[Speculative]** A basin-connected modern-DEM Mega-Chad model is a useful improvement over a rectangle cutoff, but its exact shoreline, fresh/brackish state during transitions and intra-highstand fluctuations remain unverified. Keep them labelled and exclude uncertain fringe water from freshwater claims.

## Recommendations

Ranked by useful correction per bounded build, with explicit limits:

1. **M — shared modelled Mega-Chad water trial, `?pastwater=1` (first build).** Reuse and isolate the existing source-independent ~329 m model. Make a cited, bounded highstand scenario with connected basin geometry and explicit model epoch identity; do not mistake a fade for measured lake level. One geometry drives terrain paint, wet exclusion, freshwater-distance patch and local close-up lake plane. Default off; preserve counts, including explicitly unresolved placement if a cell has no dry candidates. No new global dataset dependency, credentials, paid compute or production deployment required. **M is an estimate, not demonstrated implementation cost:** begin with a regional geometry/API feasibility gate; if the shared mask and 3D plane cannot fit the bounded build, document a NO-GO and file a resized follow-up rather than dropping correctness criteria.
2. **M — PaleoMIST native-epoch geometry proof, then a flagged regional relief preview.** First obtain the CC-BY archive normally, verify checksums/attributes and reproduce a published epoch. Compare 0/10/20 ka frames and a glaciated versus far-field location; prove bed/ice/RSL separation before integration. Stop with a documented NO-GO if source access/semantics cannot be established. Full globe/100 ka support is a later scope, not hidden inside M.
3. **S ingest / M integrated — European LGM lake/river snapshot.** Small published vectors, subject to successful payload access and licence-version confirmation. Respect one-snapshot semantics; do not interpolate them through all Holocene years.
4. **M — Mesopotamian interpreted coast/delta stages**, independently labelled and region-bounded. More useful than making a global sea-level curve imitate sediment growth. Keep figure/source-derived geometry distinct from measured shoreline.
5. **M research prototypes — Agassiz stages, Black Sea scenarios and Persian Gulf drainage.** Each has missing geomorphological/hydrological constraints; none should be the first global replacement.

Filed follow-up: **Steady `eb6ee923-1664-439e-ab09-72bc149aee6c`**, linked to goal `f0043c47-4a93-4f49-9703-f44c2380cd90`, project deep-footsteps, backlog, **M / headless / light**. This files the build; it does not dispatch it.

First-build acceptance criteria for the follow-up:

- A source/model manifest states datum, calendar years, fixed highstand scenario, validity, uncertainty and freshwater assumption; derive basin-connected water and share it between consumers. Unsupported dates/areas remain explicitly outside the scenario, not reconstructed dry land.
- Flag off leaves current app behaviour/data unchanged. Flag on switches all relevant consumers to one model epoch; worker/ranking caches invalidate when water changes even if global sea level does not. Build from existing modern inputs; do not require API secrets.
- Use app year **−6000** (~7.95 ka BP, within highstand) as the modelled-wet trial, **−12000** and **0** as pre-/post-scenario controls. Controls must report **scenario inactive / geography unknown**, not reconstructed dry lakebed; show baseline context with that status. Show the intended mask difference, unchanged world/cell totals, zero **placed** camps in the reconstructed lake, and an explicit count/label for unresolved population rather than silent disappearance or forced placement. Verify highstand shore distances and outside-region invariance.
- Test close-up water at the local plane (roughly 329 m in the documented datum), not ocean sea level. Inspect real-data Units, Grid and Dots with/without flag; Dots may retain its static archive but must clearly state that its positions do not follow the experimental model. Do not imply it has been regenerated.
- Record generated transfer bytes and screenshot evidence; run applicable Python/frontend/static-export checks. Keep all default geography and rollout unchanged until Will reviews the flag on production in a separate authorised step.

### Reproduction and verification

`python3 docs/research/0014-past-terrain/probe_sources.py` emits bounded HEAD observations as JSON without downloading archives. Store stdout under the Manager workspace `evidence/` directory. It deliberately returns research observations for failed sources rather than mistaking HTTP availability for a scientific or licence test. Consult source pages above for scientific metadata; the script checks access/transfer bytes only.

The research commit changes only this note, its small probe and the per-job log fragment. No app behaviour is claimed tested or changed. Manager reviews and lands the committed branch to main; this job does not write the primary checkout.
