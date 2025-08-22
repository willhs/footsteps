// Auto-generated LOD configuration - DO NOT EDIT MANUALLY
// Generated from lod_config.py

// Shared LOD selection used by client & server
// Zoom thresholds updated: LOD 1 transitions earlier at zoom 2 for better detail
export function getLODLevel(zoom: number): 0 | 1 | 2 | 3 {
  if (zoom < 2) return 0;      // REGIONAL - World view
  if (zoom < 4) return 1;      // SUBREGIONAL - Continental/country view
  if (zoom < 6) return 2;      // LOCAL - Regional/county view
  return 3;                    // DETAILED - City/settlement level
}
