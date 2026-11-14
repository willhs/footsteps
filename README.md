# Footsteps of Time

A living atlas of human population: scrub through history on an interactive globe.
The slider runs from **100,000 BCE to 1900 CE**. People come from 30 HYDE years
(10,000 BCE–1900 CE); before that the map shows the ice-age Earth only. People in
deep prehistory and the present remain a goal, not available data.

What it's for and what it isn't: [docs/philosophy/vision.md](docs/philosophy/vision.md).

## Views

- **Units** (default): population expressed as bands, villages, and dense city glow.
  Positions within each HYDE cell are invented, deterministically placed marks,
  not archaeological settlement locations.
- **Grid**: one mark per populated HYDE cell, sized by population.
- **Dots**: prebuilt PMTiles; snaps to the nearest of nine available tile years.

Units and Grid share one lossless WebP per year (about 1 MB; the first view of Units costs roughly 1.5 MB, down from 3.4 MB). HYDE 3.5 density grids
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
cp data/tiles/grid/humans_*.webp footsteps-web/public/grid/
pnpm --dir footsteps-web dev
```

Open http://localhost:4444. This example generates three years only; generate all
30 values in `footsteps-web/lib/constants.ts` (`TARGET_YEARS`) for the full slider.
For local Dots mode, copy existing `humans_*.pmtiles` archives from
`data/tiles/humans/` into `footsteps-web/public/pmtiles/`. Required Dots years are
listed separately in `DOT_TILE_YEARS`. Generated files are not committed.

### Cross-fade between years

Units (the default) and Grid blend decoded years over 300 ms. The previous
snapshot stays visible while the next image loads. Rapid scrubbing finishes the
active blend, then takes the latest decoded year, keeping at most two datasets
on the GPU. Seeded bands that persist stay in place and retain their brightness.
The nearest earlier and later years are fetched, decoded and prepared in a Web
Worker; an LRU cache retains five prepared snapshots. Positions, radii and colours
arrive as transferable binary buffers. Hidden chunks of 32,768 points upload
four at a time across frames before a year becomes visible, so large uploads do not stall the
fade. The previous year stays visible during this preparation; rapid requests
replace an unfinished upload with the latest decoded year.
Dots keeps its existing tile behavior.

Units uses stable cell/kind/ordinal IDs to merge the two years into one cloud.
The shader interpolates each mark's colour and radius; persistent bands are drawn
once at full brightness, while only gained or lost marks fade. Compact unit
endpoints stay in the worker's four-year cache; the UI caches five decoded grids.

To verify transitions with the real data, serve all 30 generated images from
`footsteps-web/public/grid/` (for example, symlink it to `data/tiles/grid/`). With
the app running on port 4444, run from `footsteps-web/`:

```bash
CROSSFADE_EVIDENCE=/absolute/path/outside/git node scripts/verify-year-crossfade.mjs
```

This drives every year and rapid reversals, checks continuous opacity and the
two-snapshot limit, switches rendering modes, checks actual population pixels,
and captures screenshots and frame timings (median under 20 ms, p95 under 125 ms; slow frames cluster in years with 3M+ units). It opens
Chromium by default; set `HEADLESS=true` for CI. Set `CROSSFADE_VIDEO=true` to also
record video; leave it off for timing measurements to avoid capture overhead.

## Raw data and processing

The project's raw HYDE 3.5 archive is on the NAS at **`/volume2/deep-footsteps`**.
Copy/extract its population-density ASCII grids to the repository-local
**`data/raw/hyde-3.5/`** (not under `footstep-generator/`). Expected filenames include
`popd_10000BC.asc`, `popd_0AD.asc`, and `popd_1900AD.asc`.

Direct HYDE download has been blocked by an Anubis bot check; use the NAS copy
rather than assuming automated acquisition works. The NAS location and download
block are operational context, not verified by a local checkout.

`footstep-generator/grid_image.py` converts density to people per cell using
latitude-dependent cell areas, then encodes population logarithmically (1023 levels, within ±0.76% per cell) into the
WebP's red/green channels. Output: `data/tiles/grid/humans_{year}.webp`. These are
data images: do not resize, recolour, or re-encode them with a lossy image tool.
The browser decodes them in `gridData.ts`; encoding constants must match.
`python3 footstep-generator/grid_image.py --verify YEAR…` checks them against the ASCs.
The older dot-generation scripts remain in `footstep-generator/`; they are not
needed to generate Units/Grid images.

## Architecture

- `footsteps-web/`: Next.js 15 App Router, React, TypeScript, deck.gl, Tailwind CSS.
  `next.config.js` uses `output: 'export'`; `pnpm build` writes `out/`.
- `components/footsteps/FootstepsViz.tsx`: view selection and globe composition.
- `components/footsteps/hooks/useGridLayer.ts`: fetch/decode/cache of `/grid/humans_{year}.webp`.
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

**Code deploys itself.** Every green CI run on `main` triggers
`.github/workflows/deploy-budgie.yml`, which builds two images and pushes them to GHCR:
- `ghcr.io/willhs/footsteps-web`: the static export baked into Caddy (`deploy/budgie/web/Dockerfile`).
- `ghcr.io/willhs/footsteps-api`: the day and anthropology API.

Watchtower on budgie pulls both within about 5 minutes. The workflow then waits until
https://footsteps.willhs.me/version.txt shows the commit and runs `scripts/smoke.sh --quick` (app, day API, one
PMTiles archive, one image of each kind; ~15 s). If that passes, the images are tagged `:good`; if not, the workflow
rolls back (below). A full `scripts/smoke.sh` then checks every year's data, and any red job pages Medic.
So: push to `main`, and prod follows. Nothing needs this Mac or the home network.

### Rolling back

**Automatic.** When the quick smoke fails after a deploy, the `rollback` job in `deploy-budgie.yml` points
`ghcr.io/willhs/footsteps-{web,api}:latest` back at the digests pinned before the deploy (`:good`, the last images that
passed the quick smoke; the current `:latest` on a first run). Watchtower sees `:latest` change within ~5 minutes and
recreates both containers on the old images. The bad build stays in GHCR as `:<sha>` only, so Watchtower never
re-pulls it. The job then waits for `/version.txt` to show a different commit and re-runs the quick smoke, and Medic is
paged whatever happens (the run is red). The fix is a new push to `main`: it deploys as usual and becomes `:good`
once it passes. Missing data (population, terrain, PMTiles) fails only the full smoke, so it pages Medic but does not roll back.

**By hand** (CI is down, or a bad deploy slipped past the smoke). Needs `docker login ghcr.io` with a token that can push packages:

```bash
scripts/image-pins.sh pin ghcr.io/willhs/footsteps-web                      # digest of :good (else :latest)
scripts/image-pins.sh rollback ghcr.io/willhs/footsteps-web=sha256:<good> ghcr.io/willhs/footsteps-api=sha256:<good>
# then wait ~5 minutes for Watchtower, or on budgie: docker compose pull && docker compose up -d   (in ~/projects/deep-footsteps/deploy/budgie)
```

To pin a specific old commit instead, use its tag: `docker buildx imagetools inspect ghcr.io/willhs/footsteps-web:<sha>`
gives the digest. `DRY_RUN=1` on `rollback` only checks the digests exist and prints what would move.

**Rehearse it** (no prod, no network beyond pulling `registry:2` once): `scripts/rollback-drill.sh` runs the same
script against a throwaway local registry with a good and a bad image and checks `:latest` ends on the good one.

**Data is published by hand.** Population, terrain, habitat, fauna and evidence images and PMTiles are not in git.
They live on budgie under `deploy/budgie/app/<folder>` and `pmtiles/`, mounted over the image (`docker-compose.yml`):

```bash
GRID_ONLY=1 scripts/deploy-budgie.sh       # data images only
scripts/deploy-budgie.sh                   # compose file + data + PMTiles, then pull images now
SKIP_TILES=1 scripts/deploy-budgie.sh      # same without PMTiles
API_ONLY=1 scripts/deploy-budgie.sh        # pull and restart the API now
scripts/smoke.sh https://footsteps.willhs.me
```

These need SSH/rsync access to `will@budgie` (the home network). Defaults to
`~/projects/deep-footsteps/deploy/budgie` remotely; override `REMOTE`, `DEST`, or `TILES_DIR` when needed.
Data rsyncs only add and replace files, never delete. The script pulls images built from `main`, so push first.
A change to `docker-compose.yml` itself needs one run of the script.

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
