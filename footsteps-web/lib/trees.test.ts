import { treesForTile, outsideClearings, clearedMask, clearingsKey, treeLodShare, TREE_HEIGHT } from './trees';
import { treesParam, withIce, type Ground } from './close3d';

const bbox = { west: 10, east: 10.02, south: 45, north: 45.02 };
const heights = new Float32Array(256 * 256).fill(100);
const ground = (biome = 4): Ground => ({ colourAt: () => [80, 100, 60], biomeAt: () => biome, tempAt: () => 18, precipAt: () => 800 });
const make = (g = ground(), h = heights) => treesForTile(h, bbox, [100, 100, 13], 0, g);

test('flag stays opt in and deterministic trees have real positive sizes and atlas variants', () => {
  expect(treesParam('')).toBe(false);
  expect(treesParam('?trees=0')).toBe(false);
  expect(treesParam('?trees=1')).toBe(true);
  const trees = make();
  expect(trees.length).toBeGreaterThan(1000);
  expect(make()).toEqual(trees);
  expect(trees.every(t => t.height >= TREE_HEIGHT[t.kind] * 0.7 && t.height < TREE_HEIGHT[t.kind] * 1.3 && t.variant >= 0 && t.variant < 3)).toBe(true);
});

test('no tree in ocean, ice, dated lake or the wet half of a coast', () => {
  expect(make(ground(), new Float32Array(65536).fill(-10))).toHaveLength(0);
  expect(make(withIce(ground(), { key: 'ice', shareAt: () => 1 }))).toHaveLength(0);
  expect(treesForTile(heights, bbox, [100, 100, 13], 0, ground(), { key: 'lake', levelAt: () => 200 })).toHaveLength(0);
  const coast = heights.slice();
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) coast[y * 256 + x] = -10;
  expect(make(ground(), coast).every(t => t.position[0] >= 10.01)).toBe(true);
});

test('forest is denser than savanna and clearings exclude crowns including across index boundaries', () => {
  const forest = make();
  expect(forest.length).toBeGreaterThan(make(ground(12)).length * 4);
  const center: [number, number] = [10.01, 45.01];
  const cleared = outsideClearings(forest, [{ position: center, radius: 150 }]);
  expect(cleared.length).toBeLessThan(forest.length);
  for (const t of cleared) {
    const dx = (t.position[0] - center[0]) * 111320 * Math.cos(center[1] * Math.PI / 180);
    const dy = (t.position[1] - center[1]) * 110540;
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(150 + t.height * 0.35);
  }
  expect(outsideClearings(forest, [])).toEqual(forest);
});

test('distance LOD draws every tree near the camera, a thinner share further out and none where trees are subpixel', () => {
  expect(treeLodShare(8)).toBe(1);
  expect(treeLodShare(3)).toBe(1);
  expect(treeLodShare(1.5)).toBe(0.5);
  expect(treeLodShare(0.9)).toBe(0);
  for (let px = 0; px < 6; px += 0.25) expect(treeLodShare(px + 0.25)).toBeGreaterThanOrEqual(treeLodShare(px));
});

test('clearedMask marks the same trees outsideClearings drops', () => {
  const forest = Array.from({ length: 400 }, (_, i) => ({
    position: [12.6 + (i % 20) * 0.0002, 41.85 + Math.floor(i / 20) * 0.0002, 0] as [number, number, number],
    kind: 'broadleaf' as const, variant: 0, height: 20, tint: [255, 255, 255, 255] as [number, number, number, number],
  }));
  const clearings = [{ position: [12.602, 41.852] as const, radius: 60 }];
  const mask = clearedMask(forest, clearings);
  expect(mask.some(Boolean)).toBe(true);
  expect(forest.filter((_, i) => !mask[i])).toEqual(outsideClearings(forest, clearings));
  expect(clearedMask(forest, []).every((m) => m === 0)).toBe(true);
});

test('clearingsKey follows content, not array identity', () => {
  const a = [{ position: [12.6, 41.85] as const, radius: 30 }];
  expect(clearingsKey([...a])).toBe(clearingsKey([{ ...a[0] }]));
  expect(clearingsKey(a)).not.toBe(clearingsKey([{ position: [12.6001, 41.85] as const, radius: 30 }]));
  expect(clearingsKey([])).not.toBe(clearingsKey(a));
});
