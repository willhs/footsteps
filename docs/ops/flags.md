---
id: ops-flags
type: ops
purpose: "Inventory of every URL flag the app reads (default, what it does, its ops doc, reviewed or not) and the flag sweep that loads them on and off across six scenes"
updated: 2026-11-28
---

# URL flags

Every query parameter the app reads, found by grepping the source for `URLSearchParams` reads (`params.get(`, `searchParams`); the registry
is `footsteps-web/scripts/flags-lib.mjs` `FLAGS`, and `lib/flags.test.ts` fails if the code reads a parameter that is not in the registry or
not in this page (or the reverse). **Adding a flag: add it to `FLAGS`, add a row here, then run the sweep.** No flag changes a default
by being listed; "Reviewed" is whether Will has looked at the look on prod.

**Reviewed 2026-11-28:** Will kept 15 features and they are now on by default (the off switches below, from `sky` to `langs`, plus `humans`);
the other seven (`tilt`, `plants`, `figures`, `seasons`, `evidence`, `tour`, `chart`) were removed and their parameters are no longer read.
The close-up no longer tilts by itself as you zoom (with or without the sky); a right-drag still tilts it by hand.

**Features menu** (map controls, top right; `components/ui/FeaturesMenu.tsx`, `lib/flagChoices.ts` `MENU_FLAGS`): the 15 kept features
plus `humans` as checkboxes, remembered in this browser (localStorage `footsteps.flags.v1`). Remembered choices are written into
the URL by a script in the page head before anything reads it, so each feature keeps reading its own parameter; a parameter already in the
URL wins. Most features read their flag once at load, so a change waits for "Reload to apply" (the view and year are kept); other humans
changes at once. A new opt-in flag goes in `MENU_FLAGS` too (`lib/flagChoices.test.ts` checks it matches the registry).

Flags combine: `?ground=1&shelters=1&mode=grid` is valid. `lon` also reads `lng`, `zoom` also reads `z`. The Dots-only data (PMTiles) ignores most
opt-in looks and says so on screen.

## Opt-in (off until set)

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?explain=1` | off | "How is this estimated?" link under the counter: a panel naming the sources, methods and a confidence word for the place and year | [estimate-panel.md](estimate-panel.md) | no |
| `?coast=1` | off | Draws the modern coastline (Natural Earth 110m) over the terrain image | [terrain-images.md](terrain-images.md) | n/a (debug overlay) |

## Off switches (on until `=0`)

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?trees=0` | on | Shaded biome tree impostors, household clearings and distance LOD; trees imagined | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?ground=0` | on | Biome surface detail (grass, canopy, sand ripples, cracked ice, reeds, rock) in the close-up ground shader; the note says "surface imagined" | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?weather=0` | on | Imagined weather in the close-up ground shader: cloud shadows drifting by the place's rainfall, gusts through grass and reeds; works with or without `ground=1`; the note says "weather imagined" | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?shelters=0` | on | One dwelling per household in the close-up, typed from the analog society's house codes | [settlements.md](settlements.md) | yes (2026-11-28, kept on) |
| `?fields=0` | on | Imagined fields, gardens, terraces, corrals, grazed grass and worn paths round each group in the close-up (zoom ~11.5+, 3D only); farmed share from HYDE cropland, crops from the food table, tracks towards fresh water | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?smoke=0` | on | A smoke plume from each household's hearth, drifting with the wind, and warm light pools on the ground at night (all imagined) | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?routine=0` | on | Each person at street zoom follows a daily routine for the local sun time (asleep, hearth, play, trip) | [routine.md](routine.md) | yes (2026-11-28, kept on) |
| `?ice=0` | on | Dated ice-sheet margins (PaleoMIST 1.0, nearest 2.5 ka epoch, 0-80 ka): white overlay, close-up ice surface, groups kept off the ice, hover row | [ice-sheets.md](ice-sheets.md) | yes (2026-11-28, kept on) |
| `?avatar=0` | on | The person card shows a rigged, animated 3D figure (CC0 Quaternius body; clothes, hair and ornaments by era, place and way of life from a cited table; a tool and work loop by role; drag to turn) instead of the drawing | [avatar.md](avatar.md) | yes (2026-11-28, kept on) |
| `?pastwater=0` | on | Dated past-water scenarios (Lake Mega-Chad, European LGM lakes and rivers, Mesopotamian coast) in the Earth image, the site ranker and the close-up lake plane | [past-water.md](past-water.md) | yes (2026-11-28, kept on) |
| `?terrain_tiles=0` | on | The 500 m photo pyramid recoloured per year on the GPU, zoom 3-8 and the close-up ground colours | [terrain-images.md](terrain-images.md), [terrain-bench.md](terrain-bench.md) | yes (2026-11-28, kept on) |
| `?food=0` | on | Hover card row: crops and animals around, and forager staples (modelled) | [food.md](food.md) | yes (2026-11-28, kept on) |
| `?spread=0` | on | HYDE people moved by climate-then-vs-now within continent regions, 10,000-4,000 BCE ("Adjusted spread (modelled on HYDE)") | [hyde-climate-spread.md](hyde-climate-spread.md) | yes (2026-11-28, kept on) |
| `?langs=0` | on | "Languages spreading here" hover line from cited expansion boxes (never before 3050 BCE) | [languages.md](languages.md) | yes (2026-11-28, kept on) |
| `?sky=0` | on | Close-up light from the local sun clock, distance haze into a sky at the horizon, animated water with glint, shallows and shore foam | [close-up-scene.md](close-up-scene.md) | yes (2026-11-28, kept on) |
| `?settlements=0` | on | The settlement model (group sizes and layouts from ethnographic analogs); `=0` gives even groups at random spots | [settlements.md](settlements.md) | n/a (default) |
| `?sites=0` | on | Spot ranking inside each cell (flat, near fresh water, off the sea); `=0` keeps the old random positions | [site-terrain.md](site-terrain.md) | n/a (default) |
| `?humans=0` | on | Other kinds of human (Neanderthals, Denisovans, floresiensis, luzonensis) | [other-humans.md](other-humans.md) | n/a (default) |
| `?close3d=0` | on | The 3D landscape from zoom 8, seen from straight above; `=0` keeps the map flat | [close-up-scene.md](close-up-scene.md) | n/a (default) |
| `?hover=0` | on | The hover card (habitat, climate, people, way of life under the cursor) | [habitat-lookup.md](habitat-lookup.md) | n/a (default) |
| `?tags=0` | on | Name tags on people at street zoom | [footsteps-web/AGENTS.md](../../footsteps-web/AGENTS.md) (no ops doc) | n/a (default) |

