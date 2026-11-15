---
id: research-0010-aadr-ancient-dna-samples-by-region
type: research
purpose: "What the Allen Ancient DNA Resource (AADR) annotation table can and cannot say about when people reached each region, and how lopsided it is"
date: 2026-11-14
---

# AADR: earliest ancient-DNA samples per region

## Question

AADR lists thousands of ancient individuals with a date and a place. After ingesting it, what are the earliest Homo sapiens samples in each region of the arrival table ([research 0002](../0002-pre-hyde-population-model/research.md) section 3), how dense is coverage by era, and how biased is it? It is a second kind of dated evidence beside the p3k14c radiocarbon sites ([research 0003](../0003-p3k14c-earliest-dates-by-region/research.md)).

## Method

`footstep-generator/evidence/aadr.py` and `aadr_report.py` (see the evidence README). Source: AADR v66.p1, the 1240K annotation table (metadata only, no genotypes), Harvard Dataverse doi:10.7910/DVN/FFIDCW, licence CC0 1.0. 23,089 rows in:

- 3,970 present-day people and 90 rows without coordinates or a date (reference genomes, unlocated finds) are dropped.
- 1,489 rows are repeat libraries of an individual already listed (`.AG`, `.SG`, `_d`, `_alt`); the best-assessed library is kept. 5 individuals' libraries disagree on date or place.
- That leaves 17,540 individuals: 17,527 Homo sapiens, 10 Neanderthals, 2 Denisovans and 1 Neanderthal-Denisovan hybrid (listed apart, never counted as sapiens).
- 75 sapiens samples are left out of every figure below because the table's own date and its own range disagree (one of them is wrong; we cannot tell which). 1 is flagged by AADR's curators as not to be used.
- Dates are the table's cal BP mean and 95.4% range. 99% of ranges are the table's own; the rest are mean ± 2 sd.

## Findings

1. **It is Europe-heavy and Holocene-heavy.** 68% of the 17,451 usable sapiens samples are in Europe. 99% are younger than 11.7 ka and 80% younger than 5 ka. Only 116 are older than 12 ka: 79 in Europe, and 29 outside Europe and Siberia. Five of the eleven table regions have no sample older than 12 ka.
2. **Coverage by era** (usable sapiens samples; 8 in 10 are in the last 5,000 years):

| Era | Samples | Direct-dated |
|---|---|---|
| 50-40 ka | 16 | 4 |
| 40-30 ka | 26 | 17 |
| 30-20 ka | 22 | 17 |
| 20-12 ka | 52 | 36 |
| 12-8 ka | 511 | 296 |
| 8-5 ka | 2,898 | 1,756 |
| 5-3 ka | 3,936 | 2,319 |
| 3-1 ka | 7,089 | 2,673 |
| < 1 ka | 2,901 | 915 |

3. **It confirms three arrival rows and says nothing about the rest.** "Direct" means the individual's own radiocarbon date.

