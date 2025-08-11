// Shared LOD selection used by client & server
// Zoom thresholds mirror server legacy logic.
export function getLODLevel(zoom: number): 0 | 1 | 2 | 3 {
  if (zoom < 4) return 0;      // Global LOD
  if (zoom < 5) return 1;      // Regional LOD
  if (zoom < 6) return 2;      // Local LOD
  return 3;                    // Detailed LOD
}
