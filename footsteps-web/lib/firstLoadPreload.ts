// The images the first view waits for, started with the HTML instead of after the scripts (docs/ops/first-load.md).
// app/layout.tsx inlines `firstLoadUrls` and `bracketIn` (lib/time.ts) in the page head as source text, so both must be
// self-contained: no imports or outside names inside them. The tables they need are passed in as JSON.
import { DEFAULT_TIME, PEOPLE_YEARS, TARGET_YEARS, TERRAIN_VERSION, TERRAIN_YEARS } from './constants';
import { TIME_MAX, TIME_MIN, bracketIn } from './time';

export type PreloadTables = {
  peopleYears: readonly number[];
  terrainYears: readonly number[];
  /** First HYDE year: land use exists from here (gridData.ts `readLandUse`). */
  hydeMin: number;
  timeMin: number;
  timeMax: number;
  defaultTime: number;
  terrainVersion: number;
};

export const PRELOAD_TABLES: PreloadTables = {
  peopleYears: PEOPLE_YEARS,
  terrainYears: TERRAIN_YEARS,
  hydeMin: TARGET_YEARS[0],
  timeMin: TIME_MIN,
  timeMax: TIME_MAX,
  defaultTime: DEFAULT_TIME,
  terrainVersion: TERRAIN_VERSION,
};

/**
 * The people images (and HYDE land use) of the two data years either side of the opening year, and the two Earth images
 * either side of it: exactly what the firelight and the globe fetch first (usePresenceLayers, gridData, useTerrainLayers).
 * None when a flag changes those addresses or the view does not use them (Dots, the adjusted spread, past water,
 * the tour, which moves the year at once), so a preload is never a wasted download.
 */
export function firstLoadUrls(
  search: string,
  t: PreloadTables,
  bracket: (years: readonly number[], time: number) => { y0: number; y1: number },
): string[] {
  const q = new URLSearchParams(search);
  if (q.get('mode') === 'dots' || q.get('spread') === '1' || q.get('pastwater') === '1' || q.get('tour') === '1') return [];
  const asked = Number(q.get('year') ?? NaN); // as app/page.tsx reads it
  const time = Number.isFinite(asked) ? Math.min(t.timeMax, Math.max(t.timeMin, asked)) : t.defaultTime;
  const people = bracket(t.peopleYears, time);
  const earth = bracket(t.terrainYears, time);
  // The Earth first: it is a tenth of the bytes and the globe waits only for it.
  const urls: string[] = [];
  for (const y of earth.y0 === earth.y1 ? [earth.y0] : [earth.y0, earth.y1]) urls.push(`/terrain/earth_${y}.webp?v=${t.terrainVersion}`);
  for (const y of people.y0 === people.y1 ? [people.y0] : [people.y0, people.y1]) {
    urls.push(`/grid/humans_${y}.webp`);
    if (y >= t.hydeMin) urls.push(`/grid/landuse_${y}.png`);
  }
  return urls;
}

/** The inline head script: adds a `<link rel=preload as=fetch>` per image (the app reads them with `fetch`), the Earth at high priority. */
export function preloadScript(): string {
  return `try{(${firstLoadUrls.toString()})(location.search,${JSON.stringify(PRELOAD_TABLES)},${bracketIn.toString()}).forEach(function(u){var l=document.createElement('link');l.rel='preload';l.as='fetch';l.crossOrigin='anonymous';if(u.indexOf('/terrain/')===0)l.setAttribute('fetchpriority','high');l.href=u;document.head.appendChild(l)})}catch(e){}`;
}
