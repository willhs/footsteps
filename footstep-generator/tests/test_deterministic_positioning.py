#!/usr/bin/env python3
"""
Tests for deterministic positioning logic in LODProcessor.
Validates that positioning algorithms produce consistent results.
"""

import pytest
import numpy as np
import sys
import os
from unittest.mock import patch

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lod_processor import LODProcessor
from models import (
    LODConfiguration,
    SettlementContinuityConfig,
    HumanSettlement,
    Coordinates,
)
from settlement_registry import SettlementRegistry


class TestDeterministicPositioning:
    """Test cases for deterministic positioning in LODProcessor."""

    def setup_method(self):
        """Set up test fixtures."""
        self.lod_config = LODConfiguration()
        self.continuity_config = SettlementContinuityConfig(enable_continuity=True)
        self.processor = LODProcessor(
            config=self.lod_config, continuity_config=self.continuity_config
        )

        # Test parameters
        self.test_lat = 40.7589
        self.test_lon = -73.9851
        self.test_cellsize = 0.083333
        self.people_per_dot = 100

    def test_deterministic_vs_random_mode(self):
        """Test that deterministic mode produces different results than random mode."""
        # Create processor with continuity disabled (random mode)
        random_config = SettlementContinuityConfig(enable_continuity=False)
        random_processor = LODProcessor(
            config=self.lod_config, continuity_config=random_config
        )

        cell_population = 1000

        # Get deterministic dots
        deterministic_dots = self.processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Get random dots (multiple times to ensure they're different)
        random_dots1 = random_processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )
        random_dots2 = random_processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Deterministic should be consistent
        deterministic_dots2 = self.processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        assert deterministic_dots == deterministic_dots2  # Should be identical
        assert (
            random_dots1 != random_dots2
        )  # Should be different (with high probability)

    def test_deterministic_dot_consistency(self):
        """Test that deterministic positioning produces identical results across calls."""
        cell_population = 5000

        dots1 = self.processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )
        dots2 = self.processor.create_density_aware_dots(
            cell_population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        assert len(dots1) == len(dots2)

        for dot1, dot2 in zip(dots1, dots2):
            lat1, lon1, pop1 = dot1
            lat2, lon2, pop2 = dot2

            assert abs(lat1 - lat2) < 1e-10, f"Latitude mismatch: {lat1} vs {lat2}"
            assert abs(lon1 - lon2) < 1e-10, f"Longitude mismatch: {lon1} vs {lon2}"
            assert abs(pop1 - pop2) < 1e-6, f"Population mismatch: {pop1} vs {pop2}"

    def test_settlement_type_classification(self):
        """Test that settlement types are correctly classified based on population."""
        rural_pop = 500
        town_pop = 5000
        city_pop = 50000

        # Test rural classification
        rural_dots = self.processor.create_density_aware_dots(
            rural_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Test town classification
        town_dots = self.processor.create_density_aware_dots(
            town_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Test city classification
        city_dots = self.processor.create_density_aware_dots(
            city_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Rural should have more dots (lower aggregation)
        # Town should have fewer dots (medium aggregation)
        # City should have fewest dots (high aggregation)

        rural_dots_per_person = len(rural_dots) / rural_pop
        town_dots_per_person = len(town_dots) / town_pop
        city_dots_per_person = len(city_dots) / city_pop

        assert rural_dots_per_person > town_dots_per_person
        assert town_dots_per_person > city_dots_per_person

    def test_population_conservation(self):
        """Test that total population is conserved across all dots."""
        test_populations = [100, 1000, 5000, 20000, 100000]

        for population in test_populations:
            dots = self.processor.create_density_aware_dots(
                population,
                self.test_lat,
                self.test_lon,
                self.test_cellsize,
                self.people_per_dot,
            )

            total_dot_population = sum(dot[2] for dot in dots)  # dot[2] is population

            # Allow small floating point differences
            assert (
                abs(total_dot_population - population) < 1e-6
            ), f"Population not conserved: {total_dot_population} vs {population}"

    def test_coordinate_bounds_validation(self):
        """Test that all generated coordinates are within valid bounds."""
        test_cases = [
            (1000, self.test_lat, self.test_lon),
            (5000, 89.0, 0.0),  # Near North Pole
            (2000, -89.0, 0.0),  # Near South Pole
            (3000, 0.0, 179.0),  # Near Date Line
            (1500, 0.0, -179.0),  # Near Date Line (West)
        ]

        for population, lat, lon in test_cases:
            dots = self.processor.create_density_aware_dots(
                population, lat, lon, self.test_cellsize, self.people_per_dot
            )

            for dot_lat, dot_lon, _ in dots:
                assert -90 <= dot_lat <= 90, f"Invalid latitude: {dot_lat}"
                assert -180 <= dot_lon <= 180, f"Invalid longitude: {dot_lon}"

    def test_minimum_population_threshold(self):
        """Test that populations below threshold don't generate dots."""
        low_populations = [10, 25, 49]  # Below the 50 person threshold

        for population in low_populations:
            dots = self.processor.create_density_aware_dots(
                population,
                self.test_lat,
                self.test_lon,
                self.test_cellsize,
                self.people_per_dot,
            )

            assert (
                len(dots) == 0
            ), f"Should not generate dots for population {population}"

    def test_different_coordinates_produce_different_positions(self):
        """Test that different coordinates produce different dot positions."""
        population = 2000

        dots1 = self.processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        dots2 = self.processor.create_density_aware_dots(
            population,
            self.test_lat + 1.0,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        dots3 = self.processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon + 1.0,
            self.test_cellsize,
            self.people_per_dot,
        )

        # All should have same number of dots but different positions
        assert len(dots1) == len(dots2) == len(dots3)
        assert dots1 != dots2
        assert dots1 != dots3
        assert dots2 != dots3

    def test_cell_size_affects_positioning(self):
        """Test that different cell sizes affect dot positioning."""
        population = 3000
        cellsize1 = 0.1
        cellsize2 = 0.2

        dots1 = self.processor.create_density_aware_dots(
            population, self.test_lat, self.test_lon, cellsize1, self.people_per_dot
        )

        dots2 = self.processor.create_density_aware_dots(
            population, self.test_lat, self.test_lon, cellsize2, self.people_per_dot
        )

        # Should produce different positions due to different cell sizes
        assert dots1 != dots2

        # Population should still be conserved
        total_pop1 = sum(dot[2] for dot in dots1)
        total_pop2 = sum(dot[2] for dot in dots2)
        assert abs(total_pop1 - population) < 1e-6
        assert abs(total_pop2 - population) < 1e-6

    def test_settlement_registry_integration(self):
        """Clearing registry cache should not affect deterministic results."""
        assert self.processor.settlement_registry is not None
        population = 1000

        dots1 = self.processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Clearing cache should not change output
        self.processor.settlement_registry.clear_cache()
        dots2 = self.processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        assert dots1 == dots2

    def test_continuity_config_thresholds(self):
        """Test that continuity configuration thresholds are respected."""
        # Create processor with custom thresholds
        custom_config = SettlementContinuityConfig(
            enable_continuity=True,
            rural_to_town_threshold=2000,
            town_to_city_threshold=20000,
        )
        custom_processor = LODProcessor(
            config=self.lod_config, continuity_config=custom_config
        )

        # Test populations around thresholds
        rural_pop = 1500  # Below 2000 -> rural
        town_pop = 10000  # Between 2000-20000 -> town
        city_pop = 50000  # Above 20000 -> city

        rural_dots = custom_processor.create_density_aware_dots(
            rural_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        town_dots = custom_processor.create_density_aware_dots(
            town_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        city_dots = custom_processor.create_density_aware_dots(
            city_pop,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Verify different dot densities based on settlement type
        rural_density = len(rural_dots) / rural_pop
        town_density = len(town_dots) / town_pop
        city_density = len(city_dots) / city_pop

        assert rural_density > town_density > city_density

    def test_fallback_to_random_when_continuity_disabled(self):
        """Test that processor falls back to random positioning when continuity is disabled."""
        # Create processor with continuity disabled
        no_continuity_config = SettlementContinuityConfig(enable_continuity=False)
        random_processor = LODProcessor(
            config=self.lod_config, continuity_config=no_continuity_config
        )

        # Should not have a settlement registry
        assert random_processor.settlement_registry is None

        # Should still produce dots, but they should be random
        population = 2000

        dots1 = random_processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        dots2 = random_processor.create_density_aware_dots(
            population,
            self.test_lat,
            self.test_lon,
            self.test_cellsize,
            self.people_per_dot,
        )

        # Should produce same number of dots but different positions
        assert len(dots1) == len(dots2)

        # With high probability, positions should be different
        # (very small chance they could be identical by chance)
        positions_equal = all(
            abs(d1[0] - d2[0]) < 1e-10 and abs(d1[1] - d2[1]) < 1e-10
            for d1, d2 in zip(dots1, dots2)
        )
        assert not positions_equal, "Random positions should not be identical"


class TestDeterministicPositioningEdgeCases:
    """Test edge cases and error conditions for deterministic positioning."""

    def setup_method(self):
        """Set up test fixtures."""
        self.continuity_config = SettlementContinuityConfig(enable_continuity=True)
        self.processor = LODProcessor(continuity_config=self.continuity_config)

    def test_zero_population(self):
        """Test handling of zero population."""
        dots = self.processor.create_density_aware_dots(0, 40.0, -73.0, 0.1, 100)
        assert len(dots) == 0

    def test_negative_population(self):
        """Test handling of negative population."""
        dots = self.processor.create_density_aware_dots(-100, 40.0, -73.0, 0.1, 100)
        assert len(dots) == 0

    def test_very_small_cell_size(self):
        """Test handling of very small cell sizes."""
        dots = self.processor.create_density_aware_dots(1000, 40.0, -73.0, 0.001, 100)

        # Should still produce valid results
        assert len(dots) > 0
        for dot_lat, dot_lon, _ in dots:
            assert -90 <= dot_lat <= 90
            assert -180 <= dot_lon <= 180

    def test_very_large_cell_size(self):
        """Test handling of very large cell sizes."""
        dots = self.processor.create_density_aware_dots(1000, 40.0, -73.0, 10.0, 100)

        # Should still produce valid results
        assert len(dots) > 0
        for dot_lat, dot_lon, _ in dots:
            assert -90 <= dot_lat <= 90
            assert -180 <= dot_lon <= 180

    def test_extreme_coordinates(self):
        """Test positioning at extreme coordinates."""
        extreme_cases = [
            (89.9, 0.0),  # Very close to North Pole
            (-89.9, 0.0),  # Very close to South Pole
            (0.0, 179.9),  # Very close to Date Line
            (0.0, -179.9),  # Very close to Date Line (other side)
        ]

        for lat, lon in extreme_cases:
            dots = self.processor.create_density_aware_dots(1000, lat, lon, 0.1, 100)

            assert len(dots) > 0
            for dot_lat, dot_lon, _ in dots:
                assert -90 <= dot_lat <= 90
                assert -180 <= dot_lon <= 180


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v"])
