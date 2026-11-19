import type { GridData } from '@/components/footsteps/hooks/gridData';
import { harmonic, largestOf, largestSettlementAt, RANK_SIZE_EXPONENT, regionExponent } from './rankSize';
import { layoutOfPattern, type HistoricalCity, type SettlementCatalog, type SettlementProfile } from './settlements';
import { WayOfLife, type WayOfLifeValue } from './waysOfLife';

const W = 4320;
const CELL = 1 / 12;
const lonLat = (row: number, col: number): [number, number] => [-180 + (col + 0.5) * CELL, 90 - (row + 0.5) * CELL];
const R = 1000; // the test cells sit at rows 1000-1063, cols 2900-2963: one 64-cell block, in the catalog's 5° region '16,48'

function grid(cells: [number, number, number, WayOfLifeValue?][]): GridData {
  const sorted = [...cells].sort((a, b) => a[0] * W + a[1] - (b[0] * W + b[1]));
  return {
    length: sorted.length, positions: new Float32Array(sorted.length * 2),
    people: Float32Array.from(sorted.map((c) => c[2])), cellIds: Uint32Array.from(sorted.map((c) => c[0] * W + c[1])),
    ways: Uint8Array.from(sorted.map((c) => c[3] ?? WayOfLife.Farmer)), cellDeg: CELL, total: sorted.reduce((s, c) => s + c[2], 0),
  };
}
const component = (pattern: number | null, size: number, weight = 1) => ({ weight, size, moves: null, pattern, mode: 'settled' as const, society: 's' });
function catalog(components: ReturnType<typeof component>[], cities: HistoricalCity[] = []): SettlementCatalog {
  const profile: SettlementProfile = { components, storage: null };
  return { version: 1, cities, regions: { '16,48': [profile, profile, profile, profile] }, climate: {} };
}
const near = (n: number) => lonLat(R + n, 2900 + n);

describe('the rank-size arithmetic', () => {
  it('matches the exact sum of r^-q for whole n, and is 1 for one settlement', () => {
    for (const q of [0.7, 0.9, 1, 1.2]) {
      for (const n of [2, 10, 100, 5000]) {
        let exact = 0;
        for (let r = 1; r <= n; r++) exact += r ** -q;
        expect(Math.abs(harmonic(n, q) / exact - 1)).toBeLessThan(0.01);
      }
    }
    expect(harmonic(1, 0.9)).toBe(1);
    expect(harmonic(0.4, 0.9)).toBe(1);
  });

  it('gives a biggest settlement that is at least the mean and at most everyone, steeper tails making it bigger', () => {
    const people = 100_000;
    const n = 400;
    const a = largestOf(people, n, 0.7);
    const b = largestOf(people, n, 0.9);
    expect(a).toBeGreaterThan(people / n);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(people);
    expect(largestOf(50, 1, 0.9)).toBe(50);
  });
});

describe('the exponent', () => {
  it('is stated per layout, below Zipf and flattest for scattered farmsteads', () => {
    expect(RANK_SIZE_EXPONENT.dispersed).toBeLessThan(RANK_SIZE_EXPONENT.hamlet);
    expect(RANK_SIZE_EXPONENT.hamlet).toBeLessThan(RANK_SIZE_EXPONENT.nucleated);
    expect(RANK_SIZE_EXPONENT.nucleated).toBeLessThan(1);
  });
  it('mixes by the analogs of the region, to 0.05', () => {
    const p = (...c: [number, number][]): SettlementProfile => ({ storage: null, components: c.map(([pattern, weight]) => component(pattern, 100, weight)) });
    expect(regionExponent(p([7, 1]))).toBe(0.8);
    expect(regionExponent(p([5, 1]))).toBe(0.6);
    expect(regionExponent(p([5, 0.5], [7, 0.5]))).toBe(0.7);
    expect(regionExponent(p([8, 0.35], [8, 0.35], [7, 0.3]))).toBe(0.8);
    expect(regionExponent(p([5, 0.34], [6, 0.33], [7, 0.33]))).toBe(0.7);
    expect(layoutOfPattern(null)).toBe('nucleated');
  });
});

