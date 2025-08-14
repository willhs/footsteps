#!/usr/bin/env python3
"""
Process HYDE 3.5 population density data into settlement points and hierarchical LODs.
Parses ASCII grid files (.asc) to population-preserving settlement points and aggregates
them into multiple levels of detail in-memory (tiles-only pipeline; no NDJSON writes).
Use make_tiles.py to build MBTiles (MVT) from the returned LOD data.
"""

import argparse
import os
import pathlib
from typing import Dict, List, Optional, Tuple

import numpy as np
from lod_processor import LODProcessor

# Import our modular components
from models import (
    AggregatedSettlement,
    Coordinates,
    GridMetadata,
    HumanSettlement,
    HYDEDataFile,
    LODConfiguration,
    LODLevel,
    ProcessingResult,
    ProcessingStatistics,
    SettlementContinuityConfig,
)
from pyproj import Geod
from typing import Iterable

# Models and processors are now imported from separate modules

# Geodetic calculator for accurate area calculations
geod = Geod(ellps="WGS84")

"""
Note: We no longer rely on a hardcoded TARGET_YEARS list for discovery.
Instead, we scan the raw HYDE directory for any files matching
  popd_<YEAR>(BC|AD).asc
and infer the available years dynamically. The previous TARGET_YEARS list is
kept here as a historical reference only and is not used by the pipeline.
"""
TARGET_YEARS: List[int] = []

# Density-aware dot creation is now handled by LODProcessor

# Hierarchical LOD creation is now handled by LODProcessor


