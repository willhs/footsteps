import { buildUnits, CAMP_SIZE, UnitKind, VILLAGE_SIZE } from './units';
import { WayOfLife } from '@/lib/waysOfLife';

const foragers = (n: number) => new Uint8Array(n).fill(WayOfLife.Forager);

test('sparse cells never emit implausible groups; retained populations are conserved', () => {
  const sparse = buildUnits(
    new Uint32Array(Array.from({ length: 10000 }, (_, i) => i)),
    new Float32Array(20000),
    new Float32Array(10000).fill(0.1),
    1 / 12,
    foragers(10000),
  );
  expect(sparse.length).toBe(0);
  const populations = [0.1, 0.49, 1, 2, 14.99, 15, 16, 29, 31, 44, 599];
  const ids = new Uint32Array(populations.map((_, i) => i));
  const result = buildUnits(
    ids,
    new Float32Array(ids.length * 2),
    new Float32Array(populations),
    1 / 12,
    foragers(populations.length),
  );
  expect(result.length).toBeGreaterThan(0);
  expect(Array.from(result.people).every((p) => p >= 15)).toBe(true);
  expect(Array.from(result.people).reduce((a, b) => a + b, 0)).toBeCloseTo(
    15 + 16 + 29 + 31 + 44 + 599,
    3,
  );
});

test('persistent bands retain their seeded positions as the population grows or shrinks', () => {
  const cellIds = new Uint32Array([42]);
  const positions = new Float32Array([10, 20]);
  const small = buildUnits(cellIds, positions, new Float32Array([60]), 0.1, foragers(1));
  const large = buildUnits(cellIds, positions, new Float32Array([120]), 0.1, foragers(1));
  expect(small.length).toBe(2);
  expect(large.length).toBe(4);
  expect(large.positions.slice(0, 4)).toEqual(small.positions);
  expect(Array.from(small.people)).toEqual([30, 30]);
  expect(Array.from(large.people)).toEqual([30, 30, 30, 30]);
});

test('the way of life picks the kind of group; head count only sets how many', () => {
  const build = (way: number, people: number) =>
    buildUnits(
      new Uint32Array([7]),
      new Float32Array([0, 0]),
      new Float32Array([people]),
      0.1,
      new Uint8Array([way]),
    );
  const farmers = build(WayOfLife.Farmer, 20 * VILLAGE_SIZE);
  expect(Array.from(farmers.kind)).toEqual([1, 1, 1, 1].map(() => UnitKind.Village)); // capped at four
  const herders = build(WayOfLife.Herder, 3 * CAMP_SIZE);
  expect(Array.from(herders.kind)).toEqual([UnitKind.Camp, UnitKind.Camp, UnitKind.Camp]);
  expect(herders.counts).toEqual([0, 0, 0, 3]);
  const city = build(WayOfLife.Urban, 100_000);
  expect(Array.from(city.kind)).toEqual([UnitKind.Glow]);
  // A small farming cell is one hamlet of everyone in it, not nothing.
  expect(Array.from(build(WayOfLife.Farmer, 50).people)).toEqual([50]);
  // Too few to be a group at all, whatever their way of life.
  expect(build(WayOfLife.Herder, 10).length).toBe(0);
});

test('every kind keeps its own id slots, so ids stay unique and sorted within a cell', () => {
  for (const way of [WayOfLife.Forager, WayOfLife.Farmer, WayOfLife.Herder, WayOfLife.Urban]) {
    const u = buildUnits(
      new Uint32Array([3]),
      new Float32Array([0, 0]),
      new Float32Array([50_000]),
      0.1,
      new Uint8Array([way]),
    );
    const ids = Array.from(u.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids.every((id) => Math.floor(id / 32) === 3)).toBe(true);
  }
  // Forager bands fill at most their 20 slots even in a dense cell.
  const dense = buildUnits(
    new Uint32Array([0]),
    new Float32Array([0, 0]),
    new Float32Array([20_000]),
    0.1,
    foragers(1),
  );
  expect(dense.length).toBe(20);
});
