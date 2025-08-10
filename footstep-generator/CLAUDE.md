# CLAUDE.md - Footstep Generator

This file provides guidance to Claude Code when working with the data processing pipeline in the footstep-generator directory.

## Overview
The footstep-generator is a Python-based data processing pipeline that converts HYDE 3.5 demographic grid data into visualization-ready formats for the Footsteps of Time project.

## Key Components
- **models.py**: Pydantic V2 models for data validation and type safety
- **process_hyde.py**: Main processing script that converts ASC grid files to GeoJSON points
- **lod_processor.py**: Level-of-Detail system for hierarchical data aggregation
- **tests/**: Comprehensive test suite for validation

## Commands
- **Data processing**: `python process_hyde.py` (uses hierarchical LOD processing by default)
- **Run basic tests**: `python tests/test_basic.py`
- **Run full test suite**: `pytest tests/ -v`
- **Run integration tests**: `python tests/test_integration.py`
- **Install dependencies**: `pip install -r requirements.txt` (or use Poetry: `poetry install`)

## Architecture

### Data Flow
1. **Input**: HYDE 3.5 ASC grid files with population density data
2. **Processing**: Convert grids to GeoJSON points with population attributes
3. **LOD Generation**: Create hierarchical aggregation for multiple zoom levels
4. **Output**: NDJSON.gz files optimized for web serving

### LOD System
- **LOD 0 – Regional** (zoom < 4): Coarse clusters for world/regional overview
- **LOD 1 – Subregional** (4 ≤ zoom < 5): Mid‑detail clusters for country/province scale  
- **LOD 2 – Local** (5 ≤ zoom < 6): High detail for sub‑province/county scale
- **LOD 3 – Detailed** (zoom ≥ 6): Full resolution data

### Data Models
All data structures use Pydantic V2 for validation:
- **HumanDot**: Individual population point with coordinates and population
- **ProcessedYear**: Container for all dots in a given year
- **LODLevel**: Metadata for each level of detail

## Testing Strategy
- **Unit tests**: Individual component validation
- **Integration tests**: End-to-end workflow testing with mocked data
- **E2E tests**: Full pipeline testing (requires pytest)
- **Performance tests**: Memory usage and processing time validation

## File Structure
```
data/
├── input/           # Raw HYDE ASC files
├── output/          # Processed NDJSON.gz files
└── lod/            # Level-of-detail aggregated files
```

## Performance Considerations
- Use density-aware dot creation to manage output size
- Implement hierarchical aggregation for zoom-level performance
- Compress output files with gzip
- Memory-efficient processing for large datasets

## Dependencies
- **pydantic**: Data validation and modeling
- **numpy**: Numerical processing
- **pytest**: Testing framework
- **Standard library**: File I/O, compression, logging
