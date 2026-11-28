import { REGION_TOTALS, inRegion, mergedScales, regionScales, regionTotalAt, regionWeightAt } from './regionTotals';
import { gridDataFrom } from '@/components/footsteps/hooks/gridData';

const australia = REGION_TOTALS.find((r) => r.id === 'australia')!;

// grid_image.py's encoding, as in holoceneShares.test.ts.
const MAX_PEOPLE = 5_000_000;
const LEVELS = 1023;
const LOG_MAX = Math.log1p(MAX_PEOPLE);
const HYDE_WIDTH = 4320; // 5′ cells, the only images the correction reads
const HYDE_HEIGHT = 2160;
const CELLS_PER_DEGREE = 12;

test('Australia covers the continent, Tasmania, the Top End and Cape York, not New Guinea', () => {
  expect(inRegion(australia, 151.2, -33.9)).toBe(true); // Sydney
  expect(inRegion(australia, 147.3, -42.9)).toBe(true); // Hobart
  expect(inRegion(australia, 130.8, -12.5)).toBe(true); // Darwin
  expect(inRegion(australia, 142.5, -10.8)).toBe(true); // tip of Cape York
  expect(inRegion(australia, 147.2, -9.4)).toBe(false); // Port Moresby
  expect(inRegion(australia, 150.4, -10.6)).toBe(false); // Milne Bay
});

test('HYDE as it is before 400 CE and from 1800, the contact figure 1500-1788, a ramp between', () => {
  expect(regionWeightAt(australia, 0)).toBe(0);
  expect(regionWeightAt(australia, 400)).toBe(0);
  expect(regionWeightAt(australia, 950)).toBeCloseTo(0.5);
  expect(regionWeightAt(australia, 1500)).toBe(1);
  expect(regionWeightAt(australia, 1700)).toBe(1);
  expect(regionWeightAt(australia, 1800)).toBe(0);
  expect(regionTotalAt(australia, 1700, 400_000)).toBe(australia.targetPeople);
  expect(australia.targetPeople).toBeGreaterThanOrEqual(770_000); // inside Williams 2013's contact range
  expect(australia.targetPeople).toBeLessThanOrEqual(1_100_000);
});

/** A HYDE-sized image with `people` in each listed [lon, lat] cell. */
function image(cells: [number, number, number][]) {
  const data = new Uint8ClampedArray(HYDE_WIDTH * HYDE_HEIGHT * 4);
  for (const [lon, lat, people] of cells) {
    const col = Math.floor((lon + 180) * CELLS_PER_DEGREE);
    const row = Math.floor((90 - lat) * CELLS_PER_DEGREE);
    const level = Math.round((Math.log1p(people) / LOG_MAX) * LEVELS);
    const i = (row * HYDE_WIDTH + col) * 4;
    data[i] = level >> 8;
    data[i + 1] = level & 255;
    data[i + 3] = 255;
  }
  return { width: HYDE_WIDTH, height: HYDE_HEIGHT, data };
}

test('the drawn grid puts the target total in Australia and leaves New Guinea alone', () => {
  const px = image([[151.2, -33.9, 1000], [130.8, -12.5, 1000], [147.2, -9.4, 1000]]);
  const newGuinea = (lon: number, lat: number) => lon > 140 && lon < 156 && lat > -11 && lat < 0;
  // Outside Australia, only New Guinea: lib/missingIslands.ts adds Pacific islands in some years.
  const sum = (year: number, inside: boolean) => {
    const g = gridDataFrom(year, px, null);
    let t = 0;
    for (let i = 0; i < g.length; i++) {
      const [lon, lat] = [g.positions[i * 2], g.positions[i * 2 + 1]];
      if (inside ? inRegion(australia, lon, lat) : newGuinea(lon, lat)) t += g.people[i];
    }
    return t;
  };
  expect(sum(1700, true)).toBeCloseTo(australia.targetPeople, -2);
  expect(sum(1700, false)).toBeCloseTo(sum(0, false), 3);
  expect(sum(0, true)).toBeCloseTo(sum(1800, true), 3); // unchanged outside the span
});

test('scales from different regions merge into one ascending walk', () => {
  const scales = regionScales(1700, HYDE_WIDTH, HYDE_HEIGHT, (cell) => (cell % 997 === 0 ? 1 : 0));
  const { cells, factors } = mergedScales(scales);
  expect(cells.length).toBe(factors.length);
  for (let i = 1; i < cells.length; i++) expect(cells[i]).toBeGreaterThan(cells[i - 1]);
});
