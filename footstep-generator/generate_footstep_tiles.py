#!/usr/bin/env python3
"""
Generate MBTiles from HYDE population data with hierarchical LODs.

Combined pipeline that efficiently processes raw HYDE ASC files directly to 
web-ready MBTiles without intermediate file artifacts. Replaces the separate
process_hyde.py + make_tiles.py workflow with a single efficient script.

Features:
- Single-pass processing: ASC → LODs → MBTiles
- Memory-efficient: processes one year at a time
- Population-preserving hierarchical LODs (4 levels: Regional, Subregional, Local, Detailed)
- Outputs both per-LOD artifacts and combined single-layer MBTiles
"""

import argparse
import gc
import os
import pathlib
import platform
import subprocess
import tempfile
import json
from typing import Dict, List, Optional
from pmtiles_utils import ensure_pmtiles_for_year

# Import core processing functions
from hyde_tile_processor import (
    find_hyde_files,
    generate_yearly_tile_data,
    get_memory_usage
)

# Import tile generation functions
from tile_generator import (
    run_command,
    verify_tiles,
    write_combined_geojsonl_windows,
    generate_single_layer_mbtiles,
    write_geojsonl_temp,
    generate_mbtiles_for_lod,
    combine_lod_mbtiles
)

from verify_tiles import verify_single_layer
from lod_config import LOD_ZOOM_RANGES


def generate_year_tiles_combined(asc_file: str, tiles_dir: str, year: int, 
                                force: bool = False, single_layer: bool = True,
                                verify: bool = False, strict: bool = False) -> Optional[str]:
    """
    Generate MBTiles for a single year in one efficient pass.
    
    Processes HYDE ASC → LODs → temp files → MBTiles → cleanup.
    No duplicate processing, minimal memory usage.
    """
    tiles_dir_path = pathlib.Path(tiles_dir)
    tiles_dir_path.mkdir(parents=True, exist_ok=True)
    
    print(f"→ Processing year {year}...")
    
    # Check if final output already exists
    final_path = tiles_dir_path / f"humans_{year}.mbtiles"
    if final_path.exists() and not force and single_layer:
        print(f"  ↪ Skipping year {year}: {final_path.name} already exists (use --force to overwrite)")
        return str(final_path)
    
    # Single call to process HYDE data into LODs
    result = generate_yearly_tile_data(asc_file, year, str(tiles_dir_path), force=force)
    
    if not result.lod_data or all(not settlements for settlements in result.lod_data.values()):
        print(f"  ✗ No LOD data generated for year {year}")
        return None
    
    # Report LOD statistics
    lod_counts = {}
    for level, settlements in result.lod_data.items():
        level_name = getattr(level, 'name', f'LOD_{level}') if hasattr(level, 'name') else f'LOD_{level}'
        lod_counts[level_name] = len(settlements)
    
    print(f"  LOD counts: {lod_counts} | Population: {result.total_population:,.0f}")
    
    # Generate per-LOD MBTiles
    lod_tiles: List[str] = []
    tmp_files: List[str] = []
    
    try:
        for lod_level, settlements in sorted(
            result.lod_data.items(), key=lambda x: getattr(x[0], "value", x[0])
        ):
            if not settlements:
                continue
                
            # Write temp GeoJSONL for this LOD
            tmp_geojsonl = write_geojsonl_temp(settlements, int(getattr(lod_level, "value", lod_level)))
            tmp_files.append(tmp_geojsonl)
            
            minzoom, maxzoom = LOD_ZOOM_RANGES.get(int(getattr(lod_level, "value", lod_level)), (0, 12))
            target_lod = int(getattr(lod_level, "value", lod_level))
            
            # Generate per-LOD MBTiles
            lod_out = tiles_dir_path / f"humans_{year}_lod_{target_lod}.mbtiles"
            if lod_out.exists() and force:
                lod_out.unlink()
            
            if not lod_out.exists() or force:
                ok = generate_mbtiles_for_lod(tmp_geojsonl, str(lod_out), target_lod, minzoom, maxzoom)
                if not ok:
                    return None
            else:
                print(f"  ↪ Skipping LOD {target_lod}: {lod_out.name} already exists")
            
            lod_tiles.append(str(lod_out))
        
        success = True
        
        # Generate single-layer MBTiles (default, what frontend uses)
        if single_layer:
            # Use LOD windows for clean zoom transitions
            combined_geojsonl = write_combined_geojsonl_windows(result.lod_data)
            tmp_files.append(combined_geojsonl)
            
            if final_path.exists() and force:
                final_path.unlink()
                
            if not final_path.exists() or force:
                ok = generate_single_layer_mbtiles(combined_geojsonl, str(final_path))
                if not ok:
                    success = False
                else:
                    # Verify output
                    verify_tiles(str(final_path))
                    
                    if verify:
                        print("  → Verifying single-layer output…")
                        ok2 = verify_single_layer(str(final_path), strict=strict)
                        if strict and not ok2:
                            success = False
            else:
                print(f"  ↪ Skipping single-layer: {final_path.name} already exists")
        
        if success:
            print(f"  ✓ Year {year} tiles ready: {final_path if single_layer else f'{len(lod_tiles)} LOD files'}")
            return str(final_path) if single_layer else str(lod_tiles[0]) if lod_tiles else None
        else:
            return None
            
    finally:
        # Always clean up temp files
        for tmp_file in tmp_files:
            try:
                os.unlink(tmp_file)
            except OSError:
                pass
        
        # Clean up result to free memory
        del result
        gc.collect()


