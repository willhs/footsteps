import { buildUnits } from './units';

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