def ascii_grid_to_dots(
    asc_file: str, year: int, people_per_dot: int = 100
) -> List[dict]:
    """
    Convert a HYDE ASC file to settlement points for consistent processing.

    Args:
        asc_file: Path to HYDE ASC file (e.g., popd_1850AD.asc)
        year: Year for this data
        people_per_dot: Number of people each dot represents

    Returns:
        List of dicts with fields: lon, lat, population, year, type
    """
    print(f"  Processing year {year}...")

    try:
        # Read ASC file directly for consistent processing
        print(f"    Reading ASCII grid {os.path.basename(asc_file)}")
        with open(asc_file, "r", encoding="utf-8") as f_asc:
            # ----- Parse header (first 6 lines) -----
            header = {}
            for _ in range(6):  # Standard ASCII grid header lines
                line = f_asc.readline().strip()
                key, value = line.split()
                header[key.lower()] = float(value) if "." in value else int(value)

            # Extract grid parameters
            ncols = int(header["ncols"])
            nrows = int(header["nrows"])
            xllcorner = header["xllcorner"]
            yllcorner = header["yllcorner"]
            cellsize = header["cellsize"]
            nodata_value = header.get("nodata_value", -9999)

            print(f"    Grid: {ncols}x{nrows}, cellsize: {cellsize}°")

            # Parse data efficiently by streaming directly from the file
            data = np.loadtxt(f_asc, dtype=float)
            if data.shape != (nrows, ncols):
                print(
                    f"    WARNING: Parsed grid shape {data.shape} != expected ({nrows}, {ncols})"
                )

        # Replace nodata with NaN
        data[data == nodata_value] = np.nan

        # Create coordinate arrays
        # Longitude runs from west to east (xllcorner to xllcorner + ncols*cellsize)
        lons = np.linspace(
            xllcorner + cellsize / 2,
            xllcorner + (ncols - 1) * cellsize + cellsize / 2,
            ncols,
        )

        # Latitude: HYDE uses bottom-left origin (yllcorner = -90)
        # Row 0 is the SOUTHERNMOST row, not the northernmost row
        # So we need to go from south to north (bottom to top of the grid)
        lats = np.linspace(
            yllcorner + cellsize / 2,
            yllcorner + (nrows - 1) * cellsize + cellsize / 2,
            nrows,
        )

        # Add coordinate debugging
        print(
            f"    Coordinate bounds: lon [{lons[0]:.2f}, {lons[-1]:.2f}], lat [{lats[0]:.2f}, {lats[-1]:.2f}]"
        )
        print(
            f"    Grid info: {ncols}x{nrows}, origin=({xllcorner}, {yllcorner}), cellsize={cellsize}"
        )
        print(f"    Expected global bounds: lon [-180, 180], lat [-90, 90]")

        # Find cells with population data
        valid_mask = ~np.isnan(data) & (data > 0)
        valid_indices = np.where(valid_mask)

        print(f"    Found {len(valid_indices[0])} cells with population data")

        # Process all populated cells (no sampling)
        valid_i = valid_indices[0]
        valid_j = valid_indices[1]

        dots: List[dict] = []
        total_people = 0

        # Create LOD processor instance once for reuse across all cells
        # Enable settlement continuity by default for better visual continuity
        continuity_config = SettlementContinuityConfig(enable_continuity=True)
        lod_processor = LODProcessor(continuity_config=continuity_config)

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

            # Skip extreme polar regions; keep more of high-lat Europe
            if lat > 75 or lat < -70:
                continue

            # Apply density threshold to filter noise in HYDE data
            # Use a lower threshold for BCE years to retain sparse populations
            min_density = 0.001 if year <= 0 else 0.01
            if density < min_density:
                continue

            # Calculate total population in this cell using geodesic area
            lon_w = lon - cellsize / 2
            lon_e = lon + cellsize / 2
            lat_s = lat - cellsize / 2
            lat_n = lat + cellsize / 2
            cell_area_m2, _ = geod.polygon_area_perimeter(
                [lon_w, lon_e, lon_e, lon_w], [lat_s, lat_s, lat_n, lat_n]
            )
            cell_area_km2 = abs(cell_area_m2) / 1_000_000
            cell_population = density * cell_area_km2

            # Apply maximum population cap per cell to prevent unrealistic concentrations
            # Even modern megacities rarely exceed 100k people per km² average
            max_reasonable_population = cell_area_km2 * 50000  # 50k people per km² max
            if cell_population > max_reasonable_population:
                cell_population = max_reasonable_population

            total_people += cell_population

            # Density-aware dot creation to handle high-concentration areas
            # Use LOD 3 (detailed) logic for base settlements to get maximum granularity
            dots_created = lod_processor.create_density_aware_dots(
                cell_population, lat, lon, cellsize, people_per_dot, lod_level=3
            )

            for dot_info in dots_created:
                dot_lat, dot_lon, dot_population = dot_info

                # Validate coordinates are within reasonable bounds
                if not (-180 <= dot_lon <= 180 and -90 <= dot_lat <= 90):
                    print(
                        f"    WARNING: Invalid coordinates: ({dot_lon:.2f}, {dot_lat:.2f}) from cell ({i}, {j})"
                    )
                    continue

                dots.append(
                    {
                        "lon": float(dot_lon),
                        "lat": float(dot_lat),
                        "population": float(dot_population),
                        "year": int(year),
                        "type": "settlement",
                    }
                )

        # Return list of points
        if dots:
            # Add geographic validation by showing sample coordinates
            sample = dots[: min(5, len(dots))]
            sample_coords = [(d["lon"], d["lat"]) for d in sample]
            print(f"    Sample coordinates: {sample_coords}")

            # Check for major regions (approximate bounding boxes)
            def count_where(pred: Iterable[bool]) -> int:
                return sum(1 for v in pred if v)

            usa_count = count_where(
                (-125 <= d["lon"] <= -66) and (20 <= d["lat"] <= 49) for d in dots
            )
            europe_count = count_where(
                (-10 <= d["lon"] <= 40) and (35 <= d["lat"] <= 71) for d in dots
            )
            china_count = count_where(
                (73 <= d["lon"] <= 135) and (18 <= d["lat"] <= 54) for d in dots
            )

            print(
                f"    Regional distribution: USA: {usa_count}, Europe: {europe_count}, China: {china_count}"
            )

            print(
                f"    Created {len(dots)} settlement points for year {year} ({total_people:,.0f} people)"
            )
            return dots
        else:
            print(f"    No data found for year {year}")
            return []

    except Exception as e:
        print(f"    Error processing {asc_file}: {e}")
        return []


def _parse_year_from_filename(name: str) -> Optional[int]:
    """Parse a HYDE year from a filename like 'popd_1000AD.asc' or 'popd_3700BC.asc'."""
    lower = name.lower()
    if not lower.startswith("popd_") or not lower.endswith(".asc"):
        return None
    # Strip prefix/suffix
    core = lower[len("popd_") : -len(".asc")]
    if core.endswith("ad"):
        num_part = core[:-2]
        if not num_part.isdigit():
            return None
        return int(num_part)
    if core.endswith("bc"):
        num_part = core[:-2]
        if not num_part.isdigit():
            return None
        val = int(num_part)
        # By convention, 0AD == year 0; there is no year 0 BC.
        # Use negative for BC.
        return -val
    return None


