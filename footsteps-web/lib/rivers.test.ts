import { decodeRivers, riversForTile, smooth, RIVER_WIDTH_M } from './rivers';
import { EXAGGERATION, type Ground } from './close3d';

const ground = (biome = 21): Ground => ({ colourAt: () => [0, 0, 0], biomeAt: () => biome, tempAt: () => 25, precipAt: () => 20 });
const flat = (h: number) => new Float32Array(256 * 256).fill(h);
// A Nile-like line running north through the tile 31.0-31.1 E, 30.0-30.1 N, as the file stores it (1e-4 degree deltas).
const file = { version: 1 as const, scale: 10000, rivers: [[1, 310500, 299000, 0, 1000, 0, 1000, 0, 1000]] };
const bbox = { west: 31.0, east: 31.1, south: 30.0, north: 30.1 };

test('smoothing keeps the ends and cuts the corners', () => {
  const c = smooth(Float64Array.from([0, 0, 1, 0, 1, 1]), 1);
  expect([c[0], c[1]]).toEqual([0, 0]);
  expect([c[c.length - 2], c[c.length - 1]]).toEqual([1, 1]);
  expect(c.length / 2).toBe(4);
});

test('a river crossing a tile is draped on its ground, densified, with its rank width', () => {
  const rivers = decodeRivers(file);
  const paths = riversForTile(rivers, flat(20), bbox, 0, ground());
  expect(paths).toHaveLength(1);
  const { path, width } = paths[0];
  expect(width).toBe(RIVER_WIDTH_M[1]);
  expect(path.length).toBeGreaterThan(30); // ~64 mesh cells across the tile
  for (const [lon, lat, z] of path) {
    expect(lon).toBeCloseTo(31.05, 6);
    expect(lat).toBeGreaterThanOrEqual(30.0);
    expect(lat).toBeLessThanOrEqual(30.1);
    expect(z).toBeCloseTo(20 * EXAGGERATION + 2, 3);
  }
});

test('no river under the sea, under the ice or off the tile', () => {
  const rivers = decodeRivers(file);
  expect(riversForTile(rivers, flat(-5), bbox, 0, ground())).toEqual([]);
  expect(riversForTile(rivers, flat(20), bbox, 0, ground(28))).toEqual([]);
  expect(riversForTile(rivers, flat(20), { west: 40, east: 40.1, south: 30, north: 30.1 }, 0, ground())).toEqual([]);
});

test('a river breaks where it crosses past water', () => {
  const rivers = decodeRivers(file);
  const lake = { key: 'k', levelAt: (_lon: number, lat: number) => (lat > 30.04 && lat < 30.06 ? 25 : null) };
  const paths = riversForTile(rivers, flat(20), bbox, 0, ground(), lake);
  expect(paths).toHaveLength(2);
});

test('the baked file decodes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const baked = require('../public/water/rivers.json');
  const rivers = decodeRivers(baked);
  expect(rivers.lines.length).toBeGreaterThan(1500);
  // the Nile at Cairo: some line passes within 0.1 degrees of 31.23 E, 30.05 N
  const near = rivers.lines.some((l) => { for (let i = 0; i < l.coords.length; i += 2) if (Math.abs(l.coords[i] - 31.23) < 0.1 && Math.abs(l.coords[i + 1] - 30.05) < 0.1) return true; return false; });
  expect(near).toBe(true);
});
