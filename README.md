# 🌍 Globe of Humans

**A living atlas of human presence on Earth from 100,000 BCE to 2025 CE**

Watch humanity spread, cluster, and explode into cities on an interactive 3D globe. Experience the vast sweep of human history as a visceral time-lapse journey from the first settlements to modern megacities.

![Globe of Humans Demo](docs/demo-screenshot.png)

## 🎯 Vision

Transform dry demographic data into an intuitive, time-scrubbing experience that makes 100,000 years of human presence instantly graspable. See individual dots representing humans and settlements emerge, grow, and spread across continents as you drag through time.

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

#### Installing Poetry

```bash
# macOS/Linux
curl -sSL https://install.python-poetry.org | python3 -

# Windows (PowerShell)
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -

# Alternative: via pip
pip install poetry
```

### Installation

#### Automated Setup (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd deep-footsteps

# Run the automated setup script
./setup.sh

# Start the development server (port 4444)
cd humans-globe && pnpm dev
```

#### Manual Setup

```bash
# Clone the repository
git clone <repository-url>
cd deep-footsteps

# Install Python dependencies with Poetry
poetry install

# Install frontend dependencies
cd humans-globe
pnpm install

# Generate data and tiles
cd ..
poetry run python footstep-generator/fetch_data.py      # Optional: download datasets
poetry run python footstep-generator/process_hyde.py    # Compute population-preserving LODs
poetry run python footstep-generator/make_tiles.py      # Build MBTiles (tiles-only)

# Start the development server
cd humans-globe
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

### Frontend (`/humans-globe/`)
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

## 🛠️ Development

### Project Structure

```
deep-footsteps/
├── humans-globe/                 # Next.js frontend application
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
2. Build tiles (tiles-only, population-preserving LODs):
   - All years found: `poetry run python footstep-generator/make_tiles.py`
   - Specific years: `poetry run python footstep-generator/make_tiles.py --years -1000 0 1500 2020`
3. Dev serving: export `HUMANS_TILES_DIR=$(pwd)/data/tiles/humans` before running the frontend
4. Tile API: `/api/tiles/{year}/{lod}/{z}/{x}/{y}.pbf`

### Processing Historical Data

**⚠️ Required:** The application requires historical datasets to function. You must download and process data before running the visualization.

### Step 1: Download Datasets

First, try the automated download:
```bash
poetry run fetch-data
```

**If automated download fails** (common due to website restrictions), download manually:

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
cd humans-globe
pnpm build
pnpm start
```

### Tiles in Production
- Local files: set `HUMANS_TILES_DIR=/path/to/data/tiles/humans` in the runtime env
- GCS hosting (optional): set `NODE_ENV=production`, `GCP_PROJECT_ID`, and `GCS_BUCKET_NAME` to stream tiles from GCS


## 🙏 Acknowledgments

- **HYDE 3.5 Team** - Historical population density data
- **Reba et al.** - Urban settlement historical records
- **DeckGL Team** - Incredible WebGL visualization framework
- **Next.js Team** - React framework powering the frontend
