This file provides guidance to AI agents when working with code in this repository.


# Footsteps of Time

## Project Overview
A living atlas that lets anyone scrub through 100,000 BCE → today and watch humanity spread, cluster, and explode into cities on a single, elegant globe.

## Vision
Make the vast sweep of human presence instantly graspable by turning dry demographic tables into a visceral, time-lapse journey.

## Principles
Balance simple + elegant with telling a rich story about human history.

Tell a new story about human history, emphasise something based on modern data if possible, probably around the positions and perhaps other behaviour of humans that can be recorded or estimated through history.

Follow principles of the The Visual Display of Quantitative Information by Edward Tufte such as "data ink" where we only use ink or in this case pixels to show data, a "duck" which where the aesthetic overpowers telling a real story, and "chartjunk" which is any decoration that doesn't serve the purpose of communicating data.

## Core Experience
1. Land on a globe showing faint clusters at -100k
2. Drag the slider forward or back or click to scrub through time to see human presence grow and shrink, cities bloom and shrink, and clusters form and dissolve.

## MVP Tech Stack (v0.1)
- **Frontend**: Next.js + Deck.gl heat shader, RC-Slider control, basic tooltip
- **Backend**: Static file hosting; mbtiles served locally during dev
- **Data**: HYDE grids (every 1k yr to 1 CE, 100 yr 1-1800, 10 yr 1800-2020) + Reba cities

## Key Features
- Interactive globe + non-linear time slider (ideally 100k BCE → 2025 CE)

## Target Audience
- Regular people who may be interested in history or anthropology
- History & data-viz enthusiasts
- High-school & university educators

## Differentiators
- Focus on showing the spread of humans, not just civilisation or cities
- Full 100k year span (vs mostly last 12k years)
- Perhaps: Fog-of-history layer showing data gaps

## Architecture

### Frontend (footsteps-web/)
- **Next.js 15** with App Router for the web application
- **Deck.gl** for high-performance 3D globe rendering and data visualization layers
- **TypeScript** for type safety throughout the frontend
- **Tailwind CSS** for styling with efficient utility classes

