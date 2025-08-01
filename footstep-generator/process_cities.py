#!/usr/bin/env python3
"""
Process city data into individual human dots for the globe visualization.
Converts Reba urban gazetteer and estimated rural population into point features.
"""

import os
import pathlib
import pandas as pd
import geopandas as gpd
import numpy as np
from shapely.geometry import Point
import json
import random
from typing import List, Dict, Any, Tuple

# Population estimation parameters - consistent with HYDE processing
PERSONS_PER_DOT = 100  # Always 100 people per dot for consistency

def get_persons_per_dot(year: int) -> int:
    """Get the number of people each dot represents for a given year."""
    return PERSONS_PER_DOT  # Always 100 people per dot

def load_reba_cities(raw_dir: str) -> pd.DataFrame:
    """Load and process the Reba urban gazetteer data."""
    print("Loading Reba urban gazetteer...")
    
    # Look for the CSV file
    raw_path = pathlib.Path(raw_dir)
    csv_files = list(raw_path.glob("**/*hup*.csv"))
    
    if not csv_files:
        raise FileNotFoundError(
            "No Reba urban gazetteer CSV files found in data/raw/. "
            "Please run 'poetry run fetch-data' first to download the datasets."
        )
    
    csv_file = csv_files[0]
    print(f"  Found: {csv_file}")
    
    try:
        # Load the CSV (adjust column names based on actual file structure)
        df = pd.read_csv(csv_file)
        
        # Expected columns: name, lat, lon, year, population
        # Rename columns if necessary
        column_mapping = {
            'latitude': 'lat',
            'longitude': 'lon',
            'pop': 'population',
            'date': 'year'
        }
        
        for old_name, new_name in column_mapping.items():
            if old_name in df.columns:
                df = df.rename(columns={old_name: new_name})
        
        # Filter and clean data
        required_cols = ['lat', 'lon', 'year', 'population']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            raise ValueError(f"Missing required columns {missing_cols} in CSV file.")
        
        # Clean the data
        df = df.dropna(subset=required_cols)
        df = df[df['population'] > 0]
        df = df[(df['lat'].abs() <= 90) & (df['lon'].abs() <= 180)]
        
        print(f"  Loaded {len(df)} city records")
        return df
        
    except Exception as e:
        raise RuntimeError(f"Error loading Reba data: {e}")


