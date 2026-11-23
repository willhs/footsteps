---
id: plan-0018
type: spec
purpose: "Implementation plan for the 3D animated person in the person card behind ?avatar=3d (part 1: figure and viewer)."
tags: ["plan", "avatar", "three.js"]
related: ["./task.md"]
---

# 3D animated person, part 1: implementation plan

## Overview

**Primary goal**: `?avatar=3d` swaps the SVG portrait in `GroundingPanel` for a lazy-loaded three.js figure built from
the selected `Person`; with no flag the app is byte- and pixel-identical.

**Approach**: a Node build script turns the two Quaternius CC0 packs into four small meshopt GLBs (two bodies, a hair
set, an animation set) with colour detail baked into vertex colours, so the viewer can recolour per person on the CPU
with no textures. The palette logic moves from `Portrait.tsx` to `lib/avatar.ts`, keeping the random draw order, so the
SVG draws the same pixels and the 3D figure gets the same colours.

## Current State Analysis

- `components/footsteps/overlays/Portrait.tsx:136-182`: skin, hair, clothing, ornaments and hair style all come from
  one `rng(seed)` in a fixed draw order; the SVG's JSX then draws three more numbers (beads fallback, paint fallback,
  `Tool`). Changing the order changes the pictures, and `rome-1000bce-person` in `pnpm visual` would catch it.
- `GroundingPanel.tsx:51` renders `<Portrait {...portrait} />` when a person is selected; there is no featured-person card yet.
- `lib/lazyModule.ts`: `lazy` + `useLazy` + `prefetchAfterFirstPeople` is the pattern for opt-in code.
- `lib/still.ts`: `stillOn()`, `STILL_SECONDS`.
- `scripts/first-load.mjs` `SWEEP` checks an opt-in's code arrives with its flag via a marker string in the chunk.
- `lib/flags.test.ts` greps `URLSearchParams(...).get('x')` and fails unless `x` is in `scripts/flags-lib.mjs` `FLAGS` and `docs/ops/flags.md`.
- three.js is not a dependency yet.

### Key discoveries (assets, checked 2026-11-24)
- Both packs say CC0 1.0 on quaternius.com and in their `License.txt`. Downloads: `POST https://quaternius.itch.io/<game>/download_url`
  gives a page; `POST /<game>/file/<upload_id>?source=game_download` with the page's csrf token gives a signed URL.
- Bodies: `Superhero_Male_FullBody.gltf` (body 7,281 verts, eyes 556, brows 646), `Superhero_Female_FullBody.gltf` (7,376 / 556 / 912).
  Hair (rigged to head bone): Long 3,080, Buns 3,501, SimpleParted 757, Buzzed 466, BuzzedFemale 466, Beard 596. All opaque.
- `UAL1_Standard.glb`: 43 clips on the same 65 joints (`root`, `pelvis`, `spine_01..03`, `neck_01`, `Head`, …), incl.
  `Idle_Loop`, `Idle_Talking_Loop`, `Walk_Loop`, `Sitting_Idle_Loop`, `Crouch_Idle_Loop`, `Fixing_Kneeling`.
- Textures are 1-4 MB PNGs each; the body base colour paints dark underwear on skin.

## Desired End State

- `footsteps-web/public/avatar/{body_male,body_female,hair,anims}.glb` + `manifest.json`, under 3 MB total.
- `?avatar=3d` + a selected person: a 120×168 canvas in the card with the figure idling; drag turns it.
- `pnpm visual` all scenes pass unchanged; `first-load.mjs --flags` default row has no avatar chunk.

## What We're NOT Doing

- Wardrobe, tools, role animations (part 2). Eye bones (the rig has none; the head turns instead).
- Body proportions for other kinds of human (the line explains why).

## Assumptions _(unattended run)_

1. **Assets**: Quaternius Universal Base Characters + Universal Animation Library, Standard (free) editions, CC0 (see task.md).
2. **No textures**: per vertex, the build bakes `COLOR_0 = (shade, garment, 0)` from the body's base-colour texture
   (shade = luminance relative to the skin median; garment = 1 where the texture is the dark underwear, or the vertex is
   in a tunic band from mid-thigh to chest inside the torso). Eyes bake real RGB from the eye texture. The viewer turns that
   into per-person colours on the CPU. Saves ~25 MB of PNG and the KTX2 toolchain; costs normal-map detail, fine at 120 px.
3. **A plain tunic** (garment colour from the same clothing palette as the SVG) instead of the pack's underwear: the
   figure has to be dressed to stand for anyone in 100,000 years; part 2 replaces it with real clothes.
4. **Hair as separate skinned meshes** rebound by bone name to the body's skeleton at runtime, so part 2 can add clothes the same way.
5. **Child = the body of their sex scaled** to a height for their age with a bigger head (`Head` bone scale);
   **elder** = a stoop added to spine and neck after the animation, a slower idle, grey hair (already in the palette).
6. **Idle only in part 1**: the card plays `Idle_Loop`; walk, sit and crouch-work ship in `anims.glb` for part 2, and the
   build asserts every kept clip targets only joints the bodies have.
7. **Reduced motion**: `prefers-reduced-motion: reduce` gets the same still frame as `?still=1` (it is auto-motion).
8. **Flag** `avatar`, kind opt-in, on value `3d`. With it on, the viewer chunk prefetches after first people (like the
   close-up) so `first-load.mjs --flags` sees the chunk without a click; the GLBs load only when a person is selected.
