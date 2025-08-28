#!/usr/bin/env python3
"""
Vector Tile Generator - Build MBTiles from hierarchical tile data.

Creates production-ready .mbtiles files using tippecanoe for efficient web serving.
Processes hierarchical LOD data into optimized vector tiles with population preservation.

NOTE: This module can be run standalone, but for production use the combined
generate_footstep_tiles.py script which does the full pipeline efficiently
without duplicate processing.

Features:
 - Tiles-only pipeline: generates per-year MBTiles directly from in-memory LOD data
 - Population-preserving: maintains demographic accuracy across zoom levels
 - Hierarchical output: produces both per-LOD artifacts and combined yearly tiles
"""

import os
import pathlib
import subprocess
import json
import re
import tempfile
import math
import hashlib
import platform
from typing import List, Dict, Any, Tuple, Optional

# Import processing functions to compute LODs in-memory
from hyde_tile_processor import find_hyde_files, generate_yearly_tile_data
from verify_tiles import verify_single_layer

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

# Import centralized LOD configuration
from lod_config import LOD_ZOOM_RANGES

def write_geojsonl_temp(settlements, lod_level: int) -> str:
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
            # Assign per-feature minzoom based on LOD and population importance
            lv = int(getattr(s.lod_level, "value", lod_level))
            if lv == 0:
                tz = 0
            elif lv == 1:
                tz = 4
            elif lv == 2:
                tz = 5
            else:
                tz = 6
            try:
                if float(s.total_population) > 20000:
                    tz = max(0, tz - 1)
            except Exception:
                pass
            feature["tippecanoe"] = {"minzoom": tz, "maxzoom": 12}
            f_out.write(json.dumps(feature))
            f_out.write("\n")
    return tmp_path

def _wm_tile(lon: float, lat: float, z: int) -> tuple:
    x = int((lon + 180.0) / 360.0 * (1 << z))
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * (1 << z))
    return x, y

def _stable_key(lon: float, lat: float) -> int:
    h = hashlib.md5(f"{lon:.6f},{lat:.6f}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)

def write_combined_geojsonl(lod_map: Dict[Any, List[Any]]) -> str:
    """Write a single-layer GeoJSONL using deterministic, population-preserving minzoom."""
    # Collect detailed points
    detailed = []
    for lod_level, settlements in lod_map.items():
        lv = int(getattr(lod_level, "value", lod_level))
        if lv == 3:
            for s in settlements:
                detailed.append({
                    "lon": float(s.coordinates.longitude),
                    "lat": float(s.coordinates.latitude),
                    "pop": float(s.total_population),
                    "year": int(s.year),
                    "grid": float(s.grid_size_degrees),
                    "src": int(s.source_dot_count),
                    "density": float(s.average_density),
                })
    # People-per-dot targets by zoom (tunable)
    # People-per-dot targets by zoom (monotonic decreasing with zoom)
    # Tune low zooms to avoid sparse appearance at 1–2x and ensure each zoom adds dots.
    ppd = {
        0: 2_000_000,  # very coarse
        1:   300_000,
        2:    60_000,
        3:    20_000,
        4:     5_000,
        5:     2_000,
        6:       600,  # detailed
    }
    minzoom = [12] * len(detailed)
    for z in range(0, 7):
        buckets: Dict[tuple, list] = {}
        for idx, d in enumerate(detailed):
            x, y = _wm_tile(d["lon"], d["lat"], z)
            buckets.setdefault((x, y), []).append(idx)
        for (x, y), idxs in buckets.items():
            total_pop = sum(detailed[i]["pop"] for i in idxs)
            target = max(1, int(math.ceil(total_pop / ppd[z])))
            ranked = sorted(idxs, key=lambda i: (-detailed[i]["pop"], _stable_key(detailed[i]["lon"], detailed[i]["lat"])) )
            for i in ranked[:target]:
                if z < minzoom[i]:
                    minzoom[i] = z
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".geojsonl")
    os.close(tmp_fd)
    with open(tmp_path, "w", encoding="utf-8") as f_out:
        for i, d in enumerate(detailed):
            feature = {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]},
                "properties": {
                    "population": d["pop"],
                    "year": d["year"],
                    "type": "settlement",
                    "lod_level": 3,
                    "grid_size": d["grid"],
                    "source_dots": d["src"],
                    "density": d["density"],
                },
                "tippecanoe": {"minzoom": int(minzoom[i]), "maxzoom": 12},
            }
            f_out.write(json.dumps(feature))
            f_out.write("\n")
    return tmp_path

