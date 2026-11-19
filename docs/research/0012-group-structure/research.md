---
id: group-structure-research
type: note
purpose: "Where groups should sit inside a cell, how to show nested levels, farmer settlement hierarchy and political groups: options, sources, labels and a recommended first build behind a URL flag."
---

# Better human groups: placement, nesting, hierarchy, polities

Research date: 2026-11-19. Steady task `49ea43d2-787a-489f-b106-cc45cf534b3e`. Research only: no app code changed.
Vision alignment: *Footsteps: how people lived (ways-of-life layer)*. This is about the shape and place of the groups
that layer already colours.

## Positions

1. **Placement.** Yes, weight positions by data, but only data finer than a cell can move a group inside it. HYDE land use,
   Krapp biome and Beyer climate are cell-sized or coarser, and cell totals are fixed, so they add nothing inside a cell.
   The data that does: sub-cell **terrain** (elevation, slope; Terrarium tiles, already in the app), **distance to
   water** (rivers and lakes, a small new static layer) and **the year's coast**. Recommended: each cell gets a fixed,
   ranked list of candidate sites; group number *k* always sits at site *k*. Scrubbing time then never moves a group, and
   cell totals are untouched. Label: **modelled** for the rule, **imagined** for the exact spot.
2. **Nested levels.** Worth doing in a small way. Model three levels from Binford-derived numbers (household about 4.5,
   camp 15–50, regional group of hundreds), draw the camp as now, show households only when zoomed to street level, and
   show the regional group only as a faint tint on hover or selection. Never draw all three at once.
3. **Farmer hierarchy.** Use the D-PLACE EA030 mix the experiment already has, and add one thing: a rank-size tail for
   how big the biggest village or town in a region is. The sources support the shape (convex, tens to hundreds of people
   per village) but not exact exponents. Everything past the village is **imagined**; keep it a hover-card fact, not map
   geometry, until a better source turns up.
4. **Political groups.** **Not as borders.** `docs/philosophy/vision.md` says "Not empires and wars. No borders", and the
   open polity shapes (Cliopatria, CC BY 4.0) are rough and Eurasia-heavy, so lines would look more precise than the data is. Use them
   at most as a **hover-card name** ("inside the Han polity, per Cliopatria"), exactly as Seshat polity names already
   appear in the atlas for 35 sites. Pre-state cultural areas are a better fit for the vision than empires, but the only
   open global source is present-day language areas; it is a later experiment.

