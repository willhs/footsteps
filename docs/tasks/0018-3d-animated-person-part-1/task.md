---
id: task-0018
type: spec
purpose: "Behind ?avatar=3d, show a rigged, animated CC0 3D human in the person card instead of the SVG portrait, with skin, hair, sex, age and build from the selected person."
tags: ["person-card", "avatar", "three.js", "close-up-scene"]
related: ["../../ops/flags.md", "../../ops/first-load.md", "../../ops/visual-regression.md", "../../ops/ages.md"]
created: 2026-11-24
updated: 2026-11-24
---

# 3D animated person, part 1, behind ?avatar=3d

Vision alignment: On a new endeavour — Want to reach my potential with software (goal: Footsteps: the close-up scene, what you'd see standing there).

## Goal

With `?avatar=3d`, clicking a person at street zoom shows a small WebGL figure in the person card: a rigged CC0 human
(man, woman or child body) that idles, occasionally turns its head, can be dragged to turn, and takes its skin, hair
and garment colours from the same palette logic as the SVG portrait. Without the flag nothing changes: no pixel and
no first-load byte.

## Context

Will chose a real 3D animated person (2026-11-24) over painted portraits or a richer 2D drawing. Today the card shows
`components/footsteps/overlays/Portrait.tsx`, a 96×120 hand-built SVG that looks samey across 100,000 years. This is
part 1 of 2: the figure and the viewer. Part 2 (a separate task) adds the era/region/role wardrobe and work
animations, so the asset layout and the viewer must leave room for clothes meshes and more clips.

## Scope

### Must Do
- Assets: CC0 rigged human bodies (man, woman; child as a scaled body) and an animation set on the same skeleton with at
  least idle, walk, sit and crouch-work. Licence checked on the source page; URL, version and sha256 in a committed
  manifest. A committed script in `footstep-generator/avatar/` fetches, trims and compresses them (meshopt) into
  `footsteps-web/public/avatar/`, aiming under ~3 MB total.
- Viewer `components/footsteps/overlays/Avatar3D.tsx`: three.js, loaded through `lib/lazyModule.ts`, never in the
  default first load. Soft studio light with a warm rim, ground shadow, slow idle, the head now and then turning, drag
  to turn (no auto-spin). `?still=1` gives a still frame. Renders only while visible.
- `lib/avatar.ts`: the palette logic factored out of `Portrait.tsx` (skin, hair, garment, hair style; latitude-nudged
  ranges, atlas palettes) so the SVG and the 3D figure agree; body build by age and sex. Deterministic per person.
- Other kinds of human: a line saying the figure is our own species' body and theirs differed.
- The card still says it is an imagined illustration, not a likeness.
- Flag registry row (`scripts/flags-lib.mjs`, `docs/ops/flags.md`), `docs/ops/avatar.md`, log fragment.

### Won't Do
- Era/region/role wardrobe, tools, work animations in the card (part 2).
- Invented anatomy for Neanderthals and others.
- Making the 3D figure the default (Will reviews on prod first).
- KTX2 textures: the build bakes the texture detail it needs into vertex colours, so no textures ship.

## Constraints

- Default visit unchanged: `node scripts/first-load.mjs --flags` shows no avatar code in it; `pnpm visual` is pixel-identical.
- No visible fps drop on the map with the card open.
- No paid or non-commercial assets.

## References

- `docs/ops/flags.md`, `docs/ops/first-load.md`, `docs/ops/visual-regression.md`, `docs/ops/ages.md`
- Steady task: b79d9ae9-4b71-4b1e-8223-88054321c8c8

## Success Criteria

- [ ] Screenshots of the card, flag on and off, for a forager child at 50,000 BCE, a farmer woman at 3000 BCE (Nile), an elder man in 1500 CE (Meseta)
- [ ] Asset manifest with licences, URL, version, sha256
- [ ] Bytes and time to first frame of the viewer measured
- [ ] Map fps with the card open measured: no visible drop; the canvas pauses offscreen
- [ ] Flag off changes no pixel (`pnpm visual`); first load unchanged (`first-load.mjs --flags`)
- [ ] tsc, lint, tests (palette and determinism), build
- [ ] flags.md registry row, docs/ops/avatar.md, log fragment

## Assumptions

- Quaternius "Universal Base Characters" (Standard, free) and "Universal Animation Library" (Standard, free) are the
  sources: both CC0 on quaternius.com and in their `License.txt`, one 65-joint UE-style skeleton shared by bodies, hair
  and animations. The free bodies are the "Superhero" male and female; the kit has no child, so a child is a scaled body.
- Downloads go through itch.io's free-download endpoint (no account needed); the script pins the zip sha256s so a
  changed upload fails loudly instead of silently changing the figure.
