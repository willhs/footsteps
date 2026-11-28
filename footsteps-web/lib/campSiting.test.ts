import { BANK_STANDOFF_M, RIVER_REACH_M, nearestRiver, siteByWater } from './campSiting';
import { RIVER_WIDTH_M, type Rivers } from './rivers';

/** One straight river running north along 10°E (scalerank 6), indexed like decodeRivers. */
function riverAlong(lon: number, rank = 6): Rivers {
  const coords = new Float64Array([lon, 49.5, lon, 50.5]);
  const bins = new Map<number, number[]>();
  for (const lat of [49, 50]) bins.set((lat + 90) * 360 + (Math.floor(lon) + 180), [0]);
  return { lines: [{ rank, coords, west: lon, east: lon, south: 49.5, north: 50.5 }], bins };
}
const mPerDegLon = 111_320 * Math.cos((50 * Math.PI) / 180);

test('a camp near a mapped river moves to its bank, on the side it was on', () => {
  const rivers = riverAlong(10.5);
  const [lon, lat] = siteByWater(rivers, 10.5 + 800 / mPerDegLon, 50);
  const back = RIVER_WIDTH_M[6] / 2 + BANK_STANDOFF_M;
  expect((lon - 10.5) * mPerDegLon).toBeCloseTo(back, 0);
  expect(lat).toBeCloseTo(50, 6);
  const [west] = siteByWater(rivers, 10.5 - 800 / mPerDegLon, 50);
  expect((west - 10.5) * mPerDegLon).toBeCloseTo(-back, 0);
});

test('a camp in the river is moved out of it; one on the bank stays', () => {
  const rivers = riverAlong(10.5);
  const [inside] = siteByWater(rivers, 10.5 + 5 / mPerDegLon, 50);
  expect((inside - 10.5) * mPerDegLon).toBeGreaterThan(RIVER_WIDTH_M[6] / 2);
  const onBank = 10.5 + (RIVER_WIDTH_M[6] / 2 + 40) / mPerDegLon;
  expect(siteByWater(rivers, onBank, 50)).toEqual([onBank, 50]);
});

test('a camp with no mapped river in reach, or no rivers loaded, stays', () => {
  const rivers = riverAlong(10.5);
  const far = 10.5 + (RIVER_REACH_M + 200) / mPerDegLon;
  expect(siteByWater(rivers, far, 50)).toEqual([far, 50]);
  expect(nearestRiver(rivers, far, 50)).toBeNull();
  expect(siteByWater(null, 10.51, 50)).toEqual([10.51, 50]);
});