| Region | Table (ka) | Earliest sample (site, country) | Verdict |
|---|---|---|---|
| Europe | 45-47 | 45.4 ka Bacho Kiro Cave, Bulgaria (direct); 45.9 ka Ranis, Germany and Zlatý kůň, Czechia (context range 49.6-42.2 ka) | Consistent with the table. Best-supported row. |
| Siberia and Arctic | 32-45 | 44.4 ka Ust'-Ishim (direct); 31.9 ka Yana River (context, "Questionable") | Matches both anchors in the table. |
| East Asia | 40 | 39.6 ka Tianyuan Cave, China (direct) | Consistent with the table. |
| The Americas | 21-23 | 12.7 ka Anzick, Montana (direct); 11.9 ka Los Rieles, Chile (direct) | Later than the table. Cannot test the debated 23-21 ka footprints. |
| Africa | throughout | 14.6 ka Taforalt, Morocco (direct); 18.5 ka Mlambalasi, Tanzania (context, assessed CRITICAL) | Late-Pleistocene only. Nothing near the origin of the species. |
| Levant and Arabia | 80-120 | 15.4 ka Pınarbaşı, Turkey (direct); 13.3 ka Raqefet Cave, Israel (direct) | **No evidence** for the early exits. (The box takes in southern Anatolia.) |
| Japan | 38 | 8.8 ka Kamikuroiwa, Shikoku (direct) | **No evidence.** Jomon only. |
| Tibetan plateau | 30-40 | 5.0 ka Zongri, Qinghai (direct) | **No evidence.** |
| South Asia | 45-50 | 5.1 ka Shahr-i Sokhta, Iran (direct); 4.3 ka Rakhigarhi, India (context) | **No evidence.** The coarse box also takes in eastern Iran and Turkmenistan. |
| Sahul | 47-50 | 3.6 ka Reber-Rakival, New Britain (direct); Australian samples are context-dated, about 1.5 ka | **No evidence.** |
| Southeast Asia | not in table | 7.9 ka Pha Faen, Laos (direct) | Hoabinhian only. |

4. **Next to p3k14c** (research 0003): AADR is silent exactly where p3k14c is (Sahul, Japan, South Asia, the Tibetan plateau), so it does not rescue those rows. Where both speak, AADR is the later and more conservative of the two (East Asia 39.6 ka against p3k14c's 45.6 ka; Europe 45.4 ka direct against p3k14c's Neanderthal-era dates near 53 ka), because a genome only exists for a person who left bones DNA can be read from. What AADR adds is attribution: every sample has a hominin label, so Neanderthals and Denisovans are separable (p3k14c sites are all unattributed), and each is a human (or hominin) skeleton, where p3k14c also holds megafauna and wood.
5. **The table has its own errors.** 75 sapiens samples carry a range and a mean that disagree by centuries to millennia (for example a "50 BCE - 150 CE" range with a mean of 900 BP). They are exported but marked `rs: conflict` and left out of every report. A consumer that ignores that flag would use dates the table contradicts.
6. **A sample is not a population.** Counts follow where labs have dug, sequenced and been permitted to (and where DNA survives), so a count must never be read as a head count. Place precision varies too: some localities are centroids (the export's `dp` is the decimal places of the coarser coordinate).

## Arrival-date check against the model (arrivals.yaml regions)

`footstep-generator/evidence/arrival_check.py` (job 588ac654, 2026-11-15). Finding 3's table above grouped samples by the
older coarse boxes; since this check the evidence code uses the model's own regions (`prehistory/arrivals.yaml`, one source
of truth: `regions.py` loads it, `tests/test_evidence.py` pins the region set, order, boxes and dates to the yaml). The table
below is by those 27 regions.

**What is compared.** The model's `central` arrival and its `early`-`late` range (ka BP), the earliest qualifying p3k14c date
(any material, and charcoal only), and the earliest *direct-dated* usable Homo sapiens AADR sample (AADR mean, cal BP). A
region is flagged `>` when the evidence is older than the model's `early` bound. Evidence younger than `central` is not a
disagreement (no sample is not no person) and is not flagged.

