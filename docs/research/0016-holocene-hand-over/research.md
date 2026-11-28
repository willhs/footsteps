---
id: research-0016-holocene-hand-over
type: research
purpose: "Big-picture audit of where people are, 100,000 BCE-1900, by continent; the worst divergence (the early-Holocene continental split at the hand-over to HYDE) and its correction"
date: 2026-11-28
tags: [research, population, hyde, modelled]
related: ["ops/prehistory-population.md", "ops/hyde-climate-spread.md", "research/0009-model-vs-evidence/research.md"]
---

# Where people were, continent by continent, and the hand-over to HYDE

## Question

Step back from spot fixes: across the whole timeline, which continent holds what share of the world's people, and where
does that diverge most from what archaeology and genetics make plausible?

## Method

`continent_shares.py` (this folder) decodes every published population image (`footsteps.willhs.me/grid/humans_{year}.webp`,
the 90 modelled years and HYDE's) and sums people per continent box. `shares_before.txt` is its output before this change.
`forager_capacity.py` asks the project's own forager model a counterfactual: if every ice-free cell held people at the
Tallavaara et al. 2018 NPP density (Miami NPP from Beyer 2020 climate, read from the published `/habitat/bp_{ka}.webp`
tiles; aridity rule; annual temperature standing in for the coldest-month rule; no coast, river or Green Sahara bonus),
how would people split by continent?

## Findings

### 1. The hand-over to HYDE moves two million people across the world in 4,000 years (fixed here)

| Share of world people | 14,000 BCE (model) | 12,000 BCE (blend) | 10,000 BCE (HYDE) | 5000 BCE (HYDE) | Forager capacity, 10 ka |
|---|---|---|---|---|---|
| Africa | 42% | 18% | **5%** | 7% | 26% |
| The Americas | 0.5% | 36% | **51%** | 33% | 36% |
| North and central Asia | 1% | 5% | **8%** | 5% | 2% |
| Southeast Asia | 21% | 9% | **3%** | 3% | 8% |
| West Asia | 1.4% | 2.4% | 4% | 6% | 1% |

(Boxes differ slightly between the columns' scripts; the gaps are far larger than that.)

- HYDE 3.5's 10,000 BCE map is a shrunken modern one. HYDE builds country series from McEvedy & Jones 1978, Livi-Bacci 2007
  and Maddison 2001 (Klein Goldewijk et al. 2017, *ESSD* 9:927, sect. 2.1); nothing in it models where foragers lived, and it
  gives no continental figures for 10,000 BCE. Its world total (4.4 M, range < 0.01-8.9 M, abstract) is the usable part.
- The Americas were reached only a few thousand years earlier (arrivals.yaml central 16 ka; Monte Verde ~14.5 ka cal BP). Half of
  humanity there by 10,000 BCE, while all of Africa holds 220,000 people at the start of the African Humid Period, has no support.
  Genetic effective sizes point the other way: Native American founders were a small population (effective size in the low
  thousands), while African populations kept the largest effective sizes throughout (e.g. the Late Pleistocene species-wide ~10,000,
  Eller, Hawks & Relethford 2009, *Hum Biol* 81:805, most of it African). Effective sizes are not head counts; they only say which
  way the error runs.
- The forager model is not just the pre-HYDE images talking: with everyone everywhere at ethnographic densities it gives Africa
  ~26% and the Americas ~36% (South America is high because the Tallavaara fit peaks near Amazonian NPP).
- On the map, the cell-by-cell blend (14,000 → 10,000 BCE) therefore drained Africa and Southeast Asia and filled the Americas and
  Siberia within 4,000 years.

**Change.** `footstep-generator/holocene_shares.py` writes `footsteps-web/lib/holoceneShares.json`, one multiplier per continent per
year, applied per cell in `gridDataFrom` (`lib/holoceneShares.ts`). Inside a continent the cell pattern is untouched; the world total
is the image's. The target share:

- 13,000-11,000 BCE (the blend years): the pure model's share, recovered from the image by undoing the blend.
- 10,000 BCE: the pure model's share at 11,000 BCE (its last).
- 9000-4000 BCE: a straight fade from that to HYDE's own share, reached at 3000 BCE. HYDE's growth from 8000 BCE is farming,
  placed where farming began, so HYDE becomes the better guess as farmers outnumber foragers.
- West Asia keeps HYDE's share throughout: Natufian and Pre-Pottery Neolithic villages make it a population centre exactly
  in this window (Bocquet-Appel 2011, *Science* 333:560), which a forager model cannot see.
- The remote Pacific (no box) is left as it is.

Result (from `holoceneShares.json`, `shares_percent`, continent boxes of `holocene_shares.py`): Africa 44% (14,000 BCE) → 33% (12,000)
→ 28% (10,000) → 22% (8000) → 13% (5000) → HYDE's 9% (3000 BCE); the Americas 0.5% → 20% → 30% → 34% → 31% → HYDE's 21%. Over
14,000-10,000 BCE Africa now falls 17 points (it fell 39) and the Americas rise 29 (they rose 50); what remains is the model's own
colonisation of the Americas, and the rest of the decline is spread over 7,000 years of farming instead of 4,000 years of blend.

Why the app and not new images: the change is a 10 × 10 table, reversible, needs no budgie run, and also applies to the
`?spread=1` images (renormalised to their own total). Baking it into the images later is optional (see "Rebuild").

### 2. Out of Africa: South Asia is empty while Southeast Asia is full (not changed)

Mainland Southeast Asia south of 22°N fills from 68,000 BCE (central 70 ka, low confidence) and holds ~19% of the world by
63,000 BCE, while South Asia stays empty until 45,000 BCE and Arabia/the Levant hold ~2%. People walked through South Asia to
reach Southeast Asia, so this is a geographic contradiction whatever the date. Research 0009 already named the switch to the 46 ka
alternative as Will's call. Lowest-change fix: give South Asia the same onset as mainland Southeast Asia, or move both to the
genetics-led ~50-55 ka main dispersal (Neanderthal admixture ~47-45 ka, Sümer et al. 2024 and Iasi et al. 2024, both to be read
before use). Needs a budgie regeneration.

### 3. Europe in the Ice Age may be several times too full (not changed)

The model puts 6-7% of the world in Europe from 40,000 to 15,000 BCE: ~120,000 people at 40,000 BCE and ~240,000 at the glacial
maximum. Archaeology-based estimates for Upper Palaeolithic Europe are far lower (thousands to tens of thousands: Bocquet-Appel et
al. 2005; Tallavaara et al. 2015, *PNAS* 112:8232, whose text could not be fetched from here, so their figures are not quoted). If
confirmed, this is a `density_multiplier` on the Europe rows of `arrivals.yaml`; the world curve would move those people elsewhere.

### 4. Smaller points

- Sahul holds ~6% at the glacial maximum, ~230,000 people: about five times the upper bound of ~47,000 from Williams 2013
  (*Proc R Soc B* 280:20130486, as cited by Gautney & Holliday 2015; not read here). Worth checking with item 3.
- 1 CE: HYDE has Africa at 6.4% (15 M); McEvedy & Jones and Biraben give ~10%. Within the published spread; left.
- Before 68,000 BCE everyone is in Africa and the Levant edge; the early exits (Skhul/Qafzeh, Al Wusta) are not drawn as people.
  Reasonable at this scale.

## What we don't know

Absolute numbers by continent at 10,000 BCE are not measured anywhere; the correction swaps one model's split (HYDE's modern-country
allocation) for another's (forager productivity). It is a better guess, not a measurement, and the label for these years in the app is
still HYDE's. Item 2 and 3 need papers read in full before changing the model.

## Rebuild (optional, on budgie)

Nothing needs rebuilding for the app change. If the population images change (any `prehistory_population.py` or `grid_image.py` run),
refresh the table from them and commit it:

```bash
poetry run python footstep-generator/holocene_shares.py           # reads data/tiles/grid and data/tiles/prehistory
# or, from anywhere: python footstep-generator/holocene_shares.py --base https://footsteps.willhs.me
poetry run pytest footstep-generator/tests/test_holocene_shares.py -q
```
