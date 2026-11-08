import { buildUnits } from '../layers/units';
import { buildUnitMorph } from './unitMorph';

const units = (people: number) =>
  buildUnits(
    new Uint32Array([42]),
    new Float32Array([10, 20]),
    new Float32Array([people]),
    0.1,
  );
const alpha = (colors: Uint8ClampedArray) =>
  Array.from(colors).filter((_, index) => index % 4 === 3);

test('persistent bands draw once at full alpha, with only gains and losses fading', () => {
  const small = units(60);
  const large = units(120);
  const growth = buildUnitMorph(small, large, 0);
  expect(growth.length).toBe(4);
  expect(alpha(growth.attributes.getFillColor.value)).toEqual([60, 60, 0, 0]);
  expect(alpha(growth.attributes.getTargetFillColor.value)).toEqual([
    60, 60, 60, 60,
  ]);
  expect(growth.attributes.getPosition.value).toEqual(large.positions);
  const decline = buildUnitMorph(large, small, 0);
  expect(decline.length).toBe(4);
  expect(alpha(decline.attributes.getFillColor.value)).toEqual([
    60, 60, 60, 60,
  ]);
  expect(alpha(decline.attributes.getTargetFillColor.value)).toEqual([
    60, 60, 0, 0,
  ]);
});

test('kind changes crossfade distinct marks and glow radii interpolate', () => {
  const change = buildUnitMorph(units(60), units(900), 1);
  expect(change.length).toBe(5);
  expect(alpha(change.attributes.getFillColor.value)).toEqual([
    110, 110, 0, 0, 0,
  ]);
  expect(alpha(change.attributes.getTargetFillColor.value)).toEqual([
    0, 0, 60, 60, 60,
  ]);
  const glow = buildUnitMorph(units(40_000), units(160_000), 2);
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
