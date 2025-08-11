#!/usr/bin/env python3
"""
DEPRECATED: Legacy analysis script for the old NDJSON/"human_dots" pipeline.
This tiles-only pipeline does not produce hyde_human_dots.geojson and this script
should not be used. Kept only for archival reference.
"""
import json
import numpy as np

def analyze_coordinates():
    """Analyze the coordinate distribution."""
    print("[DEPRECATED] analyze_coords.py is part of the legacy NDJSON/dots pipeline and is not used anymore.\n"
          "Tiles-only pipeline generates vector tiles via tippecanoe from temporary GeoJSONL.")
    raise SystemExit(0)
    
    input_file = "processed/hyde_human_dots.geojson"
    
    print(f"Analyzing coordinates in {input_file}...")
    
    latitudes = []
    longitudes = []
    
    # Sample first 10000 features to get a quick overview
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    print(f"Total features: {len(data['features']):,}")
    
    # Sample every nth feature for analysis
    sample_size = min(10000, len(data['features']))
    step = max(1, len(data['features']) // sample_size)
    
    for i in range(0, len(data['features']), step):
        feature = data['features'][i]
        coords = feature['geometry']['coordinates']
        lon, lat = coords[0], coords[1]
        latitudes.append(lat)
        longitudes.append(lon)
    
    lats = np.array(latitudes)
    lons = np.array(longitudes)
    
    print(f"\nAnalyzing {len(lats):,} sampled coordinates:")
    print(f"Latitude range: {lats.min():.2f}° to {lats.max():.2f}°")
    print(f"Longitude range: {lons.min():.2f}° to {lons.max():.2f}°")
    
    print(f"\nLatitude distribution:")
    print(f"  < -60°: {np.sum(lats < -60):,} ({np.sum(lats < -60)/len(lats)*100:.1f}%)")
    print(f"  -60° to -30°: {np.sum((lats >= -60) & (lats < -30)):,} ({np.sum((lats >= -60) & (lats < -30))/len(lats)*100:.1f}%)")
    print(f"  -30° to 0°: {np.sum((lats >= -30) & (lats < 0)):,} ({np.sum((lats >= -30) & (lats < 0))/len(lats)*100:.1f}%)")
    print(f"  0° to 30°: {np.sum((lats >= 0) & (lats < 30)):,} ({np.sum((lats >= 0) & (lats < 30))/len(lats)*100:.1f}%)")
    print(f"  30° to 60°: {np.sum((lats >= 30) & (lats < 60)):,} ({np.sum((lats >= 30) & (lats < 60))/len(lats)*100:.1f}%)")
    print(f"  > 60°: {np.sum(lats > 60):,} ({np.sum(lats > 60)/len(lats)*100:.1f}%)")
    
    print(f"\nMost common latitude ranges:")
    lat_counts, lat_bins = np.histogram(lats, bins=20)
    max_idx = np.argmax(lat_counts)
    print(f"  Peak density: {lat_bins[max_idx]:.1f}° to {lat_bins[max_idx+1]:.1f}° ({lat_counts[max_idx]:,} points)")

if __name__ == "__main__":
    analyze_coordinates()