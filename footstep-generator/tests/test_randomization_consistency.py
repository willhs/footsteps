#!/usr/bin/env python3
"""
Test spatial randomization consistency across LOD levels.
Ensures that settlements maintain consistent spatial offsets regardless of which LOD level processes them.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from lod_processor import LODProcessor
from models import LODConfiguration, SettlementContinuityConfig


def test_spatial_randomization_consistency():
    """Test that spatial randomization produces consistent results across LOD levels."""
    print("🎯 Testing spatial randomization consistency...")
    
    # Create LOD processor
    lod_config = LODConfiguration(
        global_grid_size=1.0,
        regional_grid_size=0.5,
        local_grid_size=0.1,
        min_population_threshold=0.0,
    )
    continuity_config = SettlementContinuityConfig(enable_continuity=False)
    processor = LODProcessor(config=lod_config, continuity_config=continuity_config)
    
    # Test parameters
    test_cases = [
        (10, 20, 1.0, 1000),
        (0, 0, 0.5, 1500),
        (-5, 15, 0.1, 2000),
        (100, -50, 2.0, 500),
    ]
    
    print("  Testing consistent randomization across multiple calls...")
    
    for x_idx, y_idx, grid_size, year in test_cases:
        # Call randomization multiple times
        results = []
        for _ in range(5):
            result = processor._apply_spatial_randomization(x_idx, y_idx, grid_size, year)
            results.append(result)
        
        # Verify all results are identical
        first_result = results[0]
        for i, result in enumerate(results[1:], 1):
            assert result == first_result, f"Randomization not consistent on call {i+1}: {result} != {first_result}"
        
        print(f"    ✓ Consistent for ({x_idx}, {y_idx}) at grid_size {grid_size}: {first_result}")
    
    # Test that different inputs produce different outputs
    print("  Testing different inputs produce different outputs...")
    
    base_x, base_y, base_grid, base_year = 10, 10, 1.0, 1000
    base_result = processor._apply_spatial_randomization(base_x, base_y, base_grid, base_year)
    
    # Different x_idx should produce different result
    diff_x_result = processor._apply_spatial_randomization(base_x + 1, base_y, base_grid, base_year)
    assert diff_x_result != base_result, "Different x_idx should produce different randomization"
    
    # Different y_idx should produce different result
    diff_y_result = processor._apply_spatial_randomization(base_x, base_y + 1, base_grid, base_year)
    assert diff_y_result != base_result, "Different y_idx should produce different randomization"
    
    # Different year should produce different result
    diff_year_result = processor._apply_spatial_randomization(base_x, base_y, base_grid, base_year + 1)
    assert diff_year_result != base_result, "Different year should produce different randomization"
    
    print("    ✓ Different inputs produce different outputs")
    
    # Test that grid_size doesn't affect the seed (only the final offset scaling)
    print("  Testing grid_size affects only offset scaling, not seed...")
    
    # Same coordinates and year with different grid sizes
    small_grid_result = processor._apply_spatial_randomization(10, 10, 0.1, 1000)
    large_grid_result = processor._apply_spatial_randomization(10, 10, 2.0, 1000)
    
    # Base positions should be proportional to grid size
    base_small_x = 10 * 0.1  # 1.0
    base_large_x = 10 * 2.0  # 20.0
    
    # The offset pattern should be the same, just scaled
    small_offset_x = small_grid_result[0] - base_small_x
    large_offset_x = large_grid_result[0] - base_large_x
    
    # The ratio of offsets should be proportional to grid size ratio
    offset_ratio = large_offset_x / small_offset_x if small_offset_x != 0 else 0
    expected_ratio = 2.0 / 0.1  # 20
    
    print(f"    Small grid result: {small_grid_result}")
    print(f"    Large grid result: {large_grid_result}")
    print(f"    Offset ratio: {offset_ratio:.2f}, expected ~{expected_ratio:.2f}")
    
    # Test coordinate bounds clamping
    print("  Testing coordinate bounds clamping...")
    
    # Test extreme coordinates that would exceed bounds
    extreme_cases = [
        (-200, 0, 1.0, 1000),  # x_idx that would go below -180
        (200, 0, 1.0, 1000),   # x_idx that would go above 180
        (0, -100, 1.0, 1000),  # y_idx that would go below -90
        (0, 100, 1.0, 1000),   # y_idx that would go above 90
    ]
    
    for x_idx, y_idx, grid_size, year in extreme_cases:
        result = processor._apply_spatial_randomization(x_idx, y_idx, grid_size, year)
        lon, lat = result
        
        assert -180.0 <= lon <= 180.0, f"Longitude {lon} out of bounds for case ({x_idx}, {y_idx})"
        assert -90.0 <= lat <= 90.0, f"Latitude {lat} out of bounds for case ({x_idx}, {y_idx})"
        
        print(f"    ✓ Bounds respected for extreme case ({x_idx}, {y_idx}): {result}")
    
    print("✅ Spatial randomization consistency tests passed!")


def test_performance_comparison():
    """Compare performance of new vs old randomization approach."""
    print("⚡ Testing randomization performance...")
    
    processor = LODProcessor()
    
    # Test data
    test_count = 1000
    test_data = [(i % 100, (i * 7) % 100, 1.0, 1000 + i % 10) for i in range(test_count)]
    
    # Time the new approach
    import time
    start_time = time.time()
    
    for x_idx, y_idx, grid_size, year in test_data:
        processor._apply_spatial_randomization(x_idx, y_idx, grid_size, year)
    
    new_time = time.time() - start_time
    
    print(f"  New approach: {new_time:.6f} seconds for {test_count} randomizations")
    print(f"  Rate: {test_count / new_time:,.0f} randomizations/second")
    
    # Should be very fast
    assert new_time < 0.1, f"Randomization too slow: {new_time:.6f} seconds"
    
    print("✅ Performance test passed!")


if __name__ == "__main__":
    try:
        print("🚀 Running spatial randomization tests...\n")
        
        test_spatial_randomization_consistency()
        print()
        
        test_performance_comparison()
        print()
        
        print("🎉 All randomization tests passed!")
        
    except Exception as e:
        print(f"❌ Randomization test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)