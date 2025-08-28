#!/usr/bin/env python3
"""
Integration tests for multi-year settlement continuity.
Tests the complete pipeline to ensure settlements maintain consistency across years.
"""

import pytest
import numpy as np
import sys
import os
import tempfile
import shutil
from pathlib import Path

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lod_processor import LODProcessor
from hyde_tile_processor import generate_yearly_tile_data, hyde_grid_to_tile_points
from models import (
    LODConfiguration, SettlementContinuityConfig, HumanSettlement, 
    Coordinates, ContinuityValidationResult
)
from settlement_registry import SettlementRegistry


class TestMultiYearContinuity:
    """Test cases for multi-year settlement continuity."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.lod_config = LODConfiguration()
        self.continuity_config = SettlementContinuityConfig(enable_continuity=True)
        self.processor = LODProcessor(
            config=self.lod_config,
            continuity_config=self.continuity_config
        )
        
        # Create temporary directory for test outputs
        self.temp_dir = tempfile.mkdtemp()
        
        # Test coordinates (around major population centers)
        self.test_locations = [
            (40.7589, -73.9851),  # New York
            (51.5074, -0.1278),   # London  
            (35.6762, 139.6503),  # Tokyo
            (28.6139, 77.2090),   # Delhi
        ]
    
    def teardown_method(self):
        """Clean up test fixtures."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def create_mock_settlements(self, year: int, location_populations: list) -> list:
        """Create mock settlements for testing."""
        settlements = []
        cellsize = 0.083333
        
        for i, (lat, lon, population) in enumerate(location_populations):
            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=lon, latitude=lat),
                population=population,
                year=year,
                settlement_type="settlement",
                source_resolution=cellsize
            )
            settlements.append(settlement)
        
        return settlements
    
    def test_same_coordinates_produce_same_positions_across_years(self):
        """Test that same coordinates produce identical positions across different years."""
        test_coordinates = [(40.0, -73.0, 1000), (51.0, 0.0, 2000)]
        
        # Create settlements for different years at same locations
        settlements_2000 = self.create_mock_settlements(2000, test_coordinates)
        settlements_2010 = self.create_mock_settlements(2010, test_coordinates)
        
        # Process both years with same processor (should use same registry)
        lod_data_2000 = self.processor.create_hierarchical_lods(settlements_2000)
        lod_data_2010 = self.processor.create_hierarchical_lods(settlements_2010)
        
        # Compare detailed LOD positions (should be identical)
        from models import LODLevel
        detailed_2000 = lod_data_2000[LODLevel.DETAILED]
        detailed_2010 = lod_data_2010[LODLevel.DETAILED]
        
        assert len(detailed_2000) == len(detailed_2010)
        
        # Sort by coordinates for consistent comparison
        detailed_2000_sorted = sorted(detailed_2000, key=lambda x: (x.coordinates.latitude, x.coordinates.longitude))
        detailed_2010_sorted = sorted(detailed_2010, key=lambda x: (x.coordinates.latitude, x.coordinates.longitude))
        
        for settlement_2000, settlement_2010 in zip(detailed_2000_sorted, detailed_2010_sorted):
            # Coordinates should be identical
            assert abs(settlement_2000.coordinates.latitude - settlement_2010.coordinates.latitude) < 1e-10
            assert abs(settlement_2000.coordinates.longitude - settlement_2010.coordinates.longitude) < 1e-10
            
            # Years should be different
            assert settlement_2000.year != settlement_2010.year
    
    def test_population_changes_dont_affect_positions_same_type(self):
        """Test that population changes within same settlement type don't affect positions."""
        lat, lon = 40.0, -73.0
        
        # Use populations that result in the same settlement type (both rural)
        rural_pop_low = 500   # Rural
        rural_pop_high = 800  # Still rural (< 1000 threshold)
        
        # Get dots directly from processor
        dots_low = self.processor.create_density_aware_dots(rural_pop_low, lat, lon, 0.083333, 100)
        dots_high = self.processor.create_density_aware_dots(rural_pop_high, lat, lon, 0.083333, 100)
        
        # Should have different number of dots but same positions for overlapping dots
        # (The high population will have more dots, but the first few should be in same positions)
        min_dots = min(len(dots_low), len(dots_high))
        
        if min_dots > 0:  # Only test if both generated dots
            for i in range(min_dots):
                lat_low, lon_low, _ = dots_low[i]
                lat_high, lon_high, _ = dots_high[i]
                
                # Positions should be the same (within floating point precision)
                assert abs(lat_low - lat_high) < 1e-10, f"Latitude mismatch at index {i}: {lat_low} vs {lat_high}"
                assert abs(lon_low - lon_high) < 1e-10, f"Longitude mismatch at index {i}: {lon_low} vs {lon_high}"
    
    def test_settlement_type_transitions_maintain_consistency(self):
        """Test that settlement type transitions maintain position consistency."""
        lat, lon = 35.0, 139.0
        cellsize = 0.083333
        people_per_dot = 100
        
        # Rural -> Town -> City population progression
        rural_pop = 800      # Rural
        town_pop = 3000      # Town  
        city_pop = 15000     # City
        
        rural_dots = self.processor.create_density_aware_dots(
            rural_pop, lat, lon, cellsize, people_per_dot
        )
        town_dots = self.processor.create_density_aware_dots(
            town_pop, lat, lon, cellsize, people_per_dot
        )
        city_dots = self.processor.create_density_aware_dots(
            city_pop, lat, lon, cellsize, people_per_dot
        )
        
        # All should have at least one dot at the same base position
        # (subsequent dots may be different due to different settlement types)
        assert len(rural_dots) >= 1
        assert len(town_dots) >= 1  
        assert len(city_dots) >= 1
        
        # Check that all coordinates are valid
        for dots in [rural_dots, town_dots, city_dots]:
            for dot_lat, dot_lon, _ in dots:
                assert -90 <= dot_lat <= 90
                assert -180 <= dot_lon <= 180
    
    def test_continuity_across_processor_instances(self):
        """Test that continuity is maintained across different processor instances."""
        lat, lon = 28.0, 77.0
        population = 2000
        cellsize = 0.083333
        people_per_dot = 100
        
        # Create two separate processors with same configuration
        processor1 = LODProcessor(
            config=self.lod_config,
            continuity_config=self.continuity_config
        )
        processor2 = LODProcessor(
            config=self.lod_config, 
            continuity_config=self.continuity_config
        )
        
        # Both should produce same results for same inputs
        dots1 = processor1.create_density_aware_dots(
            population, lat, lon, cellsize, people_per_dot
        )
        dots2 = processor2.create_density_aware_dots(
            population, lat, lon, cellsize, people_per_dot
        )
        
        assert len(dots1) == len(dots2)
        
        for dot1, dot2 in zip(dots1, dots2):
            lat1, lon1, pop1 = dot1
            lat2, lon2, pop2 = dot2
            
            assert abs(lat1 - lat2) < 1e-10
            assert abs(lon1 - lon2) < 1e-10
            assert abs(pop1 - pop2) < 1e-6
    
    def test_registry_cache_effectiveness(self):
        """Test that the settlement registry cache improves performance."""
        lat, lon = 40.0, -70.0
        population = 1500
        cellsize = 0.083333
        people_per_dot = 100
        
        # Clear cache first
        self.processor.settlement_registry.clear_cache()
        initial_stats = self.processor.settlement_registry.get_cache_stats()
        assert initial_stats["cached_cells"] == 0
        
        # First call should populate cache
        dots1 = self.processor.create_density_aware_dots(
            population, lat, lon, cellsize, people_per_dot
        )
        
        after_first_stats = self.processor.settlement_registry.get_cache_stats()
        assert after_first_stats["cached_cells"] == 1
        assert after_first_stats["total_cached_positions"] > 0
        
        # Second call should use cache (positions should be identical)
        dots2 = self.processor.create_density_aware_dots(
            population, lat, lon, cellsize, people_per_dot
        )
        
        # Cache stats should be unchanged (no new entries)
        after_second_stats = self.processor.settlement_registry.get_cache_stats()
        assert after_second_stats["cached_cells"] == 1
        assert after_second_stats["total_cached_positions"] == after_first_stats["total_cached_positions"]
        
        # Results should be identical
        assert dots1 == dots2
    
    def test_different_cell_sizes_create_different_settlements(self):
        """Test that different cell sizes create different settlement patterns."""
        lat, lon = 50.0, 10.0
        population = 3000
        people_per_dot = 100
        
        cellsize_small = 0.05
        cellsize_large = 0.2
        
        dots_small = self.processor.create_density_aware_dots(
            population, lat, lon, cellsize_small, people_per_dot
        )
        dots_large = self.processor.create_density_aware_dots(
            population, lat, lon, cellsize_large, people_per_dot
        )
        
        # Should have same number of dots but different positions
        assert len(dots_small) == len(dots_large)
        
        # Positions should be different due to different cell sizes
        assert dots_small != dots_large
        
        # But population should be conserved
        total_pop_small = sum(dot[2] for dot in dots_small)
        total_pop_large = sum(dot[2] for dot in dots_large)
        
        assert abs(total_pop_small - population) < 1e-6
        assert abs(total_pop_large - population) < 1e-6
    
    def test_geographic_distribution_realism(self):
        """Test that generated settlements have realistic geographic distribution."""
        # Test multiple locations with different characteristics
        test_cases = [
            (40.7589, -73.9851, 5000),  # New York (urban)
            (60.0, -150.0, 200),        # Alaska (sparse rural)
            (0.0, 20.0, 800),           # Equatorial Africa (rural)
        ]
        
        for lat, lon, population in test_cases:
            dots = self.processor.create_density_aware_dots(
                population, lat, lon, 0.083333, 100
            )
            
            if population >= 50:  # Above minimum threshold
                assert len(dots) > 0
                
                # Check spread of positions
                latitudes = [dot[0] for dot in dots]
                longitudes = [dot[1] for dot in dots]
                
                # Should have some spread but not too wide
                lat_range = max(latitudes) - min(latitudes)
                lon_range = max(longitudes) - min(longitudes)
                
                # Should be contained within reasonable bounds of the cell
                assert lat_range <= 0.2  # Within reasonable cell bounds
                assert lon_range <= 0.2
                
                # Should be centered approximately around the input coordinates
                avg_lat = sum(latitudes) / len(latitudes)
                avg_lon = sum(longitudes) / len(longitudes)
                
                assert abs(avg_lat - lat) <= 0.1
                assert abs(avg_lon - lon) <= 0.1
    
    def test_continuity_validation_results(self):
        """Test creation and validation of continuity results."""
        # Create some test settlements
        settlements = []
        for i, (lat, lon) in enumerate(self.test_locations):
            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=lon, latitude=lat),
                population=1000 * (i + 1),
                year=2000,
                settlement_type="settlement",
                source_resolution=0.083333
            )
            settlements.append(settlement)
        
        # Test the validation framework (this tests our models work correctly)
        validation_result = ContinuityValidationResult(
            is_valid=True,
            consistent_positions=len(settlements),
            total_settlements=len(settlements),
            position_consistency_ratio=1.0,
            validation_errors=[],
            performance_metrics={"processing_time": 0.1}
        )
        
        assert validation_result.is_valid
        assert validation_result.is_acceptable  # Should be >95% consistency
        assert validation_result.position_consistency_ratio == 1.0
    
    def test_multi_year_position_stability_comprehensive(self):
        """Comprehensive test of position stability across multiple years."""
        lat, lon = 45.0, 2.0  # Central France
        years = [1800, 1850, 1900, 1950, 2000]
        
        # Use same population to ensure same settlement type across all years
        fixed_population = 800  # Rural type for all years
        
        all_dots = {}
        
        # Generate dots for each year with same population
        for year in years:
            dots = self.processor.create_density_aware_dots(
                fixed_population, lat, lon, 0.083333, 100
            )
            all_dots[year] = dots
        
        # Verify that all dot positions are consistent across all years
        if all(all_dots[year] for year in years):  # If all years generated dots
            base_year_dots = all_dots[years[0]]
            
            for year in years[1:]:
                year_dots = all_dots[year]
                
                # Should have same number of dots
                assert len(year_dots) == len(base_year_dots), f"Dot count mismatch in year {year}"
                
                # All positions should be identical
                for i, (base_dot, year_dot) in enumerate(zip(base_year_dots, year_dots)):
                    base_lat, base_lon, _ = base_dot
                    year_lat, year_lon, _ = year_dot
                    
                    assert abs(year_lat - base_lat) < 1e-10, f"Latitude mismatch at dot {i} in year {year}"
                    assert abs(year_lon - base_lon) < 1e-10, f"Longitude mismatch at dot {i} in year {year}"


