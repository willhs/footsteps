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

### 2. Out of Africa: South Asia is empty while Southeast Asia is full (changed: needs a budgie regeneration)

Mainland Southeast Asia south of 22°N fills from 68,000 BCE (central 70 ka, low confidence) and holds ~19% of the world by
63,000 BCE, while South Asia stays empty until 45,000 BCE and Arabia/the Levant hold ~2%. People walked through South Asia to
reach Southeast Asia, so this is a geographic contradiction whatever the date. Research 0009 already named the switch to the 46 ka
alternative as Will's call.

**Change (arrivals.yaml, needs a budgie regeneration).** One southern route instead of a pocket: South Arabia and South Asia arrive at
72 ka (was 50 and 48), mainland and island Southeast Asia keep 70 and 60 ka, and all four carry the same `density_multiplier`
`[[72, 0.15], [52, 0.15], [47, 1.0]]`: a thin early presence (Jebel Faya and Dhofar in Arabia, Jwalapuram's disputed 74 ka tools, Tam Pa Ling
and Lida Ajer's few bones) that reaches full density with the main dispersal by 47 ka, when Fa-Hien Lena's microliths begin (48-45 ka)
and the Neanderthal admixture shared by all non-Africans is dated (~47-45 ka; Sümer et al. 2024 and Iasi et al. 2024, not re-read here).
The world curve is unchanged, so the people Southeast Asia gives up 70-52 ka go back to Africa through the rescale. The Levant and north
Arabia stay at 50 ka.

Rebuild on budgie (about 5 minutes for the model, then publish):

```bash
cd ~/projects/footsteps && git pull
poetry run python footstep-generator/prehistory_population.py --verify       # all 90 years; rewrites totals.json and both copies
poetry run pytest footstep-generator/tests/test_prehistory_population.py -q
poetry run python footstep-generator/holocene_shares.py                       # refresh the hand-over table from the new images
poetry run python footstep-generator/anthropology/deep.py                     # deep-past atlas cells from the new people (tables were refreshed with --tables-only)
GRID_GLOB='data/tiles/prehistory/humans_*.webp,data/tiles/grid/humans_*.webp' python3 docs/research/0016-holocene-hand-over/continent_shares.py 5000 | head -25   # South Asia now fills with Southeast Asia
GRID_ONLY=1 scripts/deploy-budgie.sh                                          # publish the images
scripts/smoke.sh https://footsteps.willhs.me
git add footsteps-web/public/prehistory_totals.json footsteps-web/lib/holoceneShares.json deploy/budgie/api/anthropology.json.gz && git commit -m "Regenerate after the southern route" && git push
```

If old images show, purge the `/grid/humans_-7*000.webp` to `-4*000` URLs in Cloudflare or reload with the cache off.

### 3. Europe in the Ice Age: the right size, the wrong shape (changed: needs a budgie regeneration)

Tallavaara et al. 2015 (*PNAS* 112:8232, read on PMC4500234, Results para. 1) simulate Europe's hunter-gatherers from climate and
ethnographic densities: "about 330,000 at 30 ky ago, 130,000 during its minimum at 23 ky ago, and almost 410,000 at 13 ky ago"
(a sensitivity run in their SI gives 500,000, 200,000 and 700,000). The shipped images, Europe box of `holocene_shares.py`:

| ka BP | 40 | 30 | 27 | 23 | 20 | 16 | 13 |
|---|---|---|---|---|---|---|---|
| Model (thousands) | 107 | 183 | 173 | 206 | 212 | 263 | 336 |
| Tallavaara 2015 | | 330 | | 130 | | | 410 |

So the totals are of the right order (an earlier draft of this note said "several times too full"; that was wrong). The shape is not:
Tallavaara's glacial maximum is 0.39 of the 30 ka level, the model's is 1.13, even after research 0009 P5 halved west Europe 26-20 ka.
East and central Europe do not dip in the model. **Change (arrivals.yaml).** `europe_west` deepens from ×0.5 to `[[30, 1.0], [26, 0.4], [23, 0.27], [20, 0.4], [16, 1.0]]` and
`europe_east_steppe` gets `[[30, 1.0], [26, 0.7], [23, 0.55], [20, 0.7], [16, 1.0]]`, aimed at Tallavaara's absolute minimum (~130-140k at
23 ka) rather than their ratio, since the model's 30 ka level (183k) is already below theirs (330k) and multipliers cannot exceed 1. Expected
after regeneration (not run here): Europe ~140k at 23 ka, unchanged at 30 and 13 ka; the people removed go to every other region through the
world rescale. The west/east split of the dip is a choice: their regional maps were not read.

