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
# Fix deployment workflow status

## Static Export (Recommended)

This app can be built and deployed as a static site. Tiles are fetched directly from a PMTiles CDN/Worker (e.g., Cloudflare Worker → GCS). No Node/Next server is required.

Build locally with direct tiles:

```bash
pnpm install
NEXT_PUBLIC_PMTILES_DIRECT=true \\
NEXT_PUBLIC_CDN_HOST="https://<your-tiles-host>" \\
pnpm build

# Static output in ./out
npx serve out
```

Deploy options:
- Cloudflare Pages: use `.github/workflows/deploy-pages.yml` and set repository secrets:
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`
  - Optional: `NEXT_PUBLIC_CDN_HOST` to override tiles host
- Any static host/CDN (Netlify, Vercel static, GitHub Pages): upload `footsteps-web/out/`.

Tiles hosting remains unchanged. Point `NEXT_PUBLIC_CDN_HOST` to your PMTiles CDN/Worker. See `iac/cloudflare/pmtiles_worker.js` for a Worker that fronts a GCS bucket with Range + caching.

### Legacy Cloud Run

The previous Docker/Cloud Run deployment for the web app is no longer necessary when using static export. It is kept temporarily for transition and can be removed once Cloudflare Pages (or another static host) is in place.
