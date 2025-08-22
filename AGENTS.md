# AGENTS Guide

Concise, actionable rules for working in this repo. Keep diffs minimal, performance high, and tests green.

## Project Structure
- `footsteps-web/`: Next.js + TypeScript frontend
  - `app/`: routes, API handlers, `globals.css`, layout
  - `components/`: React components (viz, overlays, views, hooks)
  - `lib/`: utilities (e.g., `tilesService.ts`, LOD helpers)
  - `public/`: static assets
- `footstep-generator/`: Python pipeline for HYDE → settlements → tiles
  - `tests/`: pytest suites (`test_*.py`)
- `data/`: generated artifacts (git-ignored; large)
  - `raw/`, `processed/`, `tiles/humans/`
- `docs/`, `screenshots/`: supplementary docs and UI references

## Prerequisites
- Node.js 20+ and `pnpm` (project uses `pnpm@10.x`)
- Python 3.11 and `poetry`
- For tiles: `tippecanoe` and `tile-join` (and `sqlite3` CLI) installed locally
  - macOS: `brew install tippecanoe sqlite`

## Quick Start
- Frontend dev (port 4444):
  - `cd footsteps-web && pnpm i && pnpm dev`
  - Open `http://localhost:4444`
- Python env:
  - From repo root: `poetry install`
  - Run tests: `poetry run pytest footstep-generator -q`

## Common Commands
- Frontend
  - Install: `cd footsteps-web && pnpm i`
  - Dev: `pnpm dev` (port 4444)
  - Build/serve: `pnpm build && pnpm start`
  - Lint: `pnpm lint`
  - Format: `pnpm format`
  - Tests: `pnpm test` (add `-- --watch` for watch mode)
- Python (from repo root)
  - Install deps: `poetry install`
  - Tests: `poetry run pytest footstep-generator -q`
  - Type-check: `poetry run mypy footstep-generator`
  - Lint: `poetry run flake8 footstep-generator`
  - Format: `poetry run isort footstep-generator && poetry run black footstep-generator`
  - Run processors:
    - HYDE → LOD compute: `poetry run python footstep-generator/process_hyde.py [--force]`
    - Build tiles: `poetry run python footstep-generator/make_tiles.py --years 0 1000 1500 --force`
    - Download data (if available): `poetry run python footstep-generator/fetch_data.py`

## Data + Tiles Workflow
1) Place HYDE ASCII grids (`popd_*.asc`) under `footstep-generator/data/raw/hyde-3.5/`
2) Compute LODs and/or build tiles:
   - All years found: `poetry run python footstep-generator/make_tiles.py`
   - Specific years: `poetry run python footstep-generator/make_tiles.py --years -1000 0 1500 2020`
   - Output goes to `data/tiles/humans/` (override with `--tiles-dir`)
3) Serve tiles to the frontend during dev:
   - `export HUMANS_TILES_DIR=$(pwd)/data/tiles/humans`
   - `cd footsteps-web && HUMANS_TILES_DIR=$HUMANS_TILES_DIR pnpm dev`
  - Tiles API: `/api/tiles/{year}/single/{z}/{x}/{y}.pbf`

Notes
- LOD levels: `0` (regional), `1` (subregional), `2` (local), `3` (detailed)
- `make_tiles.py` uses population-preserving LODs; temporary GeoJSONL is cleaned up automatically
- If `sqlite3`/`@mapbox/mbtiles` is unavailable, the API route falls back where possible

## Coding Style
- TypeScript: strict mode, functional components, hooks; imports via `@/` alias; Tailwind in `globals.css`
- Python: PEP 8/257, type hints, pure functions; Black/Isort for formatting; mypy for typing
- Naming: `PascalCase.tsx` for React components; `snake_case.py` for Python modules

## Testing Guidelines
- Frontend: co-locate `*.test.tsx` near components; test interactions and rendering; avoid brittle snapshots
- Python: place `test_*.py` in `footstep-generator/tests`; test pure functions and data transforms
- Add tests for all non-trivial logic; keep tests fast and deterministic

### Which Tests to Run Based on Changes
- **Frontend changes** (`footsteps-web/`):
  - `cd footsteps-web && pnpm test`
  - `pnpm lint` and `pnpm format`
- **Python changes** (`footstep-generator/`):
  - `poetry run pytest footstep-generator -q`
  - `poetry run mypy footstep-generator`
  - `poetry run black footstep-generator && poetry run isort footstep-generator`
- **Data processing changes** (HYDE pipeline, LOD system):
  - `poetry run pytest footstep-generator/tests/test_e2e.py -v`
  - `python footstep-generator/tests/test_integration.py`
- **API changes** (`app/api/`):
  - Both frontend and Python tests
  - Manual API testing: `curl -I http://localhost:4444/api/tiles/1500/2/5/10/12.pbf`
- **Cross-cutting changes** (affecting both frontend and backend):
  - Run all tests: `pnpm test && poetry run pytest footstep-generator -q`

## Performance Notes
- `components/footsteps/FootstepsViz.tsx`: target 60+ fps; batch GPU buffers; avoid per-frame allocations; prefer memoization
- `components/footsteps/TimeSlider.tsx` (if present): <16 ms drag latency; keep handlers light; no heavy work in render
- Frontend uses deck.gl; keep layer props stable; avoid unnecessary layer recreation

## PR Checklist
- Lint/format clean: `pnpm lint && pnpm format && poetry run black footstep-generator && poetry run isort footstep-generator`
- Tests pass: `pnpm test` and `poetry run pytest footstep-generator`
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `perf:`, `chore:`
- Include screenshots/GIFs for UI changes

## Troubleshooting
- No tiles in frontend:
  - Ensure MBTiles exist under `data/tiles/humans`
  - Export `HUMANS_TILES_DIR` before `pnpm dev`
  - Verify API: `curl -I http://localhost:4444/api/tiles/1500/2/5/10/12.pbf`
- `tippecanoe`/`tile-join` missing:
  - Install via Homebrew: `brew install tippecanoe`
- `sqlite3` CLI missing or MBTiles access fails:
  - Install `sqlite` via package manager; API can also use `@mapbox/mbtiles` if available
- Python geospatial deps heavy to install:
  - Use Python 3.11 and Poetry; allow time for `geopandas` stack; consider a venv with cached wheels

## House Rules
- Keep diffs minimal and focused; avoid drive-by refactors
- Preserve performance characteristics; profile before/after when touching hot paths
- Prefer small, reviewable PRs with clear scope
