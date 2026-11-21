---
id: task-0013
type: spec
purpose: "Dated ice-sheet extent behind ?ice=1: PaleoMIST 1.0 margins on the Earth image, the close-up and group placement."
tags: ["task", "terrain", "ice", "placement"]
related: ["../../research/0014-past-terrain/research.md", "../../ops/past-water.md", "../../ops/ice-sheets.md"]
steady_task: 4d0ce31e-84da-49f4-9459-50b4a1242ee6
---

# Ice sheets at their dated extent behind `?ice=1`

Steady task `4d0ce31e-84da-49f4-9459-50b4a1242ee6`. Vision alignment: Footsteps: the close-up scene (what you'd see standing there).

## Why

At 20,000 BCE the Earth image shows Krapp's ice biome (a 0.5° climate-model class), but the shape and edge of the big ice sheets
(Laurentide, Fennoscandian, Patagonian) are not drawn from a dated reconstruction, and the close-up does not show ice at all. Groups
can be placed on ground that was under ice. Research 0014 (rank 2, Findings 1) names PaleoMIST 1.0 (CC BY 4.0) as the best explicitly
licensed source, with DATED-1 (Eurasia) and Dalton et al. 2020 (North America) as alternatives; ICE-6G/GLAC-1D licences were not verified.

## What

- `footstep-generator/ice_sheets.py`: a dated ice-extent mask per source epoch, as small lossless WebPs in `footsteps-web/public/ice/`
  with a manifest (source, licence, epochs, the rule between epochs, uncertainty, bytes, sha256). Source obtained normally, checksums
  verified, one published epoch reproduced.
- Behind `?ice=1` (off by default):
  - its own layer over the terrain: white with a clear edge;
  - an ice surface in the close-up where the mask covers the ground (no ice-surface height);
  - groups never sit on ice: the ranker treats ice as unusable, cells with no usable spot are counted `unresolved` (never dropped);
  - the hover card says e.g. "Ice sheet (PaleoMIST 1.0, 22.5 ka)" with the region's basis (Eurasia: DATED-1 most credible).
- Flag off changes nothing.

## Success criteria

- [ ] Masks cover at least 25,000–10,000 BCE (app years −25000…−10000).
- [ ] A check that no group is on ice with the flag on and totals (placed + unresolved) are unchanged.
- [ ] Flag off changes nothing (`pnpm visual`).
- [ ] Real-data screenshots on and off: Scandinavia 20,000 BCE, Great Lakes 15,000 BCE, Patagonia 20,000 BCE.
- [ ] Bytes measured.
- [ ] Python + frontend checks and build pass.
- [ ] `docs/ops/ice-sheets.md` and the docs log entry.
- [ ] No default change.
