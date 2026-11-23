---
id: ops-flags
type: ops
purpose: "Inventory of every URL flag the app reads (default, what it does, its ops doc, reviewed or not) and the flag sweep that loads them on and off across six scenes"
updated: 2026-11-22
---

# URL flags

Every query parameter the app reads, found by grepping the source for `URLSearchParams` reads (`params.get(`, `searchParams`); the registry
is `footsteps-web/scripts/flags-lib.mjs` `FLAGS`, and `lib/flags.test.ts` fails if the code reads a parameter that is not in the registry or
not in this page (or the reverse). **Adding a flag: add it to `FLAGS`, add a row here, then run the sweep.** No flag changes a default
by being listed; "Reviewed" is whether Will has looked at the look on prod (no ops doc records a review of any opt-in yet, so they all stay off).

Flags combine: `?ground=1&shelters=1&mode=grid` is valid. `lon` also reads `lng`, `zoom` also reads `z`. The Dots-only data (PMTiles) ignores most
opt-in looks and says so on screen.

## Opt-in (off until set)

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?ground=1` | off | Biome surface detail (grass, canopy, sand ripples, cracked ice, reeds, rock) in the close-up ground shader; the note says "surface imagined" | [close-up-scene.md](close-up-scene.md) | no |
| `?plants=1` | off | Low-poly plant marks by Krapp biome in the close-up 3D | [close-up-scene.md](close-up-scene.md) | no (off because they read as toys) |
| `?shelters=1` | off | One dwelling per household in the close-up, typed from the analog society's house codes | [settlements.md](settlements.md) | no |
| `?routine=1` | off | Each person at street zoom follows a daily routine for the local sun time (asleep, hearth, play, trip) | [routine.md](routine.md) | no |
| `?figures=1` | off | The newest footprint slot of each person becomes an upright imagined figure; also feeds the food row | [close-up-scene.md](close-up-scene.md) | no |
| `?ice=1` | off | Dated ice-sheet margins (PaleoMIST 1.0, nearest 2.5 ka epoch, 0-80 ka): white overlay, close-up ice surface, groups kept off the ice, hover row | [ice-sheets.md](ice-sheets.md) | no |
| `?pastwater=1` | off | Dated past-water scenarios (Lake Mega-Chad, European LGM lakes and rivers, Mesopotamian coast) in the Earth image, the site ranker and the close-up lake plane | [past-water.md](past-water.md) | no |
| `?terrain_tiles=1` | off | The 500 m photo pyramid recoloured per year on the GPU, zoom 3-8 and the close-up ground colours | [terrain-images.md](terrain-images.md), [terrain-bench.md](terrain-bench.md) | no |
| `?evidence=1` | off | Radiocarbon sites and ancient-DNA individuals as cool marks that fade with time | [footstep-generator/evidence/README.md](../../footstep-generator/evidence/README.md) | no |
| `?food=1` | off | Hover card row: crops and animals around, and forager staples (modelled) | [food.md](food.md) | no |
| `?coast=1` | off | Draws the modern coastline (Natural Earth 110m) over the terrain image | [terrain-images.md](terrain-images.md) | n/a (debug overlay) |
| `?spread=1` | off | HYDE people moved by climate-then-vs-now within continent regions, 10,000-4,000 BCE ("Adjusted spread (modelled on HYDE)") | [hyde-climate-spread.md](hyde-climate-spread.md) | no |
| `?langs=deep` | off | "Languages spreading here" hover line from cited expansion boxes (never before 3050 BCE) | [languages.md](languages.md) | no |
| `?tour=1` | off | Guided tour: nine sourced stops that fly the camera and set the year | [tour.md](tour.md) | no |
| `?chart=1` | off | World-population chart under the counter (modelled band, HYDE line, slider year; click or drag sets the year) | [footsteps-web/AGENTS.md](../../footsteps-web/AGENTS.md) (no ops doc) | no |
| `?seasons=1` | off | Off / Jun / Dec season controls in the settlement note; also keeps the settlement model on | [settlements.md](settlements.md), [site-terrain.md](site-terrain.md) | no |

## Off switches (on until `=0`)

| Flag | Default | What it does | Ops doc | Reviewed |
|---|---|---|---|---|
| `?settlements=0` | on | The settlement model (group sizes and layouts from ethnographic analogs); `=0` gives even groups at random spots (`seasons=1` keeps it on) | [settlements.md](settlements.md) | n/a (default) |
| `?sites=0` | on | Spot ranking inside each cell (flat, near fresh water, off the sea); `=0` keeps the old random positions | [site-terrain.md](site-terrain.md) | n/a (default) |
| `?humans=0` | on | Other kinds of human (Neanderthals, Denisovans, floresiensis, luzonensis) | [other-humans.md](other-humans.md) | n/a (default) |
| `?close3d=0` | on | The tilt into a 3D landscape from zoom 8; `=0` keeps the map flat | [close-up-scene.md](close-up-scene.md) | n/a (default) |
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
