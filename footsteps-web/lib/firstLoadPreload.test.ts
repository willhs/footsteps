import { PRELOAD_TABLES, firstLoadUrls, preloadScript } from './firstLoadPreload';
import { bracket, bracketIn, clampTime, terrainBracket } from './time';
import { DEFAULT_TIME, TARGET_YEARS, TERRAIN_VERSION } from './constants';
import { gridUrl, landUseUrl } from '@/components/footsteps/hooks/gridData';
import { adjustedSpreadYear } from './adjustedSpread';
import { pastWaterTerrainYear } from './pastWater';

const urls = (search: string) => firstLoadUrls(search, PRELOAD_TABLES, bracketIn);

/** What the app itself fetches first for an opening time (usePresenceLayers, gridData, useTerrainLayers), with the adjusted
 * spread and past water on (the default) or off. */
function appFetches(time: number, { spread = true, pastWater = true } = {}): string[] {
  const p = bracket(time);
  const e = terrainBracket(time);
  const grid = (y: number) => gridUrl(y, spread && adjustedSpreadYear(y));
  const people = [...new Set([p.y0, p.y1])].flatMap((y) => (y >= TARGET_YEARS[0] ? [grid(y), landUseUrl(y)] : [grid(y)]));
  const earth = [...new Set([e.y0, e.y1])].filter((y) => !(pastWater && pastWaterTerrainYear(y))).map((y) => `/terrain/earth_${y}.webp?v=${TERRAIN_VERSION}`);
  return [...earth, ...people];
}

describe('firstLoadUrls', () => {
  it('preloads what the default view fetches first', () => {
    expect(urls('')).toEqual(appFetches(DEFAULT_TIME));
    expect(urls('')).toContain('/grid/humans_-1000.webp');
  });

  it.each(['year=1900', 'year=-50000', 'year=-10000', 'year=123', 'year=-999999', 'year=5000', 'year=&lat=3'])('follows ?%s', (q) => {
    const asked = Number(new URLSearchParams(q).get('year'));
    expect(urls(`?${q}`)).toEqual(appFetches(clampTime(asked)));
    expect(urls(`?${q}&spread=0&pastwater=0`)).toEqual(appFetches(clampTime(asked), { spread: false, pastWater: false }));
  });

  it('skips land use before HYDE (the model has none)', () => {
    expect(urls('?year=-50000').some((u) => u.includes('landuse'))).toBe(false);
  });

  it('preloads nothing in Dots', () => {
    expect(urls('?mode=dots')).toEqual([]);
  });

  it('preloads the adjusted spread images in place of HYDE’s, and leaves out past-water years', () => {
    expect(urls('?year=-6000')).toContain('/grid/adjusted/humans_-6000.webp?v=1');
    expect(urls('?year=-6000&spread=0')).toContain('/grid/humans_-6000.webp');
    const y = PRELOAD_TABLES.pastWaterEarthYears[0];
    expect(urls(`?year=${y}`).some((u) => u.includes(`earth_${y}.webp`))).toBe(false); // may not be published: not preloaded
    expect(urls(`?year=${y}&pastwater=0`)).toContain(`/terrain/earth_${y}.webp?v=${TERRAIN_VERSION}`);
  });
});

describe('preloadScript', () => {
  // The head script is the functions' own source text: it must run with no imports or outside names.
  it('runs on its own and adds one preload link per image', () => {
    const added: Record<string, string>[] = [];
    const doc = { createElement: () => ({ setAttribute(k: string, v: string) { (this as Record<string, unknown>)[k] = v; } }) as unknown as Record<string, string>, head: { appendChild: (l: Record<string, string>) => added.push(l) } };
    new Function('location', 'document', preloadScript())({ search: '?year=1900' }, doc);
    expect(added.map((l) => l.href)).toEqual(urls('?year=1900'));
    expect(added.every((l) => l.rel === 'preload' && l.as === 'fetch' && l.crossOrigin === 'anonymous')).toBe(true);
  });
});
