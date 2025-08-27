# 🌍 Globe of Humans

**A living atlas that shows everyone who ever lived, throughout all of human history.**

Shows an instantiation of history from the data available, as accurately as possible.

## 🎯 Vision

A living atlas that shows everyone who ever lived, throughout all of human history. Shows an instantiation of history from the data available, as accurately as possible.

## ✨ Features

- **🌐 Interactive 3D Globe** - Navigate and explore with full pan/zoom/rotate controls
- **⏰ Time Travel** - Non-linear slider covering 100,000 BCE → 2025 CE with historical breakpoints
- **👥 Settlement Points** - Representative points of human presence (aggregated by LOD)
- **🔥 Heat-Map** - Population density visualization showing regional concentrations
- **📊 Real-time Filtering** - Dots appear/disappear based on historical timeline
- **⚡ Performance** - Efficient rendering of millions of data points

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
 - pnpm
- Python ≥ 3.11
- Poetry (for Python dependency management)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd deep-footsteps

# Install Python dependencies with Poetry
poetry install

# Install frontend dependencies
cd footsteps-web
pnpm install

# Generate tiles (ensure HYDE data is in data/raw/hyde-3.5/)
cd ..
python footstep-generator/generate_footstep_tiles.py    # Complete tile generation pipeline

# Start the development server
cd footsteps-web
pnpm dev
```

Open `http://localhost:4444` in your browser.

## 🎮 How to Use

1. **Navigate the Globe** - Click and drag to rotate, scroll to zoom
2. **Time Travel** - Use the slider at the bottom to scrub through history

### Time Periods

- **100k-10k BCE**: We don't have this yet, but want to
- **10k-1k BCE**: Agricultural revolution, first cities emerge
- **1k BCE-1k CE**: Classical civilizations, trade networks
- **1k-1500 CE**: Medieval growth, exploration

## 📊 Data Sources

- **Population Density**: HYDE 3.5 Database (History Database of the Global Environment)
- **Urban Settlements**: Reba et al. Historical Urban Population Dataset
- **Sample Data**: Algorithmically generated for MVP demonstration

## 🏗️ Architecture

### Frontend (`/footsteps-web/`)
- **Next.js 15** - React framework with App Router
- **DeckGL** - WebGL-powered data visualization
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling

### Data Pipeline (`/footstep-generator/`)
- **Python Pipeline** - HYDE → settlement points with hierarchical LODs
- **Tiles-only Output** - Per-year MBTiles generated via tippecanoe (temporary GeoJSONL only)
- **Tools** - tippecanoe, tile-join, and optional sqlite3 CLI for verification

### Key Components
- `components/footsteps/FootstepsViz.tsx` - Main visualization (2D/3D views, tiles integration)
- `lib/tilesService.ts` - Tile file resolution and optional GCS access
- `app/api/tiles/[year]/single/[z]/[x]/[y]/route.ts` - Tile API serving per-year MBTiles (`humans_{year}.mbtiles`, layer id `humans`)

### Tile Serving & APIs

* __Routes__
  - `GET /api/tiles/{year}/single/{z}/{x}/{y}.pbf`
    - Serves combined yearly MBTiles (`humans_{year}.mbtiles`) with single layer id `humans`.

* __Tile files__
  - Combined, single-layer per year: `humans_{year}.mbtiles`
  - Optional per-LOD artifacts (internal, not served): `humans_{year}_lod_{lod}.mbtiles` (lod ∈ {0,1,2,3})

* __Frontend integration__
  - MVT requests use `/api/tiles/{year}/single/{z}/{x}/{y}.pbf` and expect layer id `humans`.

* __Environment__
  - Dev/local: tiles resolved from `HUMANS_TILES_DIR` (default: `../data/tiles/humans` relative to `footsteps-web/` runtime).
  - Prod/GCS: set `NODE_ENV=production`, `GCP_PROJECT_ID`, `GCS_TILES_BUCKET` to serve from Google Cloud Storage.
  - Tile cache dir (GCS only): `TILE_CACHE_DIR` (default `/tmp/humans-tiles-cache`) for downloaded `.mbtiles` reuse.

* __Caching__
  - Strong caching with ETag/Last-Modified, immutable 1y cache for hits; automatic gzip detection for tiles.

## 🛠️ Development

### Project Structure

