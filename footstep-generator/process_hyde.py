#!/usr/bin/env python3
"""
Process HYDE 3.3 population density data into heat-map polygons for vector tiles.
Converts ASCII grid files (.asc) to GeoJSON polygons with population density values.
"""

import os
import pathlib
import numpy as np
import geopandas as gpd
from shapely.geometry import Polygon
import json
import zipfile
import tempfile
from typing import List, Dict, Any

# HYDE 3.5 available years - Complete deep history dataset
# All years with available population data in hyde-3.5/
TARGET_YEARS = [
    # Deep Prehistory - Every millennium
    -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,
    
    # Classical Period - Complete coverage every century
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
    
    # Medieval Period  
    1000, 1100, 1200, 1300, 1400, 1500
]

def create_density_aware_dots(cell_population: float, lat: float, lon: float, 
                              cellsize: float, people_per_dot: int) -> List[tuple]:
    """
    Create dots for a cell using density-aware strategy to handle high-concentration areas.
    
    Args:
        cell_population: Total population in the cell
        lat, lon: Center coordinates of the cell
        cellsize: Size of the cell in degrees
        people_per_dot: Standard number of people per dot
    
    Returns:
        List of (lat, lon, population) tuples for each dot to create
    """
    dots = []
    
    # Apply minimum population threshold - ignore very sparse areas
    if cell_population < 50:  # Minimum 50 people per cell to create any dots
        return dots
    
    # Density-aware strategy based on population concentration
    if cell_population < 1000:
        # Rural areas: Standard approach with random placement
        num_dots = max(1, int(cell_population / people_per_dot))
        population_per_dot = cell_population / num_dots  # Use actual population, not fixed amount
        
        for _ in range(num_dots):
            dot_lat = lat + np.random.uniform(-cellsize/2, cellsize/2)
            dot_lon = lon + np.random.uniform(-cellsize/2, cellsize/2)
            dots.append((dot_lat, dot_lon, population_per_dot))
            
    elif cell_population < 10000:
        # Towns: Systematic grid distribution to avoid overlap
        effective_people_per_dot = people_per_dot * 2  # Target larger dots
        num_dots = max(1, min(9, int(cell_population / effective_people_per_dot)))  # Max 9 dots (3x3 grid)
        population_per_dot = cell_population / num_dots  # Use actual population
        
        grid_size = int(np.ceil(np.sqrt(num_dots)))
        grid_step = cellsize / (grid_size + 1)  # Add padding
        
        dot_idx = 0
        for i in range(grid_size):
            for j in range(grid_size):
                if dot_idx >= num_dots:
                    break
                    
                # Grid position with slight randomization
                offset_lat = (i - grid_size/2 + 0.5) * grid_step
                offset_lon = (j - grid_size/2 + 0.5) * grid_step
                
                # Add small random offset to avoid perfect grid
                offset_lat += np.random.uniform(-grid_step/4, grid_step/4)
                offset_lon += np.random.uniform(-grid_step/4, grid_step/4)
                
                dot_lat = lat + offset_lat
                dot_lon = lon + offset_lon
                dots.append((dot_lat, dot_lon, population_per_dot))
                dot_idx += 1
                
    else:
        # Cities: Few large representative dots to avoid visual clutter
        effective_people_per_dot = people_per_dot * 10  # Target much larger dots
        num_dots = max(1, min(4, int(cell_population / effective_people_per_dot)))  # Max 4 dots
        population_per_dot = cell_population / num_dots  # Use actual population
        
        # Use fixed positions within cell to ensure consistency
        positions = [
            (0, 0),  # Center
            (-0.25, -0.25), (0.25, -0.25),  # Lower corners
            (-0.25, 0.25), (0.25, 0.25)    # Upper corners
        ]
        
        for i in range(num_dots):
            offset_lat, offset_lon = positions[i]
            dot_lat = lat + offset_lat * cellsize
            dot_lon = lon + offset_lon * cellsize
            dots.append((dot_lat, dot_lon, population_per_dot))
    
    return dots