### Key Components Architecture
- **components/footsteps/FootstepsViz.tsx**: Main visualization component managing 3D globe, data loading, and user interactions
- **components/footsteps/layers/**: Layer creation utilities
  - `backgroundLayers.ts`: `createBasemapLayer()`, `createStaticTerrainLayer()`, etc.
  - `humanLayer.ts`: `createHumanTilesLayer()` (deck.gl `MVTLayer` for vector tiles)
  - `index.ts`: Exports all layer functions
- **components/ui/TimeSlider.tsx**: Time navigation component
- **app/api/tiles/[year]/single/[z]/[x]/[y]/route.ts**: Tile API serving MVT from per-year MBTiles

### Data Pipeline (footstep-generator/)
- **Python-based processing pipeline** converting HYDE 3.5 demographic data to tiles
- **LOD Processor** implements hierarchical Level-of-Detail system for performance
- **Output**: Per-LOD and combined yearly MBTiles with MVT points (`data/tiles/humans/`)

### LOD (Level of Detail) System
The application implements a four‑tier LOD system for performance at different zoom levels:
- **LOD 0 – Regional** (zoom < 4): Coarse clusters for fast world/regional overview
- **LOD 1 – Subregional** (4 ≤ zoom < 5): Mid‑detail clusters for country/province scale
- **LOD 2 – Local** (5 ≤ zoom < 6): High detail for sub‑province/county scale
- **LOD 3 – Detailed** (zoom ≥ 6): Full resolution data

### API Design
- **Automatic LOD Selection**: Server automatically serves appropriate LOD level based on zoom parameter
- **Aggressive Caching**: ETag-based HTTP caching with 24-hour cache headers
- **Gzip Compression**: All API responses compressed for faster loading
- **Frontend Caching**: Map-based cache prevents duplicate API requests

### Data Flow
1. **Raw Data**: HYDE 3.5 ASC grid files with population density
2. **Processing**: Python pipeline converts grids to GeoJSON points with population attributes
3. **LOD Generation**: Hierarchical aggregation creates multiple detail levels
4. **API Serving**: Next.js API routes serve data with zoom-aware LOD selection
5. **Visualization**: Deck.gl renders dots as MVTLayer with population-based sizing

## Commands
- **Development**: `cd footsteps-web && pnpm dev` → http://localhost:4444
- **Data Processing**: `cd footstep-generator && python generate_footstep_tiles.py`
- **Build**: `pnpm build`
- **Test**: `pnpm test`
- **Lint**: `pnpm lint`

### Data Deployment Commands
- **Full local data deployment**: `cd iac/scripts && ./deploy-data-local.sh`
- **Deploy data via GitHub Actions**: Go to Actions → "Deploy Data to GCS" → Run workflow
- **Upload MBTiles to GCS**: `cd iac/scripts && ./upload-data.sh`
- **Preview MBTiles upload**: `cd iac/scripts && ./upload-data.sh --dry-run`

### Deployment Diagnostics
- **Debug deployment issues**: `cd iac/scripts && ./debug-deploy.sh`
  - Comprehensive deployment health check
  - Validates terraform configuration
  - Checks Cloud Run service status
  - Reviews recent deployment logs
  - Tests API endpoints
  - Suggests automated fixes

## Testing
### Data Processing Pipeline Tests
All tests are located in `footstep-generator/tests/` directory:

- **Basic functionality test** (no dependencies): `python tests/test_basic.py`
- **Full e2e test suite** (requires pytest): `pip install pytest && pytest tests/test_e2e.py -v`
- **Integration test**: `python tests/test_integration.py` (tests complete workflow with mocked data)
- **Run all tests**: `python tests/test_basic.py && pytest tests/test_e2e.py -q && python tests/test_integration.py`
- **Run pytest discovery**: `pytest tests/ -v` (runs all pytest-compatible tests)

### What the Tests Validate
- **Pydantic V2 models**: Data validation, type safety, coordinate bounds checking
- **Hierarchical LOD system**: Population conservation, spatial aggregation, zoom-level mapping
- **Data processing pipeline**: ASC file parsing, dot creation, file I/O, error handling
- **Performance optimizations**: Density-aware dot creation, memory usage estimation

### Manual testing on the front-end
Use your playwright tool. The app should be running at e.g. port 4444. Ask the user for help if needed

## GitHub Workflows

### 1. CI Workflow (Automated Quality Checks)

**Trigger**: Automatic on every push and pull request

**What it does**:
- **Frontend**: Lint, type check, test, and build Next.js app in `footsteps-web/`
- **Python**: Run test suite in `footstep-generator/` using Poetry and pytest
- **Terraform**: Validate and format check all infrastructure code in `iac/`
- **Tiles Availability**: Probe GCS for sample tile data (main branch only)

**Key Features**:
- Runs on all branches and PRs for comprehensive validation
- Caches dependencies (pnpm, Poetry, Terraform) for faster builds
- Archives build artifacts for potential use by deploy workflow
- Must pass before deployment can proceed

### 2. Deploy Workflow (Application Deployment)

**Trigger**: Automatic after successful CI on main branch, or manual dispatch

**What it does**:
1. **Build**: Creates Docker image of Next.js app with production environment variables
2. **Infrastructure**: Applies Terraform configuration for Cloud Run, GCS, Cloudflare
3. **Deploy**: Pushes image to Google Container Registry and deploys to Cloud Run
4. **Verify**: Performs health checks and provides deployment summary

**Key Features**:
- Zero-downtime deployments with health checks
- Automatic scaling (0-100 instances) based on traffic
- Integrates with Cloudflare CDN for tile serving
- Comprehensive deployment summary with URLs and status

**Manual Triggers**:
- Push to main branch (after CI passes)
- Manual dispatch via GitHub Actions UI
- Workflow dispatch from other workflows

## Data Deployment Workflows

The project supports two main workflows for deploying newly generated data to production:

### 1. GitHub Actions Workflow (Recommended for Production)

**Trigger**: Manual dispatch via GitHub Actions UI or API

**Usage**:
1. Go to GitHub Actions → "Deploy Data to GCS" 
2. Click "Run workflow"
3. Configure options:
   - **Dry run**: Preview upload without actually uploading
   - **Force upload**: Re-upload all files (skip existing file checks)
   - **Redeploy app**: Trigger app redeployment after data upload

**Benefits**:
- ✅ Uses secure GitHub-managed authentication
- ✅ Full audit trail and logging
- ✅ Can trigger app redeployment automatically
- ✅ Supports dry-run testing

### 2. Local CLI Workflow (Fast Development)

**Usage**: `cd iac/scripts && ./deploy-data-local.sh [options]`

**Key Options**:
- `--skip-processing`: Only upload existing files (don't regenerate data)
- `--skip-upload`: Only process data locally (don't upload)
- `--dry-run`: Preview what would be uploaded
- `--force`: Force re-upload all files
- `--deploy`: Trigger app redeployment after upload
- `--bucket NAME`: Upload to custom bucket

**Example Workflows**:
```bash
# Full workflow: process + upload
./deploy-data-local.sh

# Quick upload of existing data
./deploy-data-local.sh --skip-processing

# Test run without actual upload
./deploy-data-local.sh --dry-run

# Force complete refresh and redeploy
./deploy-data-local.sh --force --deploy
```

**Benefits**:
- ✅ Fast iteration during development
- ✅ Full control over each step
- ✅ Works offline for data processing
- ✅ Integrated with existing data pipeline

### Data Pipeline Overview

1. **Generate Data**: `cd footstep-generator && python generate_footstep_tiles.py`
2. **Upload to GCS**: MBTiles files → `gs://footsteps-earth-tiles/`
3. **Deploy App**: Cloud Run pulls tiles from GCS bucket via API routes
4. **Verify**: Check tiles API endpoint and frontend rendering

### Prerequisites

- **Python environment**: Set up in `footstep-generator/` with required dependencies
- **HYDE data**: Downloaded in `data/raw/hyde-3.5/` 
- **GCS authentication**: Either via `gcloud auth login` (local) or GitHub OIDC (Actions)
- **Generated tiles**: MBTiles files in `data/tiles/humans/` directory
