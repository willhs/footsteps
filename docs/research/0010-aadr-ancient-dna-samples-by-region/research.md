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

## Decisions

| Choice | Why |
|---|---|
| 1240K annotation, not HO | The 1240K table lists every ancient individual; HO adds present-day people we drop. |
| Dedupe by Individual ID, keep best-assessed library | One skeleton is listed once per library; keeping all would triple-count it. |
| Keep CRITICAL and Questionable samples, export the assessment | The assessment is about the DNA (contamination), not whether the skeleton existed and when. Consumers can filter; the "earliest" tables show the column. |
| Exclude `conflict` dates from reports, keep them in the export | Neither date can be trusted, so they cannot be evidence; hiding them would lose the audit trail. |
| Countries mapped to continents by a table, Russia split at 60 E | AADR gives no continent and regions.py filters on one. A new country in a later release fails the real-table test rather than silently falling into "other". |

## Open

- The arrival-table boxes (`regions.py`) are coarse; they put eastern Iran and Turkmenistan in South Asia and southern Anatolia in Levant and Arabia. Fix them when the arrival table becomes a real file.
- `Context` dates (half of all samples) are archaeologists' ranges for a layer. A stricter use should lean on direct dates only; the reports give both.
- Not wired into the app or the model. The next step is the "sources nearby" panel and an arrival-date check against both sources.
