---
id: task-0012
type: spec
purpose: "Apply research 0009's remaining pre-HYDE model proposals (P5, P6, P8, rest of P9), rerun the model and publish the images."
tags: ["task", "prehistory", "model", "research-0009"]
related: ["../../research/0009-model-vs-evidence/research.md", "../../ops/prehistory-population.md"]
steady_task: 0ed61c4f-51ec-45c3-a033-bd393d8c41e6
---

# Pre-HYDE model: research 0009 P5, P6, P8 and the rest of P9

## What

Research 0009 ("Proposed model changes") has P1-P4 and P9's arrival mask applied. Apply the rest, each with
before/after numbers from `model_vs_evidence.py` and `arrival_check.py`:

- **P5**: scale `europe_west` density between 36 and 20 ka so its 26-20 / 36-30 ka ratio is about 0.75 (was 1.49).
- **P6**: ramps `europe_east_steppe` 4 → 2 ka, `central_asia_siberia_south` 4 → 2 ka, `east_asia` 4 → 8 ka.
- **P8**: widen the low-high range in `totals.json` (and so the counter) by the share of people in rows with no
  evidence behind their weight; show that share.
- **P9 rest**: exclude Caribbean, Madagascar and Arctic Canada from the HYDE blend until their arrival dates.

P7 (dates) stays as it is; P10 (new evidence) is out of scope. A proposal that turns out wrong when applied is
skipped with the reason written down.

## Why

The map at the glacial maximum shows west Europe growing when the evidence and the docs say it contracted (P5);
ramps disagree with the evidence's fill-up speed (P6); the counter's range hides that ~40% of the modelled people
have no evidence behind their regional weight (P8); the HYDE hand-over puts people on islands before anyone
arrived (P9).

## Done when

- Research 0009 marks each proposal applied or skipped, with numbers.
- World totals still follow the literature curve (central unchanged per year).
- `poetry run pytest footstep-generator/tests/ -q` passes; the counter range test (`lib/time.test.ts`) passes.
- `totals.json` copied to `footsteps-web/public/prehistory_totals.json`; sha256 manifest of the WebPs committed.
- Published from this job: `GRID_ONLY=1 scripts/deploy-budgie.sh`, `scripts/smoke.sh https://footsteps.willhs.me`,
  two published WebPs checked against the manifest.
- Log entry (docs/log.d fragment).
