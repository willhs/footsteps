#!/usr/bin/env python3
"""
Level-of-Detail (LOD) processing logic for HYDE human settlement data.
Implements hierarchical spatial aggregation for performance optimization.
"""

import numpy as np
from collections import defaultdict
from typing import List, Dict, Optional
from landmask import is_land
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
        grid_configs = {
            LODLevel.GLOBAL: self.config.global_grid_size,
            LODLevel.REGIONAL: self.config.regional_grid_size,
            LODLevel.LOCAL: self.config.local_grid_size,
        }

        for lod_level, grid_size in grid_configs.items():
            print(f"    Creating {lod_level.name} LOD (grid: {grid_size}°)...")

            # Group settlements by grid cell
            grid_cells = defaultdict(
                lambda: {
                    "center_coords": Coordinates(longitude=grid_x, latitude=grid_y),
                    "total_population": 0.0,
                    "source_dots": 0,
                    "settlements": [],
                }
            )

            for settlement in settlements:
                # Calculate grid cell coordinates (snap to grid)
                grid_x = round(settlement.coordinates.longitude / grid_size) * grid_size
                grid_y = round(settlement.coordinates.latitude / grid_size) * grid_size
                grid_key = (grid_x, grid_y)

                cell = grid_cells[grid_key]
                cell["total_population"] += settlement.population
                cell["source_dots"] += 1
                cell["settlements"].append(settlement)

            # Create aggregated settlements
            aggregated_settlements = []

            for grid_key, cell_data in grid_cells.items():
                # PRESERVE ALL POPULATION - No thresholding!
                # The API will handle viewport-based aggregation if needed

                # Calculate average density
                cell_area_km2 = (grid_size * 111.32) ** 2  # Rough conversion to km²
                avg_density = cell_data["total_population"] / cell_area_km2

                # Create aggregated settlement with validation
                try:
                    aggregated = AggregatedSettlement(
                        coordinates=cell_data["center_coords"],
                        total_population=cell_data["total_population"],
                        year=year,
                        lod_level=lod_level,
                        grid_size_degrees=grid_size,
                        source_dot_count=cell_data["source_dots"],
                        average_density=avg_density,
                    )
                    aggregated_settlements.append(aggregated)

                except Exception as e:
                    print(f"      Warning: Skipping invalid aggregated settlement: {e}")
                    continue

            lod_results[lod_level] = aggregated_settlements
            print(
                f"      → {len(aggregated_settlements)} aggregated settlements (from {len(settlements)} original)"
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
    ) -> List[tuple]:
        """
        Create dots for a cell using density-aware strategy with deterministic positioning.

        Args:
            cell_population: Total population in the cell
            lat, lon: Center coordinates of the cell
            cellsize: Size of the cell in degrees
            people_per_dot: Standard number of people per dot

        Returns:
            List of (lat, lon, population) tuples for each dot to create
        """
        dots = []

        # Apply minimum population threshold - scale with dot size for sparse eras
        # Use half the dot size as cutoff, but never below 5 people
        min_pop_cutoff = max(people_per_dot / 2, 5)
        if cell_population < min_pop_cutoff:
            return dots

        # Determine settlement type based on population
        if cell_population < self.continuity_config.rural_to_town_threshold:
            settlement_type = "rural"
        elif cell_population < self.continuity_config.town_to_city_threshold:
            settlement_type = "town"
        else:
            settlement_type = "city"

        # Use deterministic positioning if continuity is enabled
        if self.settlement_registry is not None:
            return self._create_deterministic_dots(
                cell_population, lat, lon, cellsize, people_per_dot, settlement_type
            )
        else:
            # Random positioning without continuity
            return self._create_random_dots(
                cell_population, lat, lon, cellsize, people_per_dot, settlement_type
            )

    def _create_deterministic_dots(
        self,
        cell_population: float,
        lat: float,
        lon: float,
        cellsize: float,
        people_per_dot: int,
        settlement_type: str,
    ) -> List[tuple]:
        """Create dots using deterministic positioning for settlement continuity."""
        # Calculate number of dots needed based on settlement type
        if settlement_type == "rural":
            num_dots = max(1, int(cell_population / people_per_dot))
        elif settlement_type == "town":
            effective_people_per_dot = people_per_dot * 5
            num_dots = max(1, min(5, int(cell_population / effective_people_per_dot)))
        else:  # city
            effective_people_per_dot = people_per_dot * 20
            num_dots = max(1, min(3, int(cell_population / effective_people_per_dot)))

        population_per_dot = cell_population / num_dots

        # Deterministic RNG seeded from geographic cell id
        cell_id = self.settlement_registry.get_geographic_cell_id(
            lat, lon, cellsize, settlement_type
        )
        seed = int(cell_id[:8], 16)
        rng = np.random.RandomState(seed)

        positions = self._poisson_disc_sample(
            lat, lon, cellsize, num_dots, self.config.min_dot_spacing, rng
        )

        return [(p[0], p[1], population_per_dot) for p in positions]

    def _create_random_dots(
        self,
        cell_population: float,
        lat: float,
        lon: float,
        cellsize: float,
        people_per_dot: int,
        settlement_type: str,
    ) -> List[tuple]:
        """Create dots using original random positioning (fallback)."""
        # Determine number of dots based on settlement type
        if settlement_type == "rural":
            num_dots = max(1, int(cell_population / people_per_dot))
        elif settlement_type == "town":
            effective_people_per_dot = people_per_dot * 5
            num_dots = max(1, min(5, int(cell_population / effective_people_per_dot)))
        else:  # city
            effective_people_per_dot = people_per_dot * 20
            num_dots = max(1, min(3, int(cell_population / effective_people_per_dot)))

        population_per_dot = cell_population / num_dots

        rng = np.random.RandomState()
        positions = self._poisson_disc_sample(
            lat, lon, cellsize, num_dots, self.config.min_dot_spacing, rng
        )

        return [(p[0], p[1], population_per_dot) for p in positions]

    def _poisson_disc_sample(
        self,
        lat: float,
        lon: float,
        cellsize: float,
        num_points: int,
        min_distance: float,
        rng: np.random.RandomState,
    ) -> List[tuple]:
        """Generate points using Poisson-disc sampling within a cell."""
        points: List[tuple] = []
        attempts_per_point = 100

        for _ in range(num_points):
            attempts = 0
            while attempts < attempts_per_point:
                cand_lat = lat + rng.uniform(-cellsize / 2, cellsize / 2)
                cand_lon = lon + rng.uniform(-cellsize / 2, cellsize / 2)
                if not is_land(cand_lat, cand_lon):
                    attempts += 1
                    continue

                if all(
                    (cand_lat - p_lat) ** 2 + (cand_lon - p_lon) ** 2 >= min_distance**2
                    for p_lat, p_lon in points
                ):
                    points.append((cand_lat, cand_lon))
                    break
                attempts += 1
            else:
                # Fallback: ignore land constraint but still enforce spacing
                fallback_attempts = 0
                while True:
                    cand_lat = lat + rng.uniform(-cellsize / 2, cellsize / 2)
                    cand_lon = lon + rng.uniform(-cellsize / 2, cellsize / 2)
                    if all(
                        (cand_lat - p_lat) ** 2 + (cand_lon - p_lon) ** 2
                        >= min_distance**2
                        for p_lat, p_lon in points
                    ):
                        points.append((cand_lat, cand_lon))
                        break
                    fallback_attempts += 1
                    if fallback_attempts >= attempts_per_point:
                        points.append((cand_lat, cand_lon))
                        break

        return points

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
        if zoom_level < 2:
            return LODLevel.GLOBAL
        elif zoom_level < 4:
            return LODLevel.REGIONAL
        elif zoom_level < 6:
            return LODLevel.LOCAL
        else:
            return LODLevel.DETAILED

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

        print(f"    Population Conservation Validation:")
        print(f"      Original total: {original_total:.0f} people")

        for lod_level, aggregated in lod_results.items():
            lod_total = sum(s.total_population for s in aggregated)
            conservation_ratio = (
                lod_total / original_total if original_total > 0 else 1.0
            )

            print(
                f"      {lod_level.name}: {lod_total:.0f} people "
                f"({conservation_ratio:.1%} conserved, {len(aggregated)} dots)"
            )

            # Require 99%+ population conservation (allow for tiny floating point errors)
            if conservation_ratio < 0.99:
                raise ValueError(
                    f"LOD {lod_level.name} lost {(1-conservation_ratio):.1%} of population! "
                    f"({lod_total:.0f} vs {original_total:.0f})"
                )

        print(f"      ✅ Population conservation validated")

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
