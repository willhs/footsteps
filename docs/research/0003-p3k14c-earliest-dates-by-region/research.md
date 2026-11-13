---
id: research-0003-p3k14c-earliest-dates-by-region
type: research
purpose: "What the public p3k14c radiocarbon compilation can and cannot say about when people reached each region"
date: 2026-11-13
---

# p3k14c: earliest dated sites per region

## Question

After calibrating and deduping p3k14c 2022.06, what are the earliest dated sites in each region of the Homo sapiens arrival table ([research 0002](../0002-pre-hyde-population-model/research.md) section 3), and is that enough evidence to set arrival dates from?

## Method

`footstep-generator/evidence/` (see its README). 173,946 rows in; calibrated with IntCal20 (north), SHCal20 (south of the equator) and Marine20 with no local reservoir offset (marine material); 95.4% highest-probability-density ranges, every interval kept. Rows without coordinates (3,796) and cross-catalogue repeats of the same sample (1,757) are dropped and counted. That leaves 168,393 dates in 38,083 sites, of which 19,905 are placed within about 500 m (`LocAccuracy` 2 or 3) and exported for the web app.

A date is listed here only if it is: placed at least to its province or county, named, on the curve, from terrestrial carbon (no marine or shell or sediment material) and has a 1-sigma error of 1,500 years or less. Two lists per region: the oldest date at each of the five oldest sites (how early it could be), and the sites with three or more such dates ranked by their third-oldest (how early it is seen more than once). `LocAcc` is shown on every row.

## Findings

1. **The public file generalises the old sites.** 90,071 of 168,393 dates are province or county centroids (`LocAccuracy` 1). That includes 1,027 of the 1,030 European dates older than 35 ka and every Americas date older than 12 ka. So "well-located" (500 m) and "old" almost never coincide: a local-only filter would delete the Palaeolithic. Province level is enough to say which region a date is in, not to draw a site. The web export therefore keeps only the 19,905 locally placed sites, and the regional evidence below uses province level and says so.
2. **p3k14c can speak to some arrival rows and not others.**

