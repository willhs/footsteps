#!/usr/bin/env python3
"""
Unit tests for settlement registry and deterministic positioning functionality.
Tests the core settlement continuity mechanisms.
"""

import pytest
import numpy as np
import sys
import os

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from settlement_registry import SettlementRegistry, SettlementPosition
from models import Coordinates, SettlementContinuityConfig


class TestSettlementRegistry:
    """Test cases for SettlementRegistry class."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.registry = SettlementRegistry()
        self.test_lat = 40.7589  # New York latitude
        self.test_lon = -73.9851  # New York longitude
        self.test_cellsize = 0.083333  # HYDE grid cell size
    
    def test_geographic_cell_id_consistency(self):
        """Test that geographic cell IDs are consistent for same coordinates."""
        cell_id1 = self.registry.get_geographic_cell_id(self.test_lat, self.test_lon, self.test_cellsize)
        cell_id2 = self.registry.get_geographic_cell_id(self.test_lat, self.test_lon, self.test_cellsize)
        
        assert cell_id1 == cell_id2
        assert len(cell_id1) == 12  # MD5 hash truncated to 12 chars
        assert isinstance(cell_id1, str)
    
    def test_geographic_cell_id_varies_with_coordinates(self):
        """Test that different coordinates produce different cell IDs."""
        cell_id1 = self.registry.get_geographic_cell_id(self.test_lat, self.test_lon, self.test_cellsize)
        cell_id2 = self.registry.get_geographic_cell_id(self.test_lat + 1, self.test_lon, self.test_cellsize)
        cell_id3 = self.registry.get_geographic_cell_id(self.test_lat, self.test_lon + 1, self.test_cellsize)
        
        assert cell_id1 != cell_id2
        assert cell_id1 != cell_id3
        assert cell_id2 != cell_id3
    
    def test_deterministic_positions_consistency(self):
        """Test that getting positions multiple times returns identical results."""
        num_positions = 5
        settlement_type = "rural"
        
        positions1 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, settlement_type
        )
        positions2 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, settlement_type
        )
        
        assert len(positions1) == len(positions2) == num_positions
        
        for p1, p2 in zip(positions1, positions2):
            assert abs(p1.coordinates.latitude - p2.coordinates.latitude) < 1e-10
            assert abs(p1.coordinates.longitude - p2.coordinates.longitude) < 1e-10
            assert p1.cell_id == p2.cell_id
            assert p1.position_index == p2.position_index
    
    def test_position_validation_method(self):
        """Test the built-in position consistency validation."""
        num_positions = 3
        settlement_type = "town"
        
        is_consistent = self.registry.validate_position_consistency(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, settlement_type
        )
        
        assert is_consistent is True
    
    def test_settlement_types_produce_different_patterns(self):
        """Test that different settlement types produce different position patterns."""
        num_positions = 3
        
        rural_positions = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, "rural"
        )
        town_positions = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, "town"
        )
        city_positions = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, num_positions, "city"
        )
        
        # Positions should be different for different settlement types
        # but still consistent within the same type
        assert rural_positions != town_positions
        assert rural_positions != city_positions
        assert town_positions != city_positions
        
        # Each settlement type should have consistent cell_ids within the type
        assert all(p.cell_id == rural_positions[0].cell_id for p in rural_positions)
        assert all(p.cell_id == town_positions[0].cell_id for p in town_positions)
        assert all(p.cell_id == city_positions[0].cell_id for p in city_positions)
        
        # Different settlement types should have different cell_ids (since they include settlement type)
        assert rural_positions[0].cell_id != town_positions[0].cell_id
        assert rural_positions[0].cell_id != city_positions[0].cell_id
        assert town_positions[0].cell_id != city_positions[0].cell_id
    
    def test_coordinate_bounds_validation(self):
        """Test that generated positions stay within valid coordinate bounds."""
        num_positions = 10
        
        for settlement_type in ["rural", "town", "city"]:
            positions = self.registry.get_deterministic_positions(
                self.test_lat, self.test_lon, self.test_cellsize, num_positions, settlement_type
            )
            
            for position in positions:
                assert -90 <= position.coordinates.latitude <= 90
                assert -180 <= position.coordinates.longitude <= 180
    
    def test_extreme_coordinate_handling(self):
        """Test handling of extreme coordinates (poles, date line)."""
        extreme_coords = [
            (89.5, 0, 0.1),      # Near North Pole
            (-89.5, 0, 0.1),     # Near South Pole
            (0, 179.5, 0.1),     # Near Date Line (East)
            (0, -179.5, 0.1),    # Near Date Line (West)
        ]
        
        for lat, lon, cellsize in extreme_coords:
            positions = self.registry.get_deterministic_positions(
                lat, lon, cellsize, 3, "rural"
            )
            
            assert len(positions) == 3
            for position in positions:
                assert -90 <= position.coordinates.latitude <= 90
                assert -180 <= position.coordinates.longitude <= 180
    
    def test_position_cache_functionality(self):
        """Test that position caching works correctly."""
        # Clear cache first
        self.registry.clear_cache()
        stats_empty = self.registry.get_cache_stats()
        assert stats_empty["cached_cells"] == 0
        
        # Generate some positions
        positions1 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, 5, "rural"
        )
        
        # Check cache has been populated
        stats_populated = self.registry.get_cache_stats()
        assert stats_populated["cached_cells"] == 1
        assert stats_populated["total_cached_positions"] == 5
        
        # Generate same positions again (should use cache)
        positions2 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, 3, "rural"  # Request fewer positions
        )
        
        # Should get first 3 positions from cache
        assert len(positions2) == 3
        for i in range(3):
            assert positions1[i].coordinates.latitude == positions2[i].coordinates.latitude
            assert positions1[i].coordinates.longitude == positions2[i].coordinates.longitude
        
        # Cache stats should be unchanged
        stats_after = self.registry.get_cache_stats()
        assert stats_after["cached_cells"] == 1
        assert stats_after["total_cached_positions"] == 5  # Still cached all 5
    
    def test_position_index_sequencing(self):
        """Test that position indices are correctly assigned."""
        positions = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, 5, "rural"
        )
        
        # Check that position indices are sequential
        expected_indices = list(range(5))
        actual_indices = [p.position_index for p in positions]
        
        assert actual_indices == expected_indices
    
    def test_different_cell_sizes(self):
        """Test that different cell sizes produce different results."""
        cellsize1 = 0.1
        cellsize2 = 0.2
        
        positions1 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, cellsize1, 3, "rural"
        )
        positions2 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, cellsize2, 3, "rural"
        )
        
        # Should have different cell IDs due to different cell sizes
        assert positions1[0].cell_id != positions2[0].cell_id
        
        # Positions should also be different
        assert positions1 != positions2
    
    def test_large_number_of_positions(self):
        """Test handling of large number of positions."""
        large_num = 100
        positions = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, large_num, "rural"
        )
        
        assert len(positions) == large_num
        
        # Check that all positions are valid
        for i, position in enumerate(positions):
            assert isinstance(position, SettlementPosition)
            assert position.position_index == i
            assert -90 <= position.coordinates.latitude <= 90
            assert -180 <= position.coordinates.longitude <= 180
    
    def test_city_fixed_positions(self):
        """Test that city settlements use fixed relative positions."""
        # Cities should use fixed positions, so let's test with multiple calls
        positions1 = self.registry.get_deterministic_positions(
            self.test_lat, self.test_lon, self.test_cellsize, 3, "city"
        )
        positions2 = self.registry.get_deterministic_positions(
            50.0, 10.0, self.test_cellsize, 3, "city"  # Different location
        )
        
        # Both should have 3 positions
        assert len(positions1) == len(positions2) == 3
        
        # The relative positions within each cell should follow the same pattern
        # (though absolute coordinates will be different)
        for i in range(3):
            assert positions1[i].position_index == positions2[i].position_index


class TestSettlementPosition:
    """Test cases for SettlementPosition data class."""
    
    def test_settlement_position_creation(self):
        """Test basic SettlementPosition creation."""
        coords = Coordinates(longitude=-73.9851, latitude=40.7589)
        position = SettlementPosition(
            coordinates=coords,
            cell_id="test_cell_123",
            position_index=0
        )
        
        assert position.coordinates == coords
        assert position.cell_id == "test_cell_123"
        assert position.position_index == 0
    
    def test_position_equality(self):
        """Test that SettlementPosition objects can be compared for equality."""
        coords1 = Coordinates(longitude=-73.9851, latitude=40.7589)
        coords2 = Coordinates(longitude=-73.9851, latitude=40.7589)
        
        position1 = SettlementPosition(coordinates=coords1, cell_id="test", position_index=0)
        position2 = SettlementPosition(coordinates=coords2, cell_id="test", position_index=0)
        position3 = SettlementPosition(coordinates=coords1, cell_id="different", position_index=0)
        
        assert position1 == position2  # Same data
        assert position1 != position3  # Different cell_id


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v"])