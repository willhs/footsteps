import { useMemo } from 'react';
import type { GridData } from './gridData';
import { regionalGroupAt, type RegionalGroup } from '@/lib/regionalGroup';

/** The regional group of the 5' cell under `at` (lib/regionalGroup.ts), or null. It depends on the cell, not the
 * exact point, so moving the cursor inside a cell keeps the same object and rebuilds nothing. */
export default function useRegionalGroup(
  grid: GridData | null,
  at: { lon: number; lat: number } | null,
  enabled: boolean,
): RegionalGroup | null {
  const col = at ? Math.floor((at.lon + 180) * 12) : null;
  const row = at ? Math.floor((90 - at.lat) * 12) : null;
  return useMemo(() => {
    if (!enabled || !grid || col === null || row === null) return null;
    return regionalGroupAt(grid, (col + 0.5) / 12 - 180, 90 - (row + 0.5) / 12);
  }, [enabled, grid, col, row]);
}
