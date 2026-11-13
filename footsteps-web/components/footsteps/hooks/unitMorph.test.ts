import { buildUnits } from '../layers/units';
import { classifyCell } from '@/lib/waysOfLife';
import { buildUnitMorph } from './unitMorph';

const units = (people: number) =>
  buildUnits(
    new Uint32Array([42]),
    new Float32Array([10, 20]),
    new Float32Array([people]),
    0.1,
    new Uint8Array([classifyCell(people, 0, 0)]), // no land use: dense cells are settled
  );
const alpha = (colors: Uint8ClampedArray) =>
  Array.from(colors).filter((_, index) => index % 4 === 3);

test('persistent bands draw once at full alpha, with only gains and losses fading', () => {
  const small = units(60);
  const large = units(120);
  const growth = buildUnitMorph(small, large);
  expect(growth.length).toBe(4);
  expect(alpha(growth.attributes.getFillColor.value)).toEqual([200, 200, 0, 0]);
  expect(alpha(growth.attributes.getTargetFillColor.value)).toEqual([
    200, 200, 200, 200,
  ]);
  expect(growth.attributes.getPosition.value).toEqual(large.positions);
  expect(Array.from(growth.info.people)).toEqual([30, 30, 30, 30]);
  const decline = buildUnitMorph(large, small);
  expect(decline.length).toBe(4);
  expect(alpha(decline.attributes.getFillColor.value)).toEqual([
    200, 200, 200, 200,
  ]);
  expect(alpha(decline.attributes.getTargetFillColor.value)).toEqual([
    200, 200, 0, 0,
  ]);
  expect(Array.from(decline.info.people)).toEqual([30, 30, 0, 0]);
  expect(Array.from(decline.info.fromPeople)).toEqual([30, 30, 30, 30]);
  expect(Array.from(growth.info.fromPeople)).toEqual([30, 30, 0, 0]);
});

test('kind changes crossfade distinct marks and glow radii interpolate', () => {
  const change = buildUnitMorph(units(60), units(900));
  expect(change.length).toBe(5);
  expect(alpha(change.attributes.getFillColor.value)).toEqual([
    200, 200, 0, 0, 0,
  ]);
  expect(alpha(change.attributes.getTargetFillColor.value)).toEqual([
    0, 0, 150, 150, 150,
  ]);
  expect(Array.from(change.info.kind)).toEqual([0, 0, 1, 1, 1]);
  const glow = buildUnitMorph(units(40_000), units(160_000));
  expect(glow.length).toBe(1);
  expect(Array.from(glow.attributes.getRadius.value)).toEqual([9000]);
  expect(Array.from(glow.attributes.getTargetRadius.value)).toEqual([18000]);
  expect(Array.from(glow.attributes.getFillColor.value)).toEqual([
    60, 230, 255, 228,
  ]);
  expect(Array.from(glow.attributes.getTargetFillColor.value)).toEqual([
    60, 230, 255, 240,
  ]);
});
