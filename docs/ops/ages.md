---
id: ops-ages
type: ops
purpose: "How the people layer draws ages from modelled life-course profiles by way of life (research 0006): the asset, profile choice, sampler, random streams, the card label, and what is still a guess"
---

# Ages of the people at street zoom

Each person drawn at street zoom has an age. It is drawn from a **modelled age structure** chosen from the group's way of
life, not from one structure for everyone. Source of the numbers: [research 0006](../research/0006-life-course/research.md).
The structure is a scenario; the individual's age stays speculative. The person card says so: "Age drawn from the forager
scenario. Modelled age structure; individual speculative."

## Pieces

| What | Where |
|---|---|
| Priors (five living-age shares per profile, tail, transition window, sources) | `footstep-generator/anthropology/demography.yaml` (the one source of truth) |
| Build-time asset, validated | `poetry run python footstep-generator/anthropology/demography_asset.py` → `footsteps-web/lib/demography.json` (3 KB, committed). `--check` fails when it is stale (a pytest does the same). It validates shares sum to 1, the bins tile 0–50, source ids exist. e0/e15/TFR are **not** copied: they were never jointly calibrated with the shares. |
| Regional transition evidence | `demography_asset.py --onset data/food/food.json.gz` → `footsteps-web/lib/farmingOnset.json` (13 KB, committed): the year the earliest modelled crop reaches each 5° cell, from the [food model](food.md) (modelled, partly unchecked claims). |
| Profile choice and sampler | `footsteps-web/lib/demography.ts` (`ageStructureFor`, `sampleLivingAge`, `ageDraws`) |
| Use | `layers/people.ts` `generate`; tests `layers/peopleAges.test.ts`, `footstep-generator/tests/test_demography_asset.py`; browser check `scripts/verify-ages.mjs` |

## Which structure a group gets

| Group | Structure |
|---|---|
| Band (foragers) | `forager` |
| Village (farmers) | `early_farmer` until 2,000 years after crops first reach its 5° cell in the food model, then `agrarian`; **no calendar cut-off** (the Levant turns agrarian before Britain becomes early-farming). A village in a cell the food model never reaches has no transition evidence: `agrarian`. |
| Camp (herders) | `generic`: the old rough six-band structure, labelled "generic pre-modern guess; herders have no profile yet". Research 0006 says herding, fishing and mixed ways must not be silently equated to farmers; this is the product call, open for Will. |
| Glow (towns, cities) | no people are drawn, so the `urban` profile is in the asset but unused |

The 2,000-year window and the agrarian fallback are editorial (`demography.yaml` `sampling`). Other humans' bands (Neanderthals etc.) are `Band`s, so
they use the forager profile: an analogy, flagged by their card's "another kind of human" text.

## The sampler

`sampleLivingAge(structure, u, v)`: `u` picks the band from the share CDF (0–4, 5–14, 15–29, 30–49, 50+), `v` places the integer age
within it (uniform; the 50+ band is the editorial tail `50 + floor(-12 ln(1-v))`, truncated to 100 by scaling `v`, which is rejection
sampling without the loop). Ages 80+ stay possible (about 1% of people) but are not equally likely at every old age.

**Random streams.** Age has its own stream per person, a hash of the group's seed and the person's index (`ageDraws`), so the draws
for person *i* never depend on the group size, the profile or anyone else, and a changed profile changes ages (and so roles) only:
positions, sex, ids and gait come from the group's main stream, which takes the same draws whatever the ages (role takes its roll
always). A person's quantiles persist when the profile or the year changes: a younger profile never makes the same person older.
Positions and sex differ from before this change once (the old age draws left the main stream); they no longer move with ages.

Unchanged: the adult display anchor (the first person is at least 18, a display bias that statistics exclude), `MIN_GROUP_PEOPLE`,
`MAX_PER_GROUP`, `MAX_PEOPLE`, and the role cut-offs (child under 13, elder 55+): changing those is a separate decision for Will.

## Not claimed

Shares are editorial scenarios (`EDITORIAL2026`), not census or skeletal counts; ranges in the YAML are not used. No individual's
death age, survival curve or family is modelled. The tail scale (12) has not been sensitivity-tested at 8 and 16 (research 0006 asks
for that before adoption).
