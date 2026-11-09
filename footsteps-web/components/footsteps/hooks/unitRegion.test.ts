import { buildUnits } from '../layers/units';
import { buildUnitMorph } from './unitMorph';
import { sliceUnits, WORLD } from './unitRegion';

// A 8×4 world of 45° cells; one 300-person cell (10 bands) in each of four places.
const width = 8;
const cell = (row: number, col: number) => row * width + col;
const centre = (row: number, col: number) => [-180 + (col + 0.5) * 45, 90 - (row + 0.5) * 45];
const cells = [cell(1, 0), cell(1, 3), cell(1, 7), cell(2, 4)];
const units = buildUnits(
  new Uint32Array(cells),
  new Float32Array(cells.flatMap((c) => centre(Math.floor(c / width), c % width))),
  new Float32Array([300, 300, 300, 300]),
  45,
);
const cellsOf = (u: ReturnType<typeof sliceUnits>) => [...new Set(Array.from(u.ids, (id) => Math.floor(id / 32)))];

test('keeps only units whose cell is inside the region, in id order', () => {
  const slice = sliceUnits(units, width, { west: -45, south: -40, east: 30, north: 40 });
  expect(cellsOf(slice)).toEqual([cell(1, 3), cell(2, 4)]);
  expect(slice.length).toBe(20);
  expect(slice.counts[0]).toBe(20);
  expect(sliceUnits(units, width, WORLD).length).toBe(units.length);
});

test('wraps across the antimeridian and stays sorted so years can be merged', () => {
  const slice = sliceUnits(units, width, { west: 150, south: 0, east: 200, north: 80 });
  expect(cellsOf(slice)).toEqual([cell(1, 0), cell(1, 7)]);
  const ids = Array.from(slice.ids);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  expect(buildUnitMorph(slice, slice).length).toBe(slice.length);
});
