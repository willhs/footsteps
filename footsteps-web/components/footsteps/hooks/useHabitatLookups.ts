'use client';

import { useEffect, useState } from 'react';
import { habitatStep, habitatUrl, landUseUrl } from '@/lib/habitat';
import { loadLookup } from '@/lib/habitatImages';

/** Decoded RGBA of one lookup image, or null until it has loaded. Nothing is requested while `url` is null. */
function useLookup(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; rgba: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadLookup(url)
      .then((rgba) => live && setLoaded({ url, rgba }))
      .catch((error) => console.warn('[habitat] failed to load', url, error));
    return () => {
      live = false;
    };
  }, [url]);
  return loaded?.url === url ? loaded.rgba : null;
}

/**
 * The lookup images for the year under the hover card: the Krapp step nearest `time`, 0 BP
 * (for "vs today") and, for a HYDE year, its land use. Fetched only while `active`, so a page
 * that is never hovered costs nothing.
 */
export default function useHabitatLookups(active: boolean, time: number, landUseYear: number | null) {
  const ka = habitatStep(Math.round(time));
  return {
    step: useLookup(active ? habitatUrl(ka) : null),
    today: useLookup(active ? habitatUrl(0) : null),
    landUse: useLookup(active && landUseYear !== null ? landUseUrl(landUseYear) : null),
    ka,
  };
}
