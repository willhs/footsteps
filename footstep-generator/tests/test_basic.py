#!/usr/bin/env python3
"""
Basic test for the modular HYDE data processing pipeline.
Tests the core functionality without external dependencies.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lod_processor import LODProcessor
from models import (
    AggregatedSettlement,
    Coordinates,
    HumanSettlement,
    LODConfiguration,
    LODLevel,
    ProcessingResult,
)


def test_basic_functionality():
    """Test basic functionality of the modular pipeline."""
    print("🧪 Testing basic modular functionality...")

    # Test 1: Model validation
    print("  ✓ Testing model validation...")
    coords = Coordinates(longitude=0.0, latitude=0.0)
    settlement = HumanSettlement(
        coordinates=coords, population=1000.0, year=1000, source_resolution=0.083333
    )
    print(
        f"    Created settlement: {settlement.population} people at ({coords.longitude}, {coords.latitude})"
    )

    # Test 2: LOD processor initialization
    print("  ✓ Testing LOD processor...")
    config = LODConfiguration(
        global_grid_size=2.0,
        regional_grid_size=0.5,
        local_grid_size=0.1,
        min_population_threshold=50.0,
    )
    processor = LODProcessor(config=config)
    print(
        f"    Created processor with global grid size: {processor.config.global_grid_size}°"
    )

    # Test 3: Create test data
    print("  ✓ Creating test settlement data...")
    settlements = []
    for i in range(20):
        lon = -180 + (360 * i / 20)
        lat = -60 + (120 * i / 20)
        pop = 100 + (i * 100)

        settlement = HumanSettlement(
            coordinates=Coordinates(longitude=lon, latitude=lat),
            population=pop,
            year=1000,
            source_resolution=0.083333,
        )
        settlements.append(settlement)

    print(f"    Created {len(settlements)} test settlements")

    # Test 4: Process LOD hierarchy
    print("  ✓ Testing hierarchical LOD processing...")
    lod_data = processor.create_hierarchical_lods(settlements)

    print("    LOD Results:")
    total_original = sum(s.population for s in settlements)
    for level, lod_settlements in lod_data.items():
        if lod_settlements:
            total_lod = sum(s.total_population for s in lod_settlements)
            ratio = total_lod / total_original
            print(
                f"      {level.name}: {len(lod_settlements)} settlements (pop ratio: {ratio:.3f})"
            )

    # Test 5: Validate hierarchical reduction
    print("  ✓ Testing hierarchical reduction...")
    regional_count = len(lod_data[LODLevel.REGIONAL])
    subregional_count = len(lod_data[LODLevel.SUBREGIONAL])
    local_count = len(lod_data[LODLevel.LOCAL])
    detailed_count = len(lod_data[LODLevel.DETAILED])

    assert detailed_count == len(
        settlements
    ), f"Detailed count {detailed_count} != original {len(settlements)}"
    assert (
        regional_count <= subregional_count <= local_count
    ), f"Hierarchy broken: Regional({regional_count}) ≤ Subregional({subregional_count}) ≤ Local({local_count})"
    print(
        f"    Hierarchy: Regional({regional_count}) ≤ Subregional({subregional_count}) ≤ Local({local_count}) ≤ Detailed({detailed_count})"
    )

    # Test 6: Density-aware dot creation
    print("  ✓ Testing density-aware dot creation...")
    rural_dots = processor.create_density_aware_dots(200.0, 45.0, -100.0, 0.083333, 100)
    town_dots = processor.create_density_aware_dots(5000.0, 45.0, -100.0, 0.083333, 100)
    city_dots = processor.create_density_aware_dots(
        50000.0, 45.0, -100.0, 0.083333, 100
    )

    print(f"    Rural area: {len(rural_dots)} dots")
    print(f"    Town area: {len(town_dots)} dots")
    print(f"    City area: {len(city_dots)} dots")

    assert len(rural_dots) >= 1, "Rural areas should create at least 1 dot"
    assert 1 <= len(town_dots) <= 25, "Towns should create up to 25 dots"
    assert 1 <= len(city_dots) <= 75, "Cities should create up to 75 dots"

    # Test 7: Zoom level mapping
    print("  ✓ Testing zoom level mapping...")
    zoom_tests = [
        (0.5, LODLevel.REGIONAL),
        (1.5, LODLevel.REGIONAL),
        (2.5, LODLevel.SUBREGIONAL),
        (4.5, LODLevel.LOCAL),
        (6.5, LODLevel.DETAILED),
    ]

    for zoom, expected_lod in zoom_tests:
        actual_lod = processor.get_lod_level_for_zoom(zoom)
        assert (
            actual_lod == expected_lod
        ), f"Zoom {zoom} should map to {expected_lod}, got {actual_lod}"
        print(f"    Zoom {zoom} → {actual_lod.name}")

    print("✅ All basic tests passed!")
    # No return needed for pytest


if __name__ == "__main__":
    try:
        print("🚀 Starting basic pipeline tests...\n")

        # Run basic functionality tests
        test_basic_functionality()
        print()

        print("🎉 All tests completed successfully!")
        print("📝 The modular structure is working correctly.")
        print("📝 Next steps:")
        print("   - Install pytest to run full test suite: pip install pytest")
        print("   - Run full tests: pytest test_e2e.py -v")
        print("   - Process HYDE data: python generate_footstep_tiles.py")

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
