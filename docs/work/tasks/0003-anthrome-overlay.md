---
title: Prototype anthrome overlay tiles and UI toggle
status: paused
created: 2025-09-21
updated: 2025-09-21
owner: agent
---

Context
- Goal: prove we can render anthropogenic biome (anthrome) classes alongside the population dots.
- Constraint: keep scope tight—process a single year end-to-end and surface it via a basic overlay toggle.
- Baseline data pulls from the Anthromes 12k DGG Dataverse bundle the user already downloaded.

Changes
- Added a standalone generator (`footstep-generator/anthrome_tile_generator.py`) that extracts the 5′ grid shapefile + baseline CSV and builds `anthromes_{year}.mbtiles/pmtiles` via tippecanoe.
- Introduced frontend plumbing: static color map (`footsteps-web/components/footsteps/layers/anthromeColors.ts`), lazy layer hook (`hooks/useAnthromeLayer.ts`), and a simple toggle in `FootstepsViz` / `VizToggles`.
- Dropped the generated `anthromes_1800.pmtiles` into `footsteps-web/public/pmtiles/` for local testing and ignored PMTiles in git.
- Wired deck.gl to read the anthrome tiles as filled polygons using the shared `PMTilesTileLayer` helper.

Verification
- Generated data: `python footstep-generator/anthrome_tile_generator.py --dataverse-zip ~/Downloads/dataverse_files.zip --year 1800 --output-dir footstep-generator/data/tiles/anthromes`.
- Frontend lint: `pnpm -C footsteps-web lint` (completes with pre-existing warnings about `any` types and unused vars).
- Manual sanity: load dev server, toggle 🌱 button, confirm translucent biome layer appears (requires `public/pmtiles/anthromes_1800.pmtiles`).

Open Questions
- Only 1800 CE is wired in; need a thin LOD-aware tiling path or downsampled timeline before shipping.
- Layer currently draws full polygons—might want dissolve/generalization for coarse zooms to avoid visual noise.
- Consider exposing legend/tooltip metadata so users can decode the palette without documentation.

Change Log
- 2025-09-21: Initial spike for anthrome tiles + overlay toggle.

