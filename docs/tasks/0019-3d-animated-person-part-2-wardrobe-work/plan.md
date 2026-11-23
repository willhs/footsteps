---
id: plan-0019
type: spec
purpose: "Implementation plan for the 3D person's era/region/role wardrobe, tools and work loops behind ?avatar=3d (part 2)."
tags: ["plan", "avatar", "three.js", "wardrobe"]
related: ["./task.md", "../0018-3d-animated-person-part-1/plan.md"]
---

# 3D animated person, part 2: implementation plan

## Overview

**Primary goal**: the same person card figure, dressed and busy according to era, place, climate, way of life and role,
from a cited table, with no change when the flag is off.

**Approach**: three plain-data layers, each testable without WebGL, feeding the part-1 viewer:

1. `lib/wardrobe.ts`: the cited table and `wardrobeFor(...) → Outfit` (cut pieces, material, hair, ornaments, label).
2. `lib/avatarWork.ts`: `workFor(role, way, year, region, routineState) → { tool, loop }` and `workPose(loop, t)`: the
   keyframed bone offsets for a work loop at time t (pure).
3. `lib/avatarSpec.ts` gains `outfit` and `work`; the viewer loads the outfit's garment pieces next to the body, builds
   tools/ornaments/caps as primitives on bones, and plays the base clip plus the work offsets, alternating with the idle.

The build script makes the garment pieces from the bodies themselves (shells of body triangles for fitted parts, lathes
round the hips for skirts and cloaks, weights copied from the nearest body vertex), so they fit and bend with the rig.

## Current State Analysis

- `footstep-generator/avatar/build.mjs`: `bakeBody` paints a tunic band into the body's `garment` channel and adds one
  `garment` shell (`garmentShell`). Clips: idle, talk, walk, sit, crouch, work.
- `components/footsteps/overlays/avatarScene.ts`: `paint()` colours by (shade, garment, trim); `ADJUSTED` bones are reset
  to the clip pose before stoop/glances are applied (the mixer only writes changed values).
- `lib/avatarSpec.ts`: draws from its own generator (`personSeed ^ 0x5bd1e995`); the SVG's draws must not move.
- UAL clips available beyond part 1's six: `Idle_Torch_Loop` (one hand raised, holding), `Push_Loop`, `Interact`,
  `PickUp_Table`, `Sitting_Talking_Loop`, `Dance_Loop`, `Jog_Fwd_Loop`. No knapping, grinding or spinning.
- Atlas example (prod, Nile 3000 BCE): garments ["wrapped linen or wool cloth", "simple tunic"], materials ["flax linen",
  "wool", "animal hide"], ornaments ["bone pins", "beaded cord"], body_paint "none attested" (source: model).

## Design options

| | Shape | Exposes to callers | Verdict |
|---|---|---|---|
| A | One outfit enum per row (`'parka'`, `'toga'`, …), each mapped to a hand-made mesh | a closed list; every new culture needs a mesh | rejected: does not compose |
| B | Outfit = pieces by slot (`top`, `bottom`, `over`, `head`) + material; rows choose pieces | four small unions; meshes are per piece | **chosen**: 12 pieces dress every row |
| C | Runtime-generated garments in the viewer (no files) | nothing new on disk, but skinning code in the lazy chunk and per-click CPU | rejected: build-time is cheaper and inspectable |

Work loops: keyframed in code as offsets over a pack clip (pure `workPose`) vs authoring glTF clips in the build. Code
offsets chosen: they reuse the part-1 `rotateWorld` path, are testable and cost no bytes.

## Assumptions _(unattended run)_

1. Climate from latitude and era (task.md Assumptions).
2. Colours: natural materials take the material colour; cloth keeps `portraitLooks`'s dye-era colours or the atlas palette.
3. Atlas overrides: garment phrases are mapped to pieces by regex (as `hairStylesFrom` does); a phrase that maps to nothing
   leaves the table's choice. Atlas materials override the material when they name one the table knows.
4. Body triangles fully under a fitted piece (top, trousers, hood) are hidden at runtime via a `_COVER` bitmask the build
   writes per body vertex, so skin never pokes through. Skirts and cloaks hang free and hide nothing.
