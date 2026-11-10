---
id: plan-0003
type: spec
purpose: "Implementation plan for the per cell x era anthropology record and its API."
tags: ["plan", "api", "data", "anthropology"]
related: ["./task.md"]
---

# Anthropology database Implementation Plan

## Overview

**Primary Goal**: `GET /api/anthropology?lat=&lon=&year=` returns a record whose every field
carries a `source`, for every land cell × era, from a file shipped in the API container.

**Approach**: split by who owns the knowledge. The offline builder turns datasets into a compact
*atlas* (per-cell numbers plus a shared table of decoded D-PLACE societies and Seshat
snapshots). The stdlib runtime module turns one atlas entry into a record with rules that read
like the domain (subsistence from land use, settlement from subsistence + density, dwelling from
an "ethnographic analogue" society). The day API only routes, rate-limits and caches.

## Current State Analysis

- `deploy/budgie/api/day_api.py`: stdlib `ThreadingHTTPServer`, POST `/api/day`, SQLite cache
  (`days`, `spend`), `DAILY_CAP` and `PER_IP_PER_HOUR` checks inline in `do_POST`,
  `generate()` hard-wired to the day schema.
- `deploy/budgie/api/Dockerfile` copies only `day_api.py`.
- `footstep-generator/grid_image.py`: `decode()` reads `humans_{y}.webp` to people per
  5-arcmin pixel; `landuse_{y}.png` bytes / 255 = cropland, grazing, irrigation share of the
  pixel's area. `cell_areas_km2()` gives pixel areas.
- `scripts/deploy-budgie.sh` always rebuilds the static app and rsyncs tiles.

## Data shape (named before any logic)

```text
Era      = int in ERAS = [-10000, -9000, ..., -1000, 0, 100, ..., 1900]   (30, = HYDE years)
CellKey  = "lat0,lon0"  5° south-west corner, lat0 in [-90, 85], lon0 in [-180, 175]
Field    = {"value": <json>|null, "source": str, "note"?: str}
           source ∈ dataset names ("HYDE 3.5", "D-PLACE EA", "D-PLACE TEOW", "Seshat Equinox 2020",
           joined with "; "), "model", "derived" (confidence only), "none" (unknown, value null)
Record   = {cell, era, fields: {subsistence, settlement, dwelling, clothing, hair_adornment,
           tools_by_role, diet, skin_hair, climate, technology, polity}, confidence: Field,
           gapfill: "cached"|"generated"|"off"|"capped"|"failed"|"none-needed"}
Atlas    = {version, cell_deg, eras, sources{name: {licence, url, note}},
           societies{id: decoded society}, cells{CellKey: {hyde: [[people, landKm2, crop, graze, irri] x 30],
           analogues{class: [id, km]}, biome: [id, km], seshat{era: snapshot}}}}
```

Invariants: every Record has all 11 fields + confidence; `source == "model"` only for fields in
`MODEL_FIELDS` and only via merge; a real field is never overwritten by the model; `value is
None` ⇔ `source == "none"`.

## Design options

| Option | Shape | Verdict |
|---|---|---|
| A. Precompute full records per cell × era | 27k JSON records, runtime is a lookup | Rejected: ~25 MB, rules frozen into data, D-PLACE repeated per cell |
| B. Compact atlas + runtime rules (chosen) | numbers per cell, societies once, rules in `anthropology.py` | ~1 MB gz; rules testable as pure functions |
| C. SQLite file | same as B in tables | No gain for read-only lookups; JSON loads in ms |

Gap-fill: one fixed schema for all `MODEL_FIELDS` (simpler cache, real values win in merge)
vs a per-record schema of only missing fields (fewer tokens, cache varies). Chose fixed.

## What We're NOT Doing

- UI / portrait wiring; Binford hunter-gatherer dataset (EA has ~200 forager societies; later);
  paid bulk precompute; adding the OpenRouter key to budgie.

