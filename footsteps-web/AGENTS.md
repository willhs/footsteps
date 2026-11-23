# Footsteps web frontend

Next.js 15 App Router + React + TypeScript + deck.gl + Tailwind. The app is a
static export (`next.config.js`, `output: 'export'`), served by Caddy on budgie.
Read the root README and `.gent/rules.md` for data acquisition and deployment.

## Rendering and data

- `components/footsteps/FootstepsViz.tsx`: globe composition and mode selection.
- The default people view loads `/grid/humans_{year}.webp` through
  `components/footsteps/hooks/useGridLayer.ts` (decoded in a worker, cached per year)
  and picks its look from zoom (`hooks/peopleView.ts`): below ~4.8 one r8 texture per
  year (`layers/GlowLayer.ts`, colour ramp in the shader); from 4.8 to 5.8 it
  cross-fades to Units; from 7 unit marks are clickable. Units are built only for a
  region around the viewport (`hooks/unitRegion.ts`), so a pan inside it costs nothing.
  Zoom changes uniforms/opacity, never the uploaded marks. `layers/units.ts` builds
  bands, villages, herding camps and city glow; in-cell positions are invented and deterministic. One shader draws a unit
  as a fire far out, its kind's sign (fire, tent, house, town) from about zoom 7, and its households at their real spread once
  the footprint outgrows the sign (`layers/unitMorphVertex.ts`, `MorphScatterplotLayer.ts`); never a flat disc.
  The kind and colour come from each cell's way of life (`lib/waysOfLife.ts`): `gridData.ts` loads
  `/grid/landuse_{year}.png` (HYDE years only) beside the population image and classes each cell
  (`GridData.ways`); `FireLayer.ts` colours the far-out fires the same way, and the legend reads `LOOKS`.
  `unitMorphVertex.ts` reads a mark's kind from its colour, so `waysOfLife.test.ts` pins the palette.
  Copy `../data/tiles/grid/landuse_*.png` into `public/grid/` for local dev.
- The settlement model is the default Units view (`settlementsFromParams` in `lib/settlements.ts`, read by the page and the grid worker;
  `?settlements=0` gives the old even groups at random spots). It also ranks spots inside each cell (`layers/siteRanking.ts`, one ranker per worker, cached by cell id; reads `/sites/site_terrain.webp` and
  `/water/water_distance.webp` through `readChannels` in `hooks/gridData.ts`): group *k* sits at spot *k*, off the sea and lakes at the year's sea level. `?sites=0` turns it off to compare.
  `components/footsteps/layers/settlementSites.real.test.ts` is the gated real-data count (docs/ops/site-terrain.md "Measure").
  Also in the model: `layers/households.ts` packs a group's people into households of about 4-5 at street zoom (`peopleForMorph(..., 'households')`), and `lib/regionalGroup.ts` + `layers/regionTint.ts`
  give the hovered or selected place a soft regional-group tint and a hover-card line (docs/ops/settlements.md "Households and a regional group").
  Farming groups also follow their analogs' EA030 pattern (`layers/settlementLayout.ts`: scattered, hamlet cluster, villages apart), and `lib/rankSize.ts` + `hooks/useLargestSettlement.ts` add the hover card's
  "largest settlement around here" line (assumed rank-size exponent, labelled imagined; docs/ops/settlements.md "Farm layouts and the largest settlement").
- Unit marks represent at least 15 people. A cell under 15 holds one whole group
  (band/camp/village size) with probability people ÷ group size, seeded per cell, so
  thin forager land is not empty close in and expected head count stays right. Individual people use the
  nearer year-morph endpoint, skip absent groups, and include an adult per group.
  Portraits wait for the atlas (up to 2.5 seconds), then keep that illustration;
  late atlas responses cannot replace it. Day requests are scoped to the person.
  The portrait's palette (skin, hair, clothing, hair style) lives in `lib/avatar.ts` `portraitLooks`, shared with the 3D figure:
  its random draw order is the SVG's, so do not reorder draws (the `rome-1000bce-person` visual scene catches it).
