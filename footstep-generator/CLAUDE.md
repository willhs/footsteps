# CLAUDE.md - Footstep Generator

This file provides guidance to Claude Code when working with the data processing pipeline in the footstep-generator directory.

## Overview
The footstep-generator is a Python-based, tiles-only pipeline that converts HYDE 3.5 demographic grid data into vector tiles (MBTiles with MVT) for the Footsteps of Time project. Processing is performed in-memory; no NDJSON intermediates are written.

## Key Components
- **models.py**: Pydantic V2 models for data validation and type safety
- **process_hyde.py**: Reads HYDE ASC grids → produces in-memory settlement points and hierarchical LOD data
- **lod_processor.py**: Level-of-Detail system for hierarchical aggregation and validation
- **make_tiles.py**: Builds per‑LOD MBTiles via tippecanoe and combines into yearly MBTiles
- **tests/**: Comprehensive test suite for validation

## Commands
- **Compute LOD data (incremental)**: `python process_hyde.py`
- **Compute LOD data (force)**: `python process_hyde.py --force`
- **Generate tiles**: `python make_tiles.py --raw-dir data/raw/hyde-3.5 --tiles-dir data/tiles/humans --years 1000 1500 1600`
- **Run basic tests**: `python tests/test_basic.py`
- **Run full test suite**: `pytest tests/ -v`
- **Run integration tests**: `python tests/test_integration.py`
- **Install dependencies**: `pip install -r requirements.txt` (or use Poetry: `poetry install`)

## Architecture

### Data Flow
1. **Input**: HYDE 3.5 ASC grid files with population density data
2. **Processing**: Convert grids to in-memory settlement points with population attributes
3. **LOD Generation**: Create hierarchical aggregation for multiple zoom levels (population-preserving)
4. **Tile Building**: Write temporary GeoJSONL per LOD and run tippecanoe to build per‑LOD MBTiles
5. **Output**: Combined yearly MBTiles (and per‑LOD MBTiles if desired)

### LOD System
- **LOD 0 – Regional** (zoom < 4): Coarse clusters for world/regional overview
- **LOD 1 – Subregional** (4 ≤ zoom < 5): Mid‑detail clusters for country/province scale  
- **LOD 2 – Local** (5 ≤ zoom < 6): High detail for sub‑province/county scale
- **LOD 3 – Detailed** (zoom ≥ 6): Full resolution data

### Data Models
All data structures use Pydantic V2 for validation:
- **HumanSettlement**: Individual settlement point with coordinates and population
- **AggregatedSettlement**: Population aggregated into LOD grid cells with metadata
- **ProcessingResult**: Per‑year result containing LOD data and statistics
- **LODLevel**: Enum for each level of detail

## Testing Strategy
- **Unit tests**: Individual component validation
- **Integration tests**: End-to-end workflow testing with mocked data
- **E2E tests**: Full pipeline testing (requires pytest)
- **Performance tests**: Memory usage and processing time validation

## File Structure
```
data/
├── raw/hyde-3.5/            # Raw HYDE ASC files
└── tiles/humans/            # Generated MBTiles (per‑LOD and combined per‑year)
```

## Performance Considerations
- Use density-aware placement for sparse eras; preserve totals via hierarchical aggregation
- Tippecanoe flags: no feature/tile-size limits; per‑LOD layer naming; combine per‑LOD into yearly MBTiles
- Memory-efficient processing for large datasets; temporary GeoJSONL only
- **Incremental processing**: `process_hyde.py` computes LODs; `make_tiles.py` skips existing yearly MBTiles unless `--force`
- Use `--force` flag only when you need to rebuild existing tiles

## Dependencies
- **pydantic**: Data validation and modeling
- **numpy**: Numerical processing
- **pytest**: Testing framework
- **Standard library**: File I/O, compression, logging
