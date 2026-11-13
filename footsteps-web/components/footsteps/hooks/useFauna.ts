'use client';

import { useEffect, useState } from 'react';
import { blockKey, blockUrl, faunaCell, presentAt, speciesUrl, type FaunaBlock, type Species } from '@/lib/fauna';
import { habitatStep } from '@/lib/habitat';

type Row = [string, number, Species['role'], number];

const files = new Map<string, Promise<unknown>>();
/** One fetch per file for the life of the page; a failure is dropped so the next hover retries. */
function loadJson<T>(url: string): Promise<T> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
      })
      .catch((error) => {
        files.delete(url);
        throw error;
      });
    files.set(url, p);
  }
  return p as Promise<T>;
}

/**
 * Species ids present at the point and year, plus the species table. The 30° block file holding the
 * cursor loads on first hover over it (~50-250 KB), the table (~15 KB) once. Null while loading,
 * and null again after a failed load (so the card just omits the line).
 */
export default function useFauna(point: { lon: number; lat: number } | null, time: number) {
  const cell = point ? faunaCell(point.lon, point.lat) : null;
  const key = cell === null ? null : blockKey(cell);
  const [state, setState] = useState<{ key: string; block: FaunaBlock } | null>(null);
  const [species, setSpecies] = useState<Species[] | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    loadJson<FaunaBlock>(blockUrl(key))
      .then((block) => live && setState({ key, block }))
      .catch((error) => console.warn('[fauna] failed to load block', key, error));
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    let live = true;
    loadJson<Row[]>(speciesUrl())
      .then((rows) => live && setSpecies(rows.map(([common, kg, role, extinct]) => ({ common, kg, role, extinct: extinct === 1 }))))
      .catch((error) => console.warn('[fauna] failed to load species', error));
    return () => {
      live = false;
    };
  }, [key]);

  if (cell === null || !species || !state || state.key !== key) return null;
  return { species, ids: presentAt(state.block, cell, habitatStep(Math.round(time))) };
}
