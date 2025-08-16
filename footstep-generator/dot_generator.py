#!/usr/bin/env python3
"""
Dot generation strategies (deterministic + random) extracted from LODProcessor.
Encapsulates density-aware dot creation while preserving existing behavior.
"""
from typing import List, Optional

import numpy as np
from landmask import is_land
from models import SettlementContinuityConfig
from settlement_registry import SettlementRegistry


class DotGenerator:
    """
    Generates density-aware dots for a cell using deterministic or random
    placement depending on whether continuity is enabled (presence of a
    SettlementRegistry).
    """

    def __init__(
        self,
        continuity_config: SettlementContinuityConfig,
        settlement_registry: Optional[SettlementRegistry] = None,
    ):
        self.continuity_config = continuity_config
        self.settlement_registry = settlement_registry

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
        Create dots for a cell using density-aware strategy.
        Chooses deterministic or random positioning based on continuity.
        """
        dots: List[tuple] = []

        # Apply minimum population threshold - scale with dot size for
        # sparse eras. Use a lower cutoff for detailed (base) dots so
        # extremely sparse BCE regions still contribute at least one dot
        # and get aggregated into LOD 0-2.
        if lod_level == 3:
            # For base dots, lower cutoff significantly. For BCE-era runs
            # (proxied by people_per_dot <= 10), allow very sparse cells
            # through.
            min_pop_cutoff = (
                0.5
                if people_per_dot <= 10
                else max(people_per_dot / 4, 0.5)
            )
        else:
            # Coarser LODs can keep a higher cutoff to avoid noise
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
                cell_population,
                lat,
                lon,
                cellsize,
                people_per_dot,
                settlement_type,
                lod_level,
            )
        else:
            # Fallback to original random positioning for backward
            # compatibility
            return self._create_random_dots(
                cell_population,
                lat,
                lon,
                cellsize,
                people_per_dot,
                settlement_type,
                lod_level,
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
        """Create dots using deterministic positioning for settlement
        continuity."""
        # LOD-aware dot distribution logic
        # LOD 3 (Detailed zoom ≥6): More granular dots for detailed views
        # LOD 0-2 (Coarser zoom <6): Fewer dots to avoid clutter

        if lod_level == 3:  # Detailed LOD - show more granular dots
            if settlement_type == "rural":
                # Rural at detailed level: standard granularity with a
                # safety cap
                num_dots = max(
                    1, min(20, int(cell_population / people_per_dot))
                )
            elif settlement_type == "town":
                # Towns at detailed level: balanced density
                effective_people_per_dot = max(people_per_dot * 2, 50)
                num_dots = max(
                    1,
                    min(25, int(cell_population / effective_people_per_dot)),
                )
            else:  # city
                # Cities at detailed level: rich structure without
                # overwhelming the budget
                effective_people_per_dot = max(people_per_dot * 4, 100)
                num_dots = max(
                    1,
                    min(75, int(cell_population / effective_people_per_dot)),
                )
        else:  # LOD 0-2 - use original aggregated logic to avoid clutter
            if settlement_type == "rural":
                num_dots = max(1, int(cell_population / people_per_dot))
            elif settlement_type == "town":
                # Towns at coarse LOD: Fewer dots to reduce clutter
                # 5× more people per dot
                effective_people_per_dot = people_per_dot * 5
                num_dots = max(
                    1, min(5, int(cell_population / effective_people_per_dot))
                )
            else:  # city
                # Cities at coarse LOD: Very few dots to avoid overwhelming the view
                # 20× more people per dot
                effective_people_per_dot = people_per_dot * 20
                num_dots = max(
                    1, min(3, int(cell_population / effective_people_per_dot))
                )

        population_per_dot = cell_population / num_dots

        # Get deterministic positions from registry
        assert self.settlement_registry is not None, (
            "SettlementRegistry required for deterministic dots"
        )
        positions = self.settlement_registry.get_deterministic_positions(
            lat, lon, cellsize, num_dots, settlement_type
        )

        # Convert positions to dots
        dots: List[tuple] = []
        for position in positions:
            dots.append(
                (
                    position.coordinates.latitude,
                    position.coordinates.longitude,
                    population_per_dot,
                )
            )

        return dots

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
        """Create dots using original random positioning (fallback)."""
        dots: List[tuple] = []

        # LOD-aware density strategy
        if lod_level == 3:  # Detailed LOD - show more granular dots
            if settlement_type == "rural":
                # Rural at detailed level: standard granularity with a safety cap
                num_dots = max(1, min(20, int(cell_population / people_per_dot)))
                population_per_dot = cell_population / num_dots

                for _ in range(num_dots):
                    attempts = 0
                    while True:
                        dot_lat = lat + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )
                        dot_lon = lon + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )
                        if is_land(dot_lat, dot_lon) or attempts >= 10:
                            break
                        attempts += 1
                    dots.append((dot_lat, dot_lon, population_per_dot))

            elif settlement_type == "town":
                # Towns at detailed level: balanced density
                effective_people_per_dot = max(people_per_dot * 2, 50)
                num_dots = max(
                    1, min(25, int(cell_population / effective_people_per_dot))
                )
                population_per_dot = cell_population / num_dots

                grid_size = int(np.ceil(np.sqrt(num_dots)))
                grid_step = cellsize / (grid_size + 1)  # Add padding

                dot_idx = 0
                for i in range(grid_size):
                    for j in range(grid_size):
                        if dot_idx >= num_dots:
                            break

                        # Grid position with slight randomization
                        offset_lat = (i - grid_size / 2 + 0.5) * grid_step
                        offset_lon = (j - grid_size / 2 + 0.5) * grid_step

                        # Add small random offset to avoid perfect grid
                        attempts = 0
                        while True:
                            pert_lat = np.random.uniform(
                                -grid_step / 4, grid_step / 4
                            )
                            pert_lon = np.random.uniform(
                                -grid_step / 4, grid_step / 4
                            )
                            dot_lat = lat + offset_lat + pert_lat
                            dot_lon = lon + offset_lon + pert_lon
                            if is_land(dot_lat, dot_lon) or attempts >= 10:
                                break
                            attempts += 1
                        dots.append((dot_lat, dot_lon, population_per_dot))
                        dot_idx += 1

            else:  # city at detailed level
                # Cities at detailed level: rich structure
                # without overwhelming the budget
                effective_people_per_dot = max(people_per_dot * 4, 100)
                num_dots = max(
                    1, min(75, int(cell_population / effective_people_per_dot))
                )
                population_per_dot = cell_population / num_dots

                # Use fixed positions within cell to ensure consistency
                positions = [
                    (0, 0),  # Center
                    (-0.25, -0.25),
                    (0.25, -0.25),  # Lower corners
                    (-0.25, 0.25),
                    (0.25, 0.25),  # Upper corners
                ]

                for i in range(num_dots):
                    if i < len(positions):
                        offset_lat, offset_lon = positions[i]
                        dot_lat = lat + offset_lat * cellsize
                        dot_lon = lon + offset_lon * cellsize
                    else:
                        # For extra dots beyond fixed positions, use random placement
                        dot_lat = lat + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )
                        dot_lon = lon + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )

                    if not is_land(dot_lat, dot_lon):
                        attempts = 0
                        while True:
                            dot_lat = lat + np.random.uniform(
                                -cellsize / 2, cellsize / 2
                            )
                            dot_lon = lon + np.random.uniform(
                                -cellsize / 2, cellsize / 2
                            )
                            if is_land(dot_lat, dot_lon) or attempts >= 10:
                                break
                            attempts += 1
                    dots.append((dot_lat, dot_lon, population_per_dot))
        else:  # LOD 0-2
            if settlement_type == "rural":
                num_dots = max(1, int(cell_population / people_per_dot))
                population_per_dot = cell_population / num_dots

                for _ in range(num_dots):
                    attempts = 0
                    while True:
                        dot_lat = lat + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )
                        dot_lon = lon + np.random.uniform(
                            -cellsize / 2, cellsize / 2
                        )
                        if is_land(dot_lat, dot_lon) or attempts >= 10:
                            break
                        attempts += 1
                    dots.append((dot_lat, dot_lon, population_per_dot))

            elif settlement_type == "town":
                # Towns at coarse LOD: Fewer dots to reduce clutter
                # 5× more people per dot
                effective_people_per_dot = people_per_dot * 5
                num_dots = max(
                    1, min(5, int(cell_population / effective_people_per_dot))
                )
                population_per_dot = cell_population / num_dots

                grid_size = int(np.ceil(np.sqrt(num_dots)))
                grid_step = cellsize / (grid_size + 1)  # Add padding

                dot_idx = 0
                for i in range(grid_size):
                    for j in range(grid_size):
                        if dot_idx >= num_dots:
                            break

                        # Grid position with slight randomization
                        offset_lat = (i - grid_size / 2 + 0.5) * grid_step
                        offset_lon = (j - grid_size / 2 + 0.5) * grid_step

                        # Add small random offset to avoid perfect grid
                        attempts = 0
                        while True:
                            pert_lat = np.random.uniform(
                                -grid_step / 4, grid_step / 4
                            )
                            pert_lon = np.random.uniform(
                                -grid_step / 4, grid_step / 4
                            )
                            dot_lat = lat + offset_lat + pert_lat
                            dot_lon = lon + offset_lon + pert_lon
                            if is_land(dot_lat, dot_lon) or attempts >= 10:
                                break
                            attempts += 1
                        dots.append((dot_lat, dot_lon, population_per_dot))
                        dot_idx += 1

            else:  # city at coarse LOD
                # Cities at coarse LOD: Very few dots to avoid overwhelming the view
                # 20× more people per dot
                effective_people_per_dot = people_per_dot * 20
                num_dots = max(
                    1, min(3, int(cell_population / effective_people_per_dot))
                )
                population_per_dot = cell_population / num_dots

                # Use fixed positions within cell to ensure consistency
                positions = [
                    (0, 0),  # Center
                    (-0.25, -0.25),
                    (0.25, -0.25),  # Lower corners
                    (-0.25, 0.25),
                    (0.25, 0.25),  # Upper corners
                ]

                for i in range(num_dots):
                    offset_lat, offset_lon = positions[i]
                    dot_lat = lat + offset_lat * cellsize
                    dot_lon = lon + offset_lon * cellsize
                    if not is_land(dot_lat, dot_lon):
                        attempts = 0
                        while True:
                            dot_lat = lat + np.random.uniform(
                                -cellsize / 2, cellsize / 2
                            )
                            dot_lon = lon + np.random.uniform(
                                -cellsize / 2, cellsize / 2
                            )
                            if is_land(dot_lat, dot_lon) or attempts >= 10:
                                break
                            attempts += 1
                    dots.append((dot_lat, dot_lon, population_per_dot))

        return dots
