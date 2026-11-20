'use client';

// The language block for the cell under the cursor (GET /api/anthropology ... &fill=0: sourced fields only, so
// hovering never spends the model's daily cap). Only asked for years from LANGUAGES_FROM; the atlas holds one
// record per 5-degree cell x era, so the answers are cached by that key.
import { useEffect, useState } from 'react';
import { LANGUAGES_FROM, type LanguageBlock } from '@/lib/languages';
import { ATLAS_LAST_YEAR, atlasKey, type AtlasRecord } from './useAnthropology';

const cache = new Map<string, Promise<LanguageBlock | null>>();

function fetchBlock(lat: number, lon: number, year: number): Promise<LanguageBlock | null> {
  const key = atlasKey(lat, lon, year);
  let p = cache.get(key);
  if (!p) {
    const y = Math.round(Math.min(ATLAS_LAST_YEAR, year));
    p = fetch(`/api/anthropology?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&year=${y}&fill=0`)
      .then((r) => (r.status === 404 ? null : r.ok ? (r.json() as Promise<AtlasRecord>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rec) => (rec?.fields.languages?.value as LanguageBlock | null | undefined) ?? null);
    p.catch(() => cache.delete(key)); // retry next time rather than remember a failure
    cache.set(key, p);
  }
  return p;
}

/** The block for a place and year, or null while loading, off land, with no language point near, before 1500 or when the API is unreachable. */
export default function useLanguages(point: { lat: number; lon: number } | null, year: number): LanguageBlock | null {
  const key = point && year >= LANGUAGES_FROM ? atlasKey(point.lat, point.lon, year) : null;
  const [state, setState] = useState<{ key: string; block: LanguageBlock | null } | null>(null);
  useEffect(() => {
    if (!point || key === null) return;
    let live = true;
    fetchBlock(point.lat, point.lon, year)
      .then((block) => live && setState({ key, block }))
      .catch(() => live && setState({ key, block: null }));
    return () => {
      live = false;
    };
    // key captures lat/lon/year at the granularity the API uses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key !== null && state?.key === key ? state.block : null;
}
