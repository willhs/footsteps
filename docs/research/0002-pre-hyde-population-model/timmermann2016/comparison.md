---
id: pre-hyde-vs-timmermann2016
type: research
purpose: "Independent check of the modelled pre-HYDE population against Timmermann & Friedrich 2016 at 60, 40, 21, 14 and 12 ka BP"
---

# Our pre-HYDE model vs Timmermann & Friedrich 2016

**Verdict: the places agree, the totals do not.** Where people are, and which regions
carry how many, matches T&F within a few points from 40 ka on. Their world totals are
3 to 10 times ours at every date. The gap is a choice in the totals curve, not a fault in the
placement; it is worth a deliberate decision (below).

## What was compared

- **T&F 2016** (Nature 538:92), `human_density_a` (early exit, "a") and `_b` (late exit, "b"),
  individuals per 100 km², 1°, fetched over OPeNDAP on 2026-11-13 to `data/raw/timmermann2016/`
  **only**. Their terms say CC BY-NC, so the data is not committed or republished; only our own
  derived numbers and small maps are. Time index `i` holds `mtime` = `i + 1` kyr BP (checked
  at 0, 59, 119); longitudes `-19.5…339.5` rolled to `-180…180`; missing values read as no people.
- **Ours**: `Model.step()` at `1950 − age·1000`, the central curve, summed to 1°.
- Script: `footstep-generator/compare_timmermann2016.py` (needs the model inputs plus the T&F dump).
  Numbers: `metrics.json`. Maps: `map_{60,40,21,14,12}ka.png` (top row people per 100 km²;
  bottom row each map divided by its own mean, to compare shape).
- **12 ka is not a fair test**: our grid is 97% HYDE there (the blend runs 12,000 → 10,000 BCE).
  14 ka is our last pure-model year, so read that row for the model and the 12 ka row as HYDE vs T&F.

## Totals (million people)

| ka BP | ours low / central / high | T&F early (a) | T&F late (b) |
|---|---|---|---|
| 60 | 0.45 / 0.8 / 1.4 | 9.4 | 8.2 |
| 40 | 1.0 / 1.8 / 3.0 | 12.3 | 12.1 |
| 21 | 2.1 / 4.0 / 8.3 | 11.8 | 12.0 |
| 14 | 3.5 / 4.5 / 6.5 | 14.6 | 14.8 |
| 12 | 4.6 / 4.6 / 4.6 | 16.3 | 16.5 |