def ascii_grid_to_dots(asc_file: str, year: int, people_per_dot: int = 100) -> gpd.GeoDataFrame:
    """
    Convert a HYDE ASC file to human dots for consistent processing.
    
    Args:
        asc_file: Path to HYDE ASC file (e.g., popd_1850AD.asc)
        year: Year for this data
        people_per_dot: Number of people each dot represents
    
    Returns:
        GeoDataFrame with point features (human dots)
    """
    print(f"  Processing year {year}...")
    
    try:
        # Read ASC file directly for consistent processing
        print(f"    Reading ASCII grid {os.path.basename(asc_file)}")
        with open(asc_file, 'r', encoding='utf-8') as f_asc:
            content = f_asc.read()
        # Split into lines for header + data parsing
        lines = content.strip().split('\n')
                    
        # ----- Parse header (first 6 lines) -----
        header = {}
        for i in range(6):  # Standard ASCII grid header lines
            line = lines[i].strip()
            key, value = line.split()
            header[key.lower()] = float(value) if '.' in value else int(value)

        # Extract grid parameters
        ncols = int(header['ncols'])
        nrows = int(header['nrows'])
        xllcorner = header['xllcorner']
        yllcorner = header['yllcorner']
        cellsize = header['cellsize']
        nodata_value = header.get('nodata_value', -9999)
        
        print(f"    Grid: {ncols}x{nrows}, cellsize: {cellsize}°")
        
        # Parse data efficiently using NumPy
        import io
        data_str = "\n".join(lines[6:])
        data = np.loadtxt(io.StringIO(data_str), dtype=float)
        if data.shape != (nrows, ncols):
            print(f"    WARNING: Parsed grid shape {data.shape} != expected ({nrows}, {ncols})")
        
        # Replace nodata with NaN
        data[data == nodata_value] = np.nan
        
        # Create coordinate arrays
        # Longitude runs from west to east (xllcorner to xllcorner + ncols*cellsize)
        lons = np.linspace(xllcorner + cellsize/2, 
                          xllcorner + (ncols-1)*cellsize + cellsize/2, 
                          ncols)
        
        # Latitude: HYDE uses bottom-left origin (yllcorner = -90)
        # Row 0 is the SOUTHERNMOST row, not the northernmost row
        # So we need to go from south to north (bottom to top of the grid)
        lats = np.linspace(yllcorner + cellsize/2,
                          yllcorner + (nrows-1)*cellsize + cellsize/2,
                          nrows)
        
        # Add coordinate debugging
        print(f"    Coordinate bounds: lon [{lons[0]:.2f}, {lons[-1]:.2f}], lat [{lats[0]:.2f}, {lats[-1]:.2f}]")
        print(f"    Grid info: {ncols}x{nrows}, origin=({xllcorner}, {yllcorner}), cellsize={cellsize}")
        print(f"    Expected global bounds: lon [-180, 180], lat [-90, 90]")
        
        # Find cells with population data
        valid_mask = ~np.isnan(data) & (data > 0)
        valid_indices = np.where(valid_mask)
        
        print(f"    Found {len(valid_indices[0])} cells with population data")
        
        # Process all populated cells (no sampling)
        valid_i = valid_indices[0]
        valid_j = valid_indices[1]
        
        dots = []
        dot_populations = []
        total_people = 0
        
        for idx in range(len(valid_i)):
            i, j = valid_i[idx], valid_j[idx]
            density = data[i, j]  # people per km²
            
            # HYDE ASCII grids list data rows from north (top) to south (bottom).
            # Therefore row index `i` (0-based from the file) refers to latitude
            #   lat = yllcorner + (nrows - i - 0.5) * cellsize
            # which flips the y-axis correctly. This prevents vertically mirrored
            # or "up-side-down" placement on the map.
            lat = yllcorner + (nrows - i - 0.5) * cellsize
            lon = lons[j]
            
            # Skip Arctic and Antarctic regions where human populations would be minimal/impossible
            if lat > 70 or lat < -60:  # Exclude extreme latitudes
                continue
                
            # Apply density threshold to filter noise in HYDE data
            if density < 0.01:  # Less than 0.01 people per km² is likely noise
                continue
            
            # Calculate total population in this cell with better area calculation
            # HYDE cellsize is in degrees, convert to km² with latitude correction
            lat_factor = np.cos(np.radians(lat))
            # More accurate conversion: 1 degree ≈ 111.32 km at equator
            km_per_degree = 111.32
            cell_area_km2 = (cellsize * km_per_degree) * (cellsize * km_per_degree * lat_factor)
            cell_population = density * cell_area_km2
            
            # Apply maximum population cap per cell to prevent unrealistic concentrations
            # Even modern megacities rarely exceed 100k people per km² average
            max_reasonable_population = cell_area_km2 * 50000  # 50k people per km² max
            if cell_population > max_reasonable_population:
                cell_population = max_reasonable_population
            
            total_people += cell_population
            
            # Density-aware dot creation to handle high-concentration areas
            dots_created = create_density_aware_dots(
                cell_population, lat, lon, cellsize, people_per_dot
            )
            
            for dot_info in dots_created:
                dot_lat, dot_lon, dot_population = dot_info
                
                # Validate coordinates are within reasonable bounds
                if not (-180 <= dot_lon <= 180 and -90 <= dot_lat <= 90):
                    print(f"    WARNING: Invalid coordinates: ({dot_lon:.2f}, {dot_lat:.2f}) from cell ({i}, {j})")
                    continue
                
                # Create point geometry
                from shapely.geometry import Point
                point = Point(dot_lon, dot_lat)
                
                dots.append(point)
                dot_populations.append(dot_population)
        
        # Create GeoDataFrame
        if dots:
            gdf = gpd.GeoDataFrame({
                'population': dot_populations,
                'year': year,
                'type': 'settlement',
                'geometry': dots
            }, crs='EPSG:4326')
            
            # Add geographic validation by showing sample coordinates
            if len(gdf) > 0:
                sample_coords = [(p.x, p.y) for p in gdf.geometry.iloc[:min(5, len(gdf))]]
                print(f"    Sample coordinates: {sample_coords}")
                
                # Check for major regions (approximate bounding boxes)
                usa_count = len(gdf[(gdf.geometry.x >= -125) & (gdf.geometry.x <= -66) & 
                                   (gdf.geometry.y >= 20) & (gdf.geometry.y <= 49)])
                europe_count = len(gdf[(gdf.geometry.x >= -10) & (gdf.geometry.x <= 40) & 
                                      (gdf.geometry.y >= 35) & (gdf.geometry.y <= 71)])
                china_count = len(gdf[(gdf.geometry.x >= 73) & (gdf.geometry.x <= 135) & 
                                     (gdf.geometry.y >= 18) & (gdf.geometry.y <= 54)])
                
                print(f"    Regional distribution: USA: {usa_count}, Europe: {europe_count}, China: {china_count}")
            
            print(f"    Created {len(gdf)} dots for year {year} ({total_people:,.0f} people)")
            return gdf
        else:
            print(f"    No data found for year {year}")
            return gpd.GeoDataFrame()
            
    except Exception as e:
        print(f"    Error processing {asc_file}: {e}")
        return gpd.GeoDataFrame()

