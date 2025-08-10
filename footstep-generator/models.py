#!/usr/bin/env python3
"""
Pydantic models for HYDE data processing and Level-of-Detail (LOD) system.
Provides data validation, type safety, and structure for human settlement data.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


class LODLevel(Enum):
    """Level-of-Detail enumeration for different zoom ranges.

    Adds a SUBREGIONAL level between Regional and Local. Indices are compact
    and ordered from coarse (0) to fine (3).
    """
    REGIONAL = 0       # ~50km cells, coarse overview
    SUBREGIONAL = 1    # ~10–15km cells, mid detail
    LOCAL = 2          # ~5–10km cells, high detail
    DETAILED = 3       # ~5km cells (original), maximum detail


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
    global_grid_size: float = Field(default=1.0, description="Grid size for global LOD (degrees)")
    regional_grid_size: float = Field(default=0.25, description="Grid size for regional LOD") 
    subregional_grid_size: float = Field(default=0.1, description="Grid size for subregional LOD")
    local_grid_size: float = Field(default=0.05, description="Grid size for local LOD")
    min_population_threshold: float = Field(default=0.0, description="Minimum population per cell - DISABLED for population preservation")
    
    @field_validator('global_grid_size', 'regional_grid_size', 'subregional_grid_size', 'local_grid_size')
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


class SettlementContinuityType(Enum):
    """Types of settlement continuity tracking."""
    RURAL = "rural"
    TOWN = "town" 
    CITY = "city"


class PersistentSettlement(BaseModel):
    """Settlement with continuity tracking across years."""
    settlement_id: str = Field(..., description="Unique identifier for settlement continuity")
    coordinates: Coordinates
    population: float = Field(..., gt=0, description="Current population")
    year: int = Field(..., description="Historical year")
    continuity_type: SettlementContinuityType = Field(..., description="Settlement continuity classification")
    source_cell_id: str = Field(..., description="Geographic cell identifier for position consistency")
    position_index: int = Field(..., ge=0, description="Position index within the geographic cell")
    population_history: List[float] = Field(default_factory=list, description="Population over time")
    
    @field_validator('year')
    @classmethod
    def validate_year(cls, v):
        if not (-15000 <= v <= 2100):
            raise ValueError('Year must be between -15000 and 2100')
        return v
    
    @field_validator('settlement_id')
    @classmethod
    def validate_settlement_id(cls, v):
        if not v or len(v) < 3:
            raise ValueError('Settlement ID must be at least 3 characters')
        return v


class SettlementContinuityConfig(BaseModel):
    """Configuration for settlement continuity tracking."""
    enable_continuity: bool = Field(default=True, description="Enable settlement continuity tracking")
    max_population_change_ratio: float = Field(default=5.0, description="Maximum population change ratio between years")
    settlement_merge_threshold: float = Field(default=0.1, description="Distance threshold for merging settlements (degrees)")
    rural_to_town_threshold: int = Field(default=1000, description="Population threshold for rural to town transition")
    town_to_city_threshold: int = Field(default=10000, description="Population threshold for town to city transition")
    position_consistency_seed_length: int = Field(default=12, description="Length of geographic hash for position consistency")
    
    @field_validator('max_population_change_ratio', 'settlement_merge_threshold')
    @classmethod
    def positive_thresholds(cls, v):
        if v <= 0:
            raise ValueError('Thresholds must be positive')
        return v


class ContinuityValidationResult(BaseModel):
    """Result of settlement continuity validation."""
    is_valid: bool = Field(..., description="Whether continuity validation passed")
    consistent_positions: int = Field(..., ge=0, description="Number of settlements with consistent positions")
    total_settlements: int = Field(..., ge=0, description="Total number of settlements tested")
    position_consistency_ratio: float = Field(..., ge=0, le=1, description="Ratio of consistent positions")
    validation_errors: List[str] = Field(default_factory=list, description="List of validation errors")
    performance_metrics: Dict[str, float] = Field(default_factory=dict, description="Performance metrics")
    
    @property
    def is_acceptable(self) -> bool:
        """Whether the continuity validation results are acceptable (>95% consistency)."""
        return self.position_consistency_ratio >= 0.95