def find_hyde_files(raw_dir: str) -> Dict[int, str]:
    """Discover all HYDE population-density ASC files and return a mapping year->path.

    Scans the provided directory (recursively) for files matching
    'popd_<YEAR>(BC|AD).asc' and parses the year accordingly. If multiple files
    for the same year are present (e.g., different scenarios), the first one
    encountered is used.
    """
    hyde_files: Dict[int, str] = {}
    hyde_dir = pathlib.Path(raw_dir)

    if not hyde_dir.exists():
        print(f"Raw data directory not found: {hyde_dir}")
        return hyde_files

    # Recursively search for any matching ASC files
    candidates: List[Tuple[int, pathlib.Path]] = []
    for p in hyde_dir.rglob("*.asc"):
        year = _parse_year_from_filename(p.name)
        if year is not None:
            candidates.append((year, p))

    # Deduplicate by year, keep first encountered
    for year, path in sorted(candidates, key=lambda t: (t[0], str(t[1]))):
        if year not in hyde_files:
            hyde_files[year] = str(path)

    if hyde_files:
        min_y, max_y = min(hyde_files.keys()), max(hyde_files.keys())
        print(
            f"Found {len(hyde_files)} HYDE files spanning years [{min_y}, {max_y}]"
        )
    else:
        print("Found 0 HYDE files (no popd_*.asc files detected)")

    return hyde_files


def process_year_with_hierarchical_lods(
    asc_file: str, year: int, output_dir: str, people_per_dot: int = 100, force: bool = False
) -> ProcessingResult:
    """
    Process a single year of HYDE data with hierarchical LOD generation.

    Args:
        asc_file: Path to HYDE ASC file
        year: Year for this data
        output_dir: Directory to save processed data
        people_per_dot: Number of people each dot represents
        force: If True, overwrite existing files; if False, skip if files exist

    Returns:
        ProcessingResult with LOD data and statistics
    """
    # Process this year with hierarchical LODs (tiles-only pipeline; no NDJSON outputs)
    print(f"  Processing year {year} with hierarchical LODs...")

    # Choose representative unit size for sparse eras (fewer people per point for ancient periods)
    people_per_dot_effective = (
        10 if (year <= 0 and people_per_dot == 100) else people_per_dot
    )

    # Create LOD processor with population-preserving configuration
    lod_config = LODConfiguration(
        global_grid_size=1.0,  # Finer global grid for better rural representation
        regional_grid_size=0.25,  # Improved regional detail
        local_grid_size=0.05,  # High local detail for rural populations
        min_population_threshold=0.0,  # DISABLED - preserve all population
    )
    # Enable settlement continuity for hierarchical LOD processing
    continuity_config = SettlementContinuityConfig(enable_continuity=True)
    lod_processor = LODProcessor(config=lod_config, continuity_config=continuity_config)

    # First convert ASC to settlements using existing logic
    points = ascii_grid_to_dots(asc_file, year, people_per_dot_effective)
    if not points:
        print(f"    No data found for year {year}")
        return ProcessingResult(
            year=year,
            lod_data={level: [] for level in LODLevel},
            total_population=0.0,
            processing_stats={"error": "No data found"},
        )

    # Convert GeoDataFrame to HumanSettlement objects
    settlements = []
    cellsize = 0.083333  # HYDE 3.5 approximate resolution

    for d in points:
        try:
            settlement = HumanSettlement(
                coordinates=Coordinates(longitude=float(d["lon"]), latitude=float(d["lat"])),
                population=float(d["population"]),
                year=int(d["year"]),
                settlement_type=str(d.get("type", "settlement")),
                source_resolution=cellsize,
            )
            settlements.append(settlement)
        except Exception as e:
            print(f"    Warning: Skipping invalid settlement: {e}")
            continue

    print(f"    Converted {len(settlements)} point features to settlement objects")

    # Create hierarchical LOD data
    lod_data = lod_processor.create_hierarchical_lods(settlements)

    # Calculate total population
    total_population = sum(s.population for s in settlements)

    # Tiles-only: no file writes here. LOD data is returned to the caller for tile generation.

    # Create processing result
    processing_stats = {
        "original_settlements": len(settlements),
        "total_population": total_population,
        "lod_counts": {
            level.name: len(lod_settlements)
            for level, lod_settlements in lod_data.items()
        },
        "processing_time": 0.0,  # Could add timing here
    }

    return ProcessingResult(
        year=year,
        lod_data=lod_data,
        total_population=total_population,
        processing_stats=processing_stats,
    )