9. **Hair style mapping**: long→Long, braid→Long, tied→Buns, short→SimpleParted (man) / BuzzedFemale (woman),
   wrap→Buns in the garment trim colour; adult men get a beard 40% of the time (own seed, after the SVG's draws).
10. **Other kinds of human**: same figure plus the line "Illustration of our own species' body; their build differed."
11. **Measuring**: a new `scripts/avatar-shots.mjs` drives the three scenes, flag on and off, and records bytes,
    time to first frame (a `footsteps:avatar-first-frame` mark against the click) and map fps with the card open
    and closed (rAF count over 4 s).

---

## Phase 1: Asset pipeline

- [x] Create `footstep-generator/avatar/package.json` (gltf-transform core/extensions/functions, meshoptimizer, sharp) and install.
- [x] Create `footstep-generator/avatar/build.mjs`: fetch (or `--zips DIR`), verify sha256, unzip, bake vertex colours, rename meshes (`body`, `eyes`, `brows`, `hair_*`), drop textures/extra UVs/colour sets, keep 6 clips, resample, weld, quantize, meshopt, write GLBs and `manifest.json`.
- [x] Create `footstep-generator/avatar/sources.json`: URLs, upload ids, versions (upload dates), sha256, licence.
- [x] Run: `node footstep-generator/avatar/build.mjs` — four GLBs, total < 3 MB, manifest written.

## Phase 2: Shared palette (`lib/avatar.ts`)

- [x] Move `rng`, `pick`, `mix`, skin/hair ranges, `clothing`, `atlasClothing`, `pickHex`, `hairStylesFrom`, `saysNone` to `lib/avatar.ts`; add `personSeed` and `portraitLooks(person, year, lat, rec)` returning the colours, hair style, beads/paint and the rng in its state.
- [x] Portrait uses `portraitLooks`; re-exports `hairStylesFrom`/`saysNone` for existing tests.
- [x] Add `avatarBuild(person, looks)`: body, height scale, head scale, stoop, beard, hair mesh, colours.
- [x] Add `avatarFromParams(search)`.
- [x] Tests `lib/avatar.test.ts`: determinism, SVG fill = looks.skin, latitude pull, elder hair grey, child build, hair mapping.
- [x] Run: `pnpm test -- --runInBand lib/avatar Portrait portraitAtlas` — green.

## Phase 3: Viewer

- [x] `pnpm add three` + `@types/three` (dev).
- [x] Create `overlays/avatarScene.ts`: load GLBs (GLTFLoader + MeshoptDecoder, cached), build the figure, lights, blob shadow, mixer, head turns, drag, visibility pause, still frame, first-frame mark.
- [x] Create `overlays/Avatar3D.tsx`: the React wrapper (canvas, atlas wait like Portrait, caption, other-human line).
- [x] GroundingPanel: `?avatar=3d` → `useLazy(AVATAR)`; Portrait until the chunk is in; prefetch after first people.
- [x] Flag row in `scripts/flags-lib.mjs` + `docs/ops/flags.md`; SWEEP row in `scripts/first-load.mjs`.
- [x] Run: `pnpm exec tsc --noEmit && pnpm lint` — clean.

## Phase 4: Prove it

- [x] Create `scripts/avatar-shots.mjs` (three scenes, flag on/off, bytes, first frame, fps).
- [x] Run: `pnpm build` then `node scripts/avatar-shots.mjs <evidence dir>` — six shots, numbers.
- [x] Run: `pnpm visual` — all scenes pass.
- [x] Run: `node scripts/first-load.mjs --flags` — default row unchanged, `?avatar=3d` loads its chunk.

## Phase 5: Docs and wrap

- [x] `docs/ops/avatar.md`; AGENTS.md line; log and index fragments.
- [x] Run: `pnpm test -- --runInBand`, tsc, lint — green.
- [x] Commit.

## As built (changes from the plan)

- **Tunic shell and trim** (Phase 1): flat vertex-colour garments the colour of skin read as bare skin at card size, so the
  build adds a separate garment mesh (the tunic's triangles pushed out 1-3 cm, flaring to the hem, short sleeves, round
  neck) and a trim channel (hem, belt, cuffs) in COLOR_0's third component. Bodies grew from ~158 to ~194 KiB.
- **Children use the man's body** (Phase 2): the woman's mesh is an adult's; before puberty bodies differ little by sex.
- **Framing fixed for an adult** (Phase 3), so a child stands smaller in the card.
- **Bones adjusted after the clip are restored each frame** (Phase 3): three's PropertyMixer only writes a bone when its
  value changes, so the stoop and glances piled up (found with a drag test in a throwaway gallery harness).
- **`avatarSpec` moved to `lib/avatarSpec.ts`** (Phase 4): in `lib/avatar.ts` it was not tree-shaken and added ~2 KB to
  the first load; now the default visit gains 866 B (the flag read and the lazy hook).
- `pnpm test -- --runInBand` passes `--runInBand` to jest as a pattern under pnpm 10 here; `pnpm exec jest --runInBand` runs the suite.

## References

- Task: `docs/tasks/0018-3d-animated-person-part-1/task.md`
