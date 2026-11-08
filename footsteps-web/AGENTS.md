# Footsteps web frontend

Next.js 15 App Router + React + TypeScript + deck.gl + Tailwind. The app is a
static export (`next.config.js`, `output: 'export'`), served by Caddy on budgie.
Read the root README and `.gent/rules.md` for data acquisition and deployment.

## Rendering and data

- `components/footsteps/FootstepsViz.tsx`: globe composition and mode selection.
- Units (default) and Grid load `/grid/humans_{year}.png` through
  `components/footsteps/hooks/useGridLayer.ts`. Fetch/decode promises are cached
  per year. `components/footsteps/layers/units.ts` builds bands, villages, and glow;
  in-cell positions are invented and deterministic, not settlement observations.
- PNGs are produced by `../footstep-generator/grid_image.py` from local HYDE 3.5
  grids. Keep the log encoding and `MAX_PEOPLE` constant aligned with the decoder.
- Dots uses PMTiles and HTTP Range requests to `/pmtiles/humans_{year}.pmtiles`
  in the budgie build. `lib/constants.ts` defines the 30 slider years
  (10,000 BCE–1900 CE) and nine built Dots years; Dots snaps to the nearest one.
- `components/ui/TimeSlider.tsx`: time navigation. Derive year assumptions from
  constants rather than hardcoding counts in tests.

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

For local data, copy `../data/tiles/grid/humans_*.png` into `public/grid/`, and
existing `../data/tiles/humans/humans_*.pmtiles` into `public/pmtiles/` for Dots.
Missing files prevent population rendering. Serve `out/` with a static server for
production checks; `pnpm start` is not the static-export serving workflow.

## Change guidance

Keep view/layer/hook logic in its existing feature modules. Memoize expensive
population transforms and layer construction. Do not add runtime server routes
for data already served as static assets. PNGs encode numeric values: preserve
their pixel bytes. Verify mode switching, slider scrubbing, population totals,
and zoom behaviour in the browser when changing rendering or data loading.

From the repository root, `scripts/deploy-budgie.sh` builds with same-origin data
URLs and syncs app/grid/PMTiles to budgie. `SKIP_TILES=1` skips PMTiles only.
`scripts/smoke.sh [base-url]` checks HTML and data signatures, not rendered pixels.
