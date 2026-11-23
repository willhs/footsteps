---
id: task-0019
type: spec
purpose: "Behind ?avatar=3d, dress the 3D person by era, region, climate and way of life from a cited wardrobe table, give them hair, ornaments and a tool by role, and a work animation that alternates with the idle."
tags: ["person-card", "avatar", "three.js", "close-up-scene", "wardrobe"]
related: ["../../ops/avatar.md", "../0018-3d-animated-person-part-1/task.md", "../../ops/routine.md", "../../ops/flags.md"]
created: 2026-11-24
updated: 2026-11-24
---

# 3D animated person, part 2: clothing, hair, ornaments, tools and work by era, region, climate and role

Vision alignment: On a new endeavour — Want to reach my potential with software (goal: Footsteps: the close-up scene, what you'd see standing there).

## Goal

With `?avatar=3d`, the person in the card changes visibly with time, place and role: fur and hide in glacial Eurasia,
linen on the Nile, wool tunics and cloaks in Bronze and Iron Age Europe, a toga in Rome, layered robes in Han China, an
unku in the Andes, felt and trousers on the steppe; hair and ornaments to match; a tool in hand for their role and a work
loop (knapping, grinding, spinning, herding, carrying) alternating with the idle. Without the flag nothing changes.

## Context

Part 1 (task 0018, commits f2be389..b807118) built the figure and viewer: two CC0 Quaternius bodies, six hair meshes, six
clips, one plain tunic shell for everyone, colours from `lib/avatar.ts` `portraitLooks`. Will's complaint about the old
portrait is that it looks the same across 100,000 years; part 1's tunic has the same problem. Read `docs/ops/avatar.md`.

Checked against the code (2026-11-24): the notes' premise holds. `role()` in `layers/people.ts` gives forager, hunter,
gatherer, toolmaker, fire-keeper, fisher (bands); herder, shepherd, milker, weaver, tanner (camps); farmer, herder, potter,
weaver, builder (villages); young child, child, elder. `lib/routine.ts` `stateAt` gives asleep / hearth / playing / trip
(out, there, back, with a trip kind). The atlas record (`useAnthropology`) has clothing garments, materials and palette,
hair styles, ornaments and body paint. The UAL pack has no knapping, grinding or spinning clips, so those are keyframed.

## Scope

### Must Do
- `lib/wardrobe.ts`: a cited table (`checked`/`unverified` per row with its source, like `lib/footwear.ts`) of outfits by
  era band × region × climate × way of life (× sex where it matters), with hair styles and ornaments; atlas garment,
  material, hair and ornament phrases override the defaults. Deterministic lookup.
- Meshes: modular garment pieces rigged to part 1's skeleton, built by the committed script (no CC0 garments exist for this
  rig): tops (sleeveless, short, long sleeves), skirts (loincloth, short, knee, ankle, string skirt), trousers, cloak,
  drape (toga/mantle), hood; coloured by material and dye era. Tools, ornaments and caps are small primitives built in the
  viewer (no bytes).
- Tools and work by role, era-gated (no pot before pottery, no sickle before farming): spear, digging stick, basket,
  hammerstone and core, quern, spindle and distaff, pot, crook, sickle, torch, staff; keyframed work loops over the
  pack's clips, alternating with the idle.
- `?routine=1`: the animation follows the person's current state where it maps cleanly.
- A contact sheet of ~12 people across eras and places committed small in docs/ops; asset bytes reported (aim < ~6 MB
  total, loaded per need); flag off changes no pixel (`pnpm visual`); tsc, lint, tests (wardrobe lookup per era/region,
  determinism), build; docs/ops/avatar.md and the log fragment.

### Won't Do
- Other kinds of human's anatomy (the caveat line stays). Textures. Cloth physics. Eye bones.
- Changing the SVG portrait: its draws stay byte-identical.

## Success Criteria
- [ ] `lib/wardrobe.ts` table with a source and `checked`/`unverified` on every row; sources checked
- [ ] Garment pieces built by `footstep-generator/avatar/build.mjs`, bytes in the manifest, total < ~6 MB
- [ ] Tools and work loops by role, era-gated, alternating with idle
- [ ] `?routine=1` maps asleep / hearth / playing / trip onto the animation
- [ ] Contact sheet of ~12 people committed in docs/ops (incl. a Neanderthal with the caveat)
- [ ] `pnpm visual` (flag off) unchanged; tsc, lint, tests, build pass
- [ ] docs/ops/avatar.md updated; log fragment

## References
- `docs/ops/avatar.md`, `docs/tasks/0018-3d-animated-person-part-1/`
- `footsteps-web/lib/footwear.ts` (the cited-table model), `lib/avatar.ts`, `lib/avatarSpec.ts`, `lib/routine.ts`
- Steady task: 26286cca-5a24-4a8b-865a-5c3e7d56d6f9

## Assumptions
- Climate is read from latitude and era (cold: |lat| ≥ 50, or ≥ 40 before 10,000 BCE in the glacial; hot: |lat| < 23),
  the same stand-in `lib/footwear.ts` uses; no climate grid lookup in the card.
- Garment colours: natural-colour materials (fur, hide, bark, plant fibre, felt, leather) take the material's colour; woven
  cloth keeps `portraitLooks`'s colours (its dye-era rules and atlas palette), so the SVG and the figure still agree there.
