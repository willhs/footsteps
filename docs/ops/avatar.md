---
id: avatar
type: ops
purpose: "The 3D person in the person card behind ?avatar=3d: assets and licence, the build script, how a person becomes a figure, the viewer's rules, and how to measure it"
scope: [person-card, close-up]
tags: [imagined, experimental]
related: ["flags.md", "first-load.md", "visual-regression.md", "ages.md", "other-humans.md", "../tasks/0018-3d-animated-person-part-1/task.md"]
---

# The 3D person in the card (`?avatar=3d`)

Off by default until Will has reviewed it on prod. With `?avatar=3d`, clicking a person at street zoom shows a small
three.js figure in the card (`GroundingPanel`) instead of the SVG drawing (`overlays/Portrait.tsx`): a rigged human that
idles, now and then glances aside, and turns when dragged. Without the flag nothing changes: no pixel (`pnpm visual`)
and no byte of the first load (`node scripts/first-load.mjs --flags`).

It is an **imagined illustration of the kind of person, never a likeness**, and the caption says so. Part 1 (task 0018)
is the figure and the viewer; part 2 adds era, region and role wardrobe and work animations on the same skeleton.

## Assets and licence

| Pack | Source | Licence | sha256 of the zip |
|---|---|---|---|
| Universal Base Characters [Standard] (free) | [quaternius.com](https://quaternius.com/packs/universalbasecharacters.html), itch upload 15861669 | CC0 1.0 | `fdbf1804…5f40` |
| Universal Animation Library [Standard] (free) | [quaternius.com](https://quaternius.com/packs/universalanimationlibrary.html), itch upload 17958403 | CC0 1.0 | `cc73fc4e…7724` |

Both pages show "License: CC0" and both zips carry `License.txt` ("CC0 1.0 Universal ... Public Domain Dedication"),
checked 2026-11-24. Full URLs, versions and hashes: `footstep-generator/avatar/sources.json`; the built files and their
hashes: `footsteps-web/public/avatar/manifest.json`. No paid or non-commercial asset is used.

The packs share one 65-joint UE-style skeleton (`root`, `pelvis`, `spine_01-03`, `neck_01`, `Head`, arms, fingers, legs).
The free bodies are an adult man and woman ("Superhero" meshes, ~7,300 vertices each); the kit has no child.

## Build

```bash
pnpm --dir footstep-generator/avatar install
node footstep-generator/avatar/build.mjs            # downloads into data/raw/avatar/ (not in git), checks sha256, writes public/avatar/
node footstep-generator/avatar/build.mjs --zips DIR # zips you already have
```

The download uses itch.io's free-download flow (no account). A changed upload fails the sha256 check: check the
licence again before updating `sources.json`.

What it writes (meshopt, no textures):

| File | What | KiB |
|---|---|---|
| `body_male.glb`, `body_female.glb` | body, eyes, eyebrows, and a tunic shell, skinned | ~190, ~198 |
| `hair_{long,buns,parted,buzzed,buzzed_female,beard}.glb` | one skinned hair mesh each | 25-63 |
| `anims.glb` | skeleton + 6 clips: `idle`, `talk`, `walk`, `sit`, `crouch`, `work` (`Fixing_Kneeling`) | ~236 |
| total | | ~851 (871,728 B) |

One person loads a body, one hair file, maybe the beard, and `anims.glb`: about 0.45-0.5 MB, once per visit.

**No textures.** The pack's PNGs are 1-4 MB each and would need a KTX2 toolchain. The build samples them once into vertex
colours instead: `COLOR_0 = (shade / 1.5, garment, trim)`. *Shade* is the base-colour texture's brightness against its
typical skin pixel (muscle and face shading); *garment* is 1 on the pack's painted underwear and on a plain short-sleeved,
knee-length tunic band added in the bind pose; *trim* marks the hem, belt and cuffs. A **tunic shell** (the tunic's
triangles pushed out 1-3 cm along their normals, flaring to the hem) gives the clothes an edge and a silhouette; without it
a hide tunic the colour of skin read as bare skin. Eyes keep their texture's RGB. The viewer turns these into the person's
colours on the CPU, so the same files serve every person.

Clips keep rotation tracks for every joint and the pelvis translation; scale tracks and other translations are dropped
(they carry nothing visible, and the body's own bone lengths are kept). The build fails if a clip drives a joint the
bodies lack.

## From a person to a figure

`lib/avatar.ts` is shared by the SVG and the 3D figure, so they agree:

- `portraitLooks(person, year, lat, record)`: skin (atlas palette, else a wide light-to-deep range nudged deeper toward the
  equator), hair (atlas palette, else dark with lighter shades above 45°; grey for 55+), clothing colours (era and way of
  life defaults, atlas palette over them) and hair style (atlas phrases, else by sex). Its random draw order is the SVG's,
  unchanged: the SVG still draws exactly what it drew before (checked on 210 people against the old code).
- `avatarSpec(person, looks)` (`lib/avatarSpec.ts`, kept apart so it loads only with the viewer): the figure. Body by sex (children use the man's body: before puberty bodies differ little
  by sex, and the woman's mesh is an adult's); height from a growth fit (77 + 6.1 × age cm against 170 cm, close to the
  WHO medians) for under-18s, 0.98 for elders; a bigger head for children (`Head` bone × 1 + 0.6 × (1 − height)); elders
  (55+) stoop (0.2-0.4 rad over spine and neck, the head lifted back to look ahead) and idle at 0.8× speed. Hair mesh from
  the style: long and braid → long, tied → buns, wrap → buns in the trim colour, short → parted (men) or buzzed (women).
  Adult men get a beard 40% of the time. Beard, idle phase and glances draw from a second seed, so the SVG is untouched.
- Other kinds of human (`Person.kindOfHuman`) get the same figure and the line "Illustration of our own species' body;
  their build differed." No body-proportion change is applied: none was both cited and cheap enough for part 1.
- Deterministic: the seed is the person's spot and id (`personSeed`).

## The viewer

`components/footsteps/overlays/Avatar3D.tsx` (React) and `avatarScene.ts` (three.js), loaded through
`overlays/avatarLazy.ts` (`lib/lazyModule.ts`): never in the first load; with the flag on, the code is prefetched once the
first people are drawn, and the GLBs load when a person is first selected. The SVG shows until the code is in, and again if
WebGL or a file fails.

- 120 × 168 px canvas, up to 2× pixel ratio, ACES tone mapping. Soft studio light: a warm hemisphere, a key from the front
  left, a warm orange rim from behind on the right; a soft round shadow under the feet. Framed for an adult, so a child
  stands smaller.
- The idle clip loops from a per-person phase; every 4-10 s the head glances up to ~30° aside and back (`glanceAt`). The
  pack's rig has no eye bones, so the head turns, not the eyes.
- Drag turns the figure (with a short coast). It never turns by itself.
- `?still=1` or `prefers-reduced-motion: reduce`: one fixed frame (the clip at `STILL_SECONDS`, no glances), redrawn only
  when dragged.
- Draws at most 30 frames a second, only while the canvas is on screen (IntersectionObserver) and the tab is visible; the
  WebGL context is released when the card closes.
- Adjustments after the clip (stoop, glances) are undone before each update: three's mixer only rewrites a bone when its
  animated value changes, so an adjustment left on a bone would pile up.

## Measure

```bash
pnpm --dir footsteps-web build
node footsteps-web/scripts/avatar-shots.mjs <dir>      # three people, card flag off and on, bytes, first frame, fps
```

It finds a forager child at 50,000 BCE (East Africa), a farmer woman at 3000 BCE (Nile) and an elder man in 1500 CE
(Meseta) at street zoom, checks the card names the wanted person, and writes `<scene>-{off,on}.png`,
`avatar-report.{json,md}`.

Measured 2026-11-24 on the local static export (M-series Mac, headless Chromium on Metal, a busy machine: the page ran
at only 11-14 fps with or without the card; what matters is the difference). First frame and bytes come from a fresh
browser context per scene, clicking the person once after the viewer's code had been prefetched:

| Scene | Person | Viewer code (JS the default visit never loads) | GLB files | First frame from click / from mount | Page fps: no card · card open · card offscreen · card closed | Canvas fps · frames drawn offscreen in 3 s |
|---|---|---|---|---|---|---|
| Forager child, 50,000 BCE (East Africa) | girl, 10 | 166 KiB | 490 KiB | 259 / 95 ms | 13.6 · 13.2 · 13.3 · 13.0 | 10.5 · 0 |
| Farmer woman, 3000 BCE (Nile) | woman, 18, farmer | 166 KiB | 497 KiB | 301 / 152 ms | 12.2 · 12.5 · 11.8 · 14.1 | 10.0 · 0 |
| Elder man, 1500 CE (Meseta) | man, 78, elder | 166 KiB | 456 KiB | 198 / 101 ms | 12.2 · 11.9 · 10.8 · 11.1 | 9.5 · 0 |

- No fps drop with the card open (differences are within run-to-run noise); the canvas draws nothing while off screen and
  starts again when back.
- The default first load gains 866 B of raw JS (the flag read and the lazy hook), no avatar or three.js code:
  1,596,694 → 1,597,560 B across the 11 scripts in `index.html` (base 751de0b vs this branch). `first-load.mjs --flags`:
  `?avatar=3d` loads its chunk, the default visit does not.
- `pnpm visual` (flag off): all ten scenes pass; `rome-1000bce-person` (the SVG portrait) differs by 2 px, within the
  usual run-to-run noise.

## Checks

- `lib/avatar.test.ts`: determinism, latitude pull, atlas palettes, elder grey, child build, hair mapping, beards, the 3D
  colours equal the SVG's, and the 3D draws do not move the SVG's.
- `pnpm visual` (flag off): unchanged. `node scripts/first-load.mjs --flags`: `?avatar=3d` loads its chunk, the default
  visit does not.

## Known limits (part 2 and later)

- The bodies are the pack's athletic "Superhero" meshes; arms and legs read muscular, children included.
- The tunic is one cut for everyone; fur, dress and era wardrobe are part 2. Clips other than idle ship but are unused.
- Eyes do not move (no eye bones).
