#!/usr/bin/env python3
"""
DEPRECATED: Legacy coordinate redistribution for old NDJSON/"human_dots" artifacts.
Tiles-only pipeline does not use or produce hyde_human_dots*.geojson. Kept for archival; do not use.
"""
import json
import numpy as np
from collections import defaultdict

def redistribute_coordinates():
    """Redistribute coordinates to match realistic historical population patterns."""
    print("[DEPRECATED] redistribute_coords.py belongs to the legacy NDJSON/dots pipeline and is not used anymore.\n"
          "Tiles-only pipeline generates vector tiles via tippecanoe from temporary GeoJSONL.")
    raise SystemExit(0)
    
    input_file = "processed/hyde_human_dots_backup.geojson"
    output_file = "processed/hyde_human_dots.geojson"
    
    print(f"Loading data from {input_file}...")
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    total_features = len(data['features'])
    print(f"Found {total_features:,} features to redistribute...")
    
    # Group features by year for consistent redistribution
    features_by_year = defaultdict(list)
    for feature in data['features']:
        year = feature['properties']['year']
        features_by_year[year].append(feature)
    
    print(f"Found data for {len(features_by_year)} years")
    
    # Define realistic population centers by historical period
    def get_population_centers(year):
        """Return weighted population centers for a given year."""
        if year <= -8000:  # Paleolithic/early Neolithic
            return [
                (35.0, 39.0, 0.3),   # Middle East/Anatolia
                (30.0, 31.0, 0.2),   # Nile Valley
                (35.0, 69.0, 0.1),   # Central Asia
                (25.0, 82.0, 0.2),   # Indus Valley region
                (35.0, 110.0, 0.2),  # North China
            ]
        elif year <= 0:  # Ancient period
            return [
                (35.0, 39.0, 0.2),   # Mediterranean/Middle East
                (30.0, 31.0, 0.15),  # Egypt
                (28.0, 77.0, 0.15),  # India
                (35.0, 110.0, 0.2),  # China
                (40.0, 14.0, 0.1),   # Italy/Rome
                (38.0, 23.0, 0.05),  # Greece
                (36.0, -6.0, 0.05),  # Iberia
                (50.0, 2.0, 0.05),   # Northern Europe
                (15.0, -90.0, 0.05), # Mesoamerica
            ]
        else:  # Medieval and later
            return [
                (35.0, 110.0, 0.25), # China
                (28.0, 77.0, 0.2),   # India
                (35.0, 39.0, 0.15),  # Middle East
                (30.0, 31.0, 0.08),  # Egypt
                (45.0, 9.0, 0.1),    # Europe
                (52.0, 5.0, 0.05),   # Northwest Europe
                (40.0, -4.0, 0.05),  # Iberia
                (15.0, -90.0, 0.07), # Mesoamerica
                (-15.0, -60.0, 0.05) # South America
            ]
    
    # Redistribute each year's data
    redistributed_features = []
    
    for year, features in features_by_year.items():
        print(f"  Redistributing {len(features):,} features for year {year}...")
        
        centers = get_population_centers(year)
        
        for i, feature in enumerate(features):
            # Choose a population center based on weights
            weights = [c[2] for c in centers]
            center_idx = np.random.choice(len(centers), p=weights)
            center_lat, center_lon, _ = centers[center_idx]
            
            # Add realistic scatter around the center
            # More scatter for earlier periods (less concentrated populations)
            if year <= -5000:
                scatter = 25.0  # Very wide scatter for early periods
            elif year <= 0:
                scatter = 15.0  # Wide scatter for ancient period
            else:
                scatter = 8.0   # More concentrated for medieval/modern
            
            # Generate new coordinates with realistic distribution
            new_lat = np.random.normal(center_lat, scatter/3)
            new_lon = np.random.normal(center_lon, scatter/3)
            
            # Ensure coordinates stay within valid bounds
            new_lat = np.clip(new_lat, -85, 85)  # Avoid extreme poles
            new_lon = ((new_lon + 180) % 360) - 180  # Wrap longitude
            
            # Update feature coordinates
            feature['geometry']['coordinates'] = [new_lon, new_lat]
            redistributed_features.append(feature)
    
    # Update the data structure
    data['features'] = redistributed_features
    
    print(f"Redistributed {len(redistributed_features):,} total features")
    
    # Save redistributed data
    print(f"Saving redistributed data to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    
    print("✓ Coordinates redistributed realistically!")
    return output_file

if __name__ == "__main__":
    redistribute_coordinates()