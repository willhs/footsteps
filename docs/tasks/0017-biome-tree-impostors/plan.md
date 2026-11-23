---
id: plan-0017
type: spec
purpose: "Build and verify biome tree impostors"
---

# Tree impostors implementation plan

## Current state and artifact checks

The premise holds: `plantsForTile` uses VEGETATION, sea exclusion and a snow line, and Close3DLayer draws cones/blobs. No trees flag exists. Existing close3d tests cover legacy plant behaviour, not this feature. This is a TypeScript feature; omit Python spec-test Phase 0. Existing close-up scene and settlement docs supply the integration conventions. Existing behaviour is retained, so no behaviour-removal investigation is needed.

## Core data shape and invariants

`TreeInstance = {position: [longitude, latitude, exaggerated metres], kind, variant, height, tint}`. Heights are real metres; positive dimensions; variants index a fixed atlas. Candidates are stable per DEM tile, accepted by the existing biome/snow/water model then filtered against dated water and household clearings. `TreeClearing = {position, radius}` is independent of whether roofs are displayed. Generated candidates are cached per tile and era; camera LOD does not regenerate them.

## Caller usage and alternatives

```ts
const trees = treesForTile(heights, bbox, index, sea, ground, lake);
const visible = outsideClearings(trees, clearings);
new TreeLayer({data: visible, iconAtlas: '/trees/atlas.webp'});
```

| Design | Surface exposed | Decision |
| --- | --- | --- |
| IconLayer subclass | Atlas mapping and metre height; shader wind | Choose: existing deck texture/instance lifecycle and alpha handling |
| Custom instanced mesh shader | Camera basis, texture loader, quad and projection management | More lifecycle code than this feature needs |

## Assumptions and ordering

- Reuse `plantsForTile` for biome/snow/water eligibility at higher candidate density, without modifying it. Refine tree type for palms/dead variants only in the new module.
- Use no sprites far away; fade by projected size. Do not create another canopy data product.
- Reuse the household shelter positions for clearings even when roofs are off. Loading that table is restricted to trees/shelters flags.
- Atlas creation and pure placement are independent; integrate only after their contracts exist. Work inline in this managed branch, no shared writes.
- Acceptance verification runs once at the end after all edits; repeat only on failures or changes. The committed plan is the prerequisite commit; implementation lands in one final commit per dispatch instructions.

## Phase 1: Assets and placement

- [ ] Commit a deterministic unpaid atlas generator and its generated WebP for all six types with three variants each.
- [ ] Implement typed tree placement, clearings and LOD with unit tests for determinism, water, ice and clearings.

## Phase 2: Render and integrate

- [ ] Add camera-facing metre-scaled sprites with shader wind and alpha cutoff.
- [ ] Connect flag, cached tile trees, independently computed household clearings and imagined label, preserving flag-off behaviour.
- [ ] Register flag and update close-up documentation and job log fragment.

## Phase 3: Verification

- [ ] Run `pnpm --dir footsteps-web test -- --runInBand`, `pnpm --dir footsteps-web exec tsc --noEmit`, `pnpm --dir footsteps-web lint`, `pnpm --dir footsteps-web build`.
- [ ] Capture the five required real scenes off/on/old plants under workspace evidence; measure z13–15 using `scripts/measure-view.mjs`.
- [ ] Run `pnpm --dir footsteps-web visual` with FOOTSTEPS_DATA; inspect differences without blindly updating baselines.
- [ ] Run the flag verification script; inspect the dependency surface and demonstrate legacy placement behaviour is unchanged.

## Phase 4: Wrap (commit & finalize)

- [ ] Check acceptance evidence and update this checklist and decision trail honestly.
- [ ] Run `git diff --check`; stage only changed paths and commit implementation, assets and docs. Manager owns review and landing.
