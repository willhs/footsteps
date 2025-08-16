#!/usr/bin/env python3
"""
Centralized test utilities for the HYDE data processing pipeline.
Provides reusable test data generation and common test fixtures.
"""

import tempfile
import pathlib
import numpy as np
from typing import Tuple, List, Dict, Any
import os


def create_test_asc_file(
    temp_dir: pathlib.Path, 
    year: int, 
    size: Tuple[int, int] = (50, 50),
    region: str = "europe_africa"
) -> str:
    """
    Create a realistic test ASC file with population data.
    
    Args:
        temp_dir: Directory to create the file in
        year: Year for the filename (positive for AD, negative for BC)
        size: Grid size as (ncols, nrows)
        region: Region to simulate ("europe_africa", "global", "small")
        
    Returns:
        Path to created ASC file
    """
    ncols, nrows = size
    cellsize = 0.083333333
    
    # Define different test regions
    regions = {
        "europe_africa": {"xllcorner": -20, "yllcorner": -35},  # Europe/Africa region
        "global": {"xllcorner": -180, "yllcorner": -90},        # Full global
        "small": {"xllcorner": -10, "yllcorner": 40},           # Small European region
    }
    
    region_config = regions.get(region, regions["europe_africa"])
    xllcorner = region_config["xllcorner"]
    yllcorner = region_config["yllcorner"]
    
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
    
    # Scale cluster counts by grid size
    scale_factor = (ncols * nrows) / (50 * 50)  # Relative to 50x50 base
    num_cities = max(1, int(3 * scale_factor))
    num_towns = max(2, int(8 * scale_factor))
    num_rural = max(5, int(15 * scale_factor))
    
    # Cities (high density)
    for _ in range(num_cities):
        center_i = np.random.randint(5, max(6, nrows - 5))
        center_j = np.random.randint(5, max(6, ncols - 5))
        for di in range(-2, 3):
            for dj in range(-2, 3):
                if 0 <= center_i + di < nrows and 0 <= center_j + dj < ncols:
                    distance = abs(di) + abs(dj)
                    density = max(100.0, 2000.0 / (distance + 1))  # Higher densities
                    data[center_i + di, center_j + dj] = density
    
    # Towns (medium density)
    for _ in range(num_towns):
        center_i = np.random.randint(2, max(3, nrows - 2))
        center_j = np.random.randint(2, max(3, ncols - 2))
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


def create_mock_asc_content(size: Tuple[int, int] = (10, 10)) -> str:
    """
    Create mock ASC file content for integration testing.
    
    Args:
        size: Grid size as (ncols, nrows)
        
    Returns:
        ASC file content as string
    """
    ncols, nrows = size
    
    header = f"""ncols         {ncols}
nrows         {nrows}
xllcorner     -20
yllcorner     -35
cellsize      0.083333333
NODATA_value  -9999
"""
    
    # Create small grid with some population data
    data_rows = []
    for i in range(nrows):
        row_data = []
        for j in range(ncols):
            if i == nrows // 2 and j == ncols // 2:  # Center cell with population
                row_data.append("10.5")  # 10.5 people per km²
            elif (i + j) % 3 == 0:  # Some scattered population
                row_data.append("2.3")
            else:
                row_data.append("-9999")  # No data
        data_rows.append(" ".join(row_data))
    
    return header + "\n".join(data_rows)


def create_test_gdf_data(count: int = 5, year: int = 1000) -> List[Dict[str, Any]]:
    """
    Create test GeoPandas-like data for mocking.
    
    Args:
        count: Number of test settlements
        year: Year for the data
        
    Returns:
        List of settlement dictionaries
    """
    test_settlements = []
    
    for i in range(count):
        lon = -50 + (i * 25)  # Spread across longitudes
        lat = 10 + (i * 10)   # Spread across latitudes
        pop = 500 + (i * 200) # Varying populations
        
        test_settlements.append({
            'lon': lon,
            'lat': lat,
            'population': pop,
            'year': year,
            'type': 'settlement'
        })
    
    return test_settlements


