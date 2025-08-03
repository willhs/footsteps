#!/usr/bin/env python3
"""
Pydantic models for HYDE data processing and Level-of-Detail (LOD) system.
Provides data validation, type safety, and structure for human settlement data.
"""

from typing import List, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


class LODLevel(Enum):
    """Level-of-Detail enumeration for different zoom ranges."""
    GLOBAL = 0      # ~200km cells, zoom 0-2
    REGIONAL = 1    # ~50km cells, zoom 2-4  
    LOCAL = 2       # ~10km cells, zoom 4-6
    DETAILED = 3    # ~5km cells (original), zoom 6+


class Coordinates(BaseModel):
    """Geographic coordinates with validation."""
    model_config = ConfigDict(frozen=True)
    
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")


class HumanSettlement(BaseModel):
    """Individual human settlement dot with population data."""
    coordinates: Coordinates
    population: float = Field(..., gt=0, description="Population count for this settlement")
    year: int = Field(..., description="Historical year (negative for BCE)")
    settlement_type: str = Field(default="settlement", description="Type of settlement")
    source_resolution: float = Field(..., gt=0, description="Original grid cell size in degrees")
    
    @field_validator('year')
    @classmethod
    def validate_year(cls, v):
        if not (-15000 <= v <= 2100):
            raise ValueError('Year must be between -15000 and 2100')
        return v


class AggregatedSettlement(BaseModel):
    """Aggregated settlement representing multiple original settlements."""
    coordinates: Coordinates
    total_population: float = Field(..., gt=0, description="Total aggregated population")
    year: int = Field(..., description="Historical year")
    lod_level: LODLevel = Field(..., description="Level of detail for this aggregation")
    grid_size_degrees: float = Field(..., gt=0, description="Grid cell size in degrees")
    source_dot_count: int = Field(..., gt=0, description="Number of original dots aggregated")
    average_density: float = Field(..., ge=0, description="People per km² average")


class LODConfiguration(BaseModel):
    """Configuration for Level-of-Detail processing."""
    global_grid_size: float = Field(default=2.0, description="Grid size for global LOD (degrees)")
    regional_grid_size: float = Field(default=0.5, description="Grid size for regional LOD")
    local_grid_size: float = Field(default=0.1, description="Grid size for local LOD")
    min_population_threshold: float = Field(default=50.0, description="Minimum population per cell")
    
    @field_validator('global_grid_size', 'regional_grid_size', 'local_grid_size')
    @classmethod
    def grid_sizes_positive(cls, v):
        if v <= 0:
            raise ValueError('Grid sizes must be positive')
        return v


class ProcessingResult(BaseModel):
    """Result of processing a year's worth of HYDE data."""
    model_config = ConfigDict(use_enum_values=True)
    
    year: int
    lod_data: Dict[LODLevel, List[AggregatedSettlement]]
    total_population: float
    processing_stats: Dict[str, Any]


class HYDEDataFile(BaseModel):
    """Information about a HYDE data file."""
    year: int
    file_path: str
    file_type: str = Field(default="asc", description="File type (asc, zip, etc.)")
    
    @field_validator('file_path')
    @classmethod
    def file_path_exists(cls, v):
        import pathlib
        if not pathlib.Path(v).exists():
            raise ValueError(f'File does not exist: {v}')
        return v


class GridMetadata(BaseModel):
    """Metadata for ASCII grid files."""
    ncols: int = Field(..., gt=0)
    nrows: int = Field(..., gt=0)
    xllcorner: float
    yllcorner: float
    cellsize: float = Field(..., gt=0)
    nodata_value: float = Field(default=-9999)
    
    @field_validator('ncols', 'nrows')
    @classmethod
    def positive_dimensions(cls, v):
        if v <= 0:
            raise ValueError('Grid dimensions must be positive')
        return v


class ProcessingStatistics(BaseModel):
    """Statistics from data processing operations."""
    total_cells_processed: int = Field(default=0, ge=0)
    valid_cells_found: int = Field(default=0, ge=0)
    dots_created: int = Field(default=0, ge=0)
    total_population: float = Field(default=0, ge=0)
    processing_time_seconds: float = Field(default=0, ge=0)
    coordinate_validation_errors: int = Field(default=0, ge=0)
    density_filter_excluded: int = Field(default=0, ge=0)
    
    @property
    def valid_cell_ratio(self) -> float:
        """Ratio of valid cells to total processed."""
        if self.total_cells_processed == 0:
            return 0.0
        return self.valid_cells_found / self.total_cells_processed
    
    @property
    def average_population_per_dot(self) -> float:
        """Average population represented per dot."""
        if self.dots_created == 0:
            return 0.0
        return self.total_population / self.dots_created