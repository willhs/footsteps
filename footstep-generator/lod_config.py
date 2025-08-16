#!/usr/bin/env python3
"""
Centralized LOD (Level of Detail) configuration for the HYDE processing pipeline.
Single source of truth for zoom ranges and LOD mappings across backend and frontend.
"""

from typing import Dict, Tuple


# LOD level zoom ranges - single source of truth
# Updated: LOD 1 transitions earlier at zoom 2 for better detail progression
LOD_ZOOM_RANGES: Dict[int, Tuple[int, int]] = {
    0: (0, 1),   # REGIONAL visible at z0-1 (world view)
    1: (2, 3),   # SUBREGIONAL at z2-3 (continental/country view, starts earlier)
    2: (4, 5),   # LOCAL at z4-5 (regional/county view)
    3: (6, 12),  # DETAILED at z6+ (city/settlement level)
}

# LOD level descriptions
LOD_DESCRIPTIONS: Dict[int, str] = {
    0: "REGIONAL - World view",
    1: "SUBREGIONAL - Continental/country view", 
    2: "LOCAL - Regional/county view",
    3: "DETAILED - City/settlement level"
}

# Single-layer tile LOD windows (non-overlapping zoom ranges)
# Used for single-layer tiles where exactly one LOD is visible per zoom
SINGLE_LAYER_LOD_WINDOWS: Dict[int, Tuple[int, int]] = {
    0: (0, 1),   # REGIONAL visible at z0-1
    1: (2, 3),   # SUBREGIONAL visible at z2-3
    2: (4, 5),   # LOCAL visible at z4-5
    3: (6, 12),  # DETAILED visible at z6+
}


def get_lod_level_for_zoom(zoom: float) -> int:
    """
    Determine appropriate LOD level based on zoom level.
    
    Args:
        zoom: Current map zoom level
        
    Returns:
        LOD level (0=Regional, 1=Subregional, 2=Local, 3=Detailed)
    """
    # 4-level mapping: 0=Regional, 1=Subregional, 2=Local, 3=Detailed
    # Updated to transition to LOD 1 earlier (zoom 2 instead of 3)
    if zoom < 2:
        return 0  # REGIONAL
    elif zoom < 4:
        return 1  # SUBREGIONAL
    elif zoom < 6:
        return 2  # LOCAL
    else:
        return 3  # DETAILED


def get_zoom_range_for_lod(lod_level: int) -> Tuple[int, int]:
    """
    Get zoom range for a specific LOD level.
    
    Args:
        lod_level: LOD level (0-3)
        
    Returns:
        Tuple of (min_zoom, max_zoom) for this LOD level
    """
    return LOD_ZOOM_RANGES.get(lod_level, (6, 12))


def get_single_layer_window_for_lod(lod_level: int) -> Tuple[int, int]:
    """
    Get single-layer zoom window for a specific LOD level.
    
    Args:
        lod_level: LOD level (0-3)
        
    Returns:
        Tuple of (min_zoom, max_zoom) for single-layer tiles
    """
    return SINGLE_LAYER_LOD_WINDOWS.get(lod_level, (6, 12))


def validate_lod_configuration() -> bool:
    """
    Validate that LOD configuration is consistent.
    
    Returns:
        True if configuration is valid, False otherwise
    """
    # Check that zoom ranges don't have gaps or overlaps
    all_zooms = set()
    for lod_level in sorted(LOD_ZOOM_RANGES.keys()):
        min_z, max_z = LOD_ZOOM_RANGES[lod_level]
        for z in range(min_z, max_z + 1):
            if z in all_zooms:
                return False  # Overlap detected
            all_zooms.add(z)
    
    # Check that single-layer windows match main ranges
    for lod_level in LOD_ZOOM_RANGES:
        if lod_level in SINGLE_LAYER_LOD_WINDOWS:
            main_range = LOD_ZOOM_RANGES[lod_level]
            single_range = SINGLE_LAYER_LOD_WINDOWS[lod_level]
            if main_range != single_range:
                return False  # Mismatch detected
    
    return True


# Generate TypeScript/JavaScript compatible configuration
def generate_frontend_config() -> str:
    """
    Generate TypeScript-compatible LOD configuration.
    
    Returns:
        TypeScript code string for frontend use
    """
    ts_code = """// Auto-generated LOD configuration - DO NOT EDIT MANUALLY
// Generated from lod_config.py

// Shared LOD selection used by client & server
// Zoom thresholds updated: LOD 1 transitions earlier at zoom 2 for better detail
export function getLODLevel(zoom: number): 0 | 1 | 2 | 3 {
"""
    
    # Generate the conditional logic
    for lod_level in sorted(LOD_ZOOM_RANGES.keys()):
        min_z, max_z = LOD_ZOOM_RANGES[lod_level]
        desc = LOD_DESCRIPTIONS[lod_level]
        
        if lod_level == 0:
            ts_code += f"  if (zoom < {max_z + 1}) return {lod_level};      // {desc}\n"
        elif lod_level == max(LOD_ZOOM_RANGES.keys()):
            ts_code += f"  return {lod_level};                    // {desc}\n"
        else:
            ts_code += f"  if (zoom < {max_z + 1}) return {lod_level};      // {desc}\n"
    
    ts_code += "}\n"
    return ts_code


if __name__ == "__main__":
    # Validate configuration
    if validate_lod_configuration():
        print("✓ LOD configuration is valid")
    else:
        print("✗ LOD configuration has errors")
    
    # Print current configuration
    print("\nCurrent LOD Configuration:")
    for lod_level in sorted(LOD_ZOOM_RANGES.keys()):
        min_z, max_z = LOD_ZOOM_RANGES[lod_level]
        desc = LOD_DESCRIPTIONS[lod_level]
        print(f"  LOD {lod_level}: z{min_z}-{max_z} ({desc})")
    
    # Generate frontend config
    print("\nTypeScript configuration:")
    print(generate_frontend_config())