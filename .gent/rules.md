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
  `docs/ops/grid-images.md`); it sets the kind of group and the colour. Units use the settlement model by default (group sizes and layouts from
  ethnographic analogs, ranked spots, households: `docs/ops/settlements.md`; `?settlements=0` gives even groups at random spots). `?mode=units|grid|dots`
  is a debug override. Grid uses the same per-year population images.
- Close-up 3D: from zoom 8 on the flat map the camera tilts into a landscape (`footsteps-web/layers/Close3DLayer.ts`,
  `lib/close3d.ts`): Terrarium relief, water at the year's sea level, era-image colour with the colour pyramid's detail. Plant marks by Krapp biome
  are off by default (`?plants=1`): cones and blobs read as toys, not trees. Biome surface detail drawn in the ground shader
  (grass, closed canopy, sand ripples, cracked ice, reeds, rock; `components/footsteps/layers/groundDetail.ts`) is off until
  Will reviews it (`?ground=1`; the note then says "surface imagined"). On by default; `?close3d=0` keeps it flat.
  See `docs/ops/close-up-scene.md`.
  Dots uses static PMTiles archives and snaps to the nearest built year.
- `footstep-generator/grid_image.py`: HYDE density → people per cell → one ~1 MB
  lossless WebP per year in `data/tiles/grid/`. Browser decoding is in
  `footsteps-web/components/footsteps/hooks/useGridLayer.ts`.