## Assumptions

- Era bucketing floors (task's buckets); cells keyed by SW corner; land = any HYDE people or land use in any era.
- Subsistence class from HYDE shares of the cell's land: crop ≥ 2% → farming present, grazing ≥ 5% →
  herding present; both → mixed; neither → foraging (fishing when the era ≥ 1800 analogue in-cell says fishing). No "urban" at 5° scale.
- D-PLACE EA is ethnographic present (~1850–1950): eras ≥ 1800 use the nearest in-cell society directly;
  earlier eras use the nearest society *of the same subsistence class* within 2500 km as a labelled analogue.
- TEOW biome is present-day; labelled so, and flagged as different climate before ~8000 BCE.
- Seshat only covers 35 sites; its 5° cell gets polity, largest settlement and metals per era.
- Gap-fill shares `DAILY_CAP` and per-IP limits with day generations; cache key = atlas version + cell + era.
- Day prompt gets real fields plus any *cached* model fields (marked), never triggers a gap-fill.
- Add `API_ONLY=1` to `deploy-budgie.sh` and deploy that way: deploying an unmerged branch's full static
  app is wider than this change needs.
- Built file committed at `deploy/budgie/api/anthropology.json.gz`; licence CC-BY-NC-SA (inherits Seshat).
- Seshat xlsx read with a small stdlib reader (no new dependency).

---

## Phase 1: Atlas builder

- [ ] Copy `humans_*.webp`, `landuse_*.png` from budgie into `data/tiles/grid/` (gitignored)
- [ ] `footstep-generator/anthropology/build.py`: `fetch` (idempotent downloads to `data/raw/`), pure
      `aggregate_cells(people, landuse, cell_px)`, `decode_societies()`, `nearest_analogues()`,
      `seshat_snapshots()`, `build()` writing `deploy/budgie/api/anthropology.json.gz`
- [ ] Run: `poetry run python footstep-generator/anthropology/build.py` — file < 3 MB, ~900 land cells

## Phase 2: Runtime record

- [ ] `deploy/budgie/api/anthropology.py`: `era_of`, `cell_of`, `Atlas.record()`, `MODEL_FIELDS`,
      `GAPFILL_SCHEMA`, `gapfill_prompt()`, `merge_gapfill()`, `prompt_facts()`
- [ ] `footstep-generator/tests/test_anthropology.py`: bucketing, rules, schema, source tags, merge
- [ ] Run: `poetry run pytest footstep-generator/tests/test_anthropology.py -q` — pass

## Phase 3: API + day prompt

- [ ] `day_api.py`: `call_model()` shared; `reserve_generation()` shared cap/IP; GET route; `anthro` cache table;
      `prompt()` adds `what_we_know`; Dockerfile copies module + atlas
- [ ] Endpoint tests (in-process server, stubbed model): 200 record, 404 ocean, 400 bad input, cache hit,
      cap respected, day prompt contains record, every land cell × era returns a record from the real atlas
- [ ] Run: `poetry run pytest footstep-generator/tests/ -q`

## Phase 4: Docs + deploy

- [ ] `footstep-generator/anthropology/README.md`: sources, licences, coverage, rebuild
- [ ] `scripts/deploy-budgie.sh`: `API_ONLY=1` mode; README/AGENTS mention
- [ ] Deploy `API_ONLY=1 scripts/deploy-budgie.sh`; curl the live endpoint for 3 places/eras → evidence

## Phase 5: Wrap (commit & finalize)

- [ ] `git status` clean after commit; decisions.tsv committed beside this plan

## Final Checklist

- [ ] All phases complete; tests green; live endpoint checked
- [ ] [HUMAN] optional: add `OPENROUTER_API_KEY` to `deploy/budgie/api.env` on budgie to turn on gap-fill
      (and the day API, which is in demo mode today)

## References

- Task: `docs/tasks/0003-anthropology-database/task.md`