```
deep-footsteps/
├── footsteps-web/                # Next.js frontend application
│   ├── app/                      # App Router pages + API
│   ├── components/               # React components (viz, overlays, views)
│   ├── lib/                      # Utilities and hooks
│   └── public/                   # Static assets
├── footstep-generator/           # Python data pipeline
│   ├── data/                     # Local data roots for scripts
│   │   └── raw/hyde-3.5/         # HYDE ASCII grids (popd_*.asc)
│   └── tests/                    # pytest suites
├── data/                         # Generated artifacts (git-ignored)
│   └── tiles/humans/             # Output .mbtiles
└── docs/                         # Documentation
```

### Data + Tiles Workflow

1. Place HYDE ASCII grids (`popd_*.asc`) in `footstep-generator/data/raw/hyde-3.5/`
2. Build tiles (single-layer, population‑preserving LOD windows):
   - All years found: `poetry run python footstep-generator/make_tiles.py --single-layer --verify --strict`
   - Specific years: `poetry run python footstep-generator/make_tiles.py --years -1000 0 1500 2020 --single-layer --verify --strict`
   - Outputs:
     - `data/tiles/humans/humans_{year}.mbtiles` (single-layer, used by frontend)
     - `data/tiles/humans/humans_{year}_lod_{lod}.mbtiles` (optional per-LOD artifacts, internal/debug)
3. Dev serving: export `HUMANS_TILES_DIR=$(pwd)/data/tiles/humans` before running the frontend
4. Tile API: `/api/tiles/{year}/single/{z}/{x}/{y}.pbf` (layer id `humans`)

#### LOD System

- Zoom < 2 → LOD 0 (Regional)
- Zoom < 4 → LOD 1 (Subregional)
- Zoom < 6 → LOD 2 (Local)
- Zoom ≥ 6 → LOD 3 (Detailed)

Single-layer tiles use non-overlapping zoom windows per LOD so only one LOD is visible at any zoom. Source of truth: `footstep-generator/lod_config.py` → auto-generated into `footsteps-web/lib/lod.ts`.

### Processing Historical Data

**⚠️ Required:** The application requires historical datasets to function. You must download and process data before running the visualization.

### Step 1: Download Datasets

Download data manually:

1. **HYDE 3.5 Population Density**:
   - Visit: https://pbl.nl/en/hyde
   - Navigate to 'Download' section  
   - Choose one scenario: **Baseline** (recommended), Lower, or Upper estimate
   - Download the `\zip` directory containing population files
   - Look for files like: `10000BC_pop.zip`, `1950AD_pop.zip`, etc.
   - Extract all `popd_*.asc` files (population density ASCII grids)
   - Place all `.asc` files in: `footstep-generator/data/raw/hyde-3.5/`

2. **Reba Urban Gazetteer**:
   - Visit: https://sedac.ciesin.columbia.edu/data/set/historical-urban-population-3700-bc-ad-2000
   - Register for free account if needed
   - Download CSV file
   - Extract to: `data/raw/hup_cities/`

### Step 2: Process Data

```bash
poetry run python footstep-generator/process_hyde.py
poetry run python footstep-generator/make_tiles.py
```

## 🎨 Customization

### Styling
- Modify `globals.css` for theme changes
- Adjust visualization styling in `components/footsteps` layers and views

### Data Visualization
- Adjust dot/radius strategies in `components/footsteps/layers`
- Tweak LOD behavior via `lib/lod` and pipeline configs in `footstep-generator`

### Time Scaling
- Update time interaction components/hooks if present to change breakpoints

## 🚀 Deployment

### Server Hosting
```bash
cd footsteps-web
pnpm build
pnpm start
```

### Tiles in Production
- Local files: set `HUMANS_TILES_DIR=/path/to/data/tiles/humans` in the runtime env
- GCS hosting (optional): set `NODE_ENV=production`, `GCP_PROJECT_ID`, and `GCS_TILES_BUCKET` to stream tiles from GCS
- Optional cache dir for GCS downloads: `TILE_CACHE_DIR` (default `/tmp/humans-tiles-cache`)


## 🙏 Acknowledgments

- **HYDE 3.5 Team** - Historical population density data
- **Reba et al.** - Urban settlement historical records
- **DeckGL Team** - Incredible WebGL visualization framework
- **Next.js Team** - React framework powering the frontend
