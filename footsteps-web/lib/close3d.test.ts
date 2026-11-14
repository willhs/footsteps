import {
  CLOSE3D_PITCH,
  EXAGGERATION,
  buildTerrainMesh,
  close3dParam,
  openWater,
  groundColour,
  pitchForZoom,
  plantsForTile,
  snowLine,
  terrariumHeights,
  type Ground,
} from './close3d';

const flat = (biome = 4, temp = 10): Ground => ({
  colourAt: () => [100, 120, 80],
  biomeAt: () => biome,
  tempAt: () => temp,
});
const bbox = { west: 0, south: 0, east: 0.35, north: 0.35 };
const heightsOf = (f: (x: number, y: number) => number) => {
  const h = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) h[y * 256 + x] = f(x, y);
  return h;
};

test('the flag and the tilt', () => {
  expect(close3dParam('')).toBe(true);
  expect(close3dParam('?close3d=1')).toBe(true);
  expect(close3dParam('?close3d=0')).toBe(false);
  expect(pitchForZoom(6)).toBe(0);
  expect(pitchForZoom(8)).toBe(0);
  expect(pitchForZoom(12)).toBe(CLOSE3D_PITCH);
  expect(pitchForZoom(9)).toBeGreaterThan(0);
  expect(pitchForZoom(9)).toBeLessThan(CLOSE3D_PITCH);
});

test('Terrarium pixels decode to metres', () => {
  // 32768 + 1000.5 m = 131 * 256 + 232 + 128 / 256
  const h = terrariumHeights(Uint8ClampedArray.of(131, 232, 128, 255));
  expect(h[0]).toBeCloseTo(1000.5);
});

test('water is flat at the sea level and land keeps its height', () => {
  // West half below a -50 m sea, east half above it.
  const heights = heightsOf((x) => (x < 128 ? -80 : 20));
  const mesh = buildTerrainMesh(heights, bbox, -50, flat());
  const n = 256 / 4 + 1;
  expect(mesh.positions[2]).toBeCloseTo(-50 * EXAGGERATION); // first vertex: west, in the sea
  expect(mesh.positions[(n - 1) * 3 + 2]).toBeCloseTo(20 * EXAGGERATION); // last of the row: east, land
  // Water is blue, land keeps the year's colour.
  expect(mesh.colors[2]).toBeGreaterThan(mesh.colors[0]);
  expect(mesh.indices.length).toBe((n - 1) * (n - 1) * 6);
});

test('the snow line rises with temperature and the ground under it', () => {
  expect(snowLine(20, 0, 1000)).toBeGreaterThan(snowLine(0, 0, 1000));
  expect(snowLine(10, 0, 2000)).toBe(snowLine(10, 0, 0) + 2000);
  const g = flat(4, -10);
  expect(groundColour(5000, 0, 0, 0, 0, g)[2]).toBeGreaterThan(220); // snow
  expect(groundColour(-10, 0, 0, 0, 0, g)[2]).toBeGreaterThan(groundColour(-10, 0, 0, 0, 0, g)[0]); // sea
});

test('plants follow the biome: forest dense, desert bare, none in the sea', () => {
  const land = heightsOf(() => 100);
  const forest = plantsForTile(land, bbox, [1, 2, 10], 0, flat(4));
  const desert = plantsForTile(land, bbox, [1, 2, 10], 0, flat(21));
  const ice = plantsForTile(land, bbox, [1, 2, 10], 0, flat(28));
  expect(forest.length).toBeGreaterThan(500);
  expect(desert.length).toBeLessThan(forest.length / 20);
  expect(ice.length).toBe(0);
  expect(plantsForTile(heightsOf(() => -10), bbox, [1, 2, 10], 0, flat(4))).toHaveLength(0);
  // Stable per tile.
  expect(plantsForTile(land, bbox, [1, 2, 10], 0, flat(4))).toEqual(forest);
});

test('a small inland dip below sea level stays land, with no beach', () => {
  // Land at 3 m everywhere except a 3 × 3 pixel dip to -2 m in the middle, far from any sea.
  const heights = heightsOf((x, y) => (Math.abs(x - 128) <= 4 && Math.abs(y - 128) <= 4 ? -2 : 3));
  const mesh = buildTerrainMesh(heights, bbox, 0, flat());
  const n = 256 / 4 + 1;
  const mid = (32 * n + 32) * 3;
  expect(mesh.positions[mid + 2]).toBeCloseTo(-2 * EXAGGERATION); // drawn at its own height, not as water
  // Same colour family as the surrounding land (green-ish), not sand or water.
  expect(mesh.colors[mid + 1]).toBeGreaterThan(mesh.colors[mid + 2]);
  expect(plantsForTile(heights, bbox, [3, 3, 10], 0, flat(4)).length).toBeGreaterThan(500);
});

test('low ground beside open water is beach; the same height inland is not', () => {
  // Sea in the west quarter, land at 2 m elsewhere.
  const heights = heightsOf((x) => (x < 64 ? -30 : 2));
  const mesh = buildTerrainMesh(heights, bbox, 0, flat());
  const n = 256 / 4 + 1;
  const shore = (32 * n + 17) * 3; // just east of the water's edge (x = 68 px)
  const inland = (32 * n + 50) * 3; // x = 200 px
  const sandiness = (o: number) => mesh.colors[o] - mesh.colors[o + 1]; // sand is red over green
  expect(sandiness(shore)).toBeGreaterThan(sandiness(inland) + 0.05);
});

test('open water: patches reaching the edge or big enough; specks are not', () => {
  const n = 20;
  const below = new Uint8Array(n * n);
  below[10 * n + 10] = 1; // a lone speck in the middle
  for (let j = 0; j < n; j++) below[j * n] = 1; // a strip along the west edge
  const water = openWater(below, n);
  expect(water[10 * n + 10]).toBe(0);
  expect(water[5 * n]).toBe(1);
});
