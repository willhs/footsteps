// Shared LOD selection used by client & server
// Zoom thresholds adjusted to fix zoom 6+ discontinuity bug.
export function getLODLevel(zoom: number): 0 | 1 | 2 | 3 {
  if (zoom < 4) return 0;      // Global LOD
  if (zoom < 5) return 1;      // Regional LOD
  if (zoom < 7) return 2;      // Local LOD (extended range to delay LOD 3)
  return 3;                    // Detailed LOD
}