def process_all_hyde_data(raw_dir: str, output_dir: str) -> str:
    """
    Process all HYDE data and create a combined GeoJSON for vector tiles.

    Returns:
        Path to output GeoJSON file
    """
    print("🌍 Processing HYDE data into settlement points...")
    print("  (Each point represents ~100 people)")

    # Import geopandas lazily to avoid hard dependency when using tiles-only pipeline
    try:
        import geopandas as gpd  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "GeoPandas is required only for legacy GeoJSON output. "
            "Use process_all_hyde_data_with_lods/make_tiles.py for tiles-only pipeline, "
            "or install geopandas to use this function."
        ) from e

    hyde_files = find_hyde_files(raw_dir)
    print(f"Found {len(hyde_files)} HYDE files to process")

    if not hyde_files:
        raise FileNotFoundError(
            "No HYDE dataset files found in data/raw/. "
            "Please run 'poetry run fetch-data' first to download the datasets."
        )

    all_polygons = []

    for year in sorted(hyde_files.keys()):
        asc_file = hyde_files[year]
        try:
            # Use a smaller representative unit for BCE years to retain sparse populations
            people_per_dot_effective = 10 if year <= 0 else 100
            gdf = ascii_grid_to_dots(asc_file, year, people_per_dot_effective)
            if not gdf.empty:
                all_polygons.append(gdf)
        except Exception as e:
            print(f"  Error processing {asc_file}: {e}")
            continue

    if all_polygons:
        # Combine all years
        combined_gdf = gpd.pd.concat(all_polygons, ignore_index=True)

        # Save as GeoJSON (legacy helper output)
        output_path = pathlib.Path(output_dir) / "hyde_settlements.geojson"
        combined_gdf.to_file(output_path, driver="GeoJSON")

        print(f"✓ Saved {len(combined_gdf)} settlement points to {output_path}")
        return str(output_path)
    else:
        raise ValueError(
            "No valid HYDE data could be processed. "
            "Check that the downloaded files are in the correct format."
        )


def process_all_hyde_data_with_lods(
    raw_dir: str, output_dir: str, force: bool = False
) -> List[ProcessingResult]:
    """
    Process all HYDE data with hierarchical LOD generation.

    Args:
        raw_dir: Directory containing HYDE ASC files
        output_dir: Directory to save processed data
        force: If True, overwrite existing files; if False, skip existing files

    Returns:
        List of ProcessingResult objects for each year
    """
    mode = "Reprocessing all" if force else "Processing new"
    print(f"🌍 {mode} HYDE data with hierarchical LODs...")
    print("  (Creating multiple resolution levels for performance)")

    hyde_files = find_hyde_files(raw_dir)
    print(f"Found {len(hyde_files)} HYDE files for target years")

    if not hyde_files:
        raise FileNotFoundError(
            "No HYDE dataset files found in data/raw/. "
            "Please run 'poetry run fetch-data' first to download the datasets."
        )

    results = []

    for year in sorted(hyde_files.keys()):
        asc_file = hyde_files[year]
        try:
            result = process_year_with_hierarchical_lods(asc_file, year, output_dir, force=force)
            results.append(result)

        except Exception as e:
            print(f"  Error processing {asc_file}: {e}")
            continue

    # Print summary statistics
    print(f"\n✓ Processed {len(results)} years with hierarchical LODs")
    total_population = sum(r.total_population for r in results)
    print(f"  Total population across all years: {total_population:,.0f}")

    return results


def main():
    """Main processing routine."""
    parser = argparse.ArgumentParser(
        description="Process HYDE 3.5 population data with hierarchical LOD generation"
    )
    parser.add_argument(
        "--force", 
        action="store_true", 
        help="Force reprocessing of existing files (default: skip existing files)"
    )
    args = parser.parse_args()

    # Resolve paths relative to this script so it works from any CWD
    script_dir = pathlib.Path(__file__).resolve().parent
    # Raw ASCII grids live in hyde-3.5 subdirectory: data/raw/hyde-3.5
    raw_dir = script_dir.parent / "data" / "raw" / "hyde-3.5"
    output_dir = (
        script_dir.parent / "data" / "processed"
    )  # Write to data/processed/ not data/scripts/processed/

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    processing_mode = "force mode" if args.force else "incremental mode (skipping existing)"
    print(f"Using hierarchical LOD processing as default (population-preserving) in {processing_mode}...")
    results = process_all_hyde_data_with_lods(str(raw_dir), str(output_dir), force=args.force)

    # Count processed vs skipped results
    processed_results = [r for r in results if not r.processing_stats.get('skipped', False)]
    skipped_results = [r for r in results if r.processing_stats.get('skipped', False)]
    
    print(f"\n✓ Hierarchical LOD data computed (tiles-only; no NDJSON written)")
    print(f"  Years processed: {len(processed_results)}")
    if skipped_results:
        print(f"  Skipped: {len(skipped_results)} years (already processed)")
    
    if processed_results:
        print("  LOD settlement counts (first 3 years):")
        for result in processed_results[:3]:
            year = result.year
            counts = {level.name: len(setts) for level, setts in result.lod_data.items()}
            print(f"    {year}: {counts}")
        if len(processed_results) > 3:
            print(f"    ... and {len(processed_results) - 3} more years")
    print("\nNext: Use make_tiles.py to build MBTiles per year")


if __name__ == "__main__":
    main()
