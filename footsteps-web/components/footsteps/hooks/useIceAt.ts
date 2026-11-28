'use client';

import { flags } from '@/lib/flags';

import { useEffect, useMemo, useState } from 'react';
import { clampTime } from '@/lib/time';
import { iceEpochAt, iceHoverRow, iceMaskAt, loadIceAt, type IceMask } from '@/lib/iceSheets';

/** `?ice=1` only: the hover card's ice line for the point at this year ("Ice sheet (PaleoMIST 1.0, 22.5 ka)"), or null off the ice, while
 * loading, or with the flag off. The masks are the ones the map draws (one epoch at a time, shared with the terrain layer). */
export default function useIceAt(point: { lon: number; lat: number } | null, time: number): { text: string; detail: string } | null {
  const epoch = iceEpochAt(clampTime(time));
  const [loaded, setLoaded] = useState<{ bp: number; masks: IceMask[] } | null>(null);
  const on = point !== null && epoch !== null && typeof window !== 'undefined' && flags().enabled('ice');
  const bp = epoch?.bp ?? null;
  useEffect(() => {
    if (!on || bp === null) return;
    let live = true;
    loadIceAt(clampTime(time)).then((masks) => live && setLoaded({ bp, masks })).catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the masks depend on the epoch, not on every tick of `time`
  }, [on, bp]);
  return useMemo(() => {
    if (!on || !epoch || !point || loaded?.bp !== epoch.bp) return null;
    const mask = iceMaskAt(loaded.masks, point.lon, point.lat);
    return mask ? iceHoverRow(epoch, mask.region) : null;
  }, [on, epoch, point, loaded]);
}