| Region | Table (ka) | Oldest qualifying date | Verdict |
|---|---|---|---|
| East Asia | ~40 | 45.6 ka Xujiacheng, 45.3 ka Xiaogushan (China, AMS, locally placed) | Consistent with, and slightly older than, the table. The best-supported row. |
| Levant and Arabia | 120-80 early, ~50 main | 44.2 ka Ücgiz Cave (Turkey, locally placed) | Says nothing about the 120-80 ka exits (radiocarbon's range ends near 50 ka). |
| Siberia and Arctic | ~45 / ~32 | 53.4 ka Chagyrskaya, 47.0 ka Bunge-Toll, ~44 ka Denisova Cave (province level) | Chagyrskaya and Denisova are Neanderthal and Denisovan caves, not sapiens evidence. |
| Europe | ~47-45 | ~53 ka bone dates at Esquilleu, Lurgrotte Peggau, Roc-de-Combe (province level) | Neanderthal-era dates at the edge of the method; do not read as arrival. Oldest locally placed: 40.2 ka. |
| Africa | throughout | 53.9 ka Spitzkloof A, 51.8 ka Border Cave | At the radiocarbon limit; confirms presence, not an arrival. |
| The Americas | 23-21 (debated) | 53.4 ka Hillsborough Mastodon, 51.3 ka Mill Creek (province level) | These are megafauna and wood, not human sites. Oldest locally placed: 12.9 ka Agua de la Cueva. Nothing here tests the 23-21 ka footprints. |
| Sahul | 50-47 (65 disputed) | 11.5 ka (locally placed) | **No evidence.** The Australian records stop at 10,000 BP and there are no dates from New Guinea. |
| Japan | ~38 | 8.3 ka | **No evidence.** The Japanese records are Holocene (Jomon). |
| South Asia | ~50-45 | 7.2 ka (62 dates in all) | **No evidence.** |
| Tibetan plateau | 40-30 | 14.6 ka Jiangxigou | **No evidence** for 40-30 ka; later than the table. |
| Southeast Asia | not in table | 9.4 ka Khao Sam Kheo | Only Thailand is covered; no Indonesia, Philippines or Malaysia. |

3. **A date is not a person.** p3k14c has no hominin field, so every site is unattributed. It also holds palaeontological and geological samples (mastodon dung, wood, megafauna bone) that no code can separate from human sites. The "single" list is a ceiling on how early, never an arrival date.
4. **Site counts are research effort.** 71,000 European dates against 62 for South Asia says more about who dated what than about where people lived. Nothing here is a head count.

## Consequence for the arrival table

Use p3k14c as evidence for **East Asia** (and, with care, the Levant, Africa and Europe's lower bounds: people were certainly present by then). For **Sahul, Japan, South Asia, the Tibetan plateau and Southeast Asia** it gives no support, so those rows still rest on the literature in research 0002 and need another source. ROAD covers Africa and Eurasia from 3 Ma to 20 ka (not Sahul); Sahul needs the Australian archaeological radiocarbon database (AustArch) or the literature directly. This is a coverage result, not a failure of the ingest.

## What we don't know

- Whether the true coordinates (restricted by the p3k14c team) change the picture for the Palaeolithic sites; we only have the public ones.
- How much of each "oldest" list is human-associated. A hand check of the top few per region against their references is the next step before any date goes into the arrival table.
- Marine20 is used with no regional offset (DeltaR = 0) and the marine/shell/sediment test is a keyword match on `Material` and `Taxa`; marine dates are never used as evidence here, so this affects only the exported ranges.

## Reproduce

```bash
python footstep-generator/evidence/p3k14c.py fetch    # data/raw/p3k14c/
python footstep-generator/evidence/p3k14c.py build    # data/evidence/p3k14c_sites.json.gz, p3k14c_dates.csv.gz
python footstep-generator/evidence/p3k14c.py report   # data/evidence/earliest_by_region.{md,json}
```

Data: p3k14c 2022.06 (CC0 1.0; Bird et al. 2022, doi:10.1038/s41597-022-01118-7). Curves: IntCal20 (Reimer et al. 2020), SHCal20 (Hogg et al. 2020), Marine20 (Heaton et al. 2020).

## Appendix: the report, by region

Generated by the `report` command. References are the strings p3k14c carries (some are truncated or garbled in the source).

#### Japan

- Arrival table (research 0002): 38 ka. ~38 ka (memory, unverified)
- Dates in region: 1,418 (1,398 locally placed, 20 province or county level); qualifying: 1,412.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 8.3 ka, Mamiana (Japan).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Geographical Society Cave (Russian Federation) | 1 | GRA-16839 | 33000±1000 | 37.7 ka (35,415-39,980) | bone / unknown | van der Plicht 2009 |
| Suvorovo 4 (Russian Federation) | 1 | AA-36626 | 15900±120 | 19.2 ka (18,925-19,485) | charcoal / unknown | Kuzmin Y.V. & Orlova L.A. 1998. Radiocarbon chronology of the SiberianPaleolithic. Journal of World Prehist... |
| Ustinovka 7 (Russian Federation) | 1 | TKA-12956 | 15340±160 | 18.6 ka (18,270-18,885) | charcoal / unknown | H. Sato D. Natsuki / Quaternary International 441 (2017) 12-28 |
| Swidwin (Russian Federation) | 1 | KI-3502 | 15300±140 | 18.6 ka (18,275-18,830) | charcoal / unknown | Telegin 2003 |
| Gorham's Cave (Russian Federation) | 1 | SOAN-1922 | 13500±200 | 16.3 ka (15,725-16,925) | organics humates / unknown | Derevianko A.P. 1997. Sbornika Geologickych Ved 157-166. |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Geographical Society Cave (Russian Federation) | 1 | GRA-16839 | 33000±1000 | 37.7 ka (35,415-39,980) | bone / unknown | van der Plicht 2009 | 35.9 ka |
| Mamiana (Japan) | 2 | BETA-197018 | 7420±40 | 8.3 ka (8,055-8,355) | charred remain / unknown | Cremaetal2016 | 8.0 ka |
| Tomino 3 (Japan) | 2 | BETA-126231 | 7270±40 | 8.1 ka (7,985-8,175) | charred remain / unknown | Cremaetal2016 | 7.9 ka |
| Kiusu 7 (Japan) | 2 | BETA-111127 | 6910±60 | 7.7 ka (7,620-7,920) | charred remain / unknown | Cremaetal2016 | 7.7 ka |
| SFC (Japan) | 2 | BETA-157919 | 6230±40 | 7.1 ka (7,005-7,250) | charred remain / unknown | Cremaetal2016 | 7.1 ka |

#### Tibetan plateau

- Arrival table (research 0002): 30-40 ka. 40-30 ka, possibly Denisovans (medium)
- Dates in region: 381 (380 locally placed, 1 province or county level); qualifying: 365.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 14.6 ka, Jiangxigou (China).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Jiangxigou (China) | 2 | BETA-208338 | 12470±60 | 14.6 ka (14,305-14,990) | charcoal / AMS | Yi et al.2011 |
| Heimahe (China) | 2 | BETA-194545 | 11480±60 | 13.4 ka (13,190-13,475) | charcoal / AMS | Madsen et al.2006 |
| Yantaidong (China) | 2 | BETA-262388 | 10360±60 | 12.2 ka (11,945-12,480) | charcoal / AMS | Morello et al 2012 |
| Shalongka (China) | 2 | LUG-10128 | 7535±58 | 8.3 ka (8,195-8,415) | charcoal / radiometric | Dong et al.2013a |
| Layihai (China) | 2 | PV-0199 | 5920±85 | 6.7 ka (6,500-6,950) | charcoal / radiometric | Institute of Archaeology Chinese Academy of Social Sciences.1991 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Jiangxigou (China) | 2 | BETA-208338 | 12470±60 | 14.6 ka (14,305-14,990) | charcoal / AMS | Yi et al.2011 | 14.5 ka |
| Heimahe (China) | 2 | BETA-194545 | 11480±60 | 13.4 ka (13,190-13,475) | charcoal / AMS | Madsen et al.2006 | 13.1 ka |
| Karuo (China) | 2 | ZK-0816 | 5120±300 | 5.9 ka (5,055-6,550) | charcoal / radiometric | Institute of Archaeology Chinese Academy of Social Sciences.1991 | 5.2 ka |
| Lijiatai (China) | 2 | LUG-1069 | 4899±130 | 5.6 ka (5,325-5,910) | charcoal / radiometric | Dong et al.2013a | 5.2 ka |
| Yingpanshan (China) | 2 | ZK-3211 | 4419±32 | 5.0 ka (4,870-5,270) | charcoal / unknown | Institute of Archaeology Chinese Academy of Social Sciences.2005 | 5.0 ka |

#### Levant and Arabia

- Arrival table (research 0002): 80-120 ka. 120-80 ka early, non-lasting exits (medium); main exit ~50 ka
- Dates in region: 3,206 (2,396 locally placed, 809 province or county level); qualifying: 3,063.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 44.2 ka, Ücgiz Cave (Turkey).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Ücgiz Cave (Turkey) | 2 | UC-19A | 41400±1100 | 44.2 ka (42,755-45,890) | charcoal / unknown | Erdoàu et al. 2003 |
| Udoli Samoty (Turkey) | 1 | AA-37625 | 41400±1100 | 44.2 ka (42,755-45,890) | charcoal / unknown | Svoboda J.2001 Archaeology Ethnology & Anthropology of Eurasia 4: 30-37. Kuhn S.L.  2004. In Brantingham P;... |
| Ucagizli Magara (Turkey) | 1 | AA-27994 | 39400±1200 | 43.1 ka (41,770-44,675) | charcoal / unknown | Svoboda J.2001 Archaeology Ethnology & Anthropology of Eurasia 4: 30-37. Kuhn S.L.  2004. In Brantingham P;... |
| Palmyra (Syria) | 2 | GRN-7598 | 38450±650 | 42.4 ka (41,840-43,050) | organic material / unknown | Banadora |
| Tell Halula (Syria) | 3 | BETA-58931 | 35800±530 | 40.9 ka (39,840-41,800) | charcoal / unknown | Molist (ed.) 1996 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Ücgiz Cave (Turkey) | 2 | UC-19A | 41400±1100 | 44.2 ka (42,755-45,890) | charcoal / unknown | Erdoàu et al. 2003 | 42.9 ka |
| Ucagizli Magara (Turkey) | 1 | AA-27994 | 39400±1200 | 43.1 ka (41,770-44,675) | charcoal / unknown | Svoboda J.2001 Archaeology Ethnology & Anthropology of Eurasia 4: 30-37. Kuhn S.L.  2004. In Brantingham P;... | 42.7 ka |
| Kebara (Israel) | 2 | PTA-4267 | 36000±1100 | 40.9 ka (38,710-42,405) | charcoal / unknown | Goring-Morris and Cohern 2005 | 39.1 ka |
| Ksar'Akil (Lebanon) | 2 | OXA-1805 | 32400±1100 | 37.1 ka (34,660-39,565) | charcoal / unknown | Mellars and Tixier 1989 | 35.7 ka |
| Hayonim Cave (Israel) | 2 | OXA-2805 | 29980±720 | 34.4 ka (32,315-36,005) | bone / unknown | Bar-Yosef 1991 | 31.3 ka |

#### Sahul (Australia, New Guinea)

- Arrival table (research 0002): 47-50 ka. 50-47 ka, or 65 ka at Madjedbebe (disputed)
- Dates in region: 3,576 (3,000 locally placed, 576 province or county level); qualifying: 2,407.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 11.5 ka, Wombeyan Caves #1 (Australia).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Wombeyan Caves #1 (Australia) | 2 | WK-11561 | 9998±75 | 11.5 ka (11,230-11,750) | charcoal / unknown | Navin Officer Heritage Consultants Pty Ltd 2003 |
| Karolta 1 (Australia) | 2 | AA-6910 | 9980±85 | 11.4 ka (11,205-11,750) | organic material (from rock varnishes) / unknown | Nobbs & Dorn 1993 |
| New Guinea II (Australia) | 2 | GAK-9013 | 9940±270 | 11.4 ka (10,585-12,460) | charcoal / unknown | Ossa et al. 1995 |
| Mossman Park (Australia) | 2 | SUA-434 | 9930±130 | 11.4 ka (10,830-11,840) | charcoal / unknown | Clark & Dortch 1977 cit. Pearce & Barbetti 1981 |
| Mickey Springs 34 (Australia) | 2 | SUA-2248 | 9920±250 | 11.4 ka (10,585-12,435) | charcoal / unknown | Morwood 1990a |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Wallen Wallen Creek (Australia) | 2 | SUA-2251 | 9810±130 | 11.2 ka (10,720-11,630) | charcoal / unknown | Neal & Stock 1986 | 10.9 ka |
| Nauwalabila 1 (Australia) | 2 | ANU-8677 | 9810±120 | 11.2 ka (10,745-11,620) | charcoal / unknown | Bird et al. 2002; Roberts et al. 1994 | 10.4 ka |
| Koongine Cave (Australia) | 2 | BETA-14861 | 9710±180 | 11.0 ka (10,505-11,625) | charcoal / unknown | Frankel 1986; Frankel 1988 cit. Bird & Frankel 1991 | 10.4 ka |
| Narwala Gabarnmang (Australia) | 2 | WK-28126 | 9670±34 | 11.0 ka (10,780-11,180) | charcoal / unknown | David et al. 2011 | 10.0 ka |
| Grinding Groove Cave (Australia) | 2 | NZA-13408 | 9498±58 | 10.7 ka (10,515-11,070) | charcoal / unknown | Eales pers. comm. | 9.9 ka |

#### Siberia and the Arctic

- Arrival table (research 0002): 32-45 ka. ~45 ka Ust'-Ishim / ~32 ka Yana (memory, unverified)
- Dates in region: 993 (2 locally placed, 991 province or county level); qualifying: 956.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 2.5 ka, Alihe (China).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Chagyrskaya (Russian Federation) | 1 | MAMS-13035 | 50524±833 | 53.4 ka (51,930-55,000) | bone / unknown | Becker et al. 2015 727-745 (Anhang) |
| Bunge-Toll 1885 (Russian Federation) | 1 | GRA-57022 | 44650±950 | 47.0 ka (45,135-48,870) | bone / unknown | Pitulko V.V.  2015. Science 6270: 260-263. |
| Sopochnaya Karga (Russian Federation) | 1 | GRA-57723 | 44570±950 | 46.9 ka (45,095-48,780) | bone coelodonta antiquitatis linty / unknown | Amkreutz L.  2018 Antiquity 92 361: 22-37 |
| Okladnikov Cave (Russian Federation) | 1 | RIDDL-722 | 43300±1500 | 45.9 ka (43,210-48,595) | bone / unknown | Morlan et al. 1990; Morlan 1980 1986; Faunmap 3540; Harington 2003: 400 |
| Kara-Bom (Russian Federation) | 1 | GX-17597 | 43200±1500 | 45.8 ka (43,160-48,480) | charcoal / unknown | Kuzmin Y.V. & Orlova L.A. 1998.Radiocarbon chronology of the SiberianPaleolithic. Journal of World Prehisto... |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Chagyrskaya (Russian Federation) | 1 | MAMS-13035 | 50524±833 | 53.4 ka (51,930-55,000) | bone / unknown | Becker et al. 2015 727-745 (Anhang) | 48.0 ka |
| Denisova Cave (Russian Federation) | 1 | OXA-32506 | 41300±900 | 44.2 ka (42,850-45,485) | charcoal / unknown | https://sites.google.com/ehu.eus/c14peninsulaiberica/dataciones-14   pone 0199954s001.docx | 43.0 ka |
| Okladnikov Cave (Russian Federation) | 1 | RIDDL-722 | 43300±1500 | 45.9 ka (43,210-48,595) | bone / unknown | Morlan et al. 1990; Morlan 1980 1986; Faunmap 3540; Harington 2003: 400 | 42.1 ka |
| Denisova Cave Main Chamber (Russian Federation) | 1 | OXA-30271 | 41200±1400 | 44.2 ka (42,370-46,200) | bone coelodonta antiquitatis linty / unknown | Vermeersch2019 | 41.9 ka |
| Tolbaga (Russian Federation) | 1 | UCIAMS-143234 | 38400±1400 | 42.4 ka (40,545-44,445) | bone / unknown | Geology and culture of the west Transbaikalian. Novosibirsk 1982. M.V. Konstantinov  Derivianko A.  2003. A... | 41.6 ka |

#### East Asia

- Arrival table (research 0002): 40 ka. ~40 ka (memory, unverified)
- Dates in region: 3,485 (3,474 locally placed, 11 province or county level); qualifying: 3,270.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 45.6 ka, Xujiacheng (China).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Xujiacheng (China) | 2 | BA-091428 | 43210±300 | 45.6 ka (44,975-46,115) | animal bones / AMS | Li F et al.2013a |
| Xiaogushan (China) | 2 | BA-07696 | 42890±300 | 45.3 ka (44,800-45,915) | charcoal / AMS | Zhang et al.2010 |
| Shuidonggou (China) | 2 | BA-07943 | 36329±215 | 41.3 ka (40,995-41,795) | wood / AMS | Pei et al.2012 |
| Jinsitai (China) | 2 | BA-04480 | 36285±230 | 41.3 ka (40,935-41,790) | animal bones / AMS | Wang et al.2010 |
| Zhoukoudian(Tianyuan Cave) (China) | 2 | BA-03225 | 33970±540 | 38.9 ka (37,235-40,210) | animal bones / AMS | Tong et al.2006 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Xujiacheng (China) | 2 | BA-091428 | 43210±300 | 45.6 ka (44,975-46,115) | animal bones / AMS | Li F et al.2013a | 42.4 ka |
| Xiaogushan (China) | 2 | BA-07696 | 42890±300 | 45.3 ka (44,800-45,915) | charcoal / AMS | Zhang et al.2010 | 39.7 ka |
| Shuidonggou (China) | 2 | BA-07943 | 36329±215 | 41.3 ka (40,995-41,795) | wood / AMS | Pei et al.2012 | 34.7 ka |
| Zhoukoudian(Upper Cave) (China) | 2 | OXA-2277 | 33200±820 | 38.0 ka (36,065-39,885) | animal bones / AMS | Movius H. L. 1975. Excavation of the Abri Pataud (Eyzies (Dordogne). Peabody Museum of Archaeology and Ethn... | 32.9 ka |
| Zhoujiayoufang (China) | 2 | WB-7846 | 30900±910 | 35.3 ka (33,300-37,275) | woolly rhinoceros bones / radiometric | Institute of Archaeology Chinese Academy of Social Sciences.1991 | 30.2 ka |

#### Southeast Asia

- Arrival table (research 0002): no date. not in the table
- Dates in region: 138 (138 locally placed, 0 province or county level); qualifying: 129.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 9.4 ka, Khao Sam Kheo (Thailand).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Khao Sam Kheo (Thailand) | 2 | WK-18766 | 8412±48 | 9.4 ka (9,305-9,530) | charcoal / unknown | Castillo et al. 2016 |
| Ban Chiang (Thailand) | 2 | OXA-25015 | 3242±26 | 3.5 ka (3,385-3,545) | human bone / unknown | Higham et al. 2015 |
| Ban Lum Khao (Thailand) | 2 | OXA-40470 | 3115±20 | 3.3 ka (3,255-3,385) | pseudodon sp. / unknown | Higham et al. 2015 |
| Non Nok Tha (Thailand) | 2 | OXA-30392 | 3059±28 | 3.3 ka (3,180-3,355) | human bone / unknown | Higham et al. 2015 |
| Ban Na Di (Thailand) | 2 | OXA-30377 | 2594±24 | 2.7 ka (2,725-2,755) | human bone / unknown | GuedesBocinsky2018 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Khao Sam Kheo (Thailand) | 2 | WK-18766 | 8412±48 | 9.4 ka (9,305-9,530) | charcoal / unknown | Castillo et al. 2016 | 3.6 ka |
| Ban Chiang (Thailand) | 2 | OXA-25015 | 3242±26 | 3.5 ka (3,385-3,545) | human bone / unknown | Higham et al. 2015 | 3.1 ka |
| Ban Lum Khao (Thailand) | 2 | OXA-40470 | 3115±20 | 3.3 ka (3,255-3,385) | pseudodon sp. / unknown | Higham et al. 2015 | 3.1 ka |
| Non Nok Tha (Thailand) | 2 | OXA-30392 | 3059±28 | 3.3 ka (3,180-3,355) | human bone / unknown | Higham et al. 2015 | 3.0 ka |
| Ban Na Di (Thailand) | 2 | OXA-30377 | 2594±24 | 2.7 ka (2,725-2,755) | human bone / unknown | GuedesBocinsky2018 | 2.7 ka |

#### South Asia

- Arrival table (research 0002): 45-50 ka. ~50-45 ka (memory, unverified)
- Dates in region: 62 (62 locally placed, 0 province or county level); qualifying: 62.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 7.2 ka, Mahadaha (India).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Mahadaha (India) | 2 | OXA-1647 | 6320±80 | 7.2 ka (7,020-7,420) | cremated bones / unknown | RADON |
| Ojiyana (India) | 2 | BS-2271 | 6280±170 | 7.2 ka (6,755-7,505) | ? / unknown | Pokharia 2008a |
| Sheri Khan Tarakai 3 (Pakistan) | 2 | OXA-982 | 5660±200 | 6.5 ka (6,000-6,935) | charcoal / unknown | RADON |
| Sheri Khan Tarakai 4 (Pakistan) | 2 | OXA-1002 | 4500±100 | 5.1 ka (4,860-5,445) | charcoal / unknown | RADON |
| Ter Kala Dheri (Pakistan) | 2 | OXA-6237 | 4360±55 | 4.9 ka (4,835-5,265) | charcoal / unknown | RADON |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Sheri Khan Tarakai 3 (Pakistan) | 2 | OXA-982 | 5660±200 | 6.5 ka (6,000-6,935) | charcoal / unknown | RADON | 5.7 ka |
| Qasim Bagh (India) | 2 | OZT-624 | 4030±60 | 4.5 ka (4,300-4,810) | charcoal/qb8 / unknown | Llagostera 1979 | 4.0 ka |
| Sannarachamma (India) | 2 | BA-04391 | 3550±30 | 3.8 ka (3,725-3,960) | seed. ziziphus / unknown | Roberts et al. 2016 | 3.8 ka |
| Hiregudda (India) | 2 | R-286809 | 3433±35 | 3.7 ka (3,575-3,825) | charcoal / unknown | Djindjian F. J. Kozlowski & M. Otte 1999. Le Paleolithique superieur en Europe. Armand Colin Paris. Naudino... | 3.6 ka |
| Ter Kala Dheri (Pakistan) | 2 | OXA-6237 | 4360±55 | 4.9 ka (4,835-5,265) | charcoal / unknown | RADON | 2.6 ka |

#### Africa

- Arrival table (research 0002): no date. throughout (high)
- Dates in region: 8,943 (7,805 locally placed, 1,138 province or county level); qualifying: 8,240.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 53.9 ka, Spitzkloof A (South Africa).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Spitzkloof A (South Africa) | 2 | UBA-17617 | 52150±800 | 53.9 ka (52,660-55,000) | ? / unknown | SARD |
| Border Cave (South Africa) | 2 | ANUA-15814 | 48730±1360 | 51.8 ka (48,835-55,000) | charcoal / unknown | Villa P. Soriano S. Tsanova T. Degano I. Higham T.F. d’Errico F. Backwell L. Lucejko J.J. Colombini M.P. an... |
| Umhlatuzana (South Africa) | 2 | PTA-4333 | 46000±1500 | 48.5 ka (45,165-52,365) | charcoal / unknown | SARD |
| Sibudu Cave (South Africa) | 2 | PTA-8017 | 42300±1300 | 45.0 ka (42,880-47,195) | charcoal / unknown | Wadley L. 2001. Who Lived in Mauermanshoek Shelter Korannaberg South Africaà.African Archaeological Review1... |
| Ha Makotoko (Lesotho) | 2 | UGAMS-8988 | 40100±230 | 43.2 ka (42,840-43,905) | charcoal / unknown | Gutierrez-Zugasti J.  / Quaternary International xxx (2017) 1-12. |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Border Cave (South Africa) | 2 | ANUA-15814 | 48730±1360 | 51.8 ka (48,835-55,000) | charcoal / unknown | Villa P. Soriano S. Tsanova T. Degano I. Higham T.F. d’Errico F. Backwell L. Lucejko J.J. Colombini M.P. an... | 49.5 ka |
| Ha Makotoko (Lesotho) | 2 | UGAMS-8988 | 40100±230 | 43.2 ka (42,840-43,905) | charcoal / unknown | Gutierrez-Zugasti J.  / Quaternary International xxx (2017) 1-12. | 42.9 ka |
| Melikane (Lesotho) | 2 | OXA-22794 | 37900±750 | 42.2 ka (41,260-42,830) | charcoal / unknown | SARD | 40.7 ka |
| Umhlatuzana (South Africa) | 2 | PTA-4333 | 46000±1500 | 48.5 ka (45,165-52,365) | charcoal / unknown | SARD | 40.3 ka |
| Boomplaas (South Africa) | 2 | PTA-1811 | 37400±1370 | 41.7 ka (39,345-43,760) | ? / unknown | Gallegos | 39.8 ka |

#### Europe

- Arrival table (research 0002): 45-47 ka. ~47-45 ka, possibly 54 ka at Mandrin (memory, unverified)
- Dates in region: 71,190 (52,304 locally placed, 18,886 province or county level); qualifying: 67,991.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 40.2 ka, Cova de Moleta (Spain).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Esquilleu (Spain) | 1 | OXA-20318 | 53400±1300 | 53.8 ka (52,490-55,000) | bone / unknown | Maroto J.  2012. QI 247: 15-25. |
| Lurgrotte Peggau (Austria) | 1 | VERA-0075A | 53000±1500 | 53.5 ka (52,025-55,000) | bone / unknown | Ahern J.C.M. et al 2004. <Journal of Human Evolution 46: 27-67. Wild E.M.  2001. Radiocarbon 43: 1021-1028. |
| Roc-de-Combe (France) | 1 | GIFA-101261 | 50000±400 | 53.4 ka (52,255-55,000) | bone / unknown | Bordes 2002. Lorenzo Martinez M.  2014. Paleo 25. |
| Theopetra Cave (Greece) | 1 | OXA-15089 | 50100±1300 | 53.0 ka (50,240-55,000) | charcoal / unknown | Facorellis 2001. Radiocarbon 43: 1037. Facorellis Y.  2013. Radiocarbon 55: 1432-1442. |
| Pin Hole Cave (United Kingdom) | 1 | OXA-14212 | 50200±1400 | 53.0 ka (50,130-55,000) | bone / unknown | Vermeersch2019 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Pin Hole Cave (United Kingdom) | 1 | OXA-14212 | 50200±1400 | 53.0 ka (50,130-55,000) | bone / unknown | Vermeersch2019 | 51.4 ka |
| Theopetra Cave (Greece) | 1 | OXA-15089 | 50100±1300 | 53.0 ka (50,240-55,000) | charcoal / unknown | Facorellis 2001. Radiocarbon 43: 1037. Facorellis Y.  2013. Radiocarbon 55: 1432-1442. | 50.9 ka |
| Sesselfelsgrotte (Germany) | 1 | GRN-20314 | 47860±960 | 50.7 ka (48,205-55,000) | charcoal / unknown | Richter J. 2002. Germania 80: 1-22. | 49.4 ka |
| Rio Secco (Italy) | 1 | MAMS-15235 | 46320±1430 | 48.9 ka (45,650-54,570) | bone / unknown | Picin A.  2014  DOI: 10.1371/journal.pone.0095376 | 48.0 ka |
| Ripiceni Izvor (Moldova) | 1 | GRN-14367 | 46200±1100 | 48.7 ka (46,120-51,785) | charcoal / unknown | Ottaway 1995 215 Tab. 54 | 47.2 ka |

#### The Americas

- Arrival table (research 0002): 21-23 ka. White Sands footprints 23-21 ka (debated); widespread after ~16-14 ka
- Dates in region: 71,410 (5,283 locally placed, 66,101 province or county level); qualifying: 46,940.
- Oldest locally placed (LocAccuracy >= 2) qualifying date: 12.9 ka, Agua de la Cueva (Argentina).

Oldest qualifying date at each of the five oldest sites:

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference |
|---|---|---|---|---|---|---|
| Hillsborough Mastodon (Canada) | 1 | GSC-2467 | 51500±1270 | 53.4 ka (51,535-55,000) | mastodon feces; féces de mastodonte / unknown | Blake 1983; Harington et al. 1993; Faunmap 3462; Harington 1990 2001 |
| Mill Creek (USA) | 1 | QL-1215 | 48300±800 | 51.3 ka (48,845-55,000) | wood; bois / unknown | Anderson 1979: 362; Black 1983a |
| O- (CARD) (Canada) | 1 | GSC-3032 | 48100±1100 | 51.1 ka (48,410-55,000) | willow wood; bois de saule / unknown | Blake 1982 |
| Sixtymile Loc. 3 (Canada) | 1 | TO-2702 | 46660±840 | 49.2 ka (47,055-51,835) | horse bone collagen; collagène osseux de cheval / unknown | Harington 2003: 466; Faunmap 4293 |
| Port Talbot (Canada) | 1 | GRN-2580 | 44400±1200 | 46.8 ka (44,615-49,190) | conifer wood; bois de conifére / unknown | Roodenberg et al. 2003: 52 Figs. 4 11 |

Sites with at least 3 qualifying dates, ranked by their third-oldest date (the oldest date shown):

| Site | LocAcc | Lab ID | 14C BP | Median cal BP (95% range) | Material / method | Reference | 3rd-oldest median |
|---|---|---|---|---|---|---|---|
| Sixtymile Loc. 3 (Canada) | 1 | TO-2702 | 46660±840 | 49.2 ka (47,055-51,835) | horse bone collagen; collagène osseux de cheval / unknown | Harington 2003: 466; Faunmap 4293 | 47.5 ka |
| Goldstream (USA) | 1 | CAMS-54130 | 42600±850 | 45.2 ka (43,855-46,850) | bear bone collagen; collagène osseux d'ours / unknown | Southon and Fedje 2000; Fedje and Christiensen 1999; Ham 1990 | 41.4 ka |
| Old Crow Loc. CRH-15 (Canada) | 1 | RIDDL-731 | 39800±1100 | 43.3 ka (42,140-44,685) | mammoth? bone collagen; collagène osseux de mammouth? / unknown | Morlan et al. 1990; Harington 2003: 400; Morlan 1980 1986 1996; Faunmap 3517 | 41.4 ka |
| Old Crow Loc. REM78-1 (Canada) | 1 | RIDDL-138 | 36500±1000 | 41.3 ka (39,625-42,425) | bison bone collagen; collagène osseux de bison / unknown | Harington 2003: 426; Youngman 1993; Morlan et al. 1990; Morlan 1980 1986 1996; Faunmap 3517 | 40.3 ka |
| Old Crow Loc. CRH-14N (Canada) | 1 | RIDDL-134 | 39700±1000 | 43.2 ka (42,200-44,510) | mammoth? bone collagen; collagène osseux de mammouth / unknown | Harington 2003: 395; Bonnichsen 1979; Morlan et al. 1990; Faunmap 3784 | 39.3 ka |
