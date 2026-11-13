import { buildUnits } from './units';

test('sparse cells never emit implausible groups; retained populations are conserved', () => {
  const sparse = buildUnits(
    new Uint32Array(Array.from({ length: 10000 }, (_, i) => i)),
    new Float32Array(20000),
    new Float32Array(10000).fill(0.1),
    1 / 12,
  );
  expect(sparse.length).toBe(0);
  const populations = [0.1, 0.49, 1, 2, 14.99, 15, 16, 29, 31, 44, 599];
  const ids = new Uint32Array(populations.map((_, i) => i));
  const result = buildUnits(
    ids,
    new Float32Array(ids.length * 2),
    new Float32Array(populations),
    1 / 12,
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
  const small = buildUnits(cellIds, positions, new Float32Array([60]), 0.1);
  const large = buildUnits(cellIds, positions, new Float32Array([120]), 0.1);
  expect(small.length).toBe(2);
  expect(large.length).toBe(4);
  expect(large.positions.slice(0, 4)).toEqual(small.positions);
  expect(Array.from(small.people)).toEqual([30, 30]);
  expect(Array.from(large.people)).toEqual([30, 30, 30, 30]);
});