**First build:** data-weighted positions behind `?settlements=1`, the flag the experiment already has. See
[Recommended first build](#recommended-first-build).

## Premise check

The task note says positions are "random but evenly spread". Checked against the code on this branch (main at `adb724b`):

| Claim | Finding |
| --- | --- |
| Positions are random, stable, invented | **True.** `units.ts:96-114` seeds a PRNG by cell and jitters ±0.45 cell. `AGENTS.md` calls them "invented, stable". |
| Evenly spread | **Not quite.** `settlementUnits.ts:76-86` picks **two random anchor points per cell** (±0.325 cell) and alternates groups between them with ±0.15 cell noise. Groups in one cell clump at two points; nothing spaces them from the next cell's groups. |
| Uses terrain, water or coast | **No.** Neither builder tests land or water, so a group in a coastal cell can sit in the sea or on a lake. (Read from the code; I did not count how many do.) |
| ID contract | Ids are `cell × 32 + slot + ordinal` with up to 20 bands, 4 villages, 4 camps per cell (`units.ts:18-24`). Any new placement must keep this so the year morph still pairs a group with itself. |
| Polity data is absent | **False.** Seshat Equinox 2020 polity names for 35 sites are already in the atlas (`footstep-generator/anthropology/README.md:33`). Research 0007 flags that its Zenodo licence reads AGPL-3.0 while Seshat's site says CC BY-NC-SA, unresolved. |
| "Groups" in `human-constants.md` is only partly covered | **True.** It lists nested groups as an open question (line 68). |

Other facts the options rest on:

- A HYDE cell is 5 arc-minutes (about 9 km, about 85 km²; `docs/ops/grid-images.md`). Pre-10,000 BCE people come from 0.5° images upsampled to the same 5′ cells.
- The local relief file is `data/raw/etopo/etopo_4min.nc`, **4 arc-minutes**: about the size of one cell, so it cannot rank positions inside a cell.
  Sub-cell relief needs Terrarium (the app already fetches it for the close-up, `lib/close3d.ts`) or a new download.
- The Units view already runs viewport slices in a worker (seasons), so a per-slice step is an existing pattern.

## 1. Placement

### What the literature says (and how firmly)

Read directly unless marked.

| Statement | Source | Strength |
| --- | --- | --- |
| Dutch LBK sites are "on the edge of a loess-covered plateau", "within 750 metres of a perennial watercourse" and "on more or less flat terrain", with exceptions | Bakels, [Leiden repository](https://scholarlypublications.universiteitleiden.nl/access/item%3A2731998/download) | One region, quoted by a delegated reader |
| LBK villages "in close proximity (500 meters or less) to second- or third-order streams" | [encyclopedia.com, First Farmers of Central Europe](https://encyclopedia.com/humanities/encyclopedias-almanacs-transcripts-and-maps/first-farmers-central-europe) | Tertiary source |
| Yangshao, Songshan area: river system ranked first, then slope, elevation, soil; preferred about 100–200 m elevation, slope about 2–3°, river within about 500 m | Yan et al. 2021, [ISPRS IJGI 10(4):217](https://mdpi.com/2220-9964/10/4/217) | Search snippet only (page blocked) |
| Longshan, Loess Plateau: temperature, elevation, river distance and precipitation drive site presence | Cui 2024, [Heritage Science](https://link.springer.com/10.1186/s40494-024-01194-5) | Abstract-level |
| Where early farming sites sit off loess, "terrain and hydrology rather than the presence or absence of loess were the primary determinants" | Bogaard & Outram, [Cambridge](https://cambridge.org/core/services/aop-cambridge-core/content/view/FE48D1DBDDF5C65AA54C4090720990A0/9781107128774c7_137-162.pdf/integrated-case-study-i-early-farming-in-central-europe.pdf) | Summary only |

**Not found:** quantified aspect (south-facing), river-terrace, ecotone or defensibility figures for foragers from Binford 2001,
Kelly 1995/2013 or Bailey & Davidson. I did not read those books. Qualitatively all agree that foragers camp near water and
on resource edges, but there is nothing here to fit a number to. **The forager distance-to-water decay length is
therefore invented**, and the note says so on screen.

So the supported rule is narrow: **farmers: near a stream, flat ground (about 500–750 m, slope a few degrees)**, from three
regions with a shared loess-and-river setting. For foragers the supported rule is only "near water, not on very steep ground".

### Spacing

- Hamilton et al. 2007, Proc Natl Acad Sci 104(11):4765, [doi:10.1073/pnas.0611197104](https://doi.org/10.1073/pnas.0611197104)
  (open): across Binford's 339 societies, home-range area scales with population as a power law with exponent 0.70
  (95% CI 0.58–0.83), r² = 0.24, so the scatter is about two orders of magnitude. Read by a delegated reader.
- With natural logs the printed fit gives A ≈ 63·N^0.70 km² (about 680 km² for 30 people, about 4,900 km² for 500).
  I checked it against the Marlowe 2005 median density of 0.12 people/km²: 500 people over 4,900 km² is 0.10/km². The
  two agree, which supports the log reading. This is an **inference from a fit with a wide scatter**, not a measurement.
- Median residential group 27 people (range 13–250) at median density 0.12/km² ([Marlowe 2005 table via PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2999363/table/T1), snippet only).
  That gives one camp per about 225 km², so the average spacing of camps is **about 15 km, larger than a 9 km cell**.
  My arithmetic; no source states a spacing.
- Consequence: in sparse forager cells a cell usually holds zero or one group, and the "spacing" is a property of
  *neighbouring* cells. Per-cell Poisson-disk sampling would do nothing there. Spacing only matters where a cell holds
  several groups (farm cells, rich coasts), and there a simple minimum distance of about 0.5/√λ (the mean nearest-neighbour
  distance of random points; Clark & Evans 1954) is enough. I did not verify the Clark–Evans constant in a primary source.

### Data we have or could add

| Data | Resolution | Moves a group *inside* a cell? | Licence | Browser cost |
| --- | --- | --- | --- | --- |
| HYDE crop/grazing share | cell | No (cell-level; totals fixed) | HYDE terms (not re-verified here) | none, already loaded |
| Krapp biome, Beyer climate | 0.5° | No | existing | none |
| Year's sea level and coast | Terrarium vs Spratt series | **Yes**: removes sea; moves fishers to the shore | existing | small |
| Elevation, slope | Terrarium (z about 8–10 near the viewer; about 150–600 m/px) | **Yes** | AWS Terrain Tiles, already used | tile fetch per viewport, decode in worker |
| Distance to river / lake | new | **Yes** | see below | a static layer |
| Ice | Beyer/ice extent | Removes cells, not positions | existing | none |

Water layers:

| Source | Size | Licence | Fit |
| --- | --- | --- | --- |
| [Natural Earth 10m rivers + lake centerlines](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/) v5.0.0 | about 2 MB | Public domain (per its page) | Smallest, no licence risk, but omits small streams |
| [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers) | 544 MB global shapefile | "freely available for scientific, educational, and commercial use" (HydroSHEDS agreement; I did not retrieve the agreement text) | Complete; use offline to bake a raster, ship only the raster |
| HydroLAKES | about 1.4 M lakes of 10 ha or more | Reported CC BY 4.0 (unverified) | Check before use |
| JRC Global Surface Water | 30 m, very large | Open (Copernicus), no explicit line found | Too heavy; mean of present day |

HydroSHEDS' site terms say "personal, non-commercial use only" for site material while data licences sit on product pages, so **read the
data agreement before committing a derived raster**. That is a check for the follow-up task, not something decided here.

**Honest limit: modern rivers are a poor guide in humid-phase Sahara and Arabia and on exposed shelves.**
Quade et al. 2018 (*Quaternary Research*) find weak evidence for the Sahara "megalakes" outside the Chad basin and argue for
isolated wetlands and small lakes; Drake et al. 2022 (*QSR* 276:107318) put most highstands in MIS 5 or earlier, with only
Megalake Chad and Timbuktu in the African Humid Period. Elsewhere the Yangshao reviewer's remark that the early water system
"has a good inheritance with the modern water system" suggests modern streams are a fair proxy. Mitigation: where the
region is in the Green-Sahara box in `hyde_climate_spread.py`, weight water by 0 and say "water unknown here".

### Anchoring to dated sites

p3k14c sites (19,905 local sites, `data/evidence/p3k14c_sites.json.gz`) say a place was used, not that a group of a size stood there
(effort, not people; `footstep-generator/evidence/README.md`). Pinning a group to a site would imply a count we do not
have. Recommended use is **soft**: where a site's calibrated range covers the year and its accuracy is 2 or 3, give the
nearest candidate site a small weight bonus and tag that group "near a dated site" in the card. Not for the first build, because
the evidence layer already shows the sites directly under `?evidence=1` and users can compare. Park as follow-up.

### Stable under scrubbing, exact under conservation

Design (all inside `buildSettlementUnits`; same arrays, same ids):

1. For each populated cell, build an ordered list of up to 20 candidate sites from a **year-independent suitability field**
   (slope and water distance), choosing sites by weighted best-candidate sampling (each next site: the highest suitability among
   candidates far enough from the ones already taken). Seed by cell id, as now.
2. Group *k* in cell *c* sits at site *k*. When the count goes from 3 to 4 between years, groups 0–2 do not move. This is the
   current "stable while scrubbing" property, and the same `cell × 32 + slot + k` id keeps the year morph working.
3. Year-dependent part is only the coast: a site flooded at this year's sea level is skipped for the next dry one. The shore
   moves in 1,000-year steps before HYDE and at HYDE's years after, so this is a handful of moves near coasts, not a shuffle everywhere.
4. Sizes and cell totals are untouched: the long-tailed size draw and "last group takes the remainder" logic stay as written.
   Position and size are independent, so conservation is exactly as now (the existing test pins it).
5. Mobile bands keep a **range**, not a point: with `mobility` above 0 the mark can drift along a ranked path between the first
   few sites, which fits the seasonal scenario that already moves bands between shared gathering sites.

The cost of a cell's site list is bounded (20 sites × candidate sample of about 64 sub-cells), done once per cell per
session and cached by cell id, as `profileAt` results are today. Memory is about 20 × 2 bytes × populated cells (millions of
cells at most for the densest year; I did not count).

### Where the suitability field comes from

| Option | Positions from | Cost | Reach | Verdict |
| --- | --- | --- | --- | --- |
| A. Terrarium in the worker | Tiles at one fixed zoom for the viewport, slope per sub-cell, plus a baked water-distance image | Tens of tiles (about 150 KB each) per continental view; decode in the worker | Wherever you zoom | **Pick for the first build** for the continental view at fixed zoom 6–7 (about 1.2–2.4 km per pixel), so nothing depends on camera zoom |
| B. Fully baked sub-cell image | A new static 2.5′ (about 4.6 km) or finer raster of suitability | My estimate is several MB compressed (**not measured**) | Whole world, instantly | Good later if A is slow; costs a generator and a deploy |
| C. Water only (no terrain) | One baked distance-to-river image at the cell grid | About the size of one grid WebP (about 1 MB) | Whole world | Cheapest; cannot see slope or the sea inside a cell |
| D. Cell-level only (HYDE, biome) | Already loaded | none | | **Moves nothing** (see the position above) |

Slope from a 1–2 km pixel is a coarse measure of "flat". The close-up's ground mesh uses the same tiles at higher zoom,
so a camp ranked on z7 slope can still stand on a steep patch at street level. The ranking must stay at one fixed zoom
(otherwise positions would move when the user zooms), so accept that mismatch and keep labelling the spot *imagined*.

### Labels

| Part | Kind |
| --- | --- |
| Group count and sizes per cell | **Modelled** (HYDE total is measured; sizes from D-PLACE analogs, see research 0011) |
| Rule "near water, on flat ground, not in the sea" | **Modelled** (farmer rule supported by three regions; forager rule is a guess with a stated decay length) |
| The exact spot | **Imagined**: it is one plausible place among several the rule allows |
| "Near a dated site" tag (later) | **Measured** evidence, modelled link |

Legend wording: *"Where groups sit inside each cell is imagined: a plausible spot near water and level ground."*

## 2. Nested levels

### What the numbers support

Hamilton, Milne, Walker, Burger & Brown 2007, *Proc R Soc B* 274:2195, [doi:10.1098/rspb.2007.0564](https://doi.org/10.1098/rspb.2007.0564),
[PDF](https://www.unm.edu/~robwal/complex.pdf). **Table 1 read directly:** Binford's 339 hunter-gatherer societies; geometric mean
size by level:

| Level (order) | Geometric mean people | 95% CI | Reading |
| --- | --- | --- | --- |
| Family (2) | 4.48 | 4.31–4.67 | household |
| Dispersed group (3) | 15.60 | 14.68–16.58 | foraging party |
| Aggregated group (4) | 53.66 | 49.86–58.29 | camp or village |
| Periodic aggregation (5) | 165.32 | 152.25–181.00 | seasonal gathering |
| Regional population (6) | 839.19 | 736.36–954.03 | dialect or regional group |

The branching ratio (how many groups of one level make one of the next) is 3.77 (3.68–3.87), 3.37–3.95 by continent. The
authors state that "all distributions are approximately lognormal" with "considerable overlap in all group sizes".
Zhou, Sornette, Hill & Dunbar 2005, *Proc R Soc B* 272:439, [doi:10.1098/rspb.2004.2970](https://doi.org/10.1098/rspb.2004.2970)
(preprint [arXiv:cond-mat/0403299](https://arxiv.org/abs/cond-mat/0403299) read by a delegated reader) get a ratio close to 3 from a different
data set (layers about 4.6, 14.3, 42.6, 132.5, 567, 1,728). Both are in the same family: **nested, each level three to four times the one below, wide spread.**

Other numbers: median residential group 27 people, range 13–250 (Marlowe 2005, above); mean experienced band size 28.2 adults
across 32 societies (Hill et al. 2011, *Science* 331:1286, [doi:10.1126/science.1199071](https://doi.org/10.1126/science.1199071),
abstract level; the "3–7 households per camp" figure I saw was unattributed, so I do not use it). Early farmers: an average of
five people per dwelling at Çatalhöyük East (Kuijt & Marciniak 2024, via [Science News](https://www.sciencenews.org/article/earliest-farming-villages-housed-people)),
one site; peak population revised to 600–800. Kelly 2013 and Binford 2001 themselves could not be read; I take Kelly's "about 25"
as unverified. The Dunbar 500 and 1,500 layers are not firmly measured. The Binford data licence is unconfirmed (D-PLACE
derivative: CC BY-NC 4.0, already accepted in this repo).

**Supports as inputs:** a lognormal size per level with a ratio of 3–4 between levels; household about 4.5; camp 15–50;
regional group a few hundred to about 850. **Would be invented:** a fixed number of households per camp (not extracted), houses
per Neolithic village outside Çatalhöyük, one exact ratio, and any membership of camps in a regional group (we know sizes, not who belonged to whom).

### How to show them without clutter

The map already has two readings at two zooms: firelight far out, Units closer in, individual footprints at street level.
Nesting maps onto that:

| Zoom | Shown | Level |
| --- | --- | --- |
| Far out | firelight | cells |
| Regional | camp marks (today) | camp / village |
| Close | people as footprints, grouped into household clusters around the camp mark | household |
| On hover or select only | one soft tint for the regional group the camp belongs to | regional group |

Rules to prevent clutter: show **one extra level at a time**; the regional tint is selection-only and soft-edged (no line); households
are only drawn when the camp is on screen and large (the people layer already takes a count per camp). A zoomable tree is the standard
answer in the literature I found (De Luca et al., [arXiv:1906.05996](https://arxiv.org/pdf/1906.05996v1.pdf): coarse levels first, detail as you zoom),
but I found no study that tests it on a map, so it is a design choice, not an evidence-based one.

**Regional group = a neighbourhood of camps** in a deterministic grid of about 40–60 km blocks (about 4–6 cells; Hamilton gives the
regional size, and the area fit above gives roughly 700–5,000 km² for 30–500 people, so a block of about 50 km square is in
range). Blocks are *imagined* boundaries; the tint should fade at the edges so nobody reads them as territories. Keep this to hover.

Labels: sizes **modelled**; household clusters **imagined** in layout; regional tint **imagined** boundary around **modelled** members.

Browser cost: households need no new data (the people layer already creates the people; this only changes how they are placed around a camp). The
regional tint is one polygon per hovered block. Negligible.

## 3. Farmer settlement hierarchy

### What exists

`settlements.py` already maps each 5° region and way of life to three D-PLACE analogs by EA030 (settlement pattern) and EA031 (community size)
and draws a long-tailed size (truncated Pareto). EA030 coverage ([d-place.org/parameters/EA030](https://d-place.org/parameters/EA030), CC BY-NC 4.0): 1,187 societies of 1,291:

| EA030 code | Societies |
| --- | --- |
| Nomadic | 81 |
| Seminomadic | 188 |
| Semisedentary | 97 |
| Impermanent | 15 |
| Dispersed homesteads | 151 |
| Hamlets | 106 |
| Villages/towns | 518 |
| Complex permanent | 31 |

So dispersed versus nucleated is already in the catalog as pattern shares (representative sizes 30–75,000 in `settlements.py:30`). The first gap is
that **pattern changes size only, not geometry**: dispersed homesteads and a village of the same size are drawn the same way.

### Rank-size and central place: what the sources say

- Ortman, Cabaniss, Sturm & Bettencourt 2014, *PLoS ONE*, [doi:10.1371/journal.pone.0087902](https://doi.org/10.1371/journal.pone.0087902):
  over 1,500 Basin of Mexico settlements; area scales with population with exponent about 0.63–0.76 depending on period. It is an
  **area–population** law; it does not give a rank-size exponent.
- Johnson 1980, *Economic Geography* 56:234, "Rank-size convexity and system integration" (abstract level): rank-size distributions range
  from primate through lognormal to convex; convexity goes with low integration, and pooling several systems fakes it.
- Drennan & Peterson 2004, *J Archaeol Sci* 31:533: most archaeological distributions are convex, not a straight Zipf line (secondary descriptions only).
- Bettencourt & Lobo 2019, [doi:10.3389/fdigh.2019.00017](https://doi.org/10.3389/fdigh.2019.00017) (CC BY): "The standard rank-size rule applies for z = 1."
- Christaller: K = 3 (marketing), 4 (transport), 7 (administrative). The place counts per tier follow K, but the sources I found disagree on the details.

**No pre-industrial Zipf exponent was found** in anything read, and one finding runs against the idea: Europe's city sizes followed
Zipf's law only after about 1500. So any exponent is an assumption.

Village sizes: Vráble (LBK, Slovakia) probably never above 200–300 people ([Holocene 2019](https://sage.cnpereading.com/doi/10.1177/0959683619857239), one site);
Near East villages "a few dozen to several hundred" (Akkermans via Science News). Chinese, Mesoamerican and Mississippian sizes: not found.

Seshat's settlement-hierarchy variable codes levels per polity, roughly 1–7 (Ubaid 2, Zirids 3, Anglo-Saxon England 6, Great Ming 7), with size
bands per level for some polities (Ottoman: city 100,000–1,000,000 down to village 200–2,000). No fixed ratio is given
([seshat-db.com](https://www.seshat-db.com/sc/settlement_hierarchys/?page=22)). Licence: Equinox 2020 is **unresolved** (Zenodo says AGPL-3.0, Seshat's site says CC BY-NC-SA).

### Options

| Option | What it draws | Data supports? | Cost |
| --- | --- | --- | --- |
| A. Keep size mix, add geometry by EA030 | Dispersed homesteads: spread widely, small marks. Hamlet: tight cluster of a few. Village: one mark with a household ring. Complex: a hub | Pattern shares measured per analog society (1930s ethnography, timeless); geometry imagined | Small, in the same builder |
| B. Add a rank-size tail per region | The biggest settlement is about *k* times the median | Shape: yes (convex is typical). Exponent: no | Small; one parameter per region, stated |
| C. Central-place lattice | Towns spaced on a K = 3, 4 or 7 lattice | Theory, not archaeology; works poorly with real geography | Medium; high invention |
| D. Real data | HYDE urban/rural, Seshat, Reba cities | HYDE has an urban/rural *share* (60 files on the NAS, previously confirmed present, not their semantics); Reba cities already used; no open global settlement-size set found | Large and incomplete |

**Recommendation: A, then B.** Skip C. D already covers what exists (named cities).

Labels: pattern shares **modelled** (from analogs); geometry **imagined**; tail exponent **imagined**; named cities **measured**-ish (Reba, population estimates are modelled).
Do not say "hierarchy" in the legend. Say "bigger and smaller villages, imagined".

## 4. Political groups in history

### Sources

| Source | Coverage | Licence (checked) | Size and form | Honest limits |
| --- | --- | --- | --- | --- |
| **Cliopatria** (Seshat). Paper: *Sci Data* 12:247, [doi:10.1038/s41597-025-04516-9](https://doi.org/10.1038/s41597-025-04516-9) | Worldwide, 3400 BCE–2024 CE, about 15,000 records, 1,600+ entities | **CC BY 4.0**, confirmed from the repo's `LICENSE.md` ([GitHub](https://github.com/Seshat-Global-History-Databank/cliopatria)) | One GeoJSON, shipped zipped; releases range about 49–307 MB on [Zenodo](https://zenodo.org/records/13363121) | Redrawn from 508 hand-drawn map images, smoothed to 0.07°, "do not always align" with coastlines, borders without treaties approximate, steppe nomad empires under-represented, uncertainty rises with age, polities at least about 5,000 km² and 50 years, nominal vs effective control not separated |
| Historical Basemaps (aourednik) | About 54 snapshots, 123,000 BCE–2010 | Repo says GPL-3.0 (data licence unclear) | Snapshot GeoJSONs | "Work in progress"; borders meaningful in Europe only after 1648 |
| CShapes 2.0 | 1886–2019 only | Dataset licence unverified | | Outside Footsteps' range (≤1900) |
| GeaCron | 3000 BCE+ | Proprietary | | Not usable |
| Seshat Equinox 2020 | 373 polities, 35 regions | **Unresolved** AGPL vs CC BY-NC-SA | 3.6 MB, already used for 35 sites | Sparse |

The Cliopatria paper was read through a delegated fetch summary except the licence, which I fetched myself.

### Fit with the vision

`vision.md` ("What it isn't"): "**Not empires and wars.** No borders, battles or great-men timelines". The task asks whether it is worth it
and in what form, and this note answers: **only in forms that do not draw borders.**

| Form | What the user sees | Verdict |
| --- | --- | --- |
| Border lines or fills | Empires painted over the people | **No.** Against the vision, and Cliopatria's smoothing would give false precision |
| Polity name on the hover card | "Here, in 100 CE: the Han polity (Cliopatria)" | **Yes, later.** Cheap: point-in-polygon in the details-panel lookup, no map geometry. Needs a baked per-cell, per-year lookup, not the 50–300 MB file in the browser |
| Soft tint by degree of state organisation | Faint city-state/state/none shading | Maybe; it still draws the empire edge |
| Pre-state cultural areas | A faint tint around "this people" | Fits the vision better but see below |

Pre-state source options: the Atlas of the World's Languages polygons (Ranacher et al., *Sci Data* 2025,
[doi:10.1038/s41597-025-05828-6](https://doi.org/10.1038/s41597-025-05828-6); 6,992 language areas with Glottocodes; licence listed as cc_by by one record but
**unverified**) show *present-day* language areas, so for the past they would claim continuity the data does not have. Native Land's terms conflict (CC0 in its docs, non-commercial in its FAQ) and show current territories. D-PLACE has societies as points. **No open pre-state territory data for past dates was found.**

Browser cost of a polity name: zero extra bytes in the app if baked offline (about 100 KB per HYDE-year of per-cell ids,
my guess). Raw Cliopatria in the browser: not viable (up to 307 MB).

**Verdict: NO-GO for drawing polities; GO, as a low-priority follow-up, for a baked polity name on the hover card.**

## Cost summary

| Idea | Data to add | Browser cost | Invented share |
| --- | --- | --- | --- |
| Data-weighted positions (A) | Terrarium (already used) + baked river-distance image (about 1 MB, or the 2 MB Natural Earth vector as a start) | Tens of tiles per viewport; worker; cache by cell | Forager water decay; exact spot |
| Dated-site bonus | none (p3k14c already exported) | negligible | the weight |
| Households around camps | none | none | layout, count per camp |
| Regional tint on hover | none | negligible | block boundaries |
| EA030 geometry, rank-size tail | none | none | geometry, exponent |
| Polity name on hover | baked per-cell lookup from Cliopatria (CC BY 4.0) | none in app | none beyond Cliopatria's own limits |

## Recommended first build

**Data-weighted, ranked, stable positions behind the existing `?settlements=1` flag.**

Why this one: it fixes a visible bug (groups in the sea, groups in random places) that every other idea rests on (households and a
regional tint need a believable camp location first); it touches one function; the data is mostly in the app already; and conservation
and ids are provably unchanged. Nesting, hierarchy and polities all get cheaper afterwards.

Scope:

1. `footstep-generator/`: bake a **river and lake distance image** at the 5′ grid or 2.5′ (Natural Earth first; HydroRIVERS filtered by stream order if its agreement allows). Year-independent. Add to `docs/ops`.
2. `footsteps-web`: per-cell ranked candidate sites (suitability = flat ground × water proximity, minus sea at the year's level), worker-cached by cell id. `settlementUnits.ts` uses site *k* for group *k*.
3. Keep `?settlements=1` as the only flag. Without it the default Units path stays byte-identical. Add a legend line.
4. Tests: cell totals exact; same cell gives the same sites in every year; no group in sea at a coastal HYDE year; site list stable when count changes.
5. Real-data browser check with `verify-settlements.mjs` (Rome, Ohalo II, a Nile cell, a coastal cell) and a before/after screenshot.

Success: share of groups on water falls from "unknown, probably non-zero" to zero (measure the before number first); no group moves when the year changes unless its cell's coast does; frame time in the worker does not grow noticeably over `?settlements=1` today (measure, no number promised here).

## Follow-up tasks (outlines)

1. **Bake and ship the water-distance layer** (S–M). Fetch Natural Earth rivers and lakes; optionally HydroRIVERS after reading its data agreement;
   write a generator script and test; output a WebP; `docs/ops/water-distance.md`; green-Sahara override.
2. **Ranked sites in `settlementUnits.ts`** (M). The first build above. Depends on 1 (can start with sea-and-slope only).
3. **Households and a hover-only regional tint** (M). Place people in household clusters (4–5) around each camp mark at street zoom;
   one soft polygon for the hovered block; legend line "imagined". Depends on 2.
4. **EA030 geometry plus rank-size tail** (S–M). Dispersed/hamlet/village geometry; one stated exponent per region; hover-card line for the largest settlement. Independent of 2.

Not proposed as a task yet: a polity name on the hover card (bake Cliopatria into a per-cell, per-HYDE-year lookup, CC BY 4.0, credit Seshat).
Revisit after 2–4, and after settling the Seshat Equinox licence question from research 0007.

## Verified, and not

**Read or fetched by me:** repo code and docs cited above; Hamilton et al. 2007 PDF (Table 1, branching ratio B = 3.77 (3.68–3.87), "approximately lognormal", "considerable overlap");
Cliopatria `LICENSE.md` (CC BY 4.0). I recomputed the area-fit arithmetic.

**Reported by delegated web readers, not re-read:** everything else in the source tables, notably the Hamilton PNAS fit, Marlowe's medians, the LBK and Yangshao distances (the latter from a
search snippet), Ortman 2014 exponents, EA030 counts, the Cliopatria paper's caveats and record counts, Seshat variable examples, and the HydroSHEDS, Natural Earth and Native Land
licence statements. A reader reported it could not open Binford 2001, Kelly 1995/2013, Johnson 1981, Drennan & Peterson 2004 or Hill 2011's supplement, so nothing here is attributed to their text.

**Not measured:** how many groups now land in water; sizes of a baked sub-cell raster; worker time; how many cells are populated.

**Unresolved licences:** HydroSHEDS data agreement, HydroLAKES, Seshat Equinox (AGPL vs CC BY-NC-SA), Atlas of the World's Languages polygons, HYDE 3.5 terms.
