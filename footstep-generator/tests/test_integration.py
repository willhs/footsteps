#!/usr/bin/env python3
"""
Integration test for the complete HYDE processing pipeline with LODs.
Tests the full workflow without requiring actual HYDE data files.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pathlib
import tempfile
from unittest.mock import patch

from models import LODLevel, ProcessingResult


def create_mock_asc_content():
    """Create mock ASC file content for testing."""
    header = """ncols         4320
nrows         2160
xllcorner     -180
yllcorner     -90
cellsize      0.083333333
NODATA_value  -9999
"""

    # Create small grid with some population data
    data_rows = []
    for i in range(10):  # Just 10 rows for testing
        row_data = []
        for j in range(10):  # Just 10 columns
            if i == 5 and j == 5:  # Center cell with population
                row_data.append("10.5")  # 10.5 people per km²
            elif (i + j) % 3 == 0:  # Some scattered population
                row_data.append("2.3")
            else:
                row_data.append("-9999")  # No data
        data_rows.append(" ".join(row_data))

    return header + "\n".join(data_rows)


def test_integration_workflow():
    """Test the complete integration workflow."""
    print("🔧 Testing integration workflow with mock data...")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = pathlib.Path(temp_dir)

        # Create mock ASC file
        asc_file = temp_path / "popd_1000AD.asc"
        with open(asc_file, "w") as f:
            f.write(create_mock_asc_content())

        print(f"  ✓ Created mock ASC file: {asc_file}")

        # Create output directory
        output_dir = temp_path / "processed"
        output_dir.mkdir()

        # Mock the ascii_grid_to_dots function to return test data
        def mock_ascii_grid_to_dots(
            asc_file, year, people_per_dot=100, lod_processor=None
        ):
            import geopandas as gpd
            from shapely.geometry import Point

            # Create some test dots
            test_dots = []
            test_populations = []

            for i in range(5):
                lon = -50 + (i * 25)  # Spread across longitudes
                lat = 10 + (i * 10)  # Spread across latitudes
                pop = 500 + (i * 200)  # Varying populations

                test_dots.append(Point(lon, lat))
                test_populations.append(pop)

            gdf = gpd.GeoDataFrame(
                {
                    "population": test_populations,
                    "year": year,
                    "type": "settlement",
                    "geometry": test_dots,
                },
                crs="EPSG:4326",
            )

            return gdf

        # Import and patch the function
        from process_hyde import process_year_with_hierarchical_lods

        with patch(
            "process_hyde.ascii_grid_to_dots", side_effect=mock_ascii_grid_to_dots
        ):
            # Test the hierarchical LOD processing
            result = process_year_with_hierarchical_lods(
                str(asc_file), 1000, str(output_dir), people_per_dot=100
            )

            print(f"  ✓ Processed year 1000 with result type: {type(result)}")

            # Validate result structure
            assert isinstance(result, ProcessingResult)
            assert result.year == 1000
            assert result.total_population > 0
            assert isinstance(result.lod_data, dict)

            print(f"  ✓ Total population: {result.total_population}")
            print(f"  ✓ LOD levels generated: {len(result.lod_data)}")

            # Tiles-only: verify no NDJSON files are written
            ndjson_files = list(output_dir.glob("*.ndjson.gz"))
            assert (
                len(ndjson_files) == 0
            ), "Tiles-only pipeline should not write NDJSON files"
            print("  ✓ No NDJSON files written (tiles-only)")

            # Validate LOD data content and population conservation
            expected_total = sum([500 + i * 200 for i in range(5)])
            assert abs(result.total_population - expected_total) < 1e-6
            lod_keys = set(result.lod_data.keys())
            for level in [
                LODLevel.REGIONAL,
                LODLevel.SUBREGIONAL,
                LODLevel.LOCAL,
                LODLevel.DETAILED,
            ]:
                # Keys may be Enum or raw values depending on Pydantic config
                key = level if level in lod_keys else level.value
                assert key in lod_keys
                lod_sum = sum(s.total_population for s in result.lod_data[key])
                assert 0.99 <= (lod_sum / expected_total) <= 1.01
            print("  ✓ LOD data present and conserves population")

        print("✅ Integration workflow test passed!")
        return True


if __name__ == "__main__":
    try:
        print("🚀 Starting integration tests...\n")

        # Run integration workflow test
        test_integration_workflow()
        print()

        print("🎉 Integration workflow test passed!")
        print("📝 The complete pipeline is ready for production use.")
        print("📝 Run with real data: python process_hyde.py")

    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        import traceback

        traceback.print_exc()
        exit(1)
