import { CELL_DEG, COARSE_Z, cellMeansOfTile, smoothSnowLine, tileOf } from './snowLine';
import { snowLine } from './close3d';

// A climate with a sharp step: every 0.5° cell is 3 °C colder than its western neighbour, and cell heights alternate.
const cellOf = (lon: number, lat: number) => [Math.floor((lon + 180) / CELL_DEG), Math.floor((90 - lat) / CELL_DEG)];
const ground = { tempAt: (lon: number, lat: number) => 10 - 3 * cellOf(lon, lat)[0] + 3 * cellOf(8, 46)[0] };
const heights = (col: number) => (col % 2 ? 2200 : 900);

test('the snow line has no step at cell edges or tile edges, and meets each cell’s own line at its centre', () => {
  const line = smoothSnowLine(ground, (col) => heights(col));
  let last = line(7, 46.6);
  for (let lon = 7; lon <= 9; lon += 0.001) {
    const v = line(lon, 46.6);
    // A 0.001° move changes the line by at most a few metres; the old per-cell or per-tile rule jumped by hundreds.
    expect(Math.abs(v - last)).toBeLessThan(15);
    last = v;
  }
  const [col, row] = cellOf(8.1, 46.6);
  const cx = -180 + (col + 0.5) * CELL_DEG;
  const cy = 90 - (row + 0.5) * CELL_DEG;
  expect(line(cx, cy)).toBeCloseTo(snowLine(ground.tempAt(cx, cy), cy, heights(col)), 6);
});

test('sea cells (no temperature) drop out of the blend; with none at all the latitude rule stands', () => {
  const half = smoothSnowLine({ tempAt: (lon) => (lon < 8 ? null : 0) }, () => 1000);
  expect(half(7.9, 46.6)).toBeCloseTo(snowLine(0, 46.75, 1000), -2);
  const sea = smoothSnowLine({ tempAt: () => null }, () => null);
  expect(sea(8, 46.6)).toBe(snowLine(null, 46.6));
});

test('a coarse tile gives a mean to just the cells whose centres it holds, each counted once', () => {
  const [x, y] = tileOf(8, 46.5, COARSE_Z);
  const flat = new Float32Array(256 * 256).fill(1500);
  const means = cellMeansOfTile(flat, x, y);
  // A zoom-6 tile is 5.625° wide: 11 or 12 cell centres across, and about 7-8 cells tall at 46°N.
  expect(means.size).toBeGreaterThan(70);
  expect(means.size).toBeLessThan(110);
  for (const v of means.values()) expect(v).toBe(1500);
  // Neighbouring tiles never claim the same cell.
  const east = cellMeansOfTile(flat, x + 1, y);
  for (const k of east.keys()) expect(means.has(k)).toBe(false);
});