5. Children wear the male-body pieces (they use the male body).
6. Potter before 7000 BCE (no pottery outside East Asia yet) carries a basket instead; sickle only for farmers; spindle
   only from 7000 BCE.
7. Work alternates: work 6-12 s, idle 3-6 s, 0.5 s cross-fade, per-person seed. `?still=1` shows the work pose at its fixed
   instant.
8. Routine (only with `?routine=1`): asleep → sitting, head bowed, no tool; hearth → role work; playing → dance clip;
   trip out/back → walk; trip there → the trip's work (gathering → dig, hunting/fishing → hold spear, water and wood →
   carry, fields → reap or dig, herding → herd, visiting → talk). Computed once when the card opens.
9. Neanderthal (other kinds of human): draped hide (no tailoring), per Collard et al. 2016; caveat line unchanged.
10. Contact sheet made by a harness that bundles the viewer with esbuild (dev dependency of `footstep-generator/avatar`)
    and renders synthetic people with atlas records fetched from prod, so it does not need the map or a found person.

---

## Phase 1: Wardrobe table

- [x] Write `lib/wardrobe.ts`: types (`Top`, `Bottom`, `Over`, `Head`, `Material`, `Ornament`, `Outfit`, `WardrobeRow`),
      regions, climate, rows with sources and status, `wardrobeFor`, atlas overrides.
- [x] Check every cited DOI against Crossref (title, year); mark rows `checked` only when the claim matches the source.
- [x] Tests `lib/wardrobe.test.ts`: every row has a source; lookup per era/region for the twelve contact-sheet people;
      determinism; atlas overrides; fallback always returns an outfit.
- [x] Run: `pnpm --dir footsteps-web exec jest lib/wardrobe` — pass.

## Phase 2: Garment pieces in the build

- [x] `build.mjs`: drop the painted tunic band and the single shell; add `PIECES` (shell masks and lathes) per sex; write
      `piece_<name>_<sex>.glb`; `_COVER` per body vertex; add clip `hold` (`Idle_Torch_Loop`) and `dance` (`Dance_Loop`).
- [x] Run the build; manifest lists every file with bytes; total < 6 MB.

## Phase 3: Work and tools

- [x] `lib/avatarWork.ts`: `Tool`, `WorkLoop`, `workFor`, `workPose`, `routineWork`; tests (era gates, determinism,
      each loop returns bounded offsets).
- [x] `lib/avatarSpec.ts`: `outfit`, `work`, colours by material; tests updated.

## Phase 4: Viewer

- [x] `avatarScene.ts`: load pieces, hide covered body triangles, paint by material, attach primitives (tools, ornaments,
      cap, braids/topknot), play base clip + work offsets alternating with idle; dispose everything.
- [x] `Avatar3D.tsx`: caption shows the outfit label; routine state with `?routine=1`.

## Phase 5: Contact sheet, measure, docs

- [x] `footstep-generator/avatar/sheet.mjs`: bundle + render 12 people → `docs/ops/avatar-sheet.webp` (small).
- [x] Look at every figure; fix what reads wrong.
- [x] Run tsc, lint, jest, build, `pnpm visual`, `node scripts/first-load.mjs --flags`.
- [x] `docs/ops/avatar.md`, log fragment, decisions.tsv.

## Phase 6: Wrap (commit & finalize)

- [x] `git status` clean after the final commit; last commit holds every phase's changes.

## References

- Task: `docs/tasks/0019-3d-animated-person-part-2-wardrobe-work/task.md`
- Part 1: `docs/tasks/0018-3d-animated-person-part-1/`, `docs/ops/avatar.md`

## As built (2026-11-24)

- Phase 2 made 13 pieces, not 12: `vest`, `shortsleeve`, `longsleeve`, `trousers`, `hood`, `drape` (shells), `loin`,
  `skirt_short`, `skirt_knee`, `skirt_long`, `strings`, `cape`, `cloak` (lathes); a long top over trousers adds
  `skirt_short` as coat tails. Clips added: `hold`, `dance`, `push`.
- Assumption 3 was tightened after the first sheet: a modelled atlas (`source: model`) overrides only rows resting on
  unverified sources (`rowIsFirm`), for clothes, hair and ornaments alike; real atlas sources always override.
- Carrying is hands-free (loads on the head); props are offset by each body's own bone positions.
- Still frames show work at full strength.