class TempDirectoryManager:
    """Context manager for temporary directories in tests."""
    
    def __init__(self):
        self.temp_dir = None
        self.temp_path = None
    
    def __enter__(self) -> pathlib.Path:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = pathlib.Path(self.temp_dir.name)
        return self.temp_path
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.temp_dir:
            self.temp_dir.cleanup()


def validate_test_asc_file(asc_file_path: str) -> Dict[str, Any]:
    """
    Validate a test ASC file and return its properties.
    
    Args:
        asc_file_path: Path to ASC file
        
    Returns:
        Dictionary with file properties
    """
    with open(asc_file_path, 'r') as f:
        lines = f.readlines()
    
    # Parse header
    header = {}
    for i in range(6):
        if i < len(lines):
            parts = lines[i].strip().split()
            if len(parts) >= 2:
                key = parts[0].lower()
                try:
                    value = float(parts[1]) if '.' in parts[1] else int(parts[1])
                    header[key] = value
                except ValueError:
                    header[key] = parts[1]
    
    # Count data rows
    data_rows = len(lines) - 6
    
    # Count populated cells
    populated_cells = 0
    for line in lines[6:]:
        values = line.strip().split()
        for val in values:
            try:
                if float(val) > 0:
                    populated_cells += 1
            except ValueError:
                pass
    
    return {
        'header': header,
        'data_rows': data_rows,
        'populated_cells': populated_cells,
        'file_size_bytes': os.path.getsize(asc_file_path)
    }


def create_test_performance_data(
    sizes: List[Tuple[int, int]] = [(20, 20), (50, 50), (100, 100)]
) -> List[str]:
    """
    Create multiple test ASC files for performance testing.
    
    Args:
        sizes: List of (ncols, nrows) sizes to create
        
    Returns:
        List of paths to created test files
    """
    created_files = []
    
    with TempDirectoryManager() as temp_dir:
        for i, size in enumerate(sizes):
            year = 1000 + i * 100  # Different years
            asc_file = create_test_asc_file(temp_dir, year, size, region="europe_africa")
            
            # Copy to a persistent location for the test duration
            persistent_path = f"/tmp/test_perf_{size[0]}x{size[1]}_{year}AD.asc"
            import shutil
            shutil.copy2(asc_file, persistent_path)
            created_files.append(persistent_path)
    
    return created_files


def cleanup_test_files(file_paths: List[str]) -> None:
    """
    Clean up test files.
    
    Args:
        file_paths: List of file paths to delete
    """
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
        except OSError:
            pass  # Ignore cleanup errors


# Common test parameters
COMMON_TEST_YEARS = [1000, 1500, 1800, -1000, -5000]
COMMON_TEST_SIZES = [(20, 20), (50, 50), (100, 100)]
COMMON_PEOPLE_PER_DOT = [50, 100, 200]


if __name__ == "__main__":
    # Test the utilities
    print("🧪 Testing test utilities...")
    
    with TempDirectoryManager() as temp_dir:
        # Test ASC file creation
        asc_file = create_test_asc_file(temp_dir, 1500, (30, 30))
        properties = validate_test_asc_file(asc_file)
        
        print(f"✓ Created ASC file: {asc_file}")
        print(f"  Header: {properties['header']}")
        print(f"  Data rows: {properties['data_rows']}")
        print(f"  Populated cells: {properties['populated_cells']}")
        print(f"  File size: {properties['file_size_bytes']} bytes")
        
        # Test mock content
        mock_content = create_mock_asc_content((5, 5))
        print(f"✓ Created mock content: {len(mock_content)} characters")
        
        # Test GDF data
        gdf_data = create_test_gdf_data(3, 1800)
        print(f"✓ Created GDF data: {len(gdf_data)} settlements")
        
    print("✅ All test utilities working correctly!")