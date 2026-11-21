import { PRELOAD_TABLES, firstLoadUrls, preloadScript } from './firstLoadPreload';
import { bracket, bracketIn, clampTime, terrainBracket } from './time';
import { DEFAULT_TIME, TARGET_YEARS, TERRAIN_VERSION } from './constants';
import { gridUrl, landUseUrl } from '@/components/footsteps/hooks/gridData';

const urls = (search: string) => firstLoadUrls(search, PRELOAD_TABLES, bracketIn);

/** What the app itself fetches first for an opening time (usePresenceLayers, gridData, useTerrainLayers). */
function appFetches(time: number): string[] {
  const p = bracket(time);
  const e = terrainBracket(time);
  const people = [...new Set([p.y0, p.y1])].flatMap((y) => (y >= TARGET_YEARS[0] ? [gridUrl(y), landUseUrl(y)] : [gridUrl(y)]));
  const earth = [...new Set([e.y0, e.y1])].map((y) => `/terrain/earth_${y}.webp?v=${TERRAIN_VERSION}`);
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
  });

  it('skips land use before HYDE (the model has none)', () => {
    expect(urls('?year=-50000').some((u) => u.includes('landuse'))).toBe(false);
  });

  it.each(['mode=dots', 'spread=1', 'pastwater=1', 'tour=1'])('preloads nothing with ?%s (other addresses or another year)', (q) => {
    expect(urls(`?${q}`)).toEqual([]);
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