**Which half could be built.** Both. AADR was read from the main checkout's `data/evidence/aadr_samples.json.gz` (v66.p1, 17,540
individuals; its stored `rg` region ids predate the yaml boxes, so every sample is re-assigned from its coordinates). The raw p3k14c
dates file (`data/evidence/p3k14c_dates.csv.gz`) is **not on this machine**, so the p3k14c half is not recomputed: it reads the
`earliest` rows of [research 0009](../0009-model-vs-evidence/results.json), which `model_vs_evidence.py` wrote from the full dates file with the same
yaml boxes (the region list in that file equals the yaml's, tested) and the same qualifying filter as research 0003. Re-run that
script on a machine with the dates to refresh it. "3rd-oldest site" is the date of the third-oldest *site* in the region (a repeat, not a one-off).

| Region | Central | Early-late | Sourced | Earliest p3k14c, any material (ka) | Earliest p3k14c, charcoal (ka) | Earliest direct AADR sapiens (ka) | Evidence older than `early` |
|---|---|---|---|---|---|---|---|
| madagascar_indian_ocean | 2 | 4-1 | memory | none | none | none | - |
| caribbean | 6 | 7-4 | memory | none | none | 3.2: Canimar Abajo (Cuba) | - |
| levant_arabia | 50 | 120-47 | memory | 44.2: Udoli Samoty (Turkey) (3rd-oldest site 43.1) | 44.2: Udoli Samoty (Turkey) | 13.3: Raqefet Cave (Israel) | - |
| south_arabia | 50 | 120-47 | memory | 29.9: Site 203-207 (Saudi Arabia) (3rd-oldest site 11.1) | 8.5: Khuzma as-Shumlya Rockshelters (Yemen) | 5.2: Shah Tepe (Iran) | - |
| europe_south_iberia | 45 | 54-41 | checked | 50.6: Gorham's Cave (Gibraltar) (3rd-oldest site 46.5) | 50.6: Gorham's Cave (Gibraltar) | 7.6: Ifri Ouberrid (Morocco) | - |
| europe_sicily | 45 | 54-41 | checked | 15.3: Giurgiu - Malu Rosu (Italy) (3rd-oldest site 11.0) | 10.7: Vallone inferno (Italy) | 13.4: San Teodoro (Italy) | - |
| africa | 300 | 315-200 | memory | 53.9: Spitzkloof A (South Africa) (3rd-oldest site 48.5) | 51.8: Border Cave (South Africa) | 15.4: Pınarbaşı (Turkey) | - |
| tibetan_plateau | 38 | 160-30 | memory | 6.7: Layihai (China) (3rd-oldest site 5.9) | 6.7: Layihai (China) | 5.0: Zongri (China) | - |
| japan | 38 | 38-32 | memory | 8.3: Mamiana (Japan) (3rd-oldest site 7.7) | 8.3: Mamiana (Japan) | 8.8: Kamikuroiwa Rock Shelter (Japan) | - |
| japan_hokkaido | 38 | 38-32 | memory | 8.3: Ishikura (Japan) (3rd-oldest site 8.1) | 8.3: Ishikura (Japan) | 0.8: Hamanaka 2 (Japan) | - |
| japan_ryukyu | 38 | 38-32 | memory | none | none | 2.8: Nagabaka (Japan) | - |
| south_asia | 48 | 74-45 | checked | 7.2: Mahadaha (India) (3rd-oldest site 6.5) | 6.5: Sheri Khan Tarakai 3 (Pakistan) | 5.1: Shahr-i Sokhta (Iran) | - |
| southeast_asia_mainland | 70 | 86-46 | checked | 34.0: Longtanshan (China) (3rd-oldest site 19.6) | 34.0: Longtanshan (China) | 11.5: Longlin Cave (China) | - |
| island_se_asia_wallacea | 60 | 70-46 | memory | none | none | 0.8: Liang Bua (Indonesia) | - |
| sahul | 50 | 65-47 | checked | 11.5: Wombeyan Caves #1 (Australia) (3rd-oldest site 11.4) | 11.5: Wombeyan Caves #1 (Australia) | 3.6: Reber-Rakival (Papua New Guinea) | - |
| europe_west | 45 | 54-41 | checked | 53.8: Esquilleu (Spain) (3rd-oldest site 53.4) | 53.6: Esquilleu (Spain) | 45.4: Bacho-Kiro Cave (Bulgaria) | - |
| europe_east_steppe | 45 | 47-40 | memory | 50.7 **>**: Tischoferhohle (Russian Federation) (3rd-oldest site 45.3) | 50.7 **>**: Tischoferhohle (Russian Federation) | 38.1: Kostenki (Russia) | p3k14c, p3k14c charcoal |
| central_asia_siberia_south | 45 | 47-40 | checked | 53.4 **>**: Chagyrskaya (Russian Federation) (3rd-oldest site 45.8) | 45.8: Kara-Bom (Russian Federation) | 34.9: Salkhit (Mongolia) | p3k14c |
| siberia_arctic | 40 | 45-28 | checked | 47.0 **>**: Bunge-Toll 1885 (Russian Federation) (3rd-oldest site 44.3) | 39.2: Ust-Kova (Russian Federation) | 44.4: Ust'-Ishim (Russia) | p3k14c |
| east_asia_far_east | 42 | 80-38 | checked | 37.7: Geographical Society Cave (Russian Federation) (3rd-oldest site 35.5) | 23.4: Ogonki V (Russian Federation) | 7.7: Devil's-Gate-Cave (Russia) | - |
| east_asia | 42 | 80-38 | checked | 45.6: Xujiacheng (China) (3rd-oldest site 41.3) | 45.3: Xiaogushan (China) | 39.6: Tianyuan Cave (China) | - |
| beringia | 24 | 30-20 | memory | 51.1 **>**: O- (CARD) (Canada) (3rd-oldest site 45.5) | 23.0: Dry Creek (USA) | 10.4: On Your Knees Cave (USA) | p3k14c |
| central_america | 16 | 23-14.5 | checked | 11.4: El Gigante (Honduras) (3rd-oldest site 5.3) | 11.4: El Gigante (Honduras) | 9.5: Mayahak Cab Pek (Belize) | - |
| north_america | 16 | 23-14.5 | checked | 53.4 **>**: Hillsborough Mastodon (Canada) (3rd-oldest site 46.8) | 42.2 **>**: Jim Pitts (USA) | 12.7: Anzick Ranch (USA) | p3k14c, p3k14c charcoal |
| south_america | 15 | 18-14 | memory | 17.4: Muaco Site (Venezuela) (3rd-oldest site 16.9) | 16.9: Rancho Peludo (Venezuela) | 11.9: Los Rieles (Chile) | - |
| greenland_arctic_canada | 4.5 | 5-4 | memory | 44.3 **>**: North Head (Canada) (3rd-oldest site 40.4) | 22.6 **>**: Iceberg (Canada) | 3.9: Qeqertasussuk (Greenland) | p3k14c, p3k14c charcoal |
| pacific_remote | 3.5 | 3.5-1 | memory | 10.6 **>**: Casita de Piedra (Panama) (3rd-oldest site 1.0) | 10.6 **>**: Casita de Piedra (Panama) | 3.0: Teouma (Vanuatu) | p3k14c, p3k14c charcoal |

### Reading

- **AADR never predates the model's early bound, in any region.** Where AADR speaks about the early range it sits inside the model's
  early-late range (Europe west 45.4 ka at Bacho Kiro in 41-54; Siberia 44.4 ka Ust'-Ishim in 28-45; East Asia 39.6 ka Tianyuan in 38-80), so nothing in it
  contradicts the model. It is silent (nothing older than 12 ka) for Sahul, South Asia, Japan, the Tibetan plateau, southeast Asia and Wallacea, and
  nothing older than 15.4 ka for Africa or the Levant, so those rows stay untested by DNA, as finding 3 said.
- **Seven regions are flagged, all by p3k14c only** (`europe_east_steppe`, `central_asia_siberia_south`, `siberia_arctic`, `beringia`,
  `north_america`, `greenland_arctic_canada`, `pacific_remote`). None looks like a settled case for moving an arrival date; each is one of:
  - *A non-human or unattributed old date.* p3k14c holds megafauna, wood and Neanderthal-era caves and attributes nothing to a
    hominin. `north_america` 53.4 ka is a mastodon site (Hillsborough) and `beringia` 51.1 ka an unnamed Canadian record; the
    `north_america` charcoal minimum (42.2 ka, Jim Pitts) is also not human-attributed; `beringia`'s charcoal figure (23.0 ka, Dry Creek) is inside its bound. `central_asia_siberia_south` 53.4 ka is Chagyrskaya, a Neanderthal cave in the Altai,
    and its charcoal figure (45.8 ka, Kara-Bom) is inside the early bound. `siberia_arctic` 47.0 ka (Bunge-Toll) is 2 ka over the bound and its charcoal figure (39.2 ka) is under it.
  - *A box that covers more than its name.* `greenland_arctic_canada` (5-4 ka) has a box from 56 N and 125 W to 10 W, which takes in the Canadian interior, so its
    44.3 ka and 22.6 ka dates are Pleistocene Canada, not Arctic settlement. `pacific_remote` is the last, catch-all box: a Panama site (west of 82 W,
    south of 10 N) falls outside both `central_america` (lat 10 N and up) and `south_america` (west edge 82 W), so Casita de Piedra
    (10.6 ka) is assigned to a region the model fills only from 3.5 ka. That one is a **real model gap**: the model draws no
    people in western Panama before 3.5 ka while a dated site exists at 10.6 ka. The box edge is the cause.
  - *A record that looks mislocated.* `europe_east_steppe` 50.7 ka is "Tischoferhohle", labelled Russian Federation in p3k14c; the name
    is that of an Alpine cave (unverified), so it is probably a mislocated cave-bear or Neanderthal-era record. The region's third-oldest site (45.3 ka) is inside its bound.
- **Corroborated evidence (third-oldest site) beats the early bound in three regions only:** `north_america` (46.8 against 23),
  `beringia` (45.5 against 30) and `greenland_arctic_canada` (40.4 against 5). All three come from the same cause, Pleistocene
  dates in North America that are not human occupation; they are not a case for a 45 ka peopling of the Americas.
- **Not changed.** No value in `arrivals.yaml` and no model code moved. Research 0009's proposals (P3, P5) are untouched; the
  `pacific_remote`/Panama box edge and the `greenland_arctic_canada` extent are new items for Will to consider next to them.
- **Box artefacts the table also shows (not flagged).** `africa`'s box reaches Anatolia (its "earliest AADR" is Pınarbaşı, Turkey, 15.4 ka),
  and `europe_south_iberia` takes Moroccan coast sites. They hide nothing here but muddle a per-region reading.

## Decisions

| Choice | Why |
|---|---|
| 1240K annotation, not HO | The 1240K table lists every ancient individual; HO adds present-day people we drop. |
| Dedupe by Individual ID, keep best-assessed library | One skeleton is listed once per library; keeping all would triple-count it. |
| Keep CRITICAL and Questionable samples, export the assessment | The assessment is about the DNA (contamination), not whether the skeleton existed and when. Consumers can filter; the "earliest" tables show the column. |
| Exclude `conflict` dates from reports, keep them in the export | Neither date can be trusted, so they cannot be evidence; hiding them would lose the audit trail. |
| Countries mapped to continents by a table, Russia split at 60 E | AADR gives no continent and regions.py filters on one. A new country in a later release fails the real-table test rather than silently falling into "other". |

## Open

- ~~The arrival-table boxes (`regions.py`) are coarse.~~ Done: `regions.py` now loads `arrivals.yaml` (see the arrival-date check). The yaml boxes are still coarse in places (Anatolia falls in `africa`; see above).
- `Context` dates (half of all samples) are archaeologists' ranges for a layer. A stricter use should lean on direct dates only; the reports give both.
- Not wired into the app or the model. The arrival-date check against both sources is done (above). What is left is the "sources nearby" panel. The export on disk and on budgie still carries the old `rg` region ids until it is rebuilt from the raw `.anno`; nothing in the app reads `rg`.
