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
  bands, villages, herding camps and city glow; in-cell positions are invented and deterministic.
  The kind and colour come from each cell's way of life (`lib/waysOfLife.ts`): `gridData.ts` loads
  `/grid/landuse_{year}.png` (HYDE years only) beside the population image and classes each cell
  (`GridData.ways`); `FireLayer.ts` colours the far-out fires the same way, and the legend reads `LOOKS`.
  `unitMorphVertex.ts` reads a mark's kind from its colour, so `waysOfLife.test.ts` pins the palette.
  Copy `../data/tiles/grid/landuse_*.png` into `public/grid/` for local dev.
- Unit marks represent at least 15 people. A cell under 15 holds one whole group
  (band/camp/village size) with probability people ÷ group size, seeded per cell, so
  thin forager land is not empty close in and expected head count stays right. Individual people use the
  nearer year-morph endpoint, skip absent groups, and include an adult per group.
  Portraits wait for the atlas (up to 2.5 seconds), then keep that illustration;
  late atlas responses cannot replace it. Day requests are scoped to the person.
- `?mode=units|grid|dots` is a debug override and shows the mode button.
- Close-up 3D (default; `?close3d=0` keeps the map flat): from zoom 8 in the flat map the camera tilts (55° by zoom 10) and `layers/Close3DLayer.ts`
  draws a 3D landscape per Terrarium elevation tile: relief ×1.6, water flat at `seaLevelAt`, colour from the era
  image with a baked hillshade, sand, rock and snow, and low-poly plants by Krapp biome (`lib/close3d.ts`). Plant
  placement and size are invented and the screen says so. `@deck.gl/mesh-layers` must stay aliased to its CommonJS
  build in `next.config.js` (like the other deck.gl packages) or its shaders lose deck.gl's hooks. A hidden browser
  pane gets no animation frames, so deck.gl only redraws on input there: force frames when testing headless.
- `node scripts/measure-view.mjs <base-url> <out-dir>` screenshots 10,000 BCE/1000/1900
  and measures pan/scrub fps on the real GPU. It runs headed: headless Chromium
  throttles requestAnimationFrame, so its fps numbers are meaningless.
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
  `lib/hoverCard.ts` decides the words, `lib/habitat.ts` reads the lookups (`public/habitat_meta.json` holds the encoding),
  `hooks/useHoverPoint.ts` is the desktop-only, per-frame pointer tracking, and `hooks/useHabitatLookups.ts` fetches the
  `/habitat/*.webp` images lazily. The "animals here" row (`lib/fauna.ts`, `hooks/useFauna.ts`) reads
  `/fauna/species.json` and one 30° block `/fauna/r_{row}_{col}.json` on first hover over it (`../footstep-generator/fauna/export_web.py`;
  copy `../data/tiles/fauna/` into `public/fauna/`). Up to 4 large animals, labelled modelled; none over sea or ice. Copy `../data/tiles/habitat/` into `public/habitat/` for local dev (docs/ops/habitat-lookup.md).
  The card's top picture is an imagined, pre-painted scene (`lib/groundScene.ts` picks it from biome, date and way of life;
  `public/ground/` holds the WebPs and `index.json`; only listed scenes show). See docs/ops/ground-view.md.
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