def main():
    """Main tile generation routine."""
    print("🗺️ Footsteps Tile Generator")
    print("=" * 40)
    
    script_dir = pathlib.Path(__file__).resolve().parent
    default_raw = str(script_dir.parent / "data" / "raw" / "hyde-3.5")
    default_tiles = str(script_dir.parent / "data" / "tiles" / "humans")
    
    parser = argparse.ArgumentParser(description="Generate vector tiles from HYDE data (combined pipeline)")
    parser.add_argument("--raw-dir", default=default_raw, 
                       help="Directory with HYDE ASC files (popd_*.asc)")
    parser.add_argument("--tiles-dir", default=default_tiles, 
                       help="Output directory for MBTiles")
    parser.add_argument("--years", nargs="+", type=int,
                       help="Specific years to build (supports negative for BCE, e.g., -1000)")
    parser.add_argument("--year", type=int, 
                       help="Single year to build (convenience)")
    parser.add_argument("--force", action="store_true", 
                       help="Overwrite existing MBTiles")
    
    # Output options
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--single-layer", dest="single_layer", action="store_true",
                      help="Build single-layer humans_{year}.mbtiles (default)")
    group.add_argument("--no-single-layer", dest="single_layer", action="store_false",
                      help="Skip single-layer output (per-LOD only)")
    parser.set_defaults(single_layer=True)
    
    parser.add_argument("--verify", action="store_true", 
                       help="Run post-build verification")
    parser.add_argument("--strict", action="store_true", 
                       help="Fail build on verification errors")
    group2 = parser.add_mutually_exclusive_group()
    group2.add_argument("--pmtiles", dest="pmtiles", action="store_true", help="Also write .pmtiles next to .mbtiles (default)")
    group2.add_argument("--no-pmtiles", dest="pmtiles", action="store_false", help="Do not write .pmtiles outputs")
    parser.set_defaults(pmtiles=True)
    
    args = parser.parse_args()
    
    # Discover available HYDE files
    hyde_map = find_hyde_files(args.raw_dir)
    if not hyde_map:
        print("✗ No HYDE ASC files found. Please download data first.")
        print(f"  Expected location: {args.raw_dir}")
        print("  Expected pattern: popd_*AD.asc, popd_*BC.asc")
        return 1
    
    # Determine target years
    if args.year is not None:
        target_years = [args.year]
    elif args.years:
        target_years = args.years
    else:
        target_years = sorted(hyde_map.keys())
    
    # Validate requested years exist
    missing = [y for y in target_years if y not in hyde_map]
    if missing:
        available = sorted(hyde_map.keys())
        print(f"❌ Years not found: {missing}")
        print(f"Available: {available[:5]}...{available[-5:]} ({len(available)} total)")
        return 1
    
    print(f"Found {len(target_years)} years to build: {', '.join(map(str, target_years))}")
    pathlib.Path(args.tiles_dir).mkdir(parents=True, exist_ok=True)
    
    # Report initial memory
    initial_memory = get_memory_usage()
    print(f"Starting memory: {initial_memory}")
    
    # Process years efficiently
    built = 0
    failed = 0
    
    for i, year in enumerate(target_years, 1):
        print(f"\n[{i}/{len(target_years)}] Year {year}")
        
        asc_file = hyde_map[year]
        result = generate_year_tiles_combined(
            asc_file, args.tiles_dir, year,
            force=args.force,
            single_layer=args.single_layer,
            verify=args.verify,
            strict=args.strict
        )
        
        if result:
            built += 1
            # Optionally convert to PMTiles without reprocessing
            if args.single_layer and args.pmtiles:
                pm = ensure_pmtiles_for_year(args.tiles_dir, year)
                if pm:
                    print(f"  ✓ Year {year} PMTiles ready: {pm}")
                else:
                    print("  ⚠️  PMTiles conversion failed. Install `pmtiles` CLI or `pip install pmtiles`.")
        else:
            failed += 1
            print(f"  ✗ Failed to build tiles for year {year}")
            if args.strict:
                return 1
        
        # Report memory after each year
        if i % 5 == 0 or i == len(target_years):
            current_memory = get_memory_usage()
            print(f"  Memory: {current_memory}")
    
    # Summary
    print(f"\n✓ Completed: {built} built, {failed} failed")
    print(f"  Output: {args.tiles_dir}")
    print(f"  Final memory: {get_memory_usage()} (started: {initial_memory})")
    
    if args.single_layer:
        print("\nNext steps:")
        print("- Serve tiles: /api/tiles/{year}/single/{z}/{x}/{y}.pbf")
        print("- Frontend: MVTLayer with layer 'humans'")
        print("- Deploy: iac/scripts/upload-data.sh")
    
    # macOS notification
    try:
        if platform.system() == "Darwin":
            msg = f"Tiles complete. {built} years built."
            subprocess.run(["say", msg], check=False)
    except Exception:
        pass
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    exit(main())
