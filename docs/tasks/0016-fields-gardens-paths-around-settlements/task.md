---
id: task-0016
type: spec
purpose: "Imagined fields, gardens, corrals and worn paths around settlements in the close-up, behind ?fields=1."
tags: ["task", "close-up", "settlements", "fields"]
related: ["../../ops/close-up-scene.md", "../../ops/settlements.md", "../../ops/water-distance.md", "../../ops/food.md"]
---

# Fields, gardens and paths around settlements behind `?fields=1`

Steady task: 080b9e05-fbea-4168-8b03-794fe3e6dc45. Vision alignment: Footsteps: the close-up scene (what you'd see standing there).

## Why

Will wants the close-up (zoom 11-18) more vibrant. A farming village today is houses on bare ground: nothing shows what its
way of life did to the land around it.

## What

Behind `?fields=1` (off by default, no default flips), around each group in view, draw what its way of life does to the land as
low ground-hugging shapes draped on the Terrarium ground of the close-up (as dwellings are):

- **Farmers**: field plots out to the distance a village farms (cited: site-catchment work), as irregular strips and plots coloured
  by season and crop (`lib/food.ts` crops around the cell and era); the field area scales with the HYDE cropland share; terraces on
  steep ground; fallow and pasture patches; small kitchen gardens beside houses.
- **Herders**: a corral ring by the camp and grazed, paler grass around it.
- **Foragers**: nothing planted; a trodden clearing round the hearths.
- **Towns**: denser gardens among the roofs and a ring of fields beyond them.
- **Paths**: worn tracks from each group towards its nearest fresh water (`public/water/water_distance.webp`) and between
  neighbouring groups within a few km.

Deterministic per group (seeded like households), never on water or ice, built once per view region (not per frame). The close-up
note says fields and paths are imagined, their extent scaled by HYDE cropland.

## Success criteria

- [ ] Screenshots with and without the flag: Nile 3000 BCE z13, the Meseta 1000 CE z13, Rome 100 CE z12, Mongolian steppe 1000 CE z13 (herders).
- [ ] fps at zoom 13-15 with and without the flag (`scripts/measure-view.mjs`), cost reported, aim ≥ 45 fps.
- [ ] Flag off changes no pixel (`pnpm visual`).
- [ ] Unit tests for plot generation: deterministic, area scales with cropland, none on water.
- [ ] tsc, lint, build pass.
- [ ] `docs/ops/flags.md` registry row (and `scripts/flags-lib.mjs`).
- [ ] `docs/ops/close-up-scene.md` section.
- [ ] Docs log entry (per-job fragment).

## Won't do

- No default flips; nothing changes with the flag off.
- No new baked data: everything comes from data the app already ships.
- No fields on the flat map (`?close3d=0`), see Assumptions.

## Assumptions

- Like the shelters, the fields live in the close-up 3D only (they need the ground height to drape on and the ground's water and ice
  to stay off). The task allowed "or on z=0 on the flat map"; the flat map at zoom 11+ is a debug view (`?close3d=0`), and without
  heights there is no fine water test, which would break "never on water".
- Terraces use the slope of the close-up's own Terrarium heights at the plot (about 70 m between samples) instead of
  `site_terrain.webp`'s 2.5′ regional slope class: the main thread does not hold the site terrain (the worker does), decoding its
  8640 × 4320 image again would cost ~150 MB, and the DEM slope is finer and also gives the contour direction terraces follow.
- "Coloured by season": the app has a season only through `?seasons=1` (June / December). Without it, fields show the northern or
  southern summer look (ripening cereals), the most legible; with December in the northern hemisphere they show bare and sprouting ground.

## References

- `footsteps-web/components/footsteps/layers/shelters.ts`, `Close3DLayer.ts`, `households.ts`
- `footsteps-web/lib/food.ts`, `lib/habitat.ts` (HYDE land use per 0.5° cell)
- Chisholm, M. (1962) *Rural Settlement and Land Use*. London: Hutchinson. Vita-Finzi, C. & Higgs, E. S. (1970) Prehistoric economy in the Mount Carmel area of Palestine: site catchment analysis. *Proc. Prehist. Soc.* 36: 1-37.
- Steady task: 080b9e05-fbea-4168-8b03-794fe3e6dc45