(14 and 12 ka include the HYDE blend, so low/high converge on HYDE's 4.6 M.)
Even our **high** curve is below T&F at 60, 40 and 21 ka. T&F stays flat at 8 to 16 M from 60 ka
because its density saturates at ~10 to 28 people per 100 km² over most habitable land
(yellow in the top row); ours follows NPP, so poor land is thin. T&F is also far above HYDE
(4.6 M) at 12 ka, so it does not join HYDE either; ours was built to.

## Where people are

| ka | cells T&F a / b | cells ours | overlap (Jaccard) a / b | T&F people inside our occupied cells | our people inside T&F cells | rank corr. of density, shared cells a / b |
|---|---|---|---|---|---|---|
| 60 | 6,836 / 5,872 | 3,523 | 0.41 / 0.47 | 66% / 75% | 96% | 0.43 / 0.46 |
| 40 | 9,203 / 9,028 | 8,256 | 0.74 / 0.76 | 98% / 99% | 93% | 0.70 / 0.74 |
| 21 | 9,587 / 9,532 | 8,831 | 0.70 / 0.70 | 98% / 99% | 94% | 0.62 / 0.66 |
| 14 | 11,623 / 11,110 | 12,653 | 0.55 / 0.54 | 97% / 98% | 77% | 0.67 / 0.69 |

(cells are 1° here, counting ours after summing 2×2 blocks of 0.5° cells.)

Share of world people by region (ours / T&F a / T&F b):

| ka | Africa | W Eurasia | S Asia | E + SE Asia | Sahul | Americas |
|---|---|---|---|---|---|---|
| 60 | 75 / 47 / 54 | 8 / 10 / 8 | 2 / 12 / 13 | 23 / 30 / 27 | 0 / 7 / 1 | 0 / 0 / 0 |
| 40 | 45 / 43 / 44 | 12 / 19 / 19 | 10 / 8 / 9 | 29 / 26 / 25 | 11 / 10 / 10 | 0 / 0 / 0 |
| 21 | 43 / 35 / 36 | 11 / 14 / 15 | 9 / 8 / 9 | 34 / 32 / 31 | 10 / 12 / 12 | 0 / 0 / 0 |
| 14 | 34 / 38 / 39 | 11 / 21 / 22 | 9 / 7 / 8 | 26 / 28 / 27 | 8 / 8 / 9 | 19 / 0 / 0 |

(Regions are coarse boxes and overlap at the edges, so rows need not add to 100.)

What this says:

1. **40 and 21 ka agree well.** Almost every T&F person lives in a cell we also populate, and the
   regional shares are within about 10 points. The density ranking agrees (rank corr. 0.6 to 0.7).
   Both put the ice-sheet edge, the Sahara and the Arabian and central Asian deserts empty, and
   both thin out toward high latitudes.
2. **60 ka differs most, on the dates.** T&F early exit has people in Sahul and across S Asia
   already; the late-exit run has almost none in Sahul (1%). Ours has Africa at 75% with a small
   SE Asia box and nothing in Sahul (arrival ~50 ka central). We are close to T&F late exit on
   Sahul, and the more conservative on S Asia (2% vs 12%): worth looking at the arrival table for
   S Asia. 66 to 75% of their people sit in cells we occupy, so our out-of-Africa footprint at
   60 ka is too small by about a third if T&F is right.
3. **Americas: T&F has nobody at any date up to 12 ka.** Our 14 ka shows 19% there (arrival
   ~23 to 16 ka). This is a gap in T&F, not evidence against us: the paper simulates dispersal
   from Africa across the Old World and Sahul, and the Americas are not populated in the
   output. The 12 ka row (50% Americas) is HYDE.
4. **Shape inside occupied land differs.** T&F is close to a plateau: most habitable cells carry
   the maximum density, and it falls only near ice, desert and the northern edge. Ours is graded
   by NPP, coast, river and lake. Their bottom-row maps look flat where ours has texture; on
   shared cells the rank agreement is moderate (0.4 to 0.7), highest when ice and desert dominate
   the variation.
5. **W Eurasia is 11% of ours and 19 to 22% of T&F** at 40 to 14 ka. Their Europe fills with
   people early; ours is held back by the cold limit and the 45 ka arrival. Mild disagreement,
   plausible both ways.

## What it does not show

- T&F is a model, not data: its density is calibrated to give a plausible dispersal, not to a
  census. Agreement with it is a weak check; two models sharing a climate input are partly
  correlated by construction. Disagreement is not proof that we are wrong.
- We could not check the T&F fill-value rule beyond "missing = no people" (about 89% of the
  grid is missing, which fits ocean + ice + not yet reached).
- Only 1° and five dates were compared; the T&F series has 120 steps.

## Decision for the model owner

The totals gap is the one result that needs a choice. Options:

- **Keep the literature curve** (current). Range 0.45 to 8.3 M across 60 to 21 ka, anchored to
  HYDE's 4.6 M at 12 ka. T&F sits above our high curve, which the counter should mention.
- **Add T&F as a named alternative high scenario**, if the licence is cleared (CC BY-NC; the
  site's own notice conflicts with itself, see research 0001). Without clearance we cite
  its totals in text only.

No model change was made in this task.

Sources: Timmermann & Friedrich 2016, doi:10.1038/nature19365; data portal
https://climatedata.ibs.re.kr/data/human-dispersal-simulation/human-density (CC BY-NC).
