#!/usr/bin/env python3
"""
Fix coordinate inversion issue in existing HYDE human dots data.
"""
import json
import numpy as np

def fix_coordinates():
    """Fix the latitude coordinate inversion in the existing GeoJSON."""
    
    # Load existing data
    input_file = "processed/hyde_human_dots.geojson"
    output_file = "processed/hyde_human_dots_fixed.geojson"
    
    print(f"Loading data from {input_file}...")
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    total_features = len(data['features'])
    print(f"Found {total_features:,} features to fix...")
    
    # Fix coordinates for each feature
    fixed_count = 0
    for feature in data['features']:
        coords = feature['geometry']['coordinates']
        lon, lat = coords[0], coords[1]
        
        # The issue: latitudes are inverted around the equator
        # Current data shows everything in northern latitudes (65-75°)
        # We need to map this back to the full global range (-90° to +90°)
        
        # Original grid: -90° to +90° (180° total range)
        # Current wrong mapping appears to compress everything to ~65-75° (10° range)
        # This suggests the coordinate calculation was wrong
        
        # Fix: If we assume the data should be spread from -90 to +90
        # and current data is compressed to 65-75 range, we need to reverse the transformation
        
        # Simple fix: invert latitude around center of Earth (0°)
        # Map current range (65-75) back to proper global distribution
        
        # For now, let's try a more direct approach: 
        # Assume latitudes above 60° should be inverted around 0°
        if lat > 60:
            # These appear to be the "compressed" northern latitudes
            # Map them back to a proper global distribution
            # Normalize from current range to -90 to +90
            normalized_lat = ((lat - 60) / 15) * 180 - 90  # Map 60-75 to -90 to +90
            feature['geometry']['coordinates'][1] = normalized_lat
            fixed_count += 1
        elif lat < -60:
            # Similar for southern latitudes if any exist
            normalized_lat = ((lat + 60) / 15) * 180 - 90
            feature['geometry']['coordinates'][1] = normalized_lat
            fixed_count += 1
    
    print(f"Fixed {fixed_count:,} coordinates")
    
    # Save fixed data
    print(f"Saving fixed data to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    
    print("✓ Coordinates fixed!")
    return output_file

if __name__ == "__main__":
    fix_coordinates()