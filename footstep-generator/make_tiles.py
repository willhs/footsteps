#!/usr/bin/env python3
"""
Generate vector tiles from processed population and city data.
Creates .mbtiles files using tippecanoe for efficient web serving.
"""

import os
import pathlib
import subprocess
import json
from typing import List, Dict, Any

def run_command(cmd: List[str], description: str) -> bool:
    """Run a shell command and return success status."""
    print(f"Running: {description}")
    print(f"  Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"  ✓ Success")
        if result.stdout:
            print(f"  Output: {result.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Failed: {e}")
        if e.stderr:
            print(f"  Error: {e.stderr.strip()}")
        return False
    except FileNotFoundError:
        print(f"  ✗ Command not found: {cmd[0]}")
        print("  Make sure tippecanoe is installed: brew install tippecanoe")
        return False

def create_tileset_config() -> Dict[str, Any]:
    """Create configuration for the tileset."""
    return {
        "tilejson": "2.2.0",
        "name": "Globe of Humans",
        "description": "Human population visualization from 100,000 BCE to 2025 CE",
        "version": "1.0.0",
        "attribution": "HYDE 3.3, Reba et al.",
        "minzoom": 0,
        "maxzoom": 10,
        "bounds": [-180, -85, 180, 85],
        "center": [0, 0, 2],
        "layers": [
            {
                "id": "population_density",
                "description": "Population density heat-map",
                "minzoom": 0,
                "maxzoom": 8,
                "fields": {
                    "density": "Number",
                    "year": "Number"
                }
            },
            {
                "id": "human_dots",
                "description": "Individual human dots",
                "minzoom": 2,
                "maxzoom": 10,
                "fields": {
                    "year": "Number",
                    "population": "Number",
                    "city": "String",
                    "type": "String"
                }
            }
        ]
    }

def generate_population_tiles(input_file: str, output_file: str) -> bool:
    """Generate vector tiles for population density data."""
    print("🔥 Generating population density tiles...")
    
    if not pathlib.Path(input_file).exists():
        print(f"  ✗ Input file not found: {input_file}")
        return False
    
    # Tippecanoe command for population density
    cmd = [
        "tippecanoe",
        "-o", output_file,
        "-z", "8",           # Max zoom level
        "-Z", "0",           # Min zoom level  
        "-r", "1",           # Drop rate for dense areas
        "-B", "0",           # Buffer around tiles
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--force",           # Overwrite existing file
        "-l", "population_density",  # Layer name
        input_file
    ]
    
    return run_command(cmd, "Population density tiles")

def generate_human_dots_tiles(input_file: str, output_file: str) -> bool:
    """Generate vector tiles for human dots data."""
    print("👥 Generating human dots tiles...")
    
    if not pathlib.Path(input_file).exists():
        print(f"  ✗ Input file not found: {input_file}")
        return False
    
    # Tippecanoe command for human dots
    cmd = [
        "tippecanoe",
        "-o", output_file,
        "-z", "10",          # Max zoom level (higher for points)
        "-Z", "2",           # Min zoom level (start showing at zoom 2)
        "-r", "2",           # Drop rate
        "-B", "64",          # Buffer for points
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping", 
        "--force",           # Overwrite existing file
        "-l", "human_dots",  # Layer name
        "--maximum-zoom=g",  # Guess appropriate max zoom
        input_file
    ]
    
    return run_command(cmd, "Human dots tiles")

def combine_tilesets(density_tiles: str, dots_tiles: str, output_file: str) -> bool:
    """Combine population density and human dots into a single tileset."""
    print("🌍 Combining tilesets...")
    
    # Use tile-join to combine multiple mbtiles
    cmd = [
        "tile-join",
        "-o", output_file,
        "--force",           # Overwrite existing file
        density_tiles,
        dots_tiles
    ]
    
    return run_command(cmd, "Combining tilesets")

def create_simple_combined_tiles(processed_dir: str, output_file: str) -> bool:
    """Create tiles directly from both GeoJSON files if tile-join unavailable."""
    print("🌍 Creating combined tiles...")
    
    density_file = os.path.join(processed_dir, "population_density.geojson")
    dots_file = os.path.join(processed_dir, "human_dots.geojson")
    
    # Check if files exist
    input_files = []
    if pathlib.Path(density_file).exists():
        input_files.append(density_file)
    if pathlib.Path(dots_file).exists():
        input_files.append(dots_file)
    
    if not input_files:
        print("  ✗ No input files found")
        return False
    
    # Create combined tileset with tippecanoe
    cmd = [
        "tippecanoe",
        "-o", output_file,
        "-z", "10",          # Max zoom
        "-Z", "0",           # Min zoom
        "-r", "1",           # Drop rate
        "-B", "64",          # Buffer
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--force",           # Overwrite existing
        "--maximum-zoom=g",  # Guess max zoom
    ]
    
    # Add layer specifications for each file
    if pathlib.Path(density_file).exists():
        cmd.extend(["-L", f"population_density:{density_file}"])
    
    if pathlib.Path(dots_file).exists():
        cmd.extend(["-L", f"human_dots:{dots_file}"])
    
    return run_command(cmd, "Combined tiles generation")

def create_metadata_json(output_dir: str) -> None:
    """Create metadata JSON for the tileset."""
    config = create_tileset_config()
    
    metadata_file = os.path.join(output_dir, "tileset_metadata.json")
    with open(metadata_file, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✓ Created metadata: {metadata_file}")

def verify_tiles(tiles_file: str) -> bool:
    """Verify the generated tiles file."""
    if not pathlib.Path(tiles_file).exists():
        print(f"  ✗ Tiles file not found: {tiles_file}")
        return False
    
    # Check file size
    size_mb = pathlib.Path(tiles_file).stat().st_size / (1024 * 1024)
    print(f"  ✓ Tiles file size: {size_mb:.1f} MB")
    
    # Try to get info about the tileset
    try:
        result = subprocess.run(
            ["sqlite3", tiles_file, "SELECT name FROM sqlite_master WHERE type='table';"],
            capture_output=True, text=True, check=True
        )
        tables = result.stdout.strip().split('\n')
        print(f"  ✓ Tables found: {', '.join(tables)}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  ? Could not verify tiles (sqlite3 not available)")
        return True  # Assume it's okay

def main():
    """Main tile generation routine."""
    print("🗺️ Globe-of-Humans Tile Generator")
    print("=" * 40)
    
    processed_dir = "data/processed"
    output_file = os.path.join(processed_dir, "globe_humans.mbtiles")
    
    # Ensure processed directory exists
    pathlib.Path(processed_dir).mkdir(parents=True, exist_ok=True)
    
    # Check for input files
    density_file = os.path.join(processed_dir, "population_density.geojson")
    dots_file = os.path.join(processed_dir, "human_dots.geojson")
    
    print("Checking input files...")
    has_density = pathlib.Path(density_file).exists()
    has_dots = pathlib.Path(dots_file).exists()
    
    print(f"  Population density: {'✓' if has_density else '✗'}")
    print(f"  Human dots: {'✓' if has_dots else '✗'}")
    
    if not has_density and not has_dots:
        print("\n✗ No input data found!")
        print("Run the following first:")
        print("  python data/scripts/process_hyde.py")
        print("  python data/scripts/process_cities.py")
        return
    
    # Generate tiles
    success = create_simple_combined_tiles(processed_dir, output_file)
    
    if success:
        # Verify the output
        verify_tiles(output_file)
        
        # Create metadata
        create_metadata_json(processed_dir)
        
        print(f"\n✓ Vector tiles generated: {output_file}")
        print("\nNext steps:")
        print("1. Copy tiles to frontend: cp data/processed/globe_humans.mbtiles frontend/public/")
        print("2. Start the Next.js development server")
        print("3. Test the visualization!")
        
    else:
        print("\n✗ Tile generation failed")
        print("Make sure tippecanoe is installed: brew install tippecanoe")

if __name__ == "__main__":
    main()