- `?avatar=3d` (off until reviewed; docs/ops/avatar.md): the card shows a rigged CC0 3D person (`overlays/Avatar3D.tsx`, `avatarScene.ts`,
  three.js, loaded through `overlays/avatarLazy.ts`, never in the first load) built from `avatarSpec` (body by sex and age, stoop, hair mesh,
  colours). Assets in `public/avatar/` come from `../footstep-generator/avatar/build.mjs` (pinned sha256, vertex colours, no textures).
  `node scripts/avatar-shots.mjs <dir>` shoots three people flag off/on and measures bytes, first frame and fps.
- `?mode=units|grid|dots` is a debug override and shows the mode button.
- Close-up 3D (default; `?close3d=0` keeps the map flat): from zoom 8 in the flat map the camera tilts (55° by zoom 10) and `layers/Close3DLayer.ts`
  (elevation tiles one zoom coarser at `MESH_STEP` 2, over both S3 hostnames `DEM_TILE_URLS`, far tiles merged by `lib/demLod.ts`, meshed a frame's budget at a time; `docs/ops/close-up-scene.md` "How the ground streams in")
  draws a 3D landscape per Terrarium elevation tile: relief ×1.6, water flat at `seaLevelAt`, colour from the era
  image with a baked hillshade, sand, rock and snow, and low-poly plants by Krapp biome (`lib/close3d.ts`). Plant
  placement and size are invented and the screen says so. `?ground=1` adds biome surface detail in the ground's fragment shader
  (`layers/groundDetail.ts`, a deck.gl extension reading two numbers per vertex from `lib/close3d.ts` `coverFor`; `docs/ops/close-up-scene.md`). `?weather=1` adds cloud shadows (cover from the place's Beyer rainfall) and gusts in grass and reeds through the same extension (`lib/weather.ts`, uniforms only; `?still=1` freezes it; `scripts/weather-shots.mjs`). All deck.gl packages must resolve to the same build
  (ES modules since task 0014, so they tree-shake; `next.config.js`): a CJS/ESM mix gives two luma.gl shader assemblers and the shaders lose deck.gl's hooks.
  `Close3DLayer` loads on first use (`useLazy`, prefetched after first people): never import it statically. A hidden browser
  pane gets no animation frames, so deck.gl only redraws on input there: force frames when testing headless.
- Guided tour, `?tour=1` only (`docs/ops/tour.md`): nine stops in `lib/tour.ts` (`TOUR_STOPS`; every number in the wording is computed from `PEOPLE_TOTALS`, `OTHER_HUMANS`, `seaLevelAt`
  or pinned to `arrivals.yaml` by `lib/tour.test.ts`: never type a number in), driven by `hooks/useTour.ts` through `useGlobeViewState`'s setter and the page's `setTime` (FootstepsViz's `onTimeChange` prop),
  card `overlays/TourPanel.tsx` at the top of the left column. A press, wheel or key stops a flight. `node scripts/tour-shots.mjs <dir>` steps through every stop on the build and fails on console errors.
- `pnpm visual` is the screenshot regression: ten fixed scenes (Units, Grid, Dots, close-up 3D, hover card, a selected person) on real data and GPU, compared with `e2e/visual/*.webp`. **Run it after `pnpm build` and before committing any change that can move pixels**; a diff sheet (`visual-out/<scene>.diff.png`) shows what moved, and `pnpm visual --update --scenes <ids>` re-baselines on purpose. `?still=1` stops the time-based animation for it (`lib/still.ts`). Not in CI (no GPU, no data). `docs/ops/visual-regression.md`.
- URL flags: [docs/ops/flags.md](../docs/ops/flags.md) lists every query parameter the app reads (default, what it does, its ops doc, reviewed or not), pinned by `lib/flags.test.ts` against the source (add a flag to `scripts/flags-lib.mjs` `FLAGS` and that page, or the test fails).
  `node scripts/verify-flags.mjs` loads six scenes with no flags, each flag alone, and every opt-in flag together (174 loads, ~25 min) and fails on console or page errors, failed requests that are not known-optional data, or a blank map. Run it after `pnpm build` when you add a flag or touch layer setup.
- Terrain colour close in: `layers/TerrainDetailLayer.ts` draws the 500 m photo pyramid (`/terrain/detail/{z}/{x}/{y}.webp`, z3–8,
  a manifest says which tiles exist) recoloured by the two era images on the GPU (`recolour` in `lib/terrainDetail.ts`, GLSL twin
  `RECOLOUR_GLSL`: change one, change the other); `Close3DLayer` loads the covering tile per ground tile for its vertex colours.
  Off until reviewed: `?terrain_tiles=1` turns it on. `node scripts/terrain-detail-shots.mjs out <dir>` takes before/after shots.
- `?chart=1` adds a small world-population chart under the counter (`components/ui/PopulationChart.tsx`, series and scales in `lib/populationSeries.ts`): log people over the time bar's own time scale, the MODELLED low-high band before 10,000 BCE, HYDE's measured line after (one join point at `HYDE_MIN`, built from `PEOPLE_TOTALS`, the counter's table), the slider year marked; click or drag sets the year. Renders nothing without the flag. `node scripts/verify-chart.mjs <dir>` shoots and drives it.
- `node scripts/terrain-bench.mjs` is the terrain scoreboard (`--query terrain_tiles=0` compares a flag on one build; time to detail, fps, long tasks, bytes, texel px over fixed camera paths, `--compare old.json new.json`); run it on a quiet machine before and after any terrain change. `docs/ops/terrain-bench.md` has the baseline.
- `node scripts/first-load.mjs` is the cold first-visit scoreboard (`docs/ops/first-load.md`): JS bytes, first globe and first people (User Timing marks from `lib/firstLoadMarks.ts`), long tasks, desktop and fast 4G; `--base URL` for prod, `--flags` checks each opt-in loads its code and the default visit does not.
  Close-up and opt-in code loads through `lib/lazyModule.ts` (`lazy`/`useLazy`) or `next/dynamic` behind its flag; keep new opt-in features out of the first load the same way. The head preloads the opening year's images (`lib/firstLoadPreload.ts`), and the grid worker answers a year's grid before its units (`loadGridData`), so the firelight never waits on the settlement model.
>- `node scripts/measure-view.mjs <base-url> <out-dir>` screenshots 10,000 BCE/1000/1900
  and measures pan/scrub fps on the real GPU. Like the other
  verify/bench scripts it runs headless (60 rAF/s on the Metal GPU, so it never steals focus); `HEADED=1` shows the browser.
- The 90 modelled pre-HYDE images (100,000–11,000 BCE, 0.5°) come from `../footstep-generator/prehistory_population.py`
  and load through the same path (`/grid/humans_{year}.webp`); `gridData.ts` decodes each as 6 × 6 cells of HYDE's grid so ids, glow
  and the year morph line up. `lib/time.ts` splits people into `evidenceAt(time)`: `'measured'` (HYDE, from 10,000 BCE) or `'modelled'`;
  modelled screens say so (counter range, legend, grounding panel, timeline). 'Imagine their day' and the portrait work for them
  too (the atlas reaches back to 100,000 BCE); the day card then says "Speculative · modelled people" and why (`PersonDay`'s `modelled` prop).
  Copy `../data/tiles/prehistory/humans_*.webp` into `public/grid/` for local dev.
- The WebPs are produced by `../footstep-generator/grid_image.py` from local HYDE 3.5
  grids. Keep the log encoding, `LEVELS` and `MAX_PEOPLE` aligned with `gridData.ts`.
- Dots uses PMTiles and HTTP Range requests to `/pmtiles/humans_{year}.pmtiles`
  in the budgie build. `lib/constants.ts` defines the 30 slider years
  (10,000 BCE–1900 CE, HYDE; `PEOPLE_YEARS` adds the 90 modelled ones) and nine built Dots years; Dots snaps to the nearest one.
- The hover card is on by default (`?hover=0` hides it) (`overlays/HoverCard.tsx`): habitat, climate, people and way of life under the cursor.
  When no one is in view (zoom ≥ 4, flat map, data loaded) the column says so (`lib/emptyView.ts`: people per cell in the view box, other-human bands), checked 400 ms after the view settles.
  Nothing follows the cursor: the left column shows one thing at a time (a hovered other-human site/band or evidence mark, else the place card;
  a clicked Dots dot's population, `PopulationTooltip`). The card is docked in `FootstepsViz.tsx`'s left column, in place of the legend, and shrinks to fit (picture capped at 22vh); the column's top follows the stats panel's height (`--ov-stats-h`).
  `lib/hoverCard.ts` decides the words, `lib/habitat.ts` reads the lookups (`public/habitat_meta.json` holds the encoding),
  `hooks/useHoverPoint.ts` is the desktop-only, per-frame pointer tracking, and `hooks/useHabitatLookups.ts` fetches the
  `/habitat/*.webp` images lazily. The "animals here" row (`lib/fauna.ts`, `hooks/useFauna.ts`) reads
  `/fauna/species.json` and one 30° block `/fauna/r_{row}_{col}.json` on first hover over it (`../footstep-generator/fauna/export_web.py`;
  copy `../data/tiles/fauna/` into `public/fauna/`). Up to 4 large animals, labelled modelled; none over sea or ice. Copy `../data/tiles/habitat/` into `public/habitat/` for local dev (docs/ops/habitat-lookup.md).
  The opt-in `?food=1` row (`lib/food.ts`, `hooks/useFood.ts`) lazily loads `/food/food.json`; export with `food/export_web.py` (docs/ops/food.md).
  The card's top picture is an imagined, pre-painted scene (`lib/groundScene.ts` picks it from biome, date and way of life;
  `public/ground/` holds the WebPs and `index.json`; only listed scenes show). See docs/ops/ground-view.md.
- Featured person: at street zoom (people at least half faded in, flat map or close-up), the left column shows someone in frame without a click (`overlays/FeaturedPerson.tsx`, picked by `lib/featuredPerson.ts`: kept while well inside the frame, else the one nearest the middle, so zooming in narrows the choice; keyed by place, never by `Person.id`, which counts people in view). It replaces the place hover card there; clicking it opens the full person panel. Portraits are seeded by the person's spot (`Person.gait`), not `id`, so a person keeps their look as the view moves. A 3D animated person is being built behind `?avatar=3d` (tasks b79d9ae9, 26286cca; docs/ops/avatar.md).
- Name tags (Marauder's Map): from zoom ~16.6 (full at 17.4), flat map only, each of up to 150 people nearest the view centre
  gets a tag "role, age" ("potter, 34") beside their newest footprint. Imagined, like the people (the person card says so).
  The tag follows the walker because `lib/gait.ts` is a TS port of the footprint shader's `gait` GLSL in `layers/people.ts`:
  **change one, change the other** (`lib/gait.test.ts` pins values). The one thing they do not share is the hash `h`: GPU `sin` of a
  big number differs between cards, so `gaitSeed` computes it in TS (`Person.gait`) and the shader reads it as an attribute.
  `layers/personTags.ts` picks the tags (pure; skips overlaps in screen space, prefers people tagged last time, drops tags that a
  tilted view draws smaller than `MIN_TAG_SCALE`); `hooks/usePersonTags.ts` re-runs it every 200 ms and rewrites positions only
  (the TextLayer keeps its text while the same people are tagged). Only people present at both data years get tags. `?tags=0`
  turns them off (compare frame rates; measured ~140 fps both ways at zoom 17.5, flat and 3D, in a 1500 CE village on an M-series Mac).
- Daily routine (`?routine=1`, off by default until reviewed on prod; `lib/routine.ts`, docs/ops/routine.md): each person at street zoom is asleep, at the hearth,
  playing (children 5-12) or away on a trip (gathering, hunting, fishing, fields, herding, water and wood, visiting another camp) by the *local sun time*
  (`lib/sunTime.ts`; today's date and clock, the slider's year has none). A `DayPlan` per person per sun-clock hour (`planOf`, seeded by the spot hash `Person.gait`, not the id)
  reaches the footprint shader as two vec4 attributes (`routineProps` in `layers/people.ts`) and the shader runs `stateAt` itself per print (asleep = still, paired feet; out/back = straight road at 1.2 m/s; there = small loop
  at the destination). **`stateAt`/`routineGaitAt` (TS) and the `gait` GLSL are one piece of maths: change both** (`lib/gait.test.ts`, `lib/routine.test.ts` pin values).
  Name tags follow people along their trips (`chooseTags` `routine`), the person card adds "Now: gathering, about 2 km from camp. Imagined: …" (`describePerson(p, ms)`).
  Pattern modelled from time-use studies (hours in `lib/routine.ts` must equal `time_use.yaml`; a test reads `time_use.json`), this person's day imagined; sources and what is assumed are in docs/ops/routine.md.
  `?utc=6.5` starts the sun clock at 06:30 UTC and `?warp=60` speeds it up (`lib/solarClock.ts`; also moves the stats panel's sun time and the Day/night shading), for checking day and night.
  Our own and other kinds of human both use it; totals, ids and positions per group are untouched. A unit whose cell holds fewer than 15 people is still one whole group: at street zoom it is drawn as a typical group of its kind (band 30, camp 60, village 300; `nominalPeople` in `layers/people.ts`), members and dwellings alike, so it does not vanish when its fire hands over (fixed 2026-11-24).
- `components/ui/TimeBar.tsx`: time navigation, one fixed log-of-years-ago track. Its scale, key steps,
  typed-year parsing and speed-based fine drag live in `lib/timeScale.ts` (tested); the readout above it is
  `TimeReadout.tsx`. `?bar=old` still shows the previous two-strip `TimeNavigator.tsx` for comparison:
  delete it once the new bar is accepted. Derive year assumptions from constants rather than hardcoding counts in tests.

## Commands

Run inside `footsteps-web/`:

```bash
pnpm install
pnpm dev                 # port 4444
pnpm lint
pnpm exec tsc --noEmit
pnpm test -- --runInBand
pnpm build               # writes out/
pnpm e2e                 # Playwright; see playwright.config.ts
```

For local data, copy `../data/tiles/grid/humans_*.webp` into `public/grid/`, and
existing `../data/tiles/humans/humans_*.pmtiles` into `public/pmtiles/` for Dots.
Missing files prevent population rendering. Serve `out/` with a static server for
production checks; `pnpm start` is not the static-export serving workflow.

## Change guidance

Keep view/layer/hook logic in its existing feature modules. Memoize expensive
population transforms and layer construction. Do not add runtime server routes
for data already served as static assets. The images encode numeric values: preserve
their pixels (lossless only). Verify mode switching, slider scrubbing, population totals,
and zoom behaviour in the browser when changing rendering or data loading.

Pushing to `main` deploys the app: green CI builds `deploy/budgie/web/Dockerfile` (same-origin data URLs)
and Watchtower on budgie pulls it (README "Deployment"). `scripts/deploy-budgie.sh` publishes the data and PMTiles,
which are not in git. `SKIP_TILES=1` skips PMTiles only.
`scripts/smoke.sh [base-url]` checks HTML and data signatures, not rendered pixels.

## Opt-in close-up figures and animals

- `?figures=1` changes only the newest footprint slot to an upright imagined person; `footprintData` still repeats each `Person` three times and ids/picking stay unchanged. `PeopleLayer` shares its gait and routine shader between figures and footprints. Other-human people receive the same flag. Keep the TS/GLSL gait contract intact.
- `layers/AnimalsLayer.ts` animates one instanced silhouette per `lib/animals.ts` `AnimalInstance`, via uniforms only. `hooks/useAnimalsLayer.ts` loads own-cell PHYLACINE presence and the full food-model domestic roster (independent of `?food=1`). Do not substitute the truncated food hover row or invent species when data is absent. Counts, spots and looks are imagined; wild ranges and domestic availability are modelled, with different picking labels.
- Figures and wildlife stay opt-in pending Will's production review; footprints remain default. See `docs/ops/close-up-scene.md` and `scripts/measure-figures.mjs` for the real-data scene checks.

## Opt-in hearth smoke and firelight

- `?smoke=1` (`lib/hearths.ts`, `layers/SmokeLayer.ts`, `hooks/useSmokeLayer.ts`): one hearth per household in view (same places as `?shelters=1` dwellings, from `useGridLayer`'s `hearths`), a GPU-animated smoke plume and, by the local sun clock, a flickering pool of light. Drawn at z = 0 like the people, top-level (not inside a Close3D tile); `lib/groundHeights.ts` only drops hearths over water. `scripts/smoke-shots.mjs` takes the proof shots. See `docs/ops/close-up-scene.md`.
