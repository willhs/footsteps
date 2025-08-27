# Footstep Generator

Data processing pipeline for converting HYDE 3.5 demographic data into visualization-ready formats for the Footsteps of Time project.

## Overview

This Python-based pipeline processes historical population density data from the HYDE 3.5 dataset, converting ASCII grid files into optimized GeoJSON points with hierarchical Level-of-Detail (LOD) support for efficient globe visualization.

## Key Features

- **Pydantic V2 models** for robust data validation and type safety
- **Hierarchical LOD system** for performance optimization at different zoom levels
- **Geodesic cell area calculations** using `pyproj.Geod` (WGS84) for accurate population totals
- **Tiles-only output**: MBTiles (MVT) generated with tippecanoe from in‑memory LOD data (temporary GeoJSONL only during build)
- **Comprehensive test suite** ensuring data integrity and performance

## Architecture

### Core Components

- **`models.py`**: Pydantic V2 models for data validation and type safety
- **`lod_processor.py`**: Hierarchical Level-of-Detail system implementation
- **`hyde_tile_processor.py`**: HYDE grid to tile data conversion with LODs
- **`tile_generator.py`**: Vector tile generation via tippecanoe
- **`generate_footstep_tiles.py`**: Complete tile generation pipeline (recommended)
- **`process_cities.py`**: City data processing utilities
- **`settlement_registry.py`**: Settlement tracking and continuity management

### LOD (Level of Detail) System

The pipeline implements a four‑tier LOD system for performance at different zoom levels:

- **LOD 0 – Regional** (zoom < 4): Coarse clusters for world/regional overview
- **LOD 1 – Subregional** (4 ≤ zoom < 5): Mid‑detail clusters for country/province scale
- **LOD 2 – Local** (5 ≤ zoom < 6): High detail for sub‑province/county scale
- **LOD 3 – Detailed** (zoom ≥ 6): Full resolution data

## Commands

### Tile Generation
```bash
python generate_footstep_tiles.py
```
*Complete tile generation pipeline with hierarchical LOD system for population preservation*

### Data Requirements
Ensure HYDE 3.5 data files (popd_*.asc) are available in `data/raw/hyde-3.5/`

## Testing

### Quick Test (No Dependencies)
```bash
python tests/test_basic.py
```

### Full Test Suite (Requires pytest)
```bash
pip install pytest
pytest tests/test_e2e.py -v
```

### Integration Test
```bash
python tests/test_integration.py
```

### Run All Tests
```bash
python tests/test_basic.py && pytest tests/test_e2e.py -q && python tests/test_integration.py
```

### Test Discovery (All pytest-compatible tests)
```bash
pytest tests/ -v
```

## What the Tests Validate

- **Pydantic V2 models**: Data validation, type safety, coordinate bounds checking
- **Hierarchical LOD system**: Population conservation, spatial aggregation, zoom-level mapping
- **Data processing pipeline**: ASC file parsing, settlement point creation, file I/O, error handling
- **Performance optimizations**: Density-aware placement, memory usage estimation

## Data Flow

1. **Raw Data**: HYDE 3.5 ASC grid files with population density
2. **Processing**: Python pipeline converts grids to GeoJSON points with population attributes
3. **LOD Generation**: Hierarchical aggregation creates multiple detail levels
4. **Tiles**: Single‑layer MBTiles per year for vector tile serving (MVT)

## Target Years

The pipeline processes data for strategic historical periods:

- **Deep Prehistory**: Every millennium (-10000 to -1000 BCE)
- **Classical Period**: Every century (0 to 900 CE)
- **Medieval Period**: Every century (1000 to 1500 CE)

## Output Format

Generated artifacts:
- `humans_{year}.mbtiles` — Single yearly tileset (layer id `humans`) with per‑feature minzoom windows mapping zoom→LOD
- Tippecanoe builds tiles from temporary GeoJSONL; no intermediate artifacts are persisted
