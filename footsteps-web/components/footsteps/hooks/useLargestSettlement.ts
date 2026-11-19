import { useEffect, useMemo, useState } from 'react';
import type { GridData } from './gridData';
import { loadSettlementCatalog, type SettlementCatalog } from '@/lib/settlements';
import { largestSettlementAt, type LargestSettlement } from '@/lib/rankSize';

/** The biggest settlement in the ~590 km block around the cursor (lib/rankSize.ts), `?settlements=1` only. It depends on the 5' cell,
 * not the exact point, so moving the cursor inside a cell keeps the same object. The catalog is the one the worker reads
 * (about 4 MB, cached by the browser), fetched here only once the flag is on. */
export default function useLargestSettlement(
  grid: GridData | null,
  year: number,
  at: { lon: number; lat: number } | null,
  enabled: boolean,
): LargestSettlement | null {
  const [catalog, setCatalog] = useState<SettlementCatalog | null>(null);
  useEffect(() => {
    if (!enabled || catalog) return;
    let live = true;
    loadSettlementCatalog().then((c) => { if (live) setCatalog(c); }, () => {});
    return () => { live = false; };
  }, [enabled, catalog]);
  const col = at ? Math.floor((at.lon + 180) * 12) : null;
  const row = at ? Math.floor((90 - at.lat) * 12) : null;
  return useMemo(() => {
    if (!enabled || !grid || !catalog || col === null || row === null) return null;
    return largestSettlementAt(grid, catalog, (col + 0.5) / 12 - 180, 90 - (row + 0.5) / 12, year);
  }, [enabled, grid, catalog, col, row, year]);
}
