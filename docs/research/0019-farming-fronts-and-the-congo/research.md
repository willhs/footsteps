---
id: research-0019-farming-fronts-and-the-congo
type: research
purpose: "Four timeline checks after research 0016-0017 (South America, the Pacific, farming into Europe, the Bantu expansion), each against papers found and read through OpenAlex"
date: 2026-11-28
tags: [research, population, hyde, timeline]
related: ["research/0016-holocene-hand-over/research.md", "research/0017-australia-philippines/research.md", "ops/food.md"]
---

# Farming fronts, the Pacific and the Congo

Follows research 0016 and 0017. Every paper below was found or confirmed with the OpenAlex connector (DOI, volume and pages
from the OpenAlex record). "Abstract" means only the abstract was read; Seidensticker et al. 2021 was read in full on PMC
through the browser on Will's Mac. HYDE figures are sums of the served images in boxes (`measure.js`, same decoding as
`world-model/hyde_check.js`).

## 1. South America: confirmed, no change

`arrivals.yaml` `south_america`: central 15 ka, early 18, late 14.

- Dillehay et al. 2015, *PLOS ONE* 10:e0141923 (doi:10.1371/journal.pone.0141923), abstract: discrete horizons of ephemeral
  activity near Monte Verde "dated between at least ~18,500 and 14,500 cal BP".
- Prates, Politis & Pérez 2020, *PLOS ONE* 15:e0236023 (doi:10.1371/journal.pone.0236023), abstract: from >1,600 screened
  dates, "the earliest chronological threshold for the peopling of South America should be between 16,600 and 15,100, with a
  mean estimated date ~ 15,500 cal BP".

Central 15 ka sits at the young end of Prates' threshold, early 18 ka on Dillehay's oldest horizon. Moving central to 15.5
would need a budgie regeneration for a 500-year shift, so it is left.

## 2. The Pacific: New Zealand was shown ~80 years early (changed, app only)

- Wilmshurst et al. 2011, *PNAS* 108:1815 (doi:10.1073/pnas.1015876108), abstract: Society Islands ~1025-1120 CE, then "one
  major pulse to all remaining islands A.D. ~1190-1290". Matches `firstSettlement.ts` (Hawaii 1200) and `missingIslands.ts`.
- Wilmshurst et al. 2008, *PNAS* 105:7676 (doi:10.1073/pnas.0801507105), abstract: the Pacific rat "was introduced to both
  main islands of New Zealand approximately 1280 A.D.", matching the earliest sites and extinctions.
- Denham, Bronk Ramsey & Specht 2012, *Archaeol Oceania* 47:39 (doi:10.1002/j.1834-4453.2012.tb00113.x), abstract: Lapita in
  the Bismarcks 3360-3240 cal BP, Vanuatu by 3250-3100, Fiji by 3130-3010. Matches `pacific_remote` (3.1 ka) and the
  islands at HYDE's -1000.
- Petchey 2001, *Radiocarbon* 43:63 (doi:10.1017/s0033822200031635), abstract: Mulifanua, Samoa, 930-800 BC.

HYDE has 18,000 people in New Zealand at 1200 CE (0 at 1100). New row in `FIRST_SETTLEMENTS`: New Zealand empty before 1300,
so the image years read 0 at 1200 and HYDE's 23,000 at 1300.

**Found, not changed.** HYDE has almost no one on Samoa until 1000 CE (17 people at 0 CE, 1,076 at 1000) although Lapita
settlers were there by ~850 BC. No population figure for first-millennium Samoa was found, so no `missingIslands` row.

## 3. Farming into Europe: dates confirmed; HYDE's densities ahead of the front are already forager-level (cited, no data change)

The front is drawn by the domesticates gate (`food/crops.py` `_neolithic_europe` → `lib/domesticatesGate.json`), whose
regional dates were recalled. Now each has an abstract behind it:

