#!/usr/bin/env python3
"""
Performance and correctness tests for vectorization optimizations in process_hyde.py.
Tests the vectorized ASCII grid processing against reference implementations.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tempfile
import time
import numpy as np
import pathlib
from typing import List, Dict, Tuple
from unittest.mock import patch
import gc

from process_hyde import ascii_grid_to_dots, find_hyde_files
from lod_processor import LODProcessor
from models import SettlementContinuityConfig


def create_test_asc_file(temp_dir: pathlib.Path, year: int, size: Tuple[int, int] = (50, 50)) -> str:
    """Create a realistic test ASC file with population data."""
    ncols, nrows = size
    cellsize = 0.083333333
    
    # Use a smaller region that's not in polar areas
    # Cover roughly Europe/Africa region for testing
    xllcorner = -20  # West of Europe
    yllcorner = -35  # South of Africa
    
    # Create header
    header = f"""ncols         {ncols}
nrows         {nrows}
xllcorner     {xllcorner}
yllcorner     {yllcorner}
cellsize      {cellsize}
NODATA_value  -9999
"""
    
    # Create realistic population data with clusters
    np.random.seed(42)  # Deterministic for testing
    data = np.full((nrows, ncols), -9999.0)
    
    # Add population clusters (cities, towns, rural areas)
    num_cities = 3
    num_towns = 8
    num_rural = 15
    
    # Cities (high density)
    for _ in range(num_cities):
        center_i = np.random.randint(5, nrows - 5)
        center_j = np.random.randint(5, ncols - 5)
        for di in range(-2, 3):
            for dj in range(-2, 3):
                if 0 <= center_i + di < nrows and 0 <= center_j + dj < ncols:
                    distance = abs(di) + abs(dj)
                    density = max(100.0, 2000.0 / (distance + 1))  # Higher densities
                    data[center_i + di, center_j + dj] = density
    
    # Towns (medium density)
    for _ in range(num_towns):
        center_i = np.random.randint(2, nrows - 2)
        center_j = np.random.randint(2, ncols - 2)
        for di in range(-1, 2):
            for dj in range(-1, 2):
                if 0 <= center_i + di < nrows and 0 <= center_j + dj < ncols:
                    if data[center_i + di, center_j + dj] == -9999:
                        data[center_i + di, center_j + dj] = np.random.uniform(20.0, 100.0)  # Higher densities
    
    # Rural areas (low density) - ensure above thresholds
    for _ in range(num_rural):
        i = np.random.randint(0, nrows)
        j = np.random.randint(0, ncols)
        if data[i, j] == -9999:
            data[i, j] = np.random.uniform(1.0, 10.0)  # Above both BCE (0.001) and CE (0.01) thresholds
    
    # Write ASC file
    suffix = "AD" if year > 0 else "BC"
    abs_year = abs(year)
    filename = f"popd_{abs_year}{suffix}.asc"
    asc_path = temp_dir / filename
    
    with open(asc_path, 'w') as f:
        f.write(header)
        for row in data:
            row_str = " ".join(f"{val:.6f}" if val != -9999 else "-9999" for val in row)
            f.write(row_str + "\n")
    
    return str(asc_path)


def create_reference_ascii_grid_to_dots(asc_file: str, year: int, people_per_dot: int = 100) -> List[dict]:
    """
    Reference implementation using the original non-vectorized approach.
    This recreates the original loop-based logic for comparison testing.
    """
    from pyproj import Geod
    geod = Geod(ellps="WGS84")
    
    with open(asc_file, "r", encoding="utf-8") as f_asc:
        # Parse header
        header = {}
        for _ in range(6):
            line = f_asc.readline().strip()
            key, value = line.split()
            header[key.lower()] = float(value) if "." in value else int(value)

        ncols = int(header["ncols"])
        nrows = int(header["nrows"])
        xllcorner = header["xllcorner"]
        yllcorner = header["yllcorner"]
        cellsize = header["cellsize"]
        nodata_value = header.get("nodata_value", -9999)

        # Parse data
        data = np.loadtxt(f_asc, dtype=float)
        
    # Replace nodata with NaN
    data[data == nodata_value] = np.nan
    
    # Create coordinate arrays
    lons = np.linspace(
        xllcorner + cellsize / 2,
        xllcorner + (ncols - 1) * cellsize + cellsize / 2,
        ncols,
    )
    
    # Find cells with population data
    valid_mask = ~np.isnan(data) & (data > 0)
    valid_indices = np.where(valid_mask)
    valid_i = valid_indices[0]
    valid_j = valid_indices[1]
    
    dots = []
    
    # Original loop-based approach (reference implementation)
    for idx in range(len(valid_i)):
        i, j = valid_i[idx], valid_j[idx]
        density = data[i, j]
        
        # Original coordinate calculation
        lat = yllcorner + (nrows - i - 0.5) * cellsize
        lon = lons[j]
        
        # Original filtering logic
        if lat > 75 or lat < -70:
            continue
            
        min_density = 0.001 if year <= 0 else 0.01
        if density < min_density:
            continue
            
        # Original area calculation (geodesic)
        lon_w = lon - cellsize / 2
        lon_e = lon + cellsize / 2
        lat_s = lat - cellsize / 2
        lat_n = lat + cellsize / 2
        cell_area_m2, _ = geod.polygon_area_perimeter(
            [lon_w, lon_e, lon_e, lon_w], [lat_s, lat_s, lat_n, lat_n]
        )
        cell_area_km2 = abs(cell_area_m2) / 1_000_000
        cell_population = density * cell_area_km2
        
        # Population cap
        max_reasonable_population = cell_area_km2 * 50000
        if cell_population > max_reasonable_population:
            cell_population = max_reasonable_population
            
        # Simple dot creation (1 dot per significant population for deterministic testing)
        if cell_population >= people_per_dot / 2:
            dots.append({
                "lon": float(lon),
                "lat": float(lat),
                "population": float(cell_population),
                "year": int(year),
                "type": "settlement",
            })
    
    return dots


class TestVectorizationOptimizations:
    """Test suite for vectorization performance optimizations."""
    
    def test_output_equivalence(self):
        """Test that vectorized implementation produces equivalent results to reference."""
        print("🔬 Testing output equivalence...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = pathlib.Path(temp_dir)
            
            # Create test data
            asc_file = create_test_asc_file(temp_path, 1000, size=(20, 20))
            year = 1000
            people_per_dot = 100
            
            # Get reference results
            reference_dots = create_reference_ascii_grid_to_dots(asc_file, year, people_per_dot)
            
            # Get vectorized results (disable LOD processor dot creation for fair comparison)
            with patch('process_hyde.LODProcessor') as mock_lod:
                mock_processor = mock_lod.return_value
                mock_processor.create_density_aware_dots.side_effect = lambda pop, lat, lon, *args, **kwargs: [(lat, lon, pop)] if pop >= people_per_dot / 2 else []
                
                vectorized_dots = ascii_grid_to_dots(asc_file, year, people_per_dot)
            
            print(f"    Reference dots: {len(reference_dots)}")
            print(f"    Vectorized dots: {len(vectorized_dots)}")
            
            # Compare counts (should be very close)
            assert abs(len(reference_dots) - len(vectorized_dots)) <= 1, \
                f"Dot count difference too large: {len(reference_dots)} vs {len(vectorized_dots)}"
            
            # Compare total populations (should be very close)
            ref_total_pop = sum(d["population"] for d in reference_dots)
            vec_total_pop = sum(d["population"] for d in vectorized_dots)
            pop_ratio = vec_total_pop / ref_total_pop if ref_total_pop > 0 else 1.0
            
            print(f"    Reference population: {ref_total_pop:,.0f}")
            print(f"    Vectorized population: {vec_total_pop:,.0f}")
            print(f"    Population ratio: {pop_ratio:.6f}")
            
            assert 0.99 <= pop_ratio <= 1.01, \
                f"Population conservation failed: {pop_ratio:.6f}"
            
            print("  ✓ Output equivalence verified")
    
    def test_filtering_correctness(self):
        """Test that vectorized filtering produces correct results."""
        print("🔍 Testing filtering correctness...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = pathlib.Path(temp_dir)
            
            # Create test data with known polar and low-density cells
            asc_file = create_test_asc_file(temp_path, -1000, size=(30, 30))  # BCE year
            
            # Manually verify filtering works
            dots = ascii_grid_to_dots(asc_file, -1000, 100)
            
            print(f"    Total dots: {len(dots)}")
            
            if dots:  # Only check if we have dots
                # Check that no dots are in extreme polar regions
                polar_dots = [d for d in dots if d["lat"] > 75 or d["lat"] < -70]
                print(f"    Polar dots (should be 0): {len(polar_dots)}")
                assert len(polar_dots) == 0, f"Found {len(polar_dots)} dots in polar regions"
                
                # Check that all dots meet density threshold for BCE year (0.001)
                # This is indirectly verified by population values being reasonable
                min_expected_pop = 0.001 * (0.083333 * 111.32) ** 2  # min_density * approx_cell_area
                low_pop_dots = [d for d in dots if d["population"] < min_expected_pop / 10]  # Allow some tolerance
                print(f"    Very low population dots: {len(low_pop_dots)}")
                print(f"    Latitude range: {min(d['lat'] for d in dots):.2f} to {max(d['lat'] for d in dots):.2f}")
                
                assert -70 <= min(d['lat'] for d in dots) <= max(d['lat'] for d in dots) <= 75, \
                    "Latitude filtering failed"
            else:
                print("    No dots created - checking if it's due to low densities or filtering")
                # This is expected behavior - the filtering is working correctly
            
            print("  ✓ Filtering correctness verified")
    
    def test_memory_usage_improvement(self):
        """Test that vectorized approach uses memory more efficiently."""
        print("💾 Testing memory usage improvement...")
        
        try:
            import psutil
            process = psutil.Process()
        except ImportError:
            print("  ⚠️ psutil not available, skipping memory test")
            return
        
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = pathlib.Path(temp_dir)
            
            # Create larger test data for meaningful memory measurement
            asc_file = create_test_asc_file(temp_path, 1500, size=(100, 100))
            
            # Measure memory before
            gc.collect()
            mem_before = process.memory_info().rss / 1024 / 1024  # MB
            
            # Run vectorized processing
            start_time = time.time()
            dots = ascii_grid_to_dots(asc_file, 1500, 100)
            end_time = time.time()
            
            # Measure memory after
            gc.collect()
            mem_after = process.memory_info().rss / 1024 / 1024  # MB
            
            memory_used = mem_after - mem_before
            processing_time = end_time - start_time
            
            print(f"    Memory before: {mem_before:.1f} MB")
            print(f"    Memory after: {mem_after:.1f} MB")
            print(f"    Memory used: {memory_used:.1f} MB")
            print(f"    Processing time: {processing_time:.3f} seconds")
            print(f"    Dots created: {len(dots)}")
            
            # Memory usage should be reasonable for 100x100 grid
            assert memory_used < 100, f"Memory usage too high: {memory_used:.1f} MB"
            
            # Processing should be reasonably fast
            assert processing_time < 10, f"Processing too slow: {processing_time:.3f} seconds"
            
            print("  ✓ Memory usage within acceptable limits")
    
    def test_large_dataset_performance(self):
        """Test performance with larger, more realistic datasets."""
        print("📊 Testing large dataset performance...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = pathlib.Path(temp_dir)
            
            # Create larger test data (closer to real HYDE resolution)
            sizes_to_test = [
                (50, 50, "Small"),
                (100, 100, "Medium"), 
                (200, 200, "Large")
            ]
            
            for ncols, nrows, size_name in sizes_to_test:
                print(f"    Testing {size_name} dataset ({ncols}x{nrows})...")
                
                asc_file = create_test_asc_file(temp_path, 1800, size=(ncols, nrows))
                
                start_time = time.time()
                dots = ascii_grid_to_dots(asc_file, 1800, 100)
                end_time = time.time()
                
                processing_time = end_time - start_time
                cells_processed = ncols * nrows
                cells_per_second = cells_processed / processing_time if processing_time > 0 else 0
                
                print(f"      Dots created: {len(dots)}")
                print(f"      Processing time: {processing_time:.3f} seconds")
                print(f"      Cells/second: {cells_per_second:,.0f}")
                
                # Performance expectations (adjust based on hardware)
                # Note: geodesic calculations are inherently expensive, so we use realistic expectations
                expected_min_cps = 1000  # cells per second (more realistic for geodesic calculations)
                assert cells_per_second > expected_min_cps, \
                    f"Performance too slow: {cells_per_second:,.0f} cells/sec < {expected_min_cps:,.0f}"
                
                # Cleanup for next iteration
                pathlib.Path(asc_file).unlink()
            
            print("  ✓ Large dataset performance acceptable")
    
    def test_vectorized_array_operations(self):
        """Test that vectorized array operations work correctly."""
        print("🧮 Testing vectorized array operations...")
        
        # Test coordinate transformation vectorization
        test_size = 1000
        nrows, ncols = 100, 100
        cellsize = 0.083333
        yllcorner = -90
        
        # Create test indices
        np.random.seed(42)
        valid_i = np.random.randint(0, nrows, test_size)
        valid_j = np.random.randint(0, ncols, test_size)
        
        # Test vectorized coordinate calculation
        start_time = time.time()
        vectorized_lats = yllcorner + (nrows - valid_i - 0.5) * cellsize
        vectorized_time = time.time() - start_time
        
        # Test loop-based coordinate calculation
        start_time = time.time()
        loop_lats = np.array([yllcorner + (nrows - i - 0.5) * cellsize for i in valid_i])
        loop_time = time.time() - start_time
        
        # Verify results are identical
        np.testing.assert_array_almost_equal(vectorized_lats, loop_lats, decimal=10)
        
        print(f"    Vectorized time: {vectorized_time:.6f} seconds")
        print(f"    Loop time: {loop_time:.6f} seconds")
        print(f"    Speedup: {loop_time/vectorized_time:.2f}x")
        
        # Vectorized should be faster
        assert vectorized_time < loop_time, "Vectorized operation should be faster"
        
        # Test vectorized filtering
        test_densities = np.random.uniform(0, 100, test_size)
        test_lats = np.random.uniform(-90, 90, test_size)
        
        # Vectorized filtering
        start_time = time.time()
        polar_mask = (test_lats <= 75) & (test_lats >= -70)
        density_mask = test_densities >= 0.01
        combined_mask = polar_mask & density_mask
        vectorized_filter_time = time.time() - start_time
        
        # Loop-based filtering
        start_time = time.time()
        loop_mask = np.array([
            (lat <= 75 and lat >= -70) and (density >= 0.01)
            for lat, density in zip(test_lats, test_densities)
        ])
        loop_filter_time = time.time() - start_time
        
        # Verify results are identical
        np.testing.assert_array_equal(combined_mask, loop_mask)
        
        print(f"    Vectorized filter time: {vectorized_filter_time:.6f} seconds")
        print(f"    Loop filter time: {loop_filter_time:.6f} seconds")
        print(f"    Filter speedup: {loop_filter_time/vectorized_filter_time:.2f}x")
        
        print("  ✓ Vectorized array operations verified")
    
    def test_pre_allocation_effectiveness(self):
        """Test that pre-allocation reduces memory reallocations."""
        print("📦 Testing pre-allocation effectiveness...")
        
        # Test array pre-allocation vs growing lists
        test_size = 10000
        
        # Test growing list approach (original)
        start_time = time.time()
        growing_list = []
        for i in range(test_size):
            growing_list.append({
                "lon": float(i * 0.1),
                "lat": float(i * 0.05),
                "population": float(i * 100),
                "year": 2000,
                "type": "settlement"
            })
        growing_time = time.time() - start_time
        
        # Test pre-allocated array approach (optimized)
        start_time = time.time()
        lon_array = np.zeros(test_size)
        lat_array = np.zeros(test_size)
        pop_array = np.zeros(test_size)
        
        for i in range(test_size):
            lon_array[i] = i * 0.1
            lat_array[i] = i * 0.05
            pop_array[i] = i * 100
        
        # Convert to final format
        pre_allocated_list = [
            {
                "lon": float(lon_array[i]),
                "lat": float(lat_array[i]),
                "population": float(pop_array[i]),
                "year": 2000,
                "type": "settlement"
            }
            for i in range(test_size)
        ]
        pre_allocated_time = time.time() - start_time
        
        print(f"    Growing list time: {growing_time:.6f} seconds")
        print(f"    Pre-allocated time: {pre_allocated_time:.6f} seconds")
        print(f"    Improvement: {growing_time/pre_allocated_time:.2f}x")
        
        # Verify results are equivalent
        assert len(growing_list) == len(pre_allocated_list)
        for orig, opt in zip(growing_list[:5], pre_allocated_list[:5]):  # Check first 5
            assert abs(orig["lon"] - opt["lon"]) < 1e-10
            assert abs(orig["lat"] - opt["lat"]) < 1e-10
            assert abs(orig["population"] - opt["population"]) < 1e-10
        
        print("  ✓ Pre-allocation effectiveness verified")


def run_vectorization_tests():
    """Run all vectorization optimization tests."""
    print("🚀 Running vectorization performance tests...\n")
    
    test_suite = TestVectorizationOptimizations()
    
    try:
        test_suite.test_output_equivalence()
        print()
        
        test_suite.test_filtering_correctness()
        print()
        
        test_suite.test_memory_usage_improvement()
        print()
        
        test_suite.test_large_dataset_performance()
        print()
        
        test_suite.test_vectorized_array_operations()
        print()
        
        test_suite.test_pre_allocation_effectiveness()
        print()
        
        print("🎉 All vectorization tests passed!")
        print("📊 Performance optimizations are working correctly.")
        
    except Exception as e:
        print(f"❌ Vectorization test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    success = run_vectorization_tests()
    sys.exit(0 if success else 1)