def write_combined_geojsonl_windows(lod_map: Dict[Any, List[Any]]) -> str:
    """Write a single-layer GeoJSONL using population-preserving LOD windows.

    Emits all LODs into one layer with non-overlapping minzoom/maxzoom so that at any
    given zoom, exactly one LOD is visible and its features' populations sum to the
    true total (conservation).
    """
    # Use centralized single-layer LOD windows
    from lod_config import SINGLE_LAYER_LOD_WINDOWS
    lod_windows = SINGLE_LAYER_LOD_WINDOWS

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".geojsonl")
    os.close(tmp_fd)
    with open(tmp_path, "w", encoding="utf-8") as f_out:
        for lod_level, settlements in sorted(
            lod_map.items(), key=lambda x: int(getattr(x[0], "value", x[0]))
        ):
            lv = int(getattr(lod_level, "value", lod_level))
            minz, maxz = lod_windows.get(lv, (6, 12))
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
                        "lod_level": lv,
                        "grid_size": s.grid_size_degrees,
                        "source_dots": s.source_dot_count,
                        "density": s.average_density,
                    },
                    "tippecanoe": {"minzoom": minz, "maxzoom": maxz},
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
    # Keep many more points visible at the first LOD 3 zoom (z=6)
    # to avoid a perceived drop in density when switching from LOD 2 (z=5).
    # Droprate 1 significantly reduces point thinning at lower zooms.
    if lod_level == 3:
        cmd[1:1] = ["-r", "1"]
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

def generate_single_layer_mbtiles(input_geojsonl: str, out_mbtiles: str) -> bool:
    cmd = [
        "tippecanoe",
        "-o", out_mbtiles,
        "-Z", "0",
        "-z", "12",
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--force",
        "-r", "1",
        "-l", "humans",
        input_geojsonl,
    ]
    ok = run_command(cmd, "Single-layer yearly tiles (humans)")
    if not ok:
        return False
    # Ensure composite index on tiles to support fast remote lookups via HTTP range
    try:
        import subprocess
        print("  ▸ Ensuring tiles index (zoom_level, tile_column, tile_row)...")
        sql = (
            "CREATE INDEX IF NOT EXISTS idx_tiles_zoom_level_tile_column_tile_row "
            "ON tiles(zoom_level, tile_column, tile_row); "
            "ANALYZE;"
        )
        subprocess.run(["sqlite3", out_mbtiles, sql], check=True)
        print("  ✓ Tiles index ensured")
    except Exception as e:
        print(f"  ⚠️  Could not ensure tiles index: {e}")
    return True

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
    result = generate_yearly_tile_data(asc_file, year, str(tiles_dir_path), force=force)
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

            # Persist per-LOD MBTiles to tiles_dir so the server can serve
            # Per-LOD artifacts exist (humans_{year}_lod_{lod}.mbtiles) but the frontend uses the single per-year endpoint
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
    """Main vector tile generation routine."""
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
    parser.add_argument("--year", type=int, help="Alias for building a single year (convenience)")
    # Output mode flags: default to single-layer on
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--single-layer",
        dest="single_layer",
        action="store_true",
        help="Build single-layer humans_{year}.mbtiles with LOD windows (default)",
    )
    group.add_argument(
        "--no-single-layer",
        dest="single_layer",
        action="store_false",
        help="Skip single-layer output (emit only per-LOD artifacts)",
    )
    parser.set_defaults(single_layer=True)
    parser.add_argument("--verify", action="store_true", help="Run post-build verification (single-layer)")
    parser.add_argument("--strict", action="store_true", help="Fail build on verification regressions")
    args = parser.parse_args()

    raw_dir = args.raw_dir

    # Tiles-only per-year mode
    hyde_map = find_hyde_files(raw_dir)
    if not hyde_map:
        print("✗ No HYDE ASC files found. Please download data first.")
        return

    target_years = args.years if args.years else ([args.year] if args.year is not None else sorted(hyde_map.keys()))
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
            if args.single_layer:
                # Build single-layer variant using all LOD data deterministically
                result = generate_yearly_tile_data(asc_file, y, args.tiles_dir, force=args.force)
                # Use LOD windows so exactly one LOD is visible per zoom
                combined_geojsonl = write_combined_geojsonl_windows(result.lod_data)
                yearly_out = pathlib.Path(args.tiles_dir) / f"humans_{y}.mbtiles"
                if yearly_out.exists() and args.force:
                    yearly_out.unlink()
                ok = generate_single_layer_mbtiles(combined_geojsonl, str(yearly_out))
                try:
                    os.unlink(combined_geojsonl)
                except OSError:
                    pass
                if ok and args.verify:
                    print("→ Verifying single-layer output…")
                    ok2 = verify_single_layer(str(yearly_out), strict=args.strict)
                    if args.strict and not ok2:
                        raise SystemExit(1)

    print(f"\n✓ Built {built} yearly MBTiles → {args.tiles_dir}")
    print("Next:")
    print("- Serve tiles via frontend API route: /api/tiles/{year}/single/{z}/{x}/{y}.pbf")
    print("- Frontend MVTLayer loads from MBTiles with layer id 'humans'")
    print("- For production: Upload MBTiles to GCS using iac/scripts/upload-data.sh")

    # macOS audible completion notification
    try:
        if platform.system() == "Darwin":
            # Keep it short and informative
            msg = f"Tiles generation complete. Built {built} years."
            subprocess.run(["say", msg], check=False)
    except Exception:
        pass

if __name__ == "__main__":
    main()