- `footstep-generator/terrain_image.py`: Krapp2021 biomes + Blue Marble colours + HYDE
  farmland → one ~200 KB Earth image per terrain year in `data/tiles/terrain/`, drawn
  cross-faded in terrain mode by `hooks/useTerrainLayers.ts`. See `docs/ops/terrain-images.md`.
  Close in (zoom 3–8, stretched beyond), `footstep-generator/terrain_tiles.py`'s one year-independent pyramid of the 500 m
  Blue Marble photo (`data/tiles/terrain/detail/`, ~138 MB, alpha = today's land) is recoloured per year on the GPU as
  `photo × era ÷ ref` (`lib/terrainDetail.ts`, `layers/TerrainDetailLayer.ts`; the close-up 3D ground uses the same rule),
  so scrubbing fetches no tiles. The fine texture on past eras is today's ground, labelled imagined. Behind `?terrain_tiles=1` until Will flips it (after task 0009 it no longer slows the close-up; zoom 4 is still ~0.37 s slower to full detail; docs/ops/terrain-bench.md).
- `footstep-generator/prehistory_population.py`: a MODELLED world population (Tallavaara NPP fit, Beyer climate,
  arrival table, scaled to a literature curve, blended into HYDE) → one 0.5° WebP per 1,000 years, 100,000–11,000 BCE,
  in `grid_image.py`'s encoding, plus `totals.json` (also copied to `footsteps-web/public/prehistory_totals.json`, which `lib/time.ts`
  imports for the counter's range). The app reads the WebPs through the same grid pipeline as HYDE's (`MODELLED_YEARS`, `PEOPLE_YEARS`
  in `lib/constants.ts`; `gridData.ts` upsamples 0.5° to HYDE's 5′ cells, giving a block's people only to its land sub-cells at the year's sea level). See `docs/ops/prehistory-population.md`.
- `footstep-generator/habitat_lookup.py`: Krapp biome + Beyer temperature/precipitation per 0.5° cell per 1 ka step, and HYDE land use
  per HYDE year, as small lossless WebPs in `data/tiles/habitat/` (served at `/habitat/`) for the hover card (on by default, `?hover=0` hides it).
  See `docs/ops/habitat-lookup.md`.
- `footstep-generator/ground_images.py`: paints the hover card's imagined ground-view pictures (one 480 × 270 WebP per scene in
  `footsteps-web/lib/groundScenes.json`, via OpenRouter, run under `op-scope`), committed in `footsteps-web/public/ground/` with `index.json`.
  See `docs/ops/ground-view.md`.
- `footstep-generator/fauna/phylacine.py`: PHYLACINE 1.2.1 present-natural ranges + a cited extinction table (`losses.py`) →
  `data/fauna/fauna.json.gz`: large mammals per 1° cell per 1 ka step, 100,000 BCE–1900. A modelled dataset; the anthropology atlas reads it for big game before 10,000 BCE (`anthropology/deep.py`).
  See `docs/ops/fauna.md`.
- `footstep-generator/anthropology/ethnography.py`: D-PLACE (Ethnographic Atlas, SCCS, Binford, TEOW, ecoClimate) → 1,404 societies with 25 variables
  (`deploy/budgie/api/ethnography.json.gz`, committed) and `nearest_analogs` (`deploy/budgie/api/analogs.py`), the 3 most similar societies for a place,
  year and way of life, with a score and a plain "the ethnographic present is not the past" caveat. The day API puts them in the "Imagine their day"
  prompt as "like the X (recorded 1930s)" (`grounding.py`), beside measured adult hours from `anthropology/time_use.yaml` (exported to `time_use.json` by
  `time_use.py`). The prompt's facts stay under `PROMPT_TOKEN_BUDGET`. See `docs/ops/ethnography.md`.
- `footstep-generator/anthropology/languages.py`: Glottolog 5.4 (pinned sha256, CC BY 4.0) → a `languages` block per 5° cell in the atlas (families with language counts, the 3 nearest languages;
  sign, pidgin, creole, artificial, post-1500 transplanted and ancient written languages dropped) and `fields.languages` in the record for eras 1500-1900 only: a recorded baseline for about 1500 CE, never earlier.
  The hover card shows it from 1500 (`lib/languages.ts`, `hooks/useLanguages.ts`, `GET /api/anthropology?...&fill=0` which skips the model). D-PLACE societies carry their `glottocode`. See `docs/ops/languages.md`, research 0007.
  Steps 2-3: `anthropology/languages_expansions.yaml` (cited colonial and deep-time expansions as 5° boxes; `checked`/`unverified` per row) → `languages_expansions.py` →
  `footsteps-web/public/languages/expansions.json` (6.6 KB), read by `lib/languageExpansions.ts` for a "Languages spreading here" hover line only with `?langs=deep`, never before 3050 BCE (5 ka).
- `footstep-generator/food/`: a cited table of 19 crops and 15 domestic animals (centres, first dates, spread fronts), pooled with the habitat
  tiles' HYDE land use and Krapp biome into `data/food/food.json.gz`: which domesticates were around each 5° cell per HYDE era, plus forager
  staples by biome. A modelled dataset (origins checked against DOIs on 2026-11-19; fronts and the rest say why they were not, see `checked` and `unverified`); read by the hover card only with `?food=1`. See `docs/ops/food.md`, research 0008.
- `footstep-generator/water_distance.py`: Natural Earth 10m rivers, lake centerlines and (non-saline) lakes v5.1.2 (pinned sha256, public domain) → one year-independent
  lossless WebP of great-circle distance to the nearest fresh water per HYDE 5′ cell (8-bit, metres = 2,000 km × (code/255)², code 0 = water in the cell),
  committed at `footsteps-web/public/water/water_distance.webp` (872 KB) with a `water_distance.json` sidecar. A static model input for placing groups
  (research 0012, part 2); read by `siteRanking.ts` (settlement model, on by default). Present-day courses; the Green Sahara is not modelled (`--extra-water` is the hook). See `docs/ops/water-distance.md`.
- `footstep-generator/site_terrain.py`: AWS Terrarium zoom-6 tiles + Natural Earth 10m land and lakes v5.1.2 (pinned) → one year-independent lossless WebP on a 2.5′ grid
  (`footsteps-web/public/sites/site_terrain.webp`, 2.4 MB, with a `site_terrain.json` sidecar): depth of each pixel's sea below today's, its sea share, a lake flag and a regional slope class.
  In the settlement model (the default Units view; `?settlements=0` turns it off), `components/footsteps/layers/siteRanking.ts` ranks 16 candidate spots per 5′ cell (flat × near fresh water × near the year's coast × a stable per-spot factor of 1 ± 0.35 that stops the ties lining up in rows, never sea or lake at
  `seaLevelAt(year)`) and `settlementUnits.ts` puts group *k* at spot *k*; cell totals and ids unchanged, `?sites=0` keeps the old positions. Modelled rule, imagined spot.
  `site_check.py` counts groups in the sea against Natural Earth's polygons. See `docs/ops/site-terrain.md`.
- `footstep-generator/past_water.py`: a dated, basin-connected Lake Mega-Chad highstand (329 m, calendar BP 11.5–5 ka = app years -9550…-3050; Terrarium DEM flood-filled from Lake Chad, ~359,000 km²) → a 646 B lake mask,
  an 8 KB freshwater-distance patch and a manifest in `footsteps-web/public/pastwater/`; **one** geometry and epoch read by `terrain_image.py --pastwater`, the ranker's wet exclusion and distances (`siteRanking.ts`, epoch-keyed cache; groups
  with no dry spot are counted `unresolved`, never forced in or dropped), and the close-up lake plane (`lib/close3d.ts` `lakeVertices`). Behind `?pastwater=1` (off until reviewed; Dots is static and says so; outside the window the
  scenario is inactive: geography unknown, not dry). `past_water_check.py` is the independent placement check. See `docs/ops/past-water.md`.
- `footstep-generator/hyde_climate_spread.py`: HYDE people moved within continent-scale regions by climate-then vs today (Green Sahara,
  exposed shelves), regional totals kept → `data/tiles/grid_adjusted/` for 10,000–4,000 BCE, served at `/grid/adjusted/`. Read by the grid pipeline
  only with `?spread=1` (`lib/adjustedSpread.ts`, off until reviewed), labelled "Adjusted spread (modelled on HYDE)"; Dots says it is not applied.
  See `docs/ops/hyde-climate-spread.md`.
