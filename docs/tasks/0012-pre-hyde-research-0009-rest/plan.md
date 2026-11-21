---
id: plan-0012
type: spec
purpose: "Implementation plan for research 0009 P5, P6, P8 and the rest of P9 in the pre-HYDE model."
tags: ["plan", "prehistory", "model"]
related: ["./task.md", "../../research/0009-model-vs-evidence/research.md"]
---

# Research 0009 rest: implementation plan

## Overview

Four per-region model knobs, all data in `arrivals.yaml` (one row = one region's facts), read by
`prehistory_population.py`'s `Model`. Measured one proposal at a time against a reproduced baseline.

## Current state

- `Model.step` (`prehistory_population.py`): potential × blurred occupancy → scaled to `world_totals(year).central`
  → linear blend with HYDE's 10,000 BCE grid (weight 0 at 14,000 BCE, 1 at 10,000 BCE). low/high are the world curve's
  columns, blended with the HYDE total the same way.
- Baseline reproduced in this workspace: all 90 images match `rerun-p3/prehistory-manifest.sha256`; `results.json`
  and `arrival_check` byte-identical to what is committed (evidence rebuilt with `p3k14c.py fetch/build --raw-dir`
  outside git; AADR export copied read-only from the primary checkout).
- Baseline numbers: `europe_west` LGM ratio 1.49 (evidence 0.87 raw / 0.55 corrected); people at 20 ka in rows with
  no evidence behind their weight 39% (27% without mainland Southeast Asia); Madagascar 57.6 people at 11,000 BCE from the blend.

## Data shape

New optional fields on a region row of `arrivals.yaml`:

| Field | Type | Meaning | Default |
|---|---|---|---|
| `density_multiplier` | list of `[ka_bp, m]`, ages descending | piecewise-linear multiplier on the region's occupancy, held at the end values outside | none (1) |
| `weight_evidence` | `none` | the region's share of the world comes from the productivity fit only | absent = some evidence |
| `hyde_after_arrival` | bool | HYDE's people in the region join the hand-over blend only once the region's arrival date has passed | false |

`Model` turns them into per-region arrays (`multiplier(age)`, `unevidenced`, `hold_hyde`) indexed by
`region_index`, as it already does for `arrival` and `ramp_ka`. `Step` gains `unevidenced_share`.
`totals.json` gains `unevidenced_share` (per year) and `range_widening` (the rule and its factor).

Invariants: the image's people sum equals `totals.central` (within the encoding's 1%); central per year equals the
blended literature curve (unchanged by any of the four); low < central < high before 10,000 BCE; no people in a
`hyde_after_arrival` region before its arrival.

## Plan

### Phase 1: P6 ramps (yaml only)
- [ ] `europe_east_steppe` and `central_asia_siberia_south` ramp 4 → 2; `east_asia` 4 → 8; notes cite research 0009 P6.
- [ ] Run model + `model_vs_evidence.py` + `arrival_check.py` to scratch; record half-rise / first / rho before and after.

### Phase 2: P5 west Europe glacial maximum
- [ ] `density_multiplier` support in `Model.step` (multiplier × occupancy before the edge blur, so box edges soften as today); unit test.
- [ ] `europe_west`: `[[30, 1], [26, m], [20, m], [16, 1]]`, `m` tuned so the model LGM ratio is ~0.75; rerun, record ratio, people at 22 ka, share at 20 ka.

### Phase 3: P9 rest, HYDE blend after arrival
- [ ] `hyde_after_arrival` support: HYDE grid masked to arrived cells of flagged regions, the masked people given back pro rata to the rest of HYDE so the blend total is unchanged; unit test.
- [ ] Flag `madagascar_indian_ocean`, `caribbean`, `greenland_arctic_canada`; rerun, record people there per image 14,000-11,000 BCE.

### Phase 4: P8 wider ranges
- [ ] `weight_evidence: none` on the rows with no evidence behind their weight; `Step.unevidenced_share`; widen low/high before the blend; write both to `totals.json`; unit test.
- [ ] Rerun; counter range test (`lib/time.test.ts`) still passes; record the range at 20, 30, 50 ka before/after.

### Phase 5: publish and document
- [ ] Final full run `--verify` into `data/tiles/prehistory`; `totals.json` → `footsteps-web/public/prehistory_totals.json`; research charts and `results.json` regenerated; `rerun-0012/` with manifest, arrival check and comparison output.
- [ ] Research 0009 section "After P5, P6, P8, P9" with numbers; proposals table marks each applied/skipped; ops doc updated; log/index fragments.
- [ ] Tests: `poetry run pytest footstep-generator/tests/ -q`, `pnpm --dir footsteps-web test -- --runInBand lib/time.test.ts`.
- [ ] Commit; `GRID_ONLY=1 scripts/deploy-budgie.sh`; `scripts/smoke.sh https://footsteps.willhs.me`; two published WebPs against the manifest.

## Assumptions _(unattended run: decisions made without the user)_

- **P5 shape**: multiplier 1 at 30 ka, down to `m` by 26 ka, held to 20 ka, back to 1 at 16 ka. Keeping 36-30 ka
  untouched means the ratio moves by ~`m`, and "about 0.5 at the maximum, back to 1 by ~16 ka" is the proposal's own
  shape. Applied to `europe_west` only, not to the small `europe_south_iberia` / `europe_sicily` override boxes
  (which then read as the southern refugium, as the docs describe). The steppe / central Asia 0.7 is not applied
  (low confidence; the task names west Europe only).
- **Other regions absorb the difference** through the existing per-step world rescale: no extra code.
- **P8 rows**: `south_asia`, `sahul`, `island_se_asia_wallacea`, the three Japan rows, `tibetan_plateau` and
  `southeast_asia_mainland`. The last is not in P8's short list, but research 0009 section 5's 41% includes
  "southern Southeast Asia" (its oldest p3k14c date is 9.4 ka), so its weight has no evidence behind it either.
- **P8 rule**: those people could be half or double what the model gives (factor 2, the size of west Europe's
  model-vs-evidence disagreement where evidence exists): low × (1 − f/2), high × (1 + f), f = their share of the
  pre-blend central people. A presentation choice, written into `totals.json`.
- **"Show the share"**: in `totals.json` (`unevidenced_share`) and the research note and ops doc. No new UI text
  (the counter shows the wider range; a UI line is a design call for Will).
- **P9**: the three flagged regions only. `pacific_remote` (whose catch-all box holds the Philippines, which HYDE
  populates at 10,000 BCE) is left in the blend: excluding it would make the 10,000 BCE join jump. The measured
  10,000 BCE HYDE image itself is unchanged and may still show a few people on those islands.
