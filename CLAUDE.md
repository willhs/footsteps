# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@docs/one-pager.md

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

### Frontend (humans-globe/)
- **Next.js 15** with App Router for the web application
- **Deck.gl** for high-performance 3D globe rendering and data visualization layers
- **TypeScript** for type safety throughout the frontend
- **Tailwind CSS** for styling with efficient utility classes

### Key Components Architecture
- **FootstepsViz.tsx**: Main visualization component managing 3D globe, data loading, and user interactions
- **components/globe/**: Modular globe system with separate concerns:
  - `layers.ts`: Layer creation utilities for basemap and human dots
  - `HumanDotsLayer.tsx`: Population dot rendering with LOD support
  - `BasemapLayer.tsx`: World geography rendering
  - `Overlays.tsx`: UI overlays for data info and controls
- **TimeSlider.tsx**: Time navigation component for scrubbing through history
- **app/api/human-dots/route.ts**: API endpoint serving processed population data with smart LOD selection

### Data Pipeline (footstep-generator/)
- **Python-based processing pipeline** converting HYDE 3.5 demographic data to visualization-ready formats
- **Pydantic V2 models** (`models.py`) for robust data validation and type safety
- **LOD Processor** (`lod_processor.py`) implementing hierarchical Level-of-Detail system for performance
- **Multi-format output**: NDJSON.gz files optimized for streaming and caching

### LOD (Level of Detail) System
The application implements a sophisticated LOD system for performance at different zoom levels:
- **LOD 0** (Global, zoom < 2): Highly aggregated dots for world overview
- **LOD 1** (Regional, zoom < 4): Regional clustering 
- **LOD 2** (Local, zoom < 6): Local detail
- **LOD 3** (Detailed, zoom ≥ 6): Full resolution data

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
5. **Visualization**: Deck.gl renders dots as ScatterplotLayer with population-based sizing

## Commands
- **Development**: `cd humans-globe && pnpm dev` → http://localhost:4444
- **Data Processing**: `cd footstep-generator && python process_hyde.py`
- **Data Processing (with LODs)**: `cd footstep-generator && python process_hyde.py --with-lods`
- **Build**: `pnpm build`
- **Test**: `pnpm test`
- **Lint**: `pnpm lint`

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

