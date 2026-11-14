---
id: plan-settlement-patterns
type: spec
purpose: "Implement and verify a flagged settlement model."
---

# Settlement patterns implementation plan

## Current State Analysis

Artifact check: full research needed; existing Units tests cover default stability and
population shares, not cities or analogs. Existing research 0002 and 0009 covers population
and evidence, not settlement allocation. No default behaviour is removed.
`units.ts` uses target sizes, capped counts and equal shares; sub-15 cells use stochastic
whole groups. `waysOfLife.ts` uses 40,000 for urban. `gridData.ts` upsamples prehistory.
`unitRegion.ts` and `unitMorph.ts` require sorted cell*32+slot IDs and stable positions.
EA030/EA031 and B010/B011/B013 are present in the committed ethnography export.

## Core data shape and invariants

SettlementCatalog: versioned city observations and regional analog mixtures.
City: stable source identity, name, coordinate, dated positive population observations.
Profile: weighted analog components with size, mobility and source identity; storage is unknown.
Allocation: immutable original grid, nonnegative residual people, city allocations and shortfalls.
Sum(residual)+sum(cities)=sum(original), within Float32 precision; overlapping cities cannot
spend population twice. Unit IDs remain sorted, unique and within existing slots.
All allocations are modelled; missing observations never mean zero or extrapolated settlement.

## Caller usage

```ts
const allocation = allocateCities(data, catalog.cities, year);
const units = buildSettlementUnits(allocation.residual, profiles, habitat);
// Worker opted in once at construction; all its cached endpoints use the same model.
```

## Design options

| Shape | Consequence | Decision |
| --- | --- | --- |
| Server computes each viewport | New runtime dependency and repeated allocations across viewport edges | Reject |
| Offline catalog, worker allocates whole year, existing Units morph | Static deployment; one population budget independent of viewport | Choose |
| Replace default Units | Removes the requested comparison | Reject |

## Assumptions

- URL flag is fixed for the page lifetime; reload switches experiment, avoiding cache mixing.
- Cities interpolate only between observations separated by at most 500 years; no extrapolation.
- Prefer Chandler on matching city coordinates; Modelski supplies earlier observations.
- City catchments are bounded at 100 km, allocated nearest-first; report unmet demand.
- Regional EA mixtures use existing nearest_analogs; deep climate mixtures use only Binford societies with observed sizes/moves.
- Seasonal aggregation is an alternative allocation, never an extra population.
- Sparse cells retain fractional people, explicitly described as allocations, not literal camps.
- Storage remains unknown because the available source has no storage variable.

## Work ordering

Blocking: source audit and catalog before worker integration. Independent: catalog and rendering
seams after schema agreement. Shared state: no parallel file writers. Smallest safe decomposition:
catalog, pure allocation, opt-in integration, browser proof. Preserve default paths.

## Phase 1: Research and catalog

- [x] Write research 0011 with source URLs, NAS inventory and limitations.
- [x] Add reproducible catalog generator using Reba and nearest_analogs, with provenance.
- [x] Produce committed compact static catalog and inspect sample records.

## Phase 2: Allocation and rendering

- [x] Implement pure city debits and deterministic long-tailed regional group allocations.
- [x] Add behavior tests for conservation, overlapping cities, missing dates, stable IDs and regional/climate differences.
- [x] Wire the page-lifetime flag through the worker; render named cities and a modelled legend.
- [x] Document the flag, regeneration and scope in an ops note.

## Phase 3: Verify

- [x] Run frontend lint, tsc and Jest; Python pytest for processing changes; static build.
- [x] Drive real data across experiment, default, Grid and Dots; capture screenshots outside git.
- [x] Check p3k14c and named-site consistency without claiming site counts validate group sizes.
- [x] Blast radius: prove default path and sorted IDs/morph slicing with executable tests.

## Phase 4: Wrap (commit & finalize)

- [x] Update research, decisions and docs to match final behaviour.
- [x] Run `git diff --check`, commit implementation and report check results in Manager envelope.
- [ ] [HUMAN] Compare on production after merge.

## Documentation Updates

- [x] Add settlement research and ops references; document scientific limits and flag.

## Verification results

- Jest: 32 suites / 182+ tests pass after moving city layers to `layers/cityLayers.ts` (TextLayer's ESM font dep broke `useGridLayer.test.ts`; the test now mocks it).
- `tsc --noEmit` and lint: clean (warnings only, pre-existing).
- pytest: settlement tests pass; 2 unrelated failures (`test_terrain_image.py::test_sea_level_is_the_readout_series`, `test_vectorization_performance.py::...::test_vectorized_array_operations`).
- Browser (real data, `next dev`): Rome and Capua drawn as named cities at 100 CE with nearby cells drained; default Units unchanged; Ohalo II forager scene renders with the label; Grid and Dots show no label. Hydration mismatches appear in every scene including the unflagged default.
- Static build: `pnpm --dir footsteps-web build` passes.
