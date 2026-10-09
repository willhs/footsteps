# CLAUDE.md - Footstep Tile Generator

This file provides guidance to Claude Code when working with the tile generation pipeline in the footstep-generator directory.

## Overview
The footstep-generator is a Python-based, tiles-only pipeline that converts HYDE 3.5 demographic grid data into production-ready vector tiles (MBTiles with MVT) for the Footsteps of Time project. All processing is performed in-memory with hierarchical Level-of-Detail (LOD) optimization for efficient web serving.

## Key Components
- **models.py**: Pydantic V2 models for data validation and type safety
- **hyde_tile_processor.py**: Converts HYDE ASC grids to hierarchical tile data with LODs
- **tile_generator.py**: Builds production MBTiles via tippecanoe with population preservation
- **generate_footstep_tiles.py**: Combined CLI for the complete tile generation pipeline
- **lod_processor.py**: Level-of-Detail system for hierarchical aggregation and validation
- **tests/**: Comprehensive test suite for tile generation validation

## Commands
### Complete Tile Generation Workflow
```bash
# Single-command tile generation (recommended)
python generate_footstep_tiles.py --raw-dir data/raw/hyde-3.5 --tiles-dir data/tiles/humans
```

### Legacy Individual Commands (for testing/debugging)
```bash
# Step 1: Generate LOD data from HYDE grids
python hyde_tile_processor.py

# Step 2: Build MBTiles from LOD data  
python tile_generator.py --raw-dir data/raw/hyde-3.5 --tiles-dir data/tiles/humans
```

### Tile Generation Options
- **Generate all available years**: `python generate_footstep_tiles.py`
- **Generate specific years**: `python generate_footstep_tiles.py --years 1000 1500 1600`
- **Force rebuild existing tiles**: `python generate_footstep_tiles.py --force`
- **Skip single-layer output**: `python generate_footstep_tiles.py --no-single-layer`
- **Enable verification**: `python generate_footstep_tiles.py --verify --strict`

### Testing & Dependencies  
- **Run basic tests**: `python tests/test_basic.py`
- **Run full test suite**: `pytest tests/ -v`
- **Run integration tests**: `python tests/test_integration.py`
- **Install dependencies**: `pip install -r requirements.txt` (or use Poetry: `poetry install`)

## Architecture

### Tile Generation Flow
1. **Input**: HYDE 3.5 ASC grid files with population density data
2. **Grid Processing**: Convert demographic grids to tile-ready settlement points
3. **LOD Generation**: Create hierarchical aggregation for multiple zoom levels (population-preserving)
4. **Vector Tile Building**: Generate temporary GeoJSONL and run tippecanoe to build MBTiles
5. **Output**: Production-ready yearly MBTiles optimized for web serving

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

### What the Tests Validate
- **Pydantic V2 models**: Data validation, type safety, coordinate bounds checking
- **Hierarchical LOD system**: Population conservation, spatial aggregation, zoom-level mapping
- **Tile generation pipeline**: ASC file parsing, settlement point creation, vector tile building
- **Performance optimizations**: Memory-efficient processing, density-aware placement

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
- **Single-pass processing**: `generate_footstep_tiles.py` does full pipeline without duplicate work
- **Incremental processing**: Skips existing yearly MBTiles unless `--force` flag is used
- Use `--force` flag only when you need to rebuild existing tiles

## Dependencies
- **pydantic**: Data validation and modeling
- **numpy**: Numerical processing
- **pytest**: Testing framework
- **tippecanoe**: Vector tile generation (external binary)
- **Standard library**: File I/O, compression, logging
