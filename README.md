# Footsteps of Time

A living atlas of human population: scrub through history on an interactive globe.
The current slider covers 30 HYDE years from **10,000 BCE to 1900 CE**. Extending
it to deep prehistory and the present remains a goal, not available data.

## Views

- **Units** (default): population expressed as bands, villages, and dense city glow.
  Positions within each HYDE cell are invented, deterministically placed marks,
  not archaeological settlement locations.
- **Grid**: one mark per populated HYDE cell, sized by population.
- **Dots**: prebuilt PMTiles; snaps to the nearest of nine available tile years.

Units and Grid share one approximately 3 MB PNG per year. HYDE 3.5 density grids
are the active source; the app does not currently use the Reba city dataset.

## Local development

Requires Node.js 20+, pnpm (package declares 10.13.1), Python 3.11+, and Poetry.
Run these commands from the repository root:

```bash
poetry install
pnpm --dir footsteps-web install
```

Poetry manages dependencies only; run Python scripts by path rather than installed
console commands. For Units and Grid, generate the needed years:

```bash
poetry run python footstep-generator/grid_image.py -10000 0 1900
mkdir -p footsteps-web/public/grid
cp data/tiles/grid/humans_*.png footsteps-web/public/grid/
pnpm --dir footsteps-web dev
```

Open http://localhost:4444. This example generates three years only; generate all
30 values in `footsteps-web/lib/constants.ts` (`TARGET_YEARS`) for the full slider.
For local Dots mode, copy existing `humans_*.pmtiles` archives from
`data/tiles/humans/` into `footsteps-web/public/pmtiles/`. Required Dots years are
listed separately in `DOT_TILE_YEARS`. Generated files are not committed.

## Raw data and processing

The project's raw HYDE 3.5 archive is on the NAS at **`/volume2/deep-footsteps`**.
Copy/extract its population-density ASCII grids to the repository-local
**`data/raw/hyde-3.5/`** (not under `footstep-generator/`). Expected filenames include
`popd_10000BC.asc`, `popd_0AD.asc`, and `popd_1900AD.asc`.

Direct HYDE download has been blocked by an Anubis bot check; use the NAS copy
rather than assuming automated acquisition works. The NAS location and download
block are operational context, not verified by a local checkout.

`footstep-generator/grid_image.py` converts density to people per cell using
latitude-dependent cell areas, then encodes population logarithmically into the
PNG's red/green channels. Output: `data/tiles/grid/humans_{year}.png`. These are
data images: do not resize, recolour, or optimise them with a lossy image tool.
The browser decodes them in `useGridLayer.ts`; encoding constants must match.
The older dot-generation scripts remain in `footstep-generator/`; they are not
needed to generate Units/Grid images.

## Architecture

- `footsteps-web/`: Next.js 15 App Router, React, TypeScript, deck.gl, Tailwind CSS.
  `next.config.js` uses `output: 'export'`; `pnpm build` writes `out/`.
- `components/footsteps/FootstepsViz.tsx`: view selection and globe composition.
- `components/footsteps/hooks/useGridLayer.ts`: fetch/decode/cache of `/grid/humans_{year}.png`.
- `components/footsteps/layers/units.ts`: deterministic band/village/glow construction.
- `footstep-generator/`: Python processing and tests.
- `deploy/budgie/`: Caddy configuration and Docker Compose for static hosting.
- `scripts/`: deployment and deployed-data smoke checks.

Frontend component paths above are relative to `footsteps-web/`. Population data
is fetched as same-origin static files; no application server is needed.

## Deployment

Production is a Next static export served by Caddy on **budgie**, behind a
Cloudflare Tunnel, at https://footsteps.willhs.me. Caddy listens through Docker on
`127.0.0.1:5090`, serves the app and `/grid/` images, and serves `/pmtiles/` archives
with HTTP Range support. `/healthz` is a simple server health response.

```bash
scripts/deploy-budgie.sh
scripts/smoke.sh https://footsteps.willhs.me
```

Deployment requires SSH/rsync access to `will@budgie`, Docker Compose on the server,
local `data/tiles/grid/` images, and (unless skipped) `data/tiles/humans/` archives.
The script builds with same-origin data URLs, syncs `out/` and grid images, uploads
PMTiles, then starts/restarts Caddy and checks health. Defaults to
`~/projects/deep-footsteps/deploy/budgie` remotely; override `REMOTE`, `DEST`, or
`TILES_DIR` when needed. `SKIP_TILES=1 scripts/deploy-budgie.sh` skips only PMTiles;
grid images are still synced. App/grid rsync uses `--delete`, so prepare complete
local outputs before deploying.

The smoke script checks app HTML and file signatures for every configured grid
and Dots year. It does not verify browser rendering. Build output is static;
serve `out/` with a static server rather than `pnpm start`.

## Verification

```bash
pnpm --dir footsteps-web lint
pnpm --dir footsteps-web exec tsc --noEmit
pnpm --dir footsteps-web test -- --runInBand
pnpm --dir footsteps-web build
poetry run pytest footstep-generator/tests/ -q
```

For browser checks, run `pnpm --dir footsteps-web e2e`; see
`footsteps-web/playwright.config.ts` for server setup. Verify all three modes with
local data before changing rendering or data formats. Historical research notes
are records of their date, not current deployment instructions.

## Acknowledgements

HYDE team for historical population estimates; deck.gl and Next.js teams for the
visualisation and application frameworks.
