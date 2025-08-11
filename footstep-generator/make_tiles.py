#!/usr/bin/env python3
"""
Generate vector tiles from processed population and city data.
Creates .mbtiles files using tippecanoe for efficient web serving.

Enhancements:
- Supports per-year, per-LOD MBTiles generation from processed NDJSON.gz outputs
  emitted by process_hyde.py (dots_{year}_lod_{lod}.ndjson.gz)
- Produces one MBTiles per year containing all LOD layers with appropriate
  zoom ranges, without dropping features (population preserving)
"""

import os
import pathlib
import subprocess
import json
import re
import tempfile
import gzip
from typing import List, Dict, Any, Tuple, Optional

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

# ---------------------------
# Legacy combined tiles config
# ---------------------------
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

# ---------------------------
# Per-year, per-LOD tile generation
# ---------------------------

# Zoom ranges by LOD level (inclusive)
LOD_ZOOM_RANGES: Dict[int, Tuple[int, int]] = {
    0: (0, 3),   # REGIONAL visible at z0-3
    1: (4, 4),   # SUBREGIONAL at z4
    2: (5, 5),   # LOCAL at z5
    3: (6, 12),  # DETAILED at z6+
}

YEAR_LOD_PATTERN = re.compile(r"dots_(-?\d+)_lod_(\d)\.ndjson\.gz$")

def find_year_lod_files(processed_dir: str) -> Dict[int, Dict[int, str]]:
    """Discover processed NDJSON.gz files and return mapping year->lod->path."""
    mapping: Dict[int, Dict[int, str]] = {}
    pdir = pathlib.Path(processed_dir)
    if not pdir.exists():
        return mapping
    for path in pdir.glob("dots_*_lod_*.ndjson.gz"):
        m = YEAR_LOD_PATTERN.search(path.name)
        if not m:
            continue
        year = int(m.group(1))
        lod = int(m.group(2))
        mapping.setdefault(year, {})[lod] = str(path)
    return mapping

def gunzip_to_temp(input_path: str) -> str:
    """Decompress .gz NDJSON to a temporary .geojsonl file and return its path."""
    with gzip.open(input_path, "rb") as fin:
        data = fin.read()
    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".geojsonl")
    try:
        tmp.write(data)
    finally:
        tmp.close()
    return tmp.name

def generate_mbtiles_for_lod(
    input_geojsonl: str,
    out_mbtiles: str,
    lod_level: int,
    minzoom: int,
    maxzoom: int,
) -> bool:
    """Run tippecanoe for a single LOD with strict population preservation."""
    cmd = [
        "tippecanoe",
        "-o", out_mbtiles,
        "-Z", str(minzoom),
        "-z", str(maxzoom),
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--force",
        "-l", f"human_dots_lod_{lod_level}",
        input_geojsonl,
    ]
    return run_command(cmd, f"LOD {lod_level} tiles (z{minzoom}-{maxzoom})")

def combine_lod_mbtiles(lod_mbtiles: List[str], out_mbtiles: str) -> bool:
    """Combine multiple LOD-specific MBTiles into a single year MBTiles."""
    cmd = [
        "tile-join",
        "-o", out_mbtiles,
        "--force",
        *lod_mbtiles,
    ]
    return run_command(cmd, "Combine LOD MBTiles -> yearly tileset")

