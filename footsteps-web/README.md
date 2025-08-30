# Footsteps Web

Next.js + deck.gl visualization for human population over time.

## Development

- Install deps: `pnpm i`
- Dev server: `pnpm dev` (port 4444)
- Build: `pnpm build && pnpm start`
- Lint: `pnpm lint`
- Unit tests: `pnpm test`

## E2E (Playwright)

The e2e test verifies that population data renders by watching the on‑screen “Dots drawn” metric and using PMTiles.

Prerequisites
- Local PMTiles file under `../data/tiles/humans/`, e.g. `humans_-1000.pmtiles`.

Run steps
- One‑time: `pnpm i && pnpm dlx playwright install`
- Export tiles dir: `export HUMANS_TILES_DIR=$(pwd)/../data/tiles/humans`
- Execute: `pnpm e2e`

Notes
- The test intercepts `http://localhost:4444/pmtiles/humans_*.pmtiles` and serves bytes from your local PMTiles; no remote network is needed.
- If `HUMANS_TILES_DIR` is unset or contains no `humans_*.pmtiles`, the test is skipped.
