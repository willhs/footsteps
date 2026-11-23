---
id: task-0017
type: spec
purpose: "Opt-in biome tree impostors"
---

# Biome tree impostors

Vision alignment: Footsteps of Time — plausible close-up scenes with imagined details labelled.

Replace the toy appearance with shaded camera-facing tree sprites behind `?trees=1` only. Preserve `?plants=1` and all flag-off pixels.

## Scope

Pure deterministic placement in `lib/trees.ts`, a small generated atlas under `public/trees`, a GPU billboard layer integrated into Close3DLayer, household clearings, biome density, real metre sizes and wind. No paid image API, default flips or changes to legacy plants.

## Success Criteria

- [ ] Several conifer, broadleaf, palm, acacia, shrub and dead variants, shaded with alpha; committed generator and atlas under a few hundred KB.
- [ ] Deterministic placement, forest density and sparse grassland; excludes water, ice and household clearings; Terrarium height and distance LOD.
- [ ] Alps -1000 z13/z15, Congo 1000 z14, Sahel -3000 z14, Canada 1800 z14 screenshots off/on/old plants.
- [ ] FPS comparisons at z13–15, aiming at least 40 fps; flag-off visual regression.
- [ ] Unit tests, tsc, lint, build; flags registry, close-up ops and log fragment.

## Assumptions

- Sprite silhouettes and individual positions are imagined; biome and temperature inputs retain their existing interpretation.
- Far trees may disappear through LOD, explicitly permitted by the task.
- Approved independent data root: `../../verification-data` from the frontend directory.

## References

- Steady task: 49bb0573-d86e-4c0d-99b8-eafd1cea4552
- `docs/ops/close-up-scene.md`
- `footsteps-web/lib/close3d.ts`
