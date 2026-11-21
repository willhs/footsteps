import { buildUnits } from '../layers/units';
import { LOOKS, WayOfLife, classifyCell, type WayOfLifeValue } from '@/lib/waysOfLife';
import { buildUnitMorph, cityRadiusM } from './unitMorph';
import { BAND_GREEN_CUT, VILLAGE_GREEN_CUT } from '../layers/unitMorphVertex';

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
  // Built-up area at CITY_PEOPLE_PER_M2: four times the people, twice the radius.
  expect(glow.attributes.getRadius.value[0]).toBeCloseTo(cityRadiusM(40_000), 1);
  expect(glow.attributes.getTargetRadius.value[0]).toBeCloseTo(2 * cityRadiusM(40_000), 1);
  expect(cityRadiusM(40_000)).toBeCloseTo(921.3, 0);
  expect(Array.from(glow.attributes.getFillColor.value)).toEqual([
    60, 230, 255, 228,
  ]);
  expect(Array.from(glow.attributes.getTargetFillColor.value)).toEqual([
    60, 230, 255, 240,
  ]);
});

test('the shader can tell every kind of group from its colour', () => {
  // unitMorphVertex.ts reads the kind back from the mark's colour: towns have red < 0.5, the warm kinds differ in green.
  const g = (way: WayOfLifeValue) => LOOKS[way].rgb[1] / 255;
  expect(LOOKS[WayOfLife.Urban].rgb[0] / 255).toBeLessThan(0.5);
  for (const way of [WayOfLife.Forager, WayOfLife.Farmer, WayOfLife.Herder]) expect(LOOKS[way].rgb[0] / 255).toBeGreaterThan(0.5);
  expect(g(WayOfLife.Farmer)).toBeGreaterThan(VILLAGE_GREEN_CUT);
  expect(g(WayOfLife.Forager)).toBeLessThan(VILLAGE_GREEN_CUT);
  expect(g(WayOfLife.Forager)).toBeGreaterThan(BAND_GREEN_CUT);
  expect(g(WayOfLife.Herder)).toBeLessThan(BAND_GREEN_CUT);
  // unorm8 rounding stays well clear of the cuts
  expect(Math.min(g(WayOfLife.Farmer) - VILLAGE_GREEN_CUT, VILLAGE_GREEN_CUT - g(WayOfLife.Forager))).toBeGreaterThan(0.02);
  expect(Math.min(g(WayOfLife.Forager) - BAND_GREEN_CUT, BAND_GREEN_CUT - g(WayOfLife.Herder))).toBeGreaterThan(0.02);
});