## Choices

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?mode` | units (people view chosen by zoom) | `units`, `grid` or `dots` forces one people look and shows the mode button | [grid-images.md](grid-images.md) | n/a (debug) |
| `?bar` | new time bar | `old` shows the previous two-strip time navigator for comparison | [footsteps-web/AGENTS.md](../../footsteps-web/AGENTS.md) (no ops doc) | n/a (debug) |

## Debug

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?still=1` | off | Stops time-based animation so the same scene gives the same pixels (visual regression) | [visual-regression.md](visual-regression.md) | n/a (debug) |
| `?utc` | now | Start the sun clock at this UTC hour (e.g. 6.5) | [routine.md](routine.md) | n/a (debug) |
| `?warp` | 1 | Run the sun clock this many times faster than real time | [routine.md](routine.md) | n/a (debug) |

## Where the camera starts

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?year` | the app's start year | Start year (negative = BCE) | [visual-regression.md](visual-regression.md) | n/a (view) |
| `?lat` | globe | Start latitude | [visual-regression.md](visual-regression.md) | n/a (view) |
| `?lon` (also `?lng`) | globe | Start longitude | [visual-regression.md](visual-regression.md) | n/a (view) |
| `?zoom` (also `?z`) | globe | Start zoom | [visual-regression.md](visual-regression.md) | n/a (view) |

## The flag sweep

`node scripts/verify-flags.mjs` (in `footsteps-web/`, after `pnpm build`) loads six scenes and, in each, every variant, in real headless Chromium
on the real GPU with real data (the GPU flags, static server, data lookup and elevation-tile cache of `pnpm visual`, `docs/ops/visual-regression.md`):

- **Scenes** (`SCENES`): globe 1900; Rome 1000 BCE zoom 9; Nile 3000 BCE close-up 3D (zoom 9.5); UK 50,000 BCE zoom 7; Sahara 6000 BCE zoom 8; Croatia 50,000 BCE zoom 10.
- **Variants** (`variants()`): no flags; each opt-in flag alone; each off switch alone; `mode=units|grid|dots`; every opt-in flag together (alone, and with `mode=grid` and `mode=dots`); every off switch together. 29 variants x 6 scenes = 174 loads, about 25 minutes with `--jobs 3`.
- **Per load** it settles (nothing in flight for a second, `main[data-loading]` off, two frames), moves the mouse over the map (the hover card is its own code path), settles again, and **fails** on a console error, a page error, a failed request that is not known-optional data, a page with no canvas, a blank middle of the picture (one flat fill: under 3 colours at 16 levels per channel or a brightness range under 10; smooth terrain such as the Sahara at zoom 8 passes), or a page that never settles.
- **Known-optional requests** (`KNOWN_OPTIONAL` in `flags-lib.mjs`, each with its reason) are listed in `flags-out/report.md` but do not fail: the day API (runs on budgie, not in the static server), the `?terrain_tiles=1` photo pyramid, the `?pastwater=1` Earth frames and the `?spread=1` adjusted grids (data not built on every machine; the app falls back to the ordinary image), the favicon and outside elevation tiles. So on a machine without that data the flag was exercised on its fallback path. `--strict` makes them failures: use it with `--base <prod url>`, or on a machine that has the data.
- `--list` prints scenes and variants; `--scenes a,b --variants x,y` runs a slice; `--shots` keeps a picture of every load (a failure always keeps one); `--still` adds `?still=1`; `--out DIR` (default `flags-out/`, not in git).

Run it before changing how a flag is read, when adding a flag or an overlay, and after anything that touches layer setup. It is not in CI (no GPU, no data).

### Last sweep (2026-11-22)

**174 of 174 loads pass**: no console error, page error, failed request outside the known-optional list, blank map or unsettled page in any scene, for any flag alone or all together. So far the sweep has found **no app bug**. What it found:

- `?ice` (named in the task that asked for the sweep) is not a flag: nothing reads it. It is not in the registry.
- The first sweep flagged 26 loads as blank (Sahara 6000 BCE, Croatia 50,000 BCE). The pictures were smooth terrain, not blank: the detector was too strict (it wanted 12 colours), so its thresholds were lowered to "one flat fill" and the Sahara/Croatia cases pinned as passing. The code was not at fault.
- **Coverage gap, not a bug:** on this machine the data for `?terrain_tiles=1` (photo pyramid), `?pastwater=1` (Earth frames) and `?spread=1` (adjusted grids) is not built, and the day API is not in the static server. Those flags ran on their fallback path (all four 404s are listed in `flags-out/report.md` as notes). Run `--strict` against a machine or `--base` that has the data to see them with it.
