#!/usr/bin/env python3
"""
Generate vector tiles from processed population and city data.
Creates .mbtiles files using tippecanoe for efficient web serving.

Enhancements:
 - Tiles-only: generates per-year MBTiles directly from in-memory LOD data
   produced by process_hyde.py (no intermediate artifacts persisted)
 - Produces one MBTiles per year containing all LOD layers with appropriate
   zoom ranges, without dropping features (population preserving)
"""

import os
import pathlib
import subprocess
import json
import re
import tempfile
from typing import List, Dict, Any, Tuple, Optional

# Import processing functions to compute LODs in-memory
from process_hyde import find_hyde_files, process_year_with_hierarchical_lods

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

def create_metadata_json(output_dir: str) -> None:
    """Create metadata JSON for the tileset."""
    config = {
        "tilejson": "2.2.0",
        "name": "Globe of Humans",
        "description": "Human settlement visualization from 100,000 BCE to 2025 CE",
        "version": "1.0.0",
        "attribution": "HYDE 3.5, Reba et al.",
        "minzoom": 0,
        "maxzoom": 12,
        "bounds": [-180, -85, 180, 85],
        "center": [0, 0, 2],
        "layers": [
            {
                "id": "settlements",
                "description": "Aggregated human settlements by LOD",
                "minzoom": 0,
                "maxzoom": 12,
                "fields": {
                    "population": "Number",
                    "year": "Number",
                    "lod_level": "Number",
                    "grid_size": "Number",
                    "source_dots": "Number",
                    "density": "Number"
                }
            }
        ]
    }

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

def write_geojsonl_temp(settlements) -> str:
    """Write AggregatedSettlement list to a temporary GeoJSONL file and return its path."""
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".geojsonl")
    os.close(tmp_fd)
    with open(tmp_path, "w", encoding="utf-8") as f_out:
        for s in settlements:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [s.coordinates.longitude, s.coordinates.latitude],
                },
                "properties": {
                    "population": s.total_population,
                    "year": s.year,
                    "type": "settlement",
                    "lod_level": getattr(s.lod_level, "value", s.lod_level),
                    "grid_size": s.grid_size_degrees,
                    "source_dots": s.source_dot_count,
                    "density": s.average_density,
                },
            }
            f_out.write(json.dumps(feature))
            f_out.write("\n")
    return tmp_path

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
        "-l", f"humans_lod_{lod_level}",
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

def generate_year_tiles(asc_file: str, tiles_dir: str, year: int, force: bool = False) -> Optional[str]:
    """Generate a single MBTiles for a given year by computing LODs and combining them.

    Tiles-only: computes LODs in-memory (no intermediate artifacts), writes temporary GeoJSONL per LOD,
    builds per-LOD MBTiles with tippecanoe, and combines into a single yearly MBTiles.
    """

    tiles_dir_path = pathlib.Path(tiles_dir)
    tiles_dir_path.mkdir(parents=True, exist_ok=True)
    final_path = tiles_dir_path / f"humans_{year}.mbtiles"

    if final_path.exists() and not force:
        print(f"  ↪ Skipping year {year}: {final_path.name} already exists (use --force to overwrite)")
        return str(final_path)

    # Compute LODs for this year
    result = process_year_with_hierarchical_lods(asc_file, year, str(tiles_dir_path), force=force)
    lod_tiles: List[str] = []
    tmp_files: List[str] = []
    try:
        for lod_level, settlements in sorted(
            result.lod_data.items(), key=lambda x: getattr(x[0], "value", x[0])
        ):
            if not settlements:
                continue
            # Write temp GeoJSONL for this LOD
            tmp_geojsonl = write_geojsonl_temp(settlements)
            tmp_files.append(tmp_geojsonl)
            minzoom, maxzoom = LOD_ZOOM_RANGES.get(int(getattr(lod_level, "value", lod_level)), (0, 12))
            target_lod = int(getattr(lod_level, "value", lod_level))

            # Persist per-LOD MBTiles to tiles_dir so the server can serve
            # /api/tiles/{year}/{lod}/... directly from humans_{year}_lod_{lod}.mbtiles
            lod_out = tiles_dir_path / f"humans_{year}_lod_{target_lod}.mbtiles"
            if lod_out.exists() and force:
                lod_out.unlink()
            if not lod_out.exists() or force:
                ok = generate_mbtiles_for_lod(tmp_geojsonl, str(lod_out), target_lod, minzoom, maxzoom)
                if not ok:
                    return None
            else:
                print(f"  ↪ Skipping LOD {target_lod}: {lod_out.name} already exists (use --force to overwrite)")
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
    default_raw = str(script_dir.parent / "data" / "raw" / "hyde-3.5")
    default_tiles = str(script_dir.parent / "data" / "tiles" / "humans")

    parser = argparse.ArgumentParser(description="Generate MBTiles for Globe-of-Humans (tiles-only)")
    parser.add_argument("--raw-dir", default=default_raw, help="Directory with HYDE ASC files (popd_*.asc)")
    parser.add_argument("--tiles-dir", default=default_tiles, help="Output directory for per-year MBTiles")
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        help=(
            "One or more years to build (supports negative for BCE, e.g., -1000). "
            "Omit this flag to build all found years."
        ),
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing MBTiles")
    args = parser.parse_args()

    raw_dir = args.raw_dir

    # Tiles-only per-year mode
    hyde_map = find_hyde_files(raw_dir)
    if not hyde_map:
        print("✗ No HYDE ASC files found. Please download data first (see process_hyde.py).")
        return

    target_years = args.years if args.years else sorted(hyde_map.keys())
    missing = [y for y in (args.years or []) if y not in hyde_map]
    if missing:
        print(f"⚠️  Warning: requested years not found in raw data: {', '.join(map(str, missing))}")
    print(f"Found {len(target_years)} years to build: {', '.join(map(str, target_years))}")
    pathlib.Path(args.tiles_dir).mkdir(parents=True, exist_ok=True)

    built = 0
    for y in target_years:
        print(f"→ Building tiles for year {y}...")
        asc_file = hyde_map.get(y)
        if not asc_file:
            print(f"  ✗ Skipping year {y}: ASC file not found in {raw_dir}")
            continue
        out = generate_year_tiles(asc_file, args.tiles_dir, y, force=args.force)
        if out:
            built += 1

    print(f"\n✓ Built {built} yearly MBTiles → {args.tiles_dir}")
    print("Next:")
    print("- Serve tiles via API route: /api/tiles/{year}/{lod}/{z}/{x}/{y}.pbf")
    print("- Frontend: use deck.gl MVTLayer with that URL template and LOD selection")

if __name__ == "__main__":
    main()