def population_to_dots(population: int, year: int, lat: float, lon: float, 
                      city_name: str, spread_radius: float = 0.1) -> List[Dict]:
    """
    Convert a city population to individual human dots.
    
    Args:
        population: Total population
        year: Year for this data
        lat, lon: City center coordinates
        city_name: Name of the city
        spread_radius: How spread out the dots should be (degrees)
    
    Returns:
        List of dot features
    """
    persons_per_dot = get_persons_per_dot(year)
    num_dots = max(1, population // persons_per_dot)
    
    # Limit dots for performance (max ~1000 dots per city)
    if num_dots > 1000:
        num_dots = 1000
        persons_per_dot = population // num_dots
    
    dots = []
    
    for i in range(num_dots):
        # Scatter dots around the city center
        # Use normal distribution for realistic clustering
        offset_lat = np.random.normal(0, spread_radius / 3)
        offset_lon = np.random.normal(0, spread_radius / 3)
        
        dot_lat = lat + offset_lat
        dot_lon = lon + offset_lon
        
        # Ensure coordinates are valid
        dot_lat = max(-90, min(90, dot_lat))
        dot_lon = max(-180, min(180, dot_lon))
        
        dots.append({
            'lat': dot_lat,
            'lon': dot_lon,
            'year': year,
            'population': persons_per_dot,
            'city': city_name,
            'type': 'urban'
        })
    
    return dots

def add_rural_population(dots: List[Dict], year: int, total_world_pop: int) -> List[Dict]:
    """
    Add estimated rural population dots based on world population estimates.
    """
    print(f"  Adding rural population for year {year}...")
    
    # Estimate urban vs rural ratio based on year
    if year < -5000:
        urban_ratio = 0.05  # 5% urban
    elif year < 0:
        urban_ratio = 0.1   # 10% urban
    elif year < 1800:
        urban_ratio = 0.15  # 15% urban
    elif year < 1950:
        urban_ratio = 0.30  # 30% urban
    else:
        urban_ratio = 0.55  # 55% urban (modern times)
    
    # Calculate current urban population from existing dots
    urban_pop = sum(dot['population'] for dot in dots if dot.get('type') == 'urban')
    
    # Estimate total population if not provided
    if total_world_pop == 0:
        if urban_pop > 0:
            total_world_pop = int(urban_pop / urban_ratio)
        else:
            # Fallback estimates
            pop_estimates = {
                -100000: 1000,
                -10000: 5000000,
                -5000: 50000000,
                0: 300000000,
                1000: 400000000,
                1800: 1000000000,
                1950: 2500000000,
                2000: 6000000000,
                2020: 7800000000
            }
            
            # Find closest estimate
            years = sorted(pop_estimates.keys())
            for i, est_year in enumerate(years):
                if year <= est_year:
                    total_world_pop = pop_estimates[est_year]
                    break
            else:
                total_world_pop = pop_estimates[years[-1]]
    
    rural_pop = total_world_pop - urban_pop
    
    if rural_pop <= 0:
        return dots
    
    # Create rural dots (scattered globally)
    persons_per_dot = get_persons_per_dot(year)
    num_rural_dots = min(rural_pop // persons_per_dot, 5000)  # Limit for performance
    
    # Define inhabitable regions (rough continental boundaries)
    inhabitable_regions = [
        # (lat_min, lat_max, lon_min, lon_max, weight)
        (10, 70, -10, 60, 3),      # Europe & Western Asia
        (20, 50, 60, 140, 4),      # Asia
        (-35, 35, -20, 50, 2),     # Africa
        (15, 70, -170, -50, 3),    # North America
        (-55, 15, -85, -35, 1),    # South America
        (-45, -10, 110, 180, 1),   # Australia
    ]
    
    for i in range(num_rural_dots):
        # Choose a region based on weights
        weights = [r[4] for r in inhabitable_regions]
        total_weight = sum(weights)
        probabilities = [w / total_weight for w in weights]
        region = np.random.choice(len(inhabitable_regions), p=probabilities)
        
        lat_min, lat_max, lon_min, lon_max, _ = inhabitable_regions[region]
        
        # Random point in this region
        rural_lat = np.random.uniform(lat_min, lat_max)
        rural_lon = np.random.uniform(lon_min, lon_max)
        
        dots.append({
            'lat': rural_lat,
            'lon': rural_lon,
            'year': year,
            'population': persons_per_dot,
            'city': 'rural',
            'type': 'rural'
        })
    
    return dots

def process_cities_to_dots(raw_dir: str, output_dir: str) -> str:
    """
    Process city data and create human dots GeoJSON.
    
    Returns:
        Path to output GeoJSON file
    """
    print("🏙️ Processing cities to human dots...")
    
    # Load city data
    cities_df = load_reba_cities(raw_dir)
    
    if cities_df.empty:
        raise ValueError(
            "No city data available. Please run 'poetry run fetch-data' first "
            "to download the datasets."
        )
    
    all_dots = []
    
    # Process cities by year
    years = sorted(cities_df['year'].unique())
    
    for year in years:
        print(f"Processing year {year}...")
        
        year_cities = cities_df[cities_df['year'] == year]
        
        # Convert cities to dots
        year_dots = []
        for _, city in year_cities.iterrows():
            city_dots = population_to_dots(
                city['population'], 
                year, 
                city['lat'], 
                city['lon'], 
                city.get('name', 'Unknown')
            )
            year_dots.extend(city_dots)
        
        # Add rural population
        year_dots = add_rural_population(year_dots, year, 0)
        
        all_dots.extend(year_dots)
        print(f"  Created {len(year_dots)} dots for year {year}")
    
    # Convert to GeoDataFrame
    if all_dots:
        # Create point geometries
        geometries = [Point(dot['lon'], dot['lat']) for dot in all_dots]
        
        # Create properties
        properties = {
            'year': [dot['year'] for dot in all_dots],
            'population': [dot['population'] for dot in all_dots],
            'city': [dot['city'] for dot in all_dots],
            'type': [dot['type'] for dot in all_dots]
        }
        
        gdf = gpd.GeoDataFrame(properties, geometry=geometries, crs='EPSG:4326')
        
        # Save as GeoJSON
        output_path = pathlib.Path(output_dir) / "human_dots.geojson"
        gdf.to_file(output_path, driver='GeoJSON')
        
        print(f"✓ Saved {len(gdf)} human dots to {output_path}")
        return str(output_path)
    else:
        raise ValueError("No human dots could be created from the available data.")

def main():
    """Main processing routine."""
    # Resolve paths relative to this script so it works from any CWD
    script_dir = pathlib.Path(__file__).resolve().parent
    raw_dir = script_dir.parent / "data" / "raw"
    output_dir = script_dir.parent / "data" / "processed"
    
    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Process cities to dots
    geojson_path = process_cities_to_dots(str(raw_dir), str(output_dir))
    
    print(f"\n✓ Human dots data ready: {geojson_path}")
    print("\nNext: Run make_tiles.py to generate vector tiles")

if __name__ == "__main__":
    main()