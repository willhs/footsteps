---
id: research-0017-australia-philippines
type: research
purpose: "Australia's HYDE total before contact, and the empty pre-HYDE Philippines, checked against the sources themselves"
date: 2026-11-28
tags: [research, population, hyde, modelled]
related: ["research/0016-holocene-hand-over/research.md", "ops/prehistory-population.md"]
---

# Australia before 1788 and the Philippines before the Holocene

Follows research 0016. Both sources below were read in full text on 2026-11-28 (PMC and the MNHN journal site,
through the browser on Will's Mac; the cloud cannot reach them). Earlier notes cited them partly from memory.

## 1. Australia: HYDE is flat at ~0.4 million; contact estimates are about twice that (changed, app only)

**Source.** Williams 2013, "A new population curve for prehistoric Australia", *Proc R Soc B* 280:20130486
(doi:10.1098/rspb.2013.0486, PMC3652441). A taphonomy-corrected radiocarbon curve for the last 50 ka, scaled to
ethnohistorical contact estimates. Read: abstract, results, Table 1.

- Growth is low in the Pleistocene, then "a slow stepwise increase ... beginning during the Holocene transition (approx. 12 ka)
  and continuing in pulses (approx. 8.3-6.6, 4.4-3.7 and 1.6-0.4 ka)".
- A high of "approximately 1.2 million at approximately 0.5 ka", then an 8% decline to "approximately 770 000-1.1 million at the time
  of European contact".
- Contact estimates it reviews: Radcliffe-Brown 250-300,000; Smith ~314,000; Mulvaney & White ~750,000; Butlin up to 1.2 million
  (smallpox from 1789 cut populations before anyone counted).
- Table 1 (founding population 2,000 at 50 ka; smoothing spline d.f. 25, d.f. 50 in brackets): 30 ka 9,568 (11,586); 16 ka 16,471 (27,601);
  8 ka 50,778 (84,173); 4 ka 107,831 (204,427); 0.5 ka 683,209 (1,196,423).
- The LGM fall the model already uses is confirmed: "population fell by about 60 per cent between 21 and 18 ka".

**What the app showed** (Australia box, published images, before this change): HYDE 326,000 at 10,000 BCE, 335,000 at 3000 BCE,
363,000 at 1 CE, 415,000 at 1500, 424,000 at 1700, 436,000 at 1800. Research 0016's hand-over table multiplies 13,000-4000 BCE by the Sahul
factor (0.58-1.41), so the map went ~190,000 (10,000 BCE) → ~465,000 (5000 BCE) → 335,000 (3000 BCE) → flat.

**Conflict.** Williams' curve, anchored at contact, gives ~45,000 at 12 ka; the forager model gives ~300,000. The two disagree ~7-10x
before the late Holocene, and Williams' early values depend on an assumed founding group (1,000-3,000). Bradshaw et al. 2021
(not re-read here) puts Sahul's carrying-capacity ceiling far higher. Will chose (2026-11-28) to fix only the best-supported part.

**Change.** `footsteps-web/lib/regionTotals.ts`, applied in `gridDataFrom`: Australia's total (mainland, Tasmania, Top End, Cape York;
not New Guinea) moves from HYDE's toward 935,000 (the midpoint of Williams' 770,000-1.1 million at contact). Weight 0 at 400 CE (start of the
1.6-0.4 ka pulse), 1 by 1500, held to 1788; 1800 is HYDE's own (after the 1789 smallpox epidemic). HYDE's cell pattern is kept; the
people are added, not taken from elsewhere (+~0.5 million on a world of ~500 million). The hover card's place notes say so.

Not changed: 10,000 BCE-400 CE (the Holocene growth Williams finds is not drawn), the 1450 CE peak (within the range), and the Pleistocene size.

## 2. The Philippines were empty before the HYDE blend (row drafted, needs a budgie rebuild)

**Source.** Détroit et al. 2004, "Upper Pleistocene *Homo sapiens* from the Tabon cave (Palawan, The Philippines)",
*Comptes Rendus Palevol* 3(8):705-712 (doi:10.1016/j.crpv.2004.06.004). Earlier notes called it *J Hum Evol*; it is not. Read: full text
(XML), Tables 1 and 2.

- U-series on human bone: tibia fragment 47 +11/-10 kyr BP; right mandible fragment 31 +8/-7; frontal bone 16.5 ± 2.0.
- Occupation layers radiocarbon-dated ~30,500-9,000 BP (Fox's series).
- "the oldest potential age of the human tibia (ca. 58 000 BP) has to be considered with caution".
- All the remains are attributed to modern *H. sapiens*. Callao Cave (Luzon, 67 ka) is *H. luzonensis*, not sapiens.

**Change.** A `philippines` row in `arrivals.yaml` (bbox 116.9-127 E, 7.5-21 N; central 47 ka, early 58, late 31), before
`island_se_asia_wallacea`. Applying Palawan's date to Luzon and the Visayas is an inference and is marked `could_not_verify`. A new row
changes the region order the committed atlas and the p3k14c snapshot index, so it lands with a full rebuild on budgie:
`prehistory_population.py --verify`, `holocene_shares.py`, `anthropology/deep.py` (full, not `--tables-only`),
`evidence/model_vs_evidence.py`, then publish the images.