| Region | Table | Source (abstract) |
|---|---|---|
| Greece | 8.5 ka | Perlès, Quilès & Valladas 2013, *Antiquity* 87:1001: Franchthi cereals "during the first half of the seventh millennium BC" |
| W Mediterranean | 7.8 → 7.5 ka | Zilhão 2001, *PNAS* 98:14180: central Italy to Portugal "around 5400 calendar B.C."; Martins et al. 2015, *J Mediterr Archaeol* 28:105: Iberia "ca. 5500 Cal BC" |
| Central Europe (LBK) | 7.5 ka | Whittle & Bickle 2013, *The First Farmers of Central Europe*: "from about 5500 cal BC" |
| Britain | 6.0 ka | Stevens & Fuller 2012, *Antiquity* 86:707: cereals "arrived there in about 4000 cal BC" |
| S Scandinavia | 5.9 ka | Gron & Rowley-Conwy 2017, *Holocene* 27:98: EN I Funnel Beaker 3950-3500 cal BC; Gron & Sørensen 2018, *Antiquity* 92:958 |

The W Mediterranean change does not move the gate (both dates fall in the -5000 era; `domesticatesGate.json` rebuilt and
unchanged). Pinhasi, Fort & Ammerman 2005 (*PLoS Biol* 3:e410) give the overall rate, 0.6-1.3 km/yr.

HYDE people per km² of populated land:

| Box | -7000 | -6000 | -5000 | -4000 | -3000 |
|---|---|---|---|---|---|
| Greece | 0.034 | 0.13 | 0.25 | 0.47 | 0.91 |
| Central Europe | 0.069 | 0.13 | 0.19 | 0.35 | 0.63 |
| Britain | 0.028 | 0.029 | 0.031 | 0.035 | 0.135 |
| Ireland | 0.025 | 0.047 | 0.091 | 0.18 | 0.37 |
| S Scandinavia | 0.030 | 0.030 | 0.032 | 0.039 | 0.052 |

HYDE has no front, only smooth growth, but ahead of the farming dates every box stays at or below ~0.1/km², and Britain
rises 4x in the millennium after 4000 BC. A density correction would move a few thousand people (Ireland 5000 BCE is the
largest). Not made; the visible front is the gate's farmer/forager split, which is now cited.

## 4. The Bantu expansion: HYDE grows the Congo forest exactly when it emptied (changed, app only)

- Grollemund et al. 2015, *PNAS* 112:13296 (doi:10.1073/pnas.1503793112), abstract: the expansion out of West Central Africa
  from ~5,000 years ago followed savannah corridors, rainforest delaying occupation ~300 years.
- Russell, Silva & Steele 2014, *PLOS ONE* 9:e87854 (doi:10.1371/journal.pone.0087854), abstract: a grassland corridor
  through the rainforest ~3000-2500 BP; rivers and coasts as dispersal routes.
- **Seidensticker et al. 2021, *Sci Adv* 7:eabd8352 (doi:10.1126/sciadv.abd8352, PMC7880602), full text.** 1,149 radiocarbon
  dates from 726 pottery sites: settlement "built up gradually from ~1000 BCE onward", peak activity around 350 CE, "a
  collapse between ~400 and 600 CE, followed by a period of markedly low human activity between ~600 and 1000 CE", then a
  second expansion 1000-1400 CE. Gabon's genomes show "very low population size until ~35 generations ago, i.e., around
  1000 CE", exponential growth from ~1300. Fig. 2A: summed probability ~0.47 at the peak, ~0.11 at the low.

HYDE, box 9-28° E, 6° S-4.5° N: 758,000 at 400 CE, 1.18 M at 600, 2.34 M at 1000, 4.0 M at 1400, rising throughout.

**Change.** A second row in `lib/regionTotals.ts`: the Congo rainforest moves toward 0.11/0.47 of HYDE's 400 CE total
(~177,000) from 400 to 600 CE, holds it to 1000, and returns to HYDE's own figure by 1400. Woodland Katanga, the Great
Lakes and Bioko stay out (their activity peaked 900-1200 CE).

**Limits.** The depth is read off a plotted curve, and summed dates measure pottery-making communities: forest foragers,
who leave few dated sites, are lowered with everyone else. HYDE's 400 CE size itself is unchecked.

**Found, not changed.** Elsewhere HYDE's jumps match the Early Iron Age roughly (Great Lakes and Zambezi ×3 from 0 to 500
CE, southern Africa ×1.7). No paper read here gives regional numbers to correct them toward.

## Rebuilds

None. Sections 2 and 4 are app-side tables; section 3 changes citations only (`food.json` carries the source strings, so the
next budgie food rebuild picks them up; the gate is unchanged).
