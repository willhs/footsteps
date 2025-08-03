# 🌍 Globe of Humans

**A living atlas of human presence on Earth from 100,000 BCE to 2025 CE**

Watch humanity spread, cluster, and explode into cities on an interactive 3D globe. Experience the vast sweep of human history as a visceral time-lapse journey from the first settlements to modern megacities.

![Globe of Humans Demo](docs/demo-screenshot.png)

## 🎯 Vision

Transform dry demographic data into an intuitive, time-scrubbing experience that makes 100,000 years of human presence instantly graspable. See individual dots representing humans and settlements emerge, grow, and spread across continents as you drag through time.

## ✨ Features

- **🌐 Interactive 3D Globe** - Navigate and explore with full pan/zoom/rotate controls
- **⏰ Time Travel** - Non-linear slider covering 100,000 BCE → 2025 CE with historical breakpoints
- **👥 Human Dots** - Individual points representing settlements and populations
- **🔥 Heat-Map** - Population density visualization showing regional concentrations
- **📊 Real-time Filtering** - Dots appear/disappear based on historical timeline
- **⚡ Performance** - Efficient rendering of millions of data points

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm (recommended) or npm  
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

# Start the development server
cd humans-globe-viz && pnpm dev
```

#### Manual Setup

```bash
# Clone the repository
git clone <repository-url>
cd deep-footsteps

# Install Python dependencies with Poetry
poetry install --only main

# Install frontend dependencies
cd humans-globe-viz
pnpm install

# Generate sample data using Poetry scripts
cd ..
poetry run process-hyde         # Generate population density data
poetry run process-cities       # Generate human dots data

# Start the development server
cd humans-globe-viz
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎮 How to Use

1. **Navigate the Globe** - Click and drag to rotate, scroll to zoom
2. **Time Travel** - Use the slider at the bottom to scrub through history

### Time Periods

- **100k-10k BCE**: We don't have this yet, but want to
- **10k-1k BCE**: Agricultural revolution, first cities emerge
- **1k BCE-1k CE**: Classical civilizations, trade networks
- **1k-1500 CE**: Medieval growth, exploration

## 📊 Data Sources

- **Population Density**: HYDE 3.3 Database (History Database of the Global Environment)
- **Urban Settlements**: Reba et al. Historical Urban Population Dataset
- **Sample Data**: Algorithmically generated for MVP demonstration

## 🏗️ Architecture

### Frontend (`/humans-globe-viz/`)
- **Next.js 15** - React framework with App Router
- **DeckGL** - WebGL-powered data visualization
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling

### Data Pipeline (`/data/`)
- **Python Scripts** - Data fetching and processing
- **GeoPandas** - Geospatial data manipulation
- **Vector Tiles** - Efficient data delivery (future enhancement)

### Key Components
- `Globe.tsx` - Main 3D visualization with DeckGL layers
- `TimeSlider.tsx` - Non-linear time control interface
- `useYear.ts` - State management for temporal navigation

## 🛠️ Development

### Project Structure

```
deep-footsteps/
├── humans-globe-viz/              # Next.js frontend application
│   ├── app/                   # App Router pages
│   ├── components/            # React components
│   ├── lib/                   # Utilities and hooks
│   └── public/                # Static assets
├── data/                      # Data processing pipeline
│   ├── raw/                   # Downloaded datasets
│   ├── processed/             # Processed GeoJSON files
│   └── scripts/               # Python processing scripts
└── docs/                      # Documentation
```

### Data Processing Workflow

1. **Fetch Data** - `poetry run fetch-data` downloads HYDE and Reba datasets
2. **Process Density** - `poetry run process-hyde` converts grids to heat-map polygons
3. **Generate Dots** - `poetry run process-cities` creates individual human points
4. **Create Tiles** - `poetry run make-tiles` generates vector tiles (optional)

### Processing Historical Data

**⚠️ Required:** The application requires historical datasets to function. You must download and process data before running the visualization.

### Step 1: Download Datasets

First, try the automated download:
```bash
poetry run fetch-data
```

**If automated download fails** (common due to website restrictions), download manually:

1. **HYDE 3.3 Population Density**:
   - Visit: https://pbl.nl/en/hyde
   - Navigate to 'Download' section  
   - Choose one scenario: **Baseline** (recommended), Lower, or Upper estimate
   - Download the `\zip` directory containing population files
   - Look for files like: `10000BC_pop.zip`, `1950AD_pop.zip`, etc.
   - Extract all `popd_*.asc` files (population density ASCII grids)
   - Place all `.asc` files in: `data/raw/hyde_popd/`

2. **Reba Urban Gazetteer**:
   - Visit: https://sedac.ciesin.columbia.edu/data/set/historical-urban-population-3700-bc-ad-2000
   - Register for free account if needed
   - Download CSV file
   - Extract to: `data/raw/hup_cities/`

### Step 2: Process Data

```bash
poetry run process-hyde         # Creates population heat-map
poetry run process-cities       # Creates human settlement dots
```

## 🎨 Customization

### Styling
- Modify `globals.css` for theme changes
- Update color scales in `Globe.tsx` for different heat-map colors
- Adjust slider styling in `TimeSlider.tsx`

### Data Visualization
- Change dot sizes by modifying `getRadius` in the ScatterplotLayer
- Adjust population density thresholds in data processing scripts
- Add new data layers by extending the DeckGL configuration

### Time Scaling
- Modify `TIME_BREAKPOINTS` in `useYear.ts` for different historical emphasis
- Add more granular time periods or different scaling functions

## 🚀 Deployment

### Static Hosting (Recommended)
```bash
cd humans-globe-viz
pnpm build
pnpm start
```

Deploy the `out/` directory to Vercel, Netlify, or any static host.

### With Tile Server
For large datasets, deploy with a tile server:
```bash
docker run -p 8080:80 -v $(pwd)/data/processed:/data maptiler/tileserver-gl
```


## 🙏 Acknowledgments

- **HYDE 3.3 Team** - Historical population density data
- **Reba et al.** - Urban settlement historical records
- **DeckGL Team** - Incredible WebGL visualization framework
- **Next.js Team** - React framework powering the frontend