### 4. Sahul: the size is unconstrained, the glacial-maximum fall is not (changed: needs a budgie regeneration)

The model has ~190,000 people in Australia at 30 ka, ~210,000 at 23 ka and ~240,000 at 20 ka (Australia box). Published figures bracket it widely:
Williams 2013 (*Proc R Soc B* 280:20130486, PMC3652441, Table 1) scales a taphonomy-corrected radiocarbon curve to the contact population and
gets ~5,000-17,000 at 30 ka and ~8,000-41,000 at 16 ka; Bradshaw et al. 2021 (*Nat Commun* 12:2440, PMC8085232) model a saturation ceiling of
3.1-6.5 million for Sahul. Nothing here justifies moving the size. The shape is clearer: Williams finds the population "fell by about 60 per cent
between 21 and 18 ka", and the model rose. **Change:** `sahul` gets `density_multiplier: [[21, 1.0], [18, 0.45], [15, 1.0]]`.

### 5. The Americas: a thin presence before the coastal entry (changed: needs a budgie regeneration)

North America and Central America arrived at 16 ka (Cooper's Ferry 16.5-15.3 ka, Monte Verde 14.5 ka), with White Sands (23-21 ka; Bennett et
al. 2021, Pigati et al. 2023, both checked earlier for `arrivals.yaml`) kept only as the early scenario. The footprints are now dated by seeds,
pollen and quartz OSL; the best guess is that a few people were south of the ice before the glacial maximum, not that the continent filled then.
**Change:** `north_america` and `central_america` arrive at 23 ka (early 30 ka, Chiquihuite Cave, contested) with
`density_multiplier: [[23, 0.05], [17, 0.05], [15, 1.0]]`, so full occupation still comes with the 16-15 ka entry. South America stays at 15 ka.
The tour's Americas stop now says so.

### 6. Found, not changed: the Philippines are empty before the HYDE blend

The central Philippines (about 5-19.5°N, 116-127°E) fall to the `pacific_remote` catch-all (3.1 ka), so Palawan and the Visayas have no one until
the 14,000-10,000 BCE blend, although Tabon Cave has *H. sapiens* at ~47 ka (Détroit et al. 2004, not re-read). A `philippines` row (47 ka, the
southern-route density curve) is the fix, but any new row or box changes the region order the committed anthropology atlas indexes
(`test_anthropology_deep.py`), so it must land with a full `anthropology/deep.py` rebuild on budgie. Do it in the same rebuild.

### 7. Smaller points

- 1 CE: HYDE has Africa at 6.4% (15 M); McEvedy & Jones and Biraben give ~10%. Within the published spread; left.
- Before 68,000 BCE everyone is in Africa and the Levant edge; the early exits (Skhul/Qafzeh, Al Wusta) are not drawn as people.
  Reasonable at this scale.

## What we don't know

Absolute numbers by continent at 10,000 BCE are not measured anywhere; the correction swaps one model's split (HYDE's modern-country
allocation) for another's (forager productivity). It is a better guess, not a measurement, and the label for these years in the app is
still HYDE's. Items 2-5 change `arrivals.yaml`; their effect on the images is predicted, not yet measured (regenerate on budgie, then re-run `continent_shares.py`).

## Rebuild on budgie (for sections 2-5)

The section 1 app change needs nothing. Sections 2-5 change `arrivals.yaml`, so the 90 prehistory images must be regenerated; the commands are
in section 2 and cover all three. Whenever population images change, refresh the hand-over table from them and commit it:

```bash
poetry run python footstep-generator/holocene_shares.py           # reads data/tiles/grid and data/tiles/prehistory
# or, from anywhere: python footstep-generator/holocene_shares.py --base https://footsteps.willhs.me
poetry run pytest footstep-generator/tests/test_holocene_shares.py -q
```
