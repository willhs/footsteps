#!/usr/bin/env python3
"""
End-to-end tests for the HYDE data processing pipeline.
Tests the complete flow from data validation to LOD generation.
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import tempfile
import pathlib
import numpy as np
from typing import List, Dict
from unittest.mock import patch, MagicMock

from models import (
    LODLevel,
    Coordinates,
    HumanSettlement,
    AggregatedSettlement,
    LODConfiguration,
    ProcessingStatistics,
    HYDEDataFile,
    GridMetadata,
)
from lod_processor import LODProcessor


class TestDataProcessingPipeline:
    """End-to-end tests for the complete data processing pipeline."""

    def create_test_settlements(
        self, count: int = 100, year: int = 0
    ) -> List[HumanSettlement]:
        """Create test settlement data for validation."""
        settlements = []

        # Create settlements distributed globally with varying populations
        for i in range(count):
            # Distribute evenly across the globe
            lon = -180 + (360 * i / count)
            lat = -60 + (120 * i / count)  # Avoid extreme poles

            # Vary population sizes realistically
            if i % 20 == 0:  # 5% are cities
                population = np.random.uniform(10000, 100000)
            elif i % 5 == 0:  # 20% are towns
                population = np.random.uniform(1000, 10000)
            else:  # 75% are villages/rural
                population = np.random.uniform(100, 1000)

            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=lon, latitude=lat),
                population=population,
                year=year,
                settlement_type="settlement",
                source_resolution=0.083333,  # ~5 arcminutes
            )
            settlements.append(settlement)

        return settlements

    def test_pydantic_model_validation(self):
        """Test that Pydantic models properly validate data."""
        # Test valid coordinate creation
        coords = Coordinates(longitude=0.0, latitude=0.0)
        assert coords.longitude == 0.0
        assert coords.latitude == 0.0

        # Test invalid coordinates
        with pytest.raises(ValueError):
            Coordinates(longitude=181.0, latitude=0.0)  # Invalid longitude

        with pytest.raises(ValueError):
            Coordinates(longitude=0.0, latitude=91.0)  # Invalid latitude

        # Test valid settlement creation
        settlement = HumanSettlement(
            coordinates=coords, population=1000.0, year=0, source_resolution=0.083333
        )
        assert settlement.population == 1000.0
        assert settlement.year == 0

        # Test invalid settlement data
        with pytest.raises(ValueError):
            HumanSettlement(
                coordinates=coords,
                population=-100.0,  # Negative population
                year=0,
                source_resolution=0.083333,
            )

        with pytest.raises(ValueError):
            HumanSettlement(
                coordinates=coords,
                population=1000.0,
                year=-20000,  # Year too far in past
                source_resolution=0.083333,
            )

    def test_lod_configuration_validation(self):
        """Test LOD configuration validation."""
        # Test default configuration
        config = LODConfiguration()
        assert config.global_grid_size == 2.0
        assert config.regional_grid_size == 0.5
        assert config.local_grid_size == 0.1
        assert config.min_population_threshold == 50.0

        # Test custom configuration
        custom_config = LODConfiguration(
            global_grid_size=1.0,
            regional_grid_size=0.25,
            local_grid_size=0.05,
            min_population_threshold=100.0,
        )
        assert custom_config.global_grid_size == 1.0

        # Test invalid configuration
        with pytest.raises(ValueError):
            LODConfiguration(global_grid_size=-1.0)  # Negative grid size

    def test_lod_processor_initialization(self):
        """Test LOD processor initialization and configuration."""
        # Test default initialization
        processor = LODProcessor()
        assert processor.config.global_grid_size == 2.0

        # Test custom configuration
        custom_config = LODConfiguration(global_grid_size=1.5)
        processor = LODProcessor(config=custom_config)
        assert processor.config.global_grid_size == 1.5

    def test_hierarchical_lod_creation(self):
        """Test complete hierarchical LOD creation process."""
        processor = LODProcessor()
        settlements = self.create_test_settlements(count=50, year=1000)

        # Process settlements into LOD hierarchy
        lod_data = processor.create_hierarchical_lods(settlements)

        # Verify aggregated LOD levels are present
        assert LODLevel.REGIONAL in lod_data
        assert LODLevel.SUBREGIONAL in lod_data
        assert LODLevel.LOCAL in lod_data
        assert LODLevel.DETAILED in lod_data

        # Verify hierarchical reduction (regional < subregional < local < detailed)
        regional_count = len(lod_data[LODLevel.REGIONAL])
        subregional_count = len(lod_data[LODLevel.SUBREGIONAL])
        local_count = len(lod_data[LODLevel.LOCAL])
        detailed_count = len(lod_data[LODLevel.DETAILED])

        assert regional_count <= subregional_count
        assert subregional_count <= local_count
        assert local_count <= detailed_count
        assert detailed_count == len(settlements)  # Detailed should match original

        # Verify aggregated settlement structure (check subregional)
        if subregional_count > 0:
            subregional_settlement = lod_data[LODLevel.SUBREGIONAL][0]
            assert isinstance(subregional_settlement, AggregatedSettlement)
            assert subregional_settlement.lod_level == LODLevel.SUBREGIONAL
            assert subregional_settlement.total_population > 0
            assert subregional_settlement.source_dot_count > 0
            assert subregional_settlement.year == 1000

    def test_population_conservation(self):
        """Test that total population is conserved across LOD levels."""
        processor = LODProcessor()
        settlements = self.create_test_settlements(count=30, year=500)

        # Calculate original total population
        original_population = sum(s.population for s in settlements)

        # Process into LOD hierarchy
        lod_data = processor.create_hierarchical_lods(settlements)

        # Check population conservation for each LOD level
        for lod_level, aggregated_settlements in lod_data.items():
            lod_total_population = sum(
                s.total_population for s in aggregated_settlements
            )

            # Allow for small rounding errors and filtering
            population_ratio = lod_total_population / original_population
            assert (
                0.9 <= population_ratio <= 1.1
            ), f"Population not conserved at {lod_level}: {population_ratio:.3f}"

    def test_density_aware_dot_creation(self):
        """Test density-aware dot creation for different population levels."""
        processor = LODProcessor()

        # Test rural area (low population)
        rural_dots = processor.create_density_aware_dots(
            cell_population=200.0,
            lat=45.0,
            lon=-100.0,
            cellsize=0.083333,
            people_per_dot=100,
        )
        assert len(rural_dots) == 2

        # Test town (medium population)
        town_dots = processor.create_density_aware_dots(
            cell_population=5000.0,
            lat=45.0,
            lon=-100.0,
            cellsize=0.083333,
            people_per_dot=100,
        )
        assert len(town_dots) == 5

        # Test city (high population)
        city_dots = processor.create_density_aware_dots(
            cell_population=50000.0,
            lat=45.0,
            lon=-100.0,
            cellsize=0.083333,
            people_per_dot=100,
        )
        assert len(city_dots) == 3

        # Test very sparse area (should create no dots)
        sparse_dots = processor.create_density_aware_dots(
            cell_population=25.0,  # Below 50 threshold
            lat=45.0,
            lon=-100.0,
            cellsize=0.083333,
            people_per_dot=100,
        )
        assert len(sparse_dots) == 0

    def test_data_validation_statistics(self):
        """Test data validation and statistics generation."""
        processor = LODProcessor()
        settlements = self.create_test_settlements(count=20, year=800)

        # Add some invalid settlements
        invalid_settlements = [
            # Invalid coordinates (will be caught by Pydantic, but testing the concept)
        ]

        # Validate settlements
        stats = processor.validate_settlement_data(settlements)

        assert isinstance(stats, ProcessingStatistics)
        assert stats.total_cells_processed == len(settlements)
        assert stats.valid_cells_found <= stats.total_cells_processed
        assert stats.total_population > 0
        assert stats.dots_created == stats.valid_cells_found
        assert stats.valid_cell_ratio <= 1.0

    def test_zoom_level_lod_mapping(self):
        """Test mapping zoom levels to appropriate LOD levels."""
        processor = LODProcessor()

        # Test zoom level mappings (4 tiers: REGIONAL/SUBREGIONAL/LOCAL/DETAILED)
        assert processor.get_lod_level_for_zoom(0.5) == LODLevel.REGIONAL
        assert processor.get_lod_level_for_zoom(3.5) == LODLevel.REGIONAL
        assert processor.get_lod_level_for_zoom(4.5) == LODLevel.SUBREGIONAL
        assert processor.get_lod_level_for_zoom(5.5) == LODLevel.LOCAL
        assert processor.get_lod_level_for_zoom(6.5) == LODLevel.DETAILED
        assert processor.get_lod_level_for_zoom(10.0) == LODLevel.DETAILED

    def test_performance_impact_estimation(self):
        """Test performance impact estimation for different LOD levels."""
        processor = LODProcessor()
        settlements = self.create_test_settlements(count=40, year=1200)

        # Test performance estimates for different LOD levels
        for lod_level in LODLevel:
            performance = processor.estimate_performance_impact(settlements, lod_level)

            assert "original_dot_count" in performance
            assert "lod_dot_count" in performance
            assert "reduction_ratio" in performance
            assert "estimated_speedup" in performance
            assert "memory_reduction_mb" in performance

            assert performance["original_dot_count"] == len(settlements)
            assert performance["lod_dot_count"] >= 0
            assert 0 <= performance["reduction_ratio"] <= 1.0
            assert performance["estimated_speedup"] >= 1.0
            assert performance["memory_reduction_mb"] >= 0

    def test_empty_data_handling(self):
        """Test handling of empty or minimal datasets."""
        processor = LODProcessor()

        # Test empty settlements list
        empty_lod_data = processor.create_hierarchical_lods([])
        for lod_level in LODLevel:
            assert lod_level in empty_lod_data
            assert len(empty_lod_data[lod_level]) == 0

        # Test single settlement
        single_settlement = self.create_test_settlements(count=1, year=1000)
        single_lod_data = processor.create_hierarchical_lods(single_settlement)

        # Should have at least the detailed level
        assert len(single_lod_data[LODLevel.DETAILED]) == 1

    def test_coordinate_boundary_conditions(self):
        """Test coordinate boundary conditions and edge cases."""
        # Test settlements at coordinate boundaries
        boundary_coords = [
            (-180, -90),  # Bottom-left corner
            (180, 90),  # Top-right corner
            (0, 0),  # Origin
            (-180, 90),  # Top-left corner
            (180, -90),  # Bottom-right corner
        ]

        settlements = []
        for i, (lon, lat) in enumerate(boundary_coords):
            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=lon, latitude=lat),
                population=1000.0 + i * 100,
                year=1000,
                source_resolution=0.083333,
            )
            settlements.append(settlement)

        processor = LODProcessor()
        lod_data = processor.create_hierarchical_lods(settlements)

        # Should process boundary coordinates without errors
        assert len(lod_data[LODLevel.DETAILED]) == len(settlements)

    @pytest.fixture
    def temp_directory(self):
        """Provide a temporary directory for testing file operations."""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield pathlib.Path(temp_dir)

    def test_processing_result_structure(self, temp_directory):
        """Test ProcessingResult model structure and validation."""
        from models import ProcessingResult

        processor = LODProcessor()
        settlements = self.create_test_settlements(count=25, year=1500)
        lod_data = processor.create_hierarchical_lods(settlements)

        # Create processing result
        result = ProcessingResult(
            year=1500,
            lod_data=lod_data,
            total_population=sum(s.population for s in settlements),
            processing_stats={
                "settlements_processed": len(settlements),
                "processing_time": 1.23,
                "memory_used_mb": 45.67,
            },
        )

        assert result.year == 1500
        assert isinstance(result.lod_data, dict)
        assert result.total_population > 0
        assert "settlements_processed" in result.processing_stats


def run_basic_pipeline_test():
    """Run a basic end-to-end pipeline test for manual verification."""
    print("🧪 Running basic e2e pipeline test...")

    # Create processor with custom configuration
    config = LODConfiguration(
        global_grid_size=3.0,
        regional_grid_size=1.0,
        local_grid_size=0.2,
        min_population_threshold=75.0,
    )
    processor = LODProcessor(config=config)

    # Create test data
    test_data = []
    for i in range(100):
        lon = -180 + (360 * i / 100)
        lat = -60 + (120 * i / 100)
        pop = 100 + (i * 50)  # Increasing population

        settlement = HumanSettlement(
            coordinates=Coordinates(longitude=lon, latitude=lat),
            population=pop,
            year=1000,
            source_resolution=0.083333,
        )
        test_data.append(settlement)

    print(f"  Created {len(test_data)} test settlements")

    # Process through LOD hierarchy
    lod_results = processor.create_hierarchical_lods(test_data)

    print("  LOD Results:")
    for level, settlements in lod_results.items():
        print(f"    {level.name}: {len(settlements)} settlements")

    # Validate population conservation
    original_pop = sum(s.population for s in test_data)
    for level, settlements in lod_results.items():
        lod_pop = sum(s.total_population for s in settlements)
        ratio = lod_pop / original_pop
        print(f"    {level.name} population ratio: {ratio:.3f}")

    print("✓ Basic e2e pipeline test completed successfully")


if __name__ == "__main__":
    # Run basic test without pytest
    run_basic_pipeline_test()
    print("\n📝 To run full test suite: pytest test_e2e.py -v")
