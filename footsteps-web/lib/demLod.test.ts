import { coarsenFar, type TileIndex } from './demLod';

// A 4 × 4 block of z10 tiles; "far" rows are y < 2 (drawn small), near rows full size.
const block = (z = 10): TileIndex[] => {
  const out: TileIndex[] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) out.push({ x, y, z });
  return out;
};
const area = (ts: TileIndex[], z: number) => ts.reduce((s, t) => s + 4 ** (z - t.z), 0);
const overlaps = (ts: TileIndex[]) =>
  ts.some((a, i) =>
    ts.some((b, j) => {
      if (i === j || a.z > b.z) return false;
      const s = b.z - a.z;
      return b.x >> s === a.x && b.y >> s === a.y;
    }),
  );

test('far siblings merge into their parent, near tiles stay', () => {
  // A tile's on-screen width: 256 px near (y >= 2), 64 px far; a parent is twice its children.
  const width = (t: TileIndex) => {
    const s = 2 ** (10 - t.z);
    return (t.y * s >= 2 ? 256 : 64) * s;
  };
  const out = coarsenFar(block(), width, 256);
  expect(out.filter((t) => t.z === 9)).toEqual([
    { x: 0, y: 0, z: 9 },
    { x: 1, y: 0, z: 9 },
  ]);
  expect(out.filter((t) => t.z === 10)).toHaveLength(8);
  expect(area(out, 10)).toBe(16);
  expect(overlaps(out)).toBe(false);
});

test('nothing merges when every tile is as wide as the centre one', () => {
  expect(coarsenFar(block(), (t) => 256 * 2 ** (10 - t.z), 256)).toEqual(block());
});

test('two levels when far enough, and never an overlap with finer tiles under a grandparent', () => {
  // 8 × 8 tiles; everything is tiny except one near tile at (7, 7).
  const tiles: TileIndex[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) tiles.push({ x, y, z: 10 });
  const width = (t: TileIndex) => {
    const s = 2 ** (10 - t.z);
    const near = (7 >> (10 - t.z)) === t.x && (7 >> (10 - t.z)) === t.y;
    return near ? Infinity : 16 * s;
  };
  const out = coarsenFar(tiles, width, 256);
  expect(overlaps(out)).toBe(false);
  expect(area(out, 10)).toBe(64);
  expect(out.some((t) => t.z === 8)).toBe(true); // far quarter merged twice
  expect(out).toContainEqual({ x: 7, y: 7, z: 10 }); // the near tile and its siblings stay fine
  expect(out.filter((t) => t.z === 10)).toHaveLength(4);
});

test('respects minZ and an unknown width', () => {
  expect(coarsenFar(block(7), () => 1, 256, 2, 7)).toEqual(block(7));
  expect(coarsenFar(block(), () => Infinity, 256)).toEqual(block());
});