- `footsteps-web/lib/dwellings.ts` + `layers/shelters.ts` + `public/dwellings.json`: close-up shelters, behind `?shelters=1` (off until reviewed). One dwelling per household of a group in view
  (and dense roof clusters for towns and cities), drawn by `Close3DLayer` as six low-poly instanced shapes standing on the Terrarium ground height, never on water. The TYPE is modelled from the house codes
  (EA079 plan, EA081 walls, EA083 roof) of the analog society the settlement model drew the group from (`Units.society` indexes the 15 KB table; `settlements.py --dwellings` regenerates it), or from two cited
  dug types (mammoth-bone huts, Near East mud-brick); the PLACE is imagined (where its household stands); the hover line says both and "the ethnographic present is not the past". See `docs/ops/settlements.md` "Shelters in the close-up".
- `footsteps-web/lib/demography.ts` + `lib/demography.json` + `lib/farmingOnset.json`: ages of people at street zoom, drawn from MODELLED life-course profiles (forager / early farmer / agrarian) chosen by way of life and regional crop onset, compiled from `footstep-generator/anthropology/demography.yaml` by `demography_asset.py`; the person card says "Modelled age structure; individual speculative". Herding camps keep a labelled generic structure. See `docs/ops/ages.md`, research 0006.
- `footsteps-web/lib/otherHumans.ts`: other kinds of human (Neanderthals, Denisovans, *H. floresiensis*, *H. luzonensis*): cited end
  dates (in step with `arrivals.yaml` `other_hominins`) and 24 key dated sites, plus guessed bands of ~15 (drawn as
  our own people's fires, lavender) placed by `footstep-generator/other_humans_bands.py` (guessed numbers in `other_humans/bands.yaml` × the pre-HYDE habitat
  model inside hand-drawn ranges → `footsteps-web/public/other_humans/bands.json`, committed), drawn by `hooks/useOtherHumansLayer.ts`
  until each was last seen. On by default (View panel; `?humans=0` off). See `docs/ops/other-humans.md`.
- `footstep-generator/evidence/`: p3k14c radiocarbon dates calibrated, grouped into sites and exported
  (`data/evidence/p3k14c_sites.json.gz`); drawn only behind `?evidence=1` (cool marks that fade with time, bunched when zoomed out:
  `footsteps-web/lib/evidenceMarks.ts`, `hooks/useEvidenceLayer.ts`). Copy it to `footsteps-web/public/evidence/`. See its README and research 0003.
  `evidence/aadr.py`: AADR ancient-DNA individuals (date, place, hominin) as a second kind of evidence
  (`data/evidence/aadr_samples.json.gz`); drawn with the radiocarbon marks behind `?evidence=1` (`lib/aadr.ts`). See its README and research 0010.
  `model_vs_evidence.py` compares the modelled pre-HYDE people with the p3k14c sites per region (research 0009: box-order bugs in `arrivals.yaml`, west Europe glacial-maximum shape, proposals).
  `regions.py` loads the same `arrivals.yaml` boxes for p3k14c and AADR (one source of truth); `arrival_check.py` tabulates modelled arrival against the earliest p3k14c and direct AADR dates per region (research 0010).
- `footsteps-web/lib/constants.ts`: authoritative `TARGET_YEARS`, `TERRAIN_YEARS` and `DOT_TILE_YEARS`.
- `deploy/budgie/`: Caddy + Docker Compose, static app/grid and range-served PMTiles,
  bound to `127.0.0.1:5090` on budgie behind the Cloudflare Tunnel.
- Deploy: green CI on `main` builds the web and API images (`.github/workflows/deploy-budgie.yml`, GHCR);
  Watchtower on budgie pulls them, the workflow quick-smokes prod (`scripts/smoke.sh --quick`) and rolls `:latest` back to the
  last `:good` image if that fails (`scripts/image-pins.sh`, README "Rolling back"; `scripts/rollback-drill.sh` rehearses it), then runs the full smoke. `scripts/deploy-budgie.sh` publishes the
  data that is not in git (`GRID_ONLY=1` for data only, `API_ONLY=1` to pull the API now). It needs the home network.
- `deploy/budgie/api/`: day API (`day_api.py`) and `GET /api/anthropology` (`atlas.py`), a sourced
  record per 5° cell × era, 100,000 BCE–1900, built by `footstep-generator/anthropology/` (see its README). Before
  10,000 BCE (`deep.py`) it is a modelled record: foragers only, arrival table, Neanderthals and Denisovans, a cited
  technocomplex table (`deep_past.yaml`), Beyer/Krapp climate, fauna ranges. "Imagine their day" works there, labelled more strongly.
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

