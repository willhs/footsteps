# Footsteps of Time

An interactive globe of historical human population. Prioritise clear quantitative
storytelling: pixels should communicate data, not decoration. The current data
covers 10,000 BCE–1900 CE (30 years, measured: HYDE); the slider and terrain reach back to 100,000 BCE,
and before HYDE (`HYDE_MIN` in `lib/time.ts`) the people are a labelled MODEL (`evidenceAt` is `'modelled'`,
the counter shows a low–high range). The present is aspirational.
Read [docs/philosophy/vision.md](docs/philosophy/vision.md) first: it is the one
current vision (measured vs modelled vs imagined, and what Footsteps is not).

## Current architecture

- `footsteps-web/`: Next.js 15 static export (`out/`), TypeScript, React, deck.gl,
  Tailwind. No application server in production.
- The people view is chosen by zoom: firelight far out, Units (bands, villages, herding camps,
  city glow) for the cells around the viewport closer in. Each populated cell has a way of life
  (forager / farmer / herder / urban) read from HYDE land use (`footsteps-web/lib/waysOfLife.ts`,
  `docs/ops/grid-images.md`); it sets the kind of group and the colour. `?mode=units|grid|dots`
  is a debug override. Grid uses the same per-year population images.
  Dots uses static PMTiles archives and snaps to the nearest built year.
- `footstep-generator/grid_image.py`: HYDE density → people per cell → one ~1 MB
  lossless WebP per year in `data/tiles/grid/`. Browser decoding is in
  `footsteps-web/components/footsteps/hooks/useGridLayer.ts`.
- `footstep-generator/terrain_image.py`: Krapp2021 biomes + Blue Marble colours + HYDE
  farmland → one ~200 KB Earth image per terrain year in `data/tiles/terrain/`, drawn
  cross-faded in terrain mode by `hooks/useTerrainLayers.ts`. See `docs/ops/terrain-images.md`.
- `footstep-generator/prehistory_population.py`: a MODELLED world population (Tallavaara NPP fit, Beyer climate,
  arrival table, scaled to a literature curve, blended into HYDE) → one 0.5° WebP per 1,000 years, 100,000–11,000 BCE,
  in `grid_image.py`'s encoding, plus `totals.json` (also copied to `footsteps-web/public/prehistory_totals.json`, which `lib/time.ts`
  imports for the counter's range). The app reads the WebPs through the same grid pipeline as HYDE's (`MODELLED_YEARS`, `PEOPLE_YEARS`
  in `lib/constants.ts`; `gridData.ts` upsamples 0.5° to HYDE's 5′ cells). See `docs/ops/prehistory-population.md`.
- `footstep-generator/habitat_lookup.py`: Krapp biome + Beyer temperature/precipitation per 0.5° cell per 1 ka step, and HYDE land use
  per HYDE year, as small lossless WebPs in `data/tiles/habitat/` (served at `/habitat/`) for the hover card (`?hover=1`, off by default).
  See `docs/ops/habitat-lookup.md`.
- `footstep-generator/fauna/phylacine.py`: PHYLACINE 1.2.1 present-natural ranges + a cited extinction table (`losses.py`) →
  `data/fauna/fauna.json.gz`: large mammals per 1° cell per 1 ka step, 100,000 BCE–1900. A modelled dataset; not used by the app yet.
  See `docs/ops/fauna.md`.
- `footstep-generator/anthropology/ethnography.py`: D-PLACE (Ethnographic Atlas, SCCS, Binford, TEOW, ecoClimate) → 1,404 societies with 25 variables
  (`ethnography.json.gz`, committed) and `nearest_analogs`, the 3 most similar societies for a place, year and way of life, with a score and a plain
  "the ethnographic present is not the past" caveat. Not used by the app or API yet. See `docs/ops/ethnography.md`.
- `footstep-generator/food/`: a cited table of 19 crops and 15 domestic animals (centres, first dates, spread fronts), pooled with the habitat
  tiles' HYDE land use and Krapp biome into `data/food/food.json.gz`: which domesticates were around each 5° cell per HYDE era, plus forager
  staples by biome. A modelled dataset (most dates recalled, see its `checked` flag); not used by the app yet. See `docs/ops/food.md`, research 0008.
- `footstep-generator/evidence/`: p3k14c radiocarbon dates calibrated, grouped into sites and exported
  (`data/evidence/p3k14c_sites.json.gz`); drawn only behind `?evidence=1` (cool marks that fade with time, bunched when zoomed out:
  `footsteps-web/lib/evidenceMarks.ts`, `hooks/useEvidenceLayer.ts`). Copy it to `footsteps-web/public/evidence/`. See its README and research 0003.
- `footsteps-web/lib/constants.ts`: authoritative `TARGET_YEARS`, `TERRAIN_YEARS` and `DOT_TILE_YEARS`.
- `deploy/budgie/`: Caddy + Docker Compose, static app/grid and range-served PMTiles,
  bound to `127.0.0.1:5090` on budgie behind the Cloudflare Tunnel.
- `scripts/deploy-budgie.sh`: builds and rsyncs to budgie, restarts Caddy, checks health
  (`API_ONLY=1` for just the API container).
- `deploy/budgie/api/`: day API (`day_api.py`) and `GET /api/anthropology` (`atlas.py`), a sourced
  record per 5° cell × era built by `footstep-generator/anthropology/` (see its README).
  `scripts/smoke.sh [base-url]`: HTML and WebP/PNG/PMTiles signatures (grid, terrain) for configured years.

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

## Secrets

There is no `.env`. The OpenRouter key lives in 1Password: vault `proj-deep-footsteps`,
item `OPENROUTER_API_KEY`, field `credential` (`op://proj-deep-footsteps/OPENROUTER_API_KEY/credential`).
It is used by the day/anthropology API container on budgie (`deploy/budgie/api`).

- Budgie: `scripts/push-api-secrets.sh` renders `deploy/budgie/api.env.tpl` with `op inject`
  straight into `deploy/budgie/api.env` on budgie (git-ignored, mode 600) and recreates the
  `api` container. Run it from Will's terminal; the key never lands on the Mac's disk.
- Local: `op-scope deep-footsteps -- <cmd>` or `op run --env-file .env.tpl -- <cmd>`.
- Manager jobs: dispatch with `secrets=true` (read-only service account
  `manager-agent-deep-footsteps`, ADR 0036).
- Never write the resolved key to a file in the repo, echo it, or pass it as an argument.

