'use client';

// The anthropology atlas record (GET /api/anthropology) for a place and year:
// real sources where they exist, model gap-fill elsewhere. One record per
// 5-degree cell x era, so records are cached here by that key.
import { useEffect, useState } from 'react';

type Field<T> = { value: T | null; source: string; note?: string };

export type AtlasRecord = {
  cell: { key: string };
  era: { start: number; label: string };
  fields: {
    clothing?: Field<{
      garments?: string[];
      materials?: string[];
      palette?: string[];
    }>;
    hair_adornment?: Field<{
      styles?: string[];
      ornaments?: string[];
      body_paint?: string | null;
    }>;
    skin_hair?: Field<{ skin_palette?: string[]; hair_palette?: string[] }>;
    dwelling?: Field<{ phrase?: string; material?: string }>;
    [name: string]: Field<unknown> | undefined;
  };
  confidence?: { value: string };
};

export const ATLAS_FIRST_YEAR = -10000;
export const ATLAS_LAST_YEAR = 1900;

/** Same buckets as the API: 1000 years before 1 CE, 100 after; 5-degree cells. */
export function atlasKey(lat: number, lon: number, year: number) {
  const y = Math.round(
    Math.min(ATLAS_LAST_YEAR, Math.max(ATLAS_FIRST_YEAR, year)),
  );
  const era = y < 0 ? -Math.ceil(-y / 1000) * 1000 : Math.floor(y / 100) * 100;
  return `${Math.floor(lat / 5) * 5},${Math.floor(lon / 5) * 5},${era}`;
}

const cache = new Map<string, Promise<AtlasRecord | null>>();

function fetchRecord(
  lat: number,
  lon: number,
  year: number,
): Promise<AtlasRecord | null> {
  const key = atlasKey(lat, lon, year);
  let p = cache.get(key);
  if (!p) {
    const y = Math.round(
      Math.min(ATLAS_LAST_YEAR, Math.max(ATLAS_FIRST_YEAR, year)),
    );
    const q = `lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&year=${y}`;
    p = fetch(`/api/anthropology?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<AtlasRecord>) : null))
      .then((rec) => (rec && rec.fields ? rec : null))
      .catch(() => null);
    p.then((rec) => {
      if (!rec) cache.delete(key); // retry next time rather than remember a failure
    });
    cache.set(key, p);
  }
  return p;
}

export type AtlasState =
  | { kind: 'loading' }
  | { kind: 'settled'; rec: AtlasRecord | null };

/** Resolve once per atlas key. A late response after the 2.5s deadline cannot
 * replace the illustration already shown with era defaults. */
export function useAnthropology(
  lat: number,
  lon: number,
  year: number,
): AtlasState {
  const key = atlasKey(lat, lon, year);
  const [state, setState] = useState<{ key: string; rec: AtlasRecord | null }>({
    key: '',
    rec: null,
  });
  useEffect(() => {
    let live = true;
    const settle = (rec: AtlasRecord | null) => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      setState({ key, rec });
    };
    const timer = setTimeout(() => settle(null), 2500);
    fetchRecord(lat, lon, year).then(settle);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // key captures lat/lon/year at the granularity the API uses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key
    ? { kind: 'settled', rec: state.rec }
    : { kind: 'loading' };
}
