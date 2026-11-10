---
id: task-0003
type: spec
purpose: "A sourced anthropology record per 5-degree cell and era, served by the day API and fed into the day prompt."
tags: ["api", "data", "anthropology", "day-in-the-life"]
---

# Footsteps: anthropology database (real data + AI gap-fill) per region and era

Vision alignment: On a new endeavour — Want to reach my potential with software
(goal: Footsteps: meet these people, speculative day-in-the-life)

## Goal

`GET /api/anthropology?lat=&lon=&year=` returns a sourced record for any land cell and any
year 10,000 BCE–1900: every field says where it came from (a named dataset, or `model`).
Real data is precomputed offline into a file shipped with the API container; the model fills
only the gaps, lazily, cached per cell × era, inside the existing daily cap. The day prompt
receives the record so a "day in the life" is grounded in the same facts.

## Context

The "Imagine their day" prompt (`deploy/budgie/api/day_api.py`) only knows the year, place,
head counts and band/village. The person portrait (built separately) needs dwelling, clothing
colours, hair, tools and skin/hair palettes. Both need the same per region × era facts, and
the "what we actually know" panel needs to tell measured from guessed.

Premise check (main `f5eb02f`, 2026-11-10):
- True: nothing anthropology-related exists yet; the day API is a stdlib Python server.
- Partly false: `data/tiles/grid/landuse_{year}.png` is not in a fresh checkout and the raw
  HYDE land-use ASCs are not on this machine; the 30 encoded PNGs exist on budgie
  (`deploy/budgie/app/grid/`), so the builder reads them from there (copied locally).
- False: D-PLACE is "CC-BY". The D-PLACE EA dataset (`D-PLACE/dplace-dataset-ea`, which
  replaced `dplace-data`) is **CC-BY-NC 4.0**. Seshat Equinox 2020 is CC-BY-NC-SA 4.0.
  Both fit a personal non-commercial site; the derived file inherits CC-BY-NC-SA.
- Budgie's API has no `OPENROUTER_API_KEY` (`/api/day/health` → `live: false`), so live
  gap-fill stays off until a key is added; the endpoint must still return the real fields.

## Scope

### Must Do
- Offline builder `footstep-generator/anthropology/build.py`: HYDE population + land use,
  D-PLACE EA (+ TEOW biomes), Seshat Equinox → `deploy/budgie/api/anthropology.json.gz`.
- Runtime module `deploy/budgie/api/anthropology.py` (stdlib only): era/cell bucketing,
  record assembly, gap-fill schema, prompt and merge.
- `GET /api/anthropology` in `day_api.py`; gap-fill via OpenRouter sharing the day cap and
  per-IP limit; cached in the API SQLite.
- Day prompt includes the record (cache key unchanged).
- README in `footstep-generator/anthropology/`: sources, licences, coverage, rebuild.
- Tests: record schema and source tagging; endpoint behaviour.
- Deploy with `scripts/deploy-budgie.sh`.

### Won't Do
- Portrait/UI wiring (the people-drawer is being built separately).
- Paid bulk precompute of model fields (goal says ask Will first).
- Adding an OpenRouter key to budgie (a credential only Will has).

## Success Criteria
- [ ] The endpoint returns a sourced record for any land cell and year 10,000 BCE–1900
- [ ] README documents sources, licences, coverage and how to rebuild
- [ ] Tests cover the record schema and source tagging
- [ ] Deployed with `scripts/deploy-budgie.sh`
- [ ] Day prompt receives the record; day cache key unchanged

## Assumptions
- 5° cells keyed by south-west corner; eras: 1000-year buckets before 1 CE, 100-year after,
  floored (−2500 → −3000, 1850 → 1800). These are exactly the 30 HYDE years.
- "Land cell" = a 5° cell with any HYDE people or land use in any era. Cells without (open
  ocean, Antarctica) get 404.
- The built file is committed (small, derived, needed by the container; raw data is not).

## References
- `deploy/budgie/api/day_api.py`, `footstep-generator/grid_image.py`
- https://github.com/D-PLACE/dplace-dataset-ea, https://github.com/D-PLACE/dplace-dataset-teow
- Seshat Equinox packaged data: https://zenodo.org/records/6629022
- Steady task: e61ff36b-fd9b-4d4e-9b95-545db62bcaf1
