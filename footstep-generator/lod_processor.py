#!/usr/bin/env python3
"""
Level-of-Detail (LOD) processing logic for HYDE human settlement data.
Implements hierarchical spatial aggregation for performance optimization.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from models import (
    LODLevel,
    Coordinates,
    HumanSettlement,
    AggregatedSettlement,
    LODConfiguration,
    ProcessingStatistics,
    SettlementContinuityConfig,
)
from settlement_registry import SettlementRegistry
from dot_generator import DotGenerator


class LODProcessor:
    """Processes human settlement data into hierarchical Level-of-Detail datasets."""

    def __init__(
        self,
        config: Optional[LODConfiguration] = None,
        continuity_config: Optional[SettlementContinuityConfig] = None,
    ):
        """Initialize LOD processor with configuration."""
        self.config = config or LODConfiguration()
        self.continuity_config = continuity_config or SettlementContinuityConfig()
        self.settlement_registry = (
            SettlementRegistry() if self.continuity_config.enable_continuity else None
        )
        # Extracted dot generation logic
        self.dot_generator = DotGenerator(
            continuity_config=self.continuity_config,
            settlement_registry=self.settlement_registry,
        )

    def create_hierarchical_lods(
        self, settlements: List[HumanSettlement]
    ) -> Dict[LODLevel, List[AggregatedSettlement]]:
        """
        Create hierarchical Level-of-Detail datasets using Pydantic models.
        Aggregates population data into progressively larger grid cells.

        Args:
            settlements: List of individual settlements from HYDE data

        Returns:
            Dictionary mapping LOD levels to aggregated settlements
        """
        if not settlements:
            return {level: [] for level in LODLevel}

        # Extract year from first settlement (all should be same year)
        year = settlements[0].year

        lod_results = {}

        # LOD 3 (DETAILED): Use original settlements
        lod_results[LODLevel.DETAILED] = [
            AggregatedSettlement(
                coordinates=settlement.coordinates,
                total_population=settlement.population,
                year=settlement.year,
                lod_level=LODLevel.DETAILED,
                grid_size_degrees=settlement.source_resolution,
                source_dot_count=1,
                average_density=settlement.population
                / (
                    (settlement.source_resolution * 111.32) ** 2
                ),  # Rough km² conversion
            )
            for settlement in settlements
        ]

        # Define grid sizes for each LOD level
        # Map the 3 available config fields to 4 LOD levels
        grid_configs = {
            LODLevel.REGIONAL: self.config.global_grid_size,     # Coarsest: 1.0°
            LODLevel.SUBREGIONAL: self.config.regional_grid_size, # Medium: 0.25°  
            LODLevel.LOCAL: self.config.local_grid_size          # Finest: 0.05°
        }

        # Convert settlement data to NumPy arrays for vector operations
        lons = np.array([s.coordinates.longitude for s in settlements])
        lats = np.array([s.coordinates.latitude for s in settlements])
        populations = np.array([s.population for s in settlements])

        for lod_level, grid_size in grid_configs.items():
            print(f"    Creating {lod_level.name} LOD (grid: {grid_size}°)...")

            # Compute grid indices via vector operations
            x_idx = np.round(lons / grid_size).astype(int)
            y_idx = np.round(lats / grid_size).astype(int)

            # Aggregate populations and counts using pandas grouping
            df = pd.DataFrame(
                {
                    "x_idx": x_idx,
                    "y_idx": y_idx,
                    "population": populations,
                }
            )
            grouped = (
                df.groupby(["x_idx", "y_idx"], sort=False)
                .agg(
                    total_population=("population", "sum"),
                    source_dots=("population", "size"),
                )
                .reset_index()
            )

            aggregated_settlements: List[AggregatedSettlement] = []
            cell_area_km2 = (grid_size * 111.32) ** 2  # Rough conversion to km²

            for row in grouped.itertuples(index=False):
                # Apply deterministic spatial randomization to break grid artifacts
                # Apply to all aggregated LODs (0, 1, 2) but not DETAILED (3)
                if lod_level in (LODLevel.REGIONAL, LODLevel.SUBREGIONAL, LODLevel.LOCAL):
                    grid_x, grid_y = self._apply_spatial_randomization(
                        row.x_idx, row.y_idx, grid_size, year
                    )
                else:
                    # Keep exact grid positioning for DETAILED LOD (source data)
                    grid_x = row.x_idx * grid_size
                    grid_y = row.y_idx * grid_size
                    
                avg_density = row.total_population / cell_area_km2
                try:
                    aggregated = AggregatedSettlement(
                        coordinates=Coordinates(longitude=grid_x, latitude=grid_y),
                        total_population=row.total_population,
                        year=year,
                        lod_level=lod_level,
                        grid_size_degrees=grid_size,
                        source_dot_count=row.source_dots,
                        average_density=avg_density,
                    )
                    aggregated_settlements.append(aggregated)
                except Exception as e:
                    print(f"      Warning: Skipping invalid aggregated settlement: {e}")
                    continue

            lod_results[lod_level] = aggregated_settlements
            print(
                f"      → {len(aggregated_settlements)} aggregated settlements "
                f"(from {len(settlements)} original)"
            )

        # Validate population conservation
        self._validate_population_conservation(settlements, lod_results)

        return lod_results

    def create_density_aware_dots(
        self,
        cell_population: float,
        lat: float,
        lon: float,
        cellsize: float,
        people_per_dot: int,
        lod_level: Optional[int] = None,
    ) -> List[tuple]:
        """
        Create dots for a cell using density-aware strategy
        with deterministic positioning.

        Args:
            cell_population: Total population in the cell
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            people_per_dot: Standard number of people per dot
            lod_level: Level of detail
                (0=Regional, 1=Subregional, 2=Local, 3=Detailed)

        Returns:
            List of (lat, lon, population) tuples for each dot to create
        """
        # Delegate to extracted generator (preserves existing behavior)
        return self.dot_generator.create_density_aware_dots(
            cell_population=cell_population,
            lat=lat,
            lon=lon,
            cellsize=cellsize,
            people_per_dot=people_per_dot,
            lod_level=lod_level,
        )

    def _create_deterministic_dots(
        self,
        cell_population: float,
        lat: float,
        lon: float,
        cellsize: float,
        people_per_dot: int,
        settlement_type: str,
        lod_level: Optional[int] = None,
    ) -> List[tuple]:
        """Wrapper delegating to DotGenerator to preserve test back-compat."""
        return self.dot_generator._create_deterministic_dots(
            cell_population,
            lat,
            lon,
            cellsize,
            people_per_dot,
            settlement_type,
            lod_level,
        )

    def _create_random_dots(
        self,
        cell_population: float,
        lat: float,
        lon: float,
        cellsize: float,
        people_per_dot: int,
        settlement_type: str,
        lod_level: Optional[int] = None,
    ) -> List[tuple]:
        """Wrapper delegating to DotGenerator to preserve test back-compat."""
        return self.dot_generator._create_random_dots(
            cell_population,
            lat,
            lon,
            cellsize,
            people_per_dot,
            settlement_type,
            lod_level,
        )

    def validate_settlement_data(
        self, settlements: List[HumanSettlement]
    ) -> ProcessingStatistics:
        """
        Validate settlement data and return processing statistics.

        Args:
            settlements: List of settlements to validate

        Returns:
            Processing statistics with validation results
        """
        stats = ProcessingStatistics()
        stats.total_cells_processed = len(settlements)

        valid_settlements = []
        coordinate_errors = 0

        for settlement in settlements:
            try:
                # Validate coordinates
                coords = settlement.coordinates
                if not (
                    -180 <= coords.longitude <= 180 and -90 <= coords.latitude <= 90
                ):
                    coordinate_errors += 1
                    continue

                # Validate population
                if settlement.population <= 0:
                    continue

                valid_settlements.append(settlement)
                stats.total_population += settlement.population

            except Exception:
                coordinate_errors += 1
                continue

        stats.valid_cells_found = len(valid_settlements)
        stats.coordinate_validation_errors = coordinate_errors
        stats.dots_created = len(valid_settlements)

        return stats

    def get_lod_level_for_zoom(self, zoom_level: float) -> LODLevel:
        """
        Determine appropriate LOD level based on zoom level.

        Args:
            zoom_level: Current map zoom level

        Returns:
            Appropriate LOD level for the zoom
        """
        from lod_config import get_lod_level_for_zoom
        
        # Use centralized configuration
        lod_int = get_lod_level_for_zoom(zoom_level)
        
        # Convert to LODLevel enum
        lod_mapping = {
            0: LODLevel.REGIONAL,
            1: LODLevel.SUBREGIONAL, 
            2: LODLevel.LOCAL,
            3: LODLevel.DETAILED
        }
        
        return lod_mapping.get(lod_int, LODLevel.DETAILED)

    def _validate_population_conservation(
        self,
        original_settlements: List[HumanSettlement],
        lod_results: Dict[LODLevel, List[AggregatedSettlement]],
    ):
        """
        Validate that LOD aggregation preserves total population.
        Raises ValueError if significant population loss is detected.
        """
        if not original_settlements:
            return

        original_total = sum(s.population for s in original_settlements)

        print("    Population Conservation Validation:")
        print(f"      Original total: {original_total:.0f} people")

        for lod_level, aggregated in lod_results.items():
            lod_total = sum(s.total_population for s in aggregated)
            conservation_ratio = (
                lod_total / original_total if original_total > 0 else 1.0
            )

            print(
                f"      {lod_level.name}: {lod_total:.0f} people "
                f"({conservation_ratio:.1%} conserved, {len(aggregated)} points)"
            )

            # Require 99%+ population conservation
            # (allow for tiny floating point errors)
            if conservation_ratio < 0.99:
                raise ValueError(
                    f"LOD {lod_level.name} lost "
                    f"{(1-conservation_ratio):.1%} of population! "
                    f"({lod_total:.0f} vs {original_total:.0f})"
                )

        print("      Population conservation validated")

    def estimate_performance_impact(
        self, settlements: List[HumanSettlement], target_lod: LODLevel
    ) -> Dict[str, float]:
        """
        Estimate performance impact of using a specific LOD level.

        Args:
            settlements: Original settlement data
            target_lod: Target LOD level

        Returns:
            Dictionary with performance estimates
        """
        original_count = len(settlements)

        # Create LOD data to get actual counts
        lod_data = self.create_hierarchical_lods(settlements)
        target_count = len(lod_data.get(target_lod, []))

        reduction_ratio = target_count / original_count if original_count > 0 else 0
        estimated_render_speedup = 1.0 / reduction_ratio if reduction_ratio > 0 else 1.0

        return {
            "original_dot_count": original_count,
            "lod_dot_count": target_count,
            "reduction_ratio": reduction_ratio,
            "estimated_speedup": min(estimated_render_speedup, 10.0),  # Cap at 10x
            "memory_reduction_mb": (original_count - target_count)
            * 0.1,  # Rough estimate
        }

    def _apply_spatial_randomization(
        self, x_idx: int, y_idx: int, grid_size: float, year: int
    ) -> tuple[float, float]:
        """
        Apply deterministic spatial randomization to break grid artifacts.
        
        Uses fast deterministic randomization based on grid coordinates and year.
        Ensures consistent results across LOD levels for the same underlying settlement.
        
        Args:
            x_idx: Grid X index
            y_idx: Grid Y index  
            grid_size: Size of grid cell in degrees
            year: Year for additional entropy
            
        Returns:
            Tuple of (longitude, latitude) with randomized offset
        """
        # Create seed from original coordinates and year only
        # This ensures same settlement gets same offset across all LOD levels
        seed = hash((x_idx, y_idx, year)) & 0x7FFFFFFF  # Fast hash, ensure positive
        
        # Use seed for deterministic but pseudo-random offset
        # Simple linear congruential generator for fast randomization
        seed_x = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        seed_y = (seed * 134775813 + 67890) & 0x7FFFFFFF
        
        # Convert to [-0.5, 0.5] range
        offset_x = (seed_x / 0x7FFFFFFF) - 0.5
        offset_y = (seed_y / 0x7FFFFFFF) - 0.5
        
        # Base grid position
        grid_x = x_idx * grid_size
        grid_y = y_idx * grid_size
        
        # Add controlled offset within grid cell (±25% of cell size)
        # This breaks the regular pattern while keeping settlements clustered
        offset_range = grid_size * 0.25
        final_x = grid_x + offset_x * offset_range
        final_y = grid_y + offset_y * offset_range
        
        # Clamp to valid coordinate ranges to prevent Pydantic validation errors
        final_x = max(-180.0, min(180.0, final_x))
        final_y = max(-90.0, min(90.0, final_y))
        
        return final_x, final_y