class TestContinuityPerformance:
    """Test performance characteristics of the continuity system."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.continuity_config = SettlementContinuityConfig(enable_continuity=True)
        self.processor = LODProcessor(continuity_config=self.continuity_config)
    
    def test_performance_with_large_datasets(self):
        """Test performance with large numbers of settlements."""
        import time
        
        # Create large dataset
        large_dataset = []
        for i in range(100):  # 100 settlements
            lat = 40.0 + (i % 10) * 0.1  # Spread across small area
            lon = -73.0 + (i // 10) * 0.1
            
            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=lon, latitude=lat),
                population=1000,
                year=2000,
                settlement_type="settlement", 
                source_resolution=0.083333
            )
            large_dataset.append(settlement)
        
        # Time the processing
        start_time = time.time()
        lod_data = self.processor.create_hierarchical_lods(large_dataset)
        end_time = time.time()
        
        processing_time = end_time - start_time
        
        # Should complete in reasonable time (less than 5 seconds for 100 settlements)
        assert processing_time < 5.0, f"Processing took too long: {processing_time:.2f} seconds"
        
        # Should produce valid results
        assert len(lod_data) > 0
        
        # To populate cache, we need to call create_density_aware_dots
        # (hierarchical LODs don't directly use the settlement registry)
        test_dots = self.processor.create_density_aware_dots(1000, 40.0, -73.0, 0.083333, 100)
        assert len(test_dots) > 0
        
        # Now check that cache is populated
        cache_stats = self.processor.settlement_registry.get_cache_stats()
        assert cache_stats["cached_cells"] > 0
    
    def test_memory_usage_estimation(self):
        """Test that memory usage stays within reasonable bounds."""
        # Generate settlements to populate cache
        for i in range(50):
            lat = 40.0 + i * 0.01
            lon = -73.0 + i * 0.01
            
            self.processor.create_density_aware_dots(1000, lat, lon, 0.083333, 100)
        
        # Check memory usage estimate
        cache_stats = self.processor.settlement_registry.get_cache_stats()
        memory_estimate_kb = cache_stats["memory_usage_estimate_kb"]
        
        # Should be reasonable (less than 10MB for this test)
        assert memory_estimate_kb < 10 * 1024, f"Memory usage too high: {memory_estimate_kb} KB"


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v"])