def find_hyde_files(raw_dir: str) -> Dict[int, str]:
    """Find HYDE ASC files for target years - consistent data source."""
    hyde_files = {}
    hyde_dir = pathlib.Path(raw_dir)
    
    if not hyde_dir.exists():
        print(f"Raw data directory not found: {hyde_dir}")
        return hyde_files
    
    # Process each target year - only look for ASC files for consistency
    for year in TARGET_YEARS:
        # Determine the ASC filename pattern based on year
        if year < 0:
            asc_name = f"popd_{abs(year)}BC.asc"
        elif year == 0:
            asc_name = "popd_0AD.asc"
        else:
            asc_name = f"popd_{year}AD.asc"
            
        asc_path = hyde_dir / asc_name
        
        if asc_path.exists():
            print(f"  Using ASC file: {asc_name} for year {year}")
            hyde_files[year] = str(asc_path)
        else:
            print(f"  Missing HYDE data for year {year} (expected {asc_name})")
    
    print(f"Found {len(hyde_files)} HYDE files total")
    return hyde_files

def process_all_hyde_data(raw_dir: str, output_dir: str) -> str:
    """
    Process all HYDE data and create a combined GeoJSON for vector tiles.
    
    Returns:
        Path to output GeoJSON file
    """
    print("🌍 Processing HYDE data into human dots...")
    print("  (Each dot represents ~100 people)")
    
    hyde_files = find_hyde_files(raw_dir)
    print(f"Found {len(hyde_files)} HYDE files for target years")
    
    if not hyde_files:
        raise FileNotFoundError(
            "No HYDE dataset files found in data/raw/. "
            "Please run 'poetry run fetch-data' first to download the datasets."
        )
    
    all_polygons = []
    
    for year in sorted(hyde_files.keys()):
        asc_file = hyde_files[year]
        try:
            gdf = ascii_grid_to_dots(asc_file, year)
            if not gdf.empty:
                all_polygons.append(gdf)

            # ---- New: write per-year NDJSON for fast API lookup ----
            ndjson_path = pathlib.Path(output_dir) / f"dots_{year}.ndjson"
            with ndjson_path.open("w", encoding="utf-8") as f_nd:
                # convert each feature to JSON and write per line
                geojson_obj = json.loads(gdf.to_json())
                for feat in geojson_obj["features"]:
                    json.dump(feat, f_nd)
                    f_nd.write("\n")
            print(f"      ➜ Saved {len(gdf)} dots to {ndjson_path.relative_to(output_dir)}")
        except Exception as e:
            print(f"  Error processing {asc_file}: {e}")
            continue
    
    if all_polygons:
        # Combine all years
        combined_gdf = gpd.pd.concat(all_polygons, ignore_index=True)
        
        # Save as GeoJSON
        output_path = pathlib.Path(output_dir) / "hyde_human_dots.geojson"
        combined_gdf.to_file(output_path, driver='GeoJSON')
        
        print(f"✓ Saved {len(combined_gdf)} human dots to {output_path}")
        return str(output_path)
    else:
        raise ValueError(
            "No valid HYDE data could be processed. "
            "Check that the downloaded files are in the correct format."
        )


def main():
    """Main processing routine."""
    # Resolve paths relative to this script so it works from any CWD
    script_dir = pathlib.Path(__file__).resolve().parent
    # Raw ASCII grids live in hyde-3.5 subdirectory: data/raw/hyde-3.5
    raw_dir = script_dir.parent / "data" / "raw" / "hyde-3.5"
    output_dir = script_dir.parent / "data" / "processed"  # Write to data/processed/ not data/scripts/processed/

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Process HYDE data
    geojson_path = process_all_hyde_data(str(raw_dir), str(output_dir))
    
    print(f"\n✓ Heat-map data ready: {geojson_path}")
    print("\nNext: Run process_cities.py to create human dots data")

if __name__ == "__main__":
    main()