describe('largestSettlementAt', () => {
  const [lon, lat] = near(0);
  const model = (people: number, size: number, pattern = 7) => largestSettlementAt(
    grid([[R, 2900, people / 2], [R + 3, 2903, people / 2]]), catalog([component(pattern, size)]), lon, lat, 1000);

  it('is the rank-size tail of the block: more than a mean village, less than everyone, bigger with more people', () => {
    const small = model(20_000, 200)!;
    const big = model(200_000, 200)!;
    expect(small.city).toBeNull();
    expect(small.people).toBeGreaterThan(200);
    expect(small.people).toBeLessThan(20_000);
    expect(big.people).toBeGreaterThan(small.people);
    expect(small.exponent).toBe(0.8);
    expect(small.blockKm).toBeGreaterThan(550);
    expect(small.blockKm).toBeLessThan(640);
  });

  it('is smaller where the analogs say farms are scattered, for the same people', () => {
    expect(model(100_000, 200, 5)!.people).toBeLessThan(model(100_000, 200, 7)!.people);
  });

  it('says nothing for an empty cell, before farming, or with less than one village around', () => {
    const g = grid([[R, 2900, 0], [R + 1, 2901, 5000]]);
    expect(largestSettlementAt(g, catalog([component(7, 200)]), lon, lat, 1000)).toBeNull();
    expect(largestSettlementAt(grid([[R, 2900, 5000]]), catalog([component(7, 200)]), lon, lat, -12_000)).toBeNull();
    expect(largestSettlementAt(grid([[R, 2900, 150]]), catalog([component(7, 200)]), lon, lat, 1000)).toBeNull();
    expect(largestSettlementAt(grid([[R, 2900, 5000, WayOfLife.Forager]]), catalog([component(7, 200)]), lon, lat, 1000)).toBeNull();
    expect(largestSettlementAt(grid([[R, 2900, 5000]]), catalog([component(7, 200)]), NaN, lat, 1000)).toBeNull();
  });

  it('counts only the block around the cursor', () => {
    const inside = largestSettlementAt(grid([[R, 2900, 20_000]]), catalog([component(7, 200)]), lon, lat, 1000)!;
    const withFar = largestSettlementAt(grid([[R, 2900, 20_000], [R + 64, 2900, 900_000]]), catalog([component(7, 200)]), lon, lat, 1000)!;
    expect(withFar.people).toBe(inside.people);
  });

  it('names a city in the block when it is bigger than the tail, and ignores one outside or smaller', () => {
    const [clon, clat] = near(5);
    const city = (id: string, lon: number, lat: number, pop: number): HistoricalCity => ({ id, name: id, lon, lat, source: 't', observations: [[1000, pop]] });
    const g = grid([[R, 2900, 20_000]]);
    const tail = largestSettlementAt(g, catalog([component(7, 200)]), lon, lat, 1000)!;
    const rome = largestSettlementAt(g, catalog([component(7, 200)], [city('Rome', clon, clat, 15_000)]), lon, lat, 1000)!;
    expect(rome).toMatchObject({ city: 'Rome', people: 15_000 });
    expect(rome.exponent).toBe(tail.exponent);
    const small = largestSettlementAt(g, catalog([component(7, 200)], [city('Hamlet', clon, clat, 30)]), lon, lat, 1000)!;
    expect(small).toEqual(tail);
    const [flon, flat] = lonLat(R + 200, 2900);
    expect(largestSettlementAt(g, catalog([component(7, 200)], [city('Far', flon, flat, 1e6)]), lon, lat, 1000)).toEqual(tail);
    const dated = largestSettlementAt(g, catalog([component(7, 200)], [city('Rome', clon, clat, 15_000)]), lon, lat, 1500)!;
    expect(dated.city).toBeNull(); // no observation near enough in time
  });

  it('never calls the place smaller than the town cell it is drawn as', () => {
    const g = grid([[R, 2900, 60_000, WayOfLife.Urban], [R + 1, 2901, 3000]]);
    expect(largestSettlementAt(g, catalog([component(7, 200)]), lon, lat, 1000)!.people).toBeGreaterThanOrEqual(60_000);
  });
});