def generate_year_tiles(processed_dir: str, tiles_dir: str, year: int, force: bool = False) -> Optional[str]:
    """Generate a single MBTiles for a given year by combining all LODs.

    Returns the path to the yearly MBTiles on success, or None on failure.
    """
    year_map = find_year_lod_files(processed_dir).get(year, {})
    if not year_map:
        print(f"  ✗ No processed NDJSON found for year {year}")
        return None

    tiles_dir_path = pathlib.Path(tiles_dir)
    tiles_dir_path.mkdir(parents=True, exist_ok=True)
    final_path = tiles_dir_path / f"humans_{year}.mbtiles"

    if final_path.exists() and not force:
        print(f"  ↪ Skipping year {year}: {final_path.name} already exists (use --force to overwrite)")
        return str(final_path)

    # Generate per-LOD tiles
    tmp_files: List[str] = []
    lod_tiles: List[str] = []
    try:
        for lod, (minz, maxz) in LOD_ZOOM_RANGES.items():
            src = year_map.get(lod)
            if not src:
                print(f"    ⚠︎ Missing LOD {lod} for year {year} — skipping this LOD")
                continue
            tmp = gunzip_to_temp(src)
            tmp_files.append(tmp)
            lod_out = tiles_dir_path / f"humans_{year}_lod_{lod}.mbtiles"
            if lod_out.exists() and force:
                lod_out.unlink()
            ok = generate_mbtiles_for_lod(tmp, str(lod_out), lod, minz, maxz)
            if not ok:
                return None
            lod_tiles.append(str(lod_out))

        if not lod_tiles:
            print(f"  ✗ No LOD tiles were generated for {year}")
            return None

        # Combine into final yearly MBTiles
        if final_path.exists() and force:
            final_path.unlink()
        ok = combine_lod_mbtiles(lod_tiles, str(final_path))
        if not ok:
            return None

        # Verify
        verify_tiles(str(final_path))
        print(f"  ✓ Year {year} MBTiles ready: {final_path}")
        return str(final_path)
    finally:
        # Cleanup temp files
        for t in tmp_files:
            try:
                os.unlink(t)
            except OSError:
                pass

def main():
    """Main tile generation routine."""
    import argparse

    print("🗺️ Globe-of-Humans Tile Generator")
    print("=" * 40)

    script_dir = pathlib.Path(__file__).resolve().parent
    default_processed = str(script_dir.parent / "data" / "processed")
    default_tiles = str(script_dir.parent / "data" / "tiles" / "humans")

    parser = argparse.ArgumentParser(description="Generate MBTiles for Globe-of-Humans")
    parser.add_argument("--mode", choices=["combined", "per-year"], default="per-year", help="Tile generation mode")
    parser.add_argument("--processed-dir", default=default_processed, help="Directory with processed outputs")
    parser.add_argument("--tiles-dir", default=default_tiles, help="Output directory for per-year MBTiles")
    parser.add_argument("--years", nargs="*", type=int, help="Specific years to build (default: all found)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing MBTiles")
    args = parser.parse_args()

    processed_dir = args.processed_dir

    if args.mode == "combined":
        # Legacy combined mode (expects population_density.geojson/human_dots.geojson)
        output_file = os.path.join(processed_dir, "globe_humans.mbtiles")
        pathlib.Path(processed_dir).mkdir(parents=True, exist_ok=True)

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
            print("  python process_hyde.py")
            print("  python process_cities.py")
            return

        success = create_simple_combined_tiles(processed_dir, output_file)
        if success:
            verify_tiles(output_file)
            create_metadata_json(processed_dir)
            print(f"\n✓ Vector tiles generated: {output_file}")
            print("\nNext steps:")
            print("1. Copy tiles to frontend: cp data/processed/globe_humans.mbtiles humans-globe/public/")
            print("2. Start the Next.js development server")
            print("3. Test the visualization!")
        else:
            print("\n✗ Tile generation failed")
            print("Make sure tippecanoe is installed: brew install tippecanoe")
        return

    # Per-year mode
    year_map = find_year_lod_files(processed_dir)
    if not year_map:
        print("✗ No processed NDJSON.gz found. Run process_hyde.py first.")
        return

    target_years = args.years if args.years else sorted(year_map.keys())
    print(f"Found {len(target_years)} years to build: {', '.join(map(str, target_years))}")
    pathlib.Path(args.tiles_dir).mkdir(parents=True, exist_ok=True)

    built = 0
    for y in target_years:
        print(f"→ Building tiles for year {y}...")
        out = generate_year_tiles(processed_dir, args.tiles_dir, y, force=args.force)
        if out:
            built += 1

    print(f"\n✓ Built {built} yearly MBTiles → {args.tiles_dir}")
    print("Next:")
    print("- Serve tiles via API route: /api/tiles/{year}/{lod}/{z}/{x}/{y}.pbf")
    print("- Frontend: use deck.gl MVTLayer with that URL template and LOD selection")

if __name__ == "__main__":
    main()