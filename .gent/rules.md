# Footsteps of Time

An interactive globe of historical human population. Prioritise clear quantitative
storytelling: pixels should communicate data, not decoration. The current data
covers 10,000 BCE–1900 CE (30 years); 100,000 BCE–present is aspirational.

## Current architecture

- `footsteps-web/`: Next.js 15 static export (`out/`), TypeScript, React, deck.gl,
  Tailwind. No application server in production.
- Units is the default mode; Grid uses the same per-year population images.
  Dots uses static PMTiles archives and snaps to the nearest built year.
- `footstep-generator/grid_image.py`: HYDE density → people per cell → one ~1 MB
  lossless WebP per year in `data/tiles/grid/`. Browser decoding is in
  `footsteps-web/components/footsteps/hooks/useGridLayer.ts`.
- `footsteps-web/lib/constants.ts`: authoritative `TARGET_YEARS` and `DOT_TILE_YEARS`.
- `deploy/budgie/`: Caddy + Docker Compose, static app/grid and range-served PMTiles,
  bound to `127.0.0.1:5090` on budgie behind the Cloudflare Tunnel.
- `scripts/deploy-budgie.sh`: builds and rsyncs to budgie, restarts Caddy, checks health.
  `scripts/smoke.sh [base-url]`: HTML and WebP/PNG/PMTiles signatures for configured years.

## Data and development

Read [README.md](../README.md) for setup and deployment commands (paths in this
file are repository-relative unless stated otherwise).

Raw HYDE 3.5 is stored on the NAS at `/volume2/deep-footsteps`; copy/extract the
population grids to `data/raw/hyde-3.5/` locally. Direct download has encountered
an Anubis bot check. Do not assume this archive is present in a fresh checkout.
`grid_image.py` expects `popd_10000BC.asc`, `popd_0AD.asc`, etc.

From the repository root:

```bash
poetry install
poetry run python footstep-generator/grid_image.py -10000 0 1900
pnpm --dir footsteps-web install
mkdir -p footsteps-web/public/grid
cp data/tiles/grid/humans_*.webp footsteps-web/public/grid/
pnpm --dir footsteps-web dev
```

Development runs on port 4444. Generate all `TARGET_YEARS` for full coverage.
For local Dots mode, provide `footsteps-web/public/pmtiles/humans_{year}.pmtiles`.
Poetry is dependency-only; invoke Python scripts by path. Do not commit raw data,
generated population files, or static build output.

## Verification

Run checks appropriate to changed files before committing:
- Documentation/configuration: `git diff --check`; validate TOML/config syntax.
- Frontend: `pnpm --dir footsteps-web lint`,
  `pnpm --dir footsteps-web exec tsc --noEmit`,
  `pnpm --dir footsteps-web test -- --runInBand`.
- Static-export changes: `pnpm --dir footsteps-web build`.
- Python processing: `poetry run pytest footstep-generator/tests/ -q`.
- Deployment/data changes: `scripts/smoke.sh [base-url]` against the intended server.
  Server health alone does not prove population data is present or the globe renders.

For visual changes, use browser checks with real data across Units, Grid, and Dots.
Keep WebP encoding/decoding constants (`LEVELS`, `MAX_PEOPLE`) in sync. Units positions within cells are
invented, stable representations, not measured settlement locations.

## Documentation and configuration

`AGENTS.md` links to this file (`.gent/rules.md`); edit this source and retain a
repository-relative symlink. Use `gent list` to inspect agent configuration; avoid
syncing unrelated machine-wide configuration during project work.
See `footsteps-web/AGENTS.md` for frontend specifics. Treat old research as dated
evidence; use README and deployed scripts for the current operating model.
