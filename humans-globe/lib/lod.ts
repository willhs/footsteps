// Shared LOD selection used by client & server
// Zoom thresholds aligned with improved generator zoom ranges for smoother transitions
export function getLODLevel(zoom: number): 0 | 1 | 2 | 3 {
  if (zoom < 3) return 0;      // REGIONAL LOD (z0-2) - world/continental view
  if (zoom < 5) return 1;      // SUBREGIONAL LOD (z3-4) - country/regional view  
  if (zoom < 7) return 2;      // LOCAL LOD (z5-6) - sub-regional/county view
  return 3;                    // DETAILED LOD (z7+) - city/settlement level
}
