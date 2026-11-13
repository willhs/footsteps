import { classifyCell, LOOKS, WayOfLife, SETTLED_MIN_CELL, URBAN_MIN_CELL } from './waysOfLife';

describe('classifyCell', () => {
  test('no land use means foragers: the 10,000 BCE and modelled case', () => {
    expect(classifyCell(40, 0, 0)).toBe(WayOfLife.Forager);
    expect(classifyCell(SETTLED_MIN_CELL - 1, 0, 0)).toBe(WayOfLife.Forager);
  });

  test('cropland makes farmers, and outranks the pasture HYDE puts round farms', () => {
    expect(classifyCell(200, 0.02, 0)).toBe(WayOfLife.Farmer);
    expect(classifyCell(200, 0.019, 0)).toBe(WayOfLife.Forager);
    expect(classifyCell(200, 0.3, 0.6)).toBe(WayOfLife.Farmer);
  });

  test('grazing without crops makes herders, at any density below a city', () => {
    expect(classifyCell(200, 0, 0.1)).toBe(WayOfLife.Herder);
    expect(classifyCell(200, 0.01, 0.09)).toBe(WayOfLife.Forager);
    expect(classifyCell(5000, 0, 0.5)).toBe(WayOfLife.Herder);
  });

  test('a crowded cell cannot be foragers even with no recorded land use', () => {
    expect(classifyCell(SETTLED_MIN_CELL, 0, 0)).toBe(WayOfLife.Farmer);
  });

  test('a city is a city whatever grows round it', () => {
    expect(classifyCell(URBAN_MIN_CELL, 0.9, 0)).toBe(WayOfLife.Urban);
    expect(classifyCell(URBAN_MIN_CELL - 1, 0.9, 0)).toBe(WayOfLife.Farmer);
  });
});

// unitMorphVertex.ts reads a mark's kind from its colour channels.
test('the palette keeps the channels the unit shader reads', () => {
  const g = (way: 0 | 1 | 2 | 3) => LOOKS[way].rgb[1] / 255;
  expect(LOOKS[WayOfLife.Urban].rgb[0] / 255).toBeLessThan(0.5);
  for (const way of [WayOfLife.Forager, WayOfLife.Herder, WayOfLife.Farmer])
    expect(LOOKS[way].rgb[0] / 255).toBeGreaterThanOrEqual(0.5); // only cities have red < 0.5
  expect(g(WayOfLife.Forager)).toBeLessThan(0.8);
  expect(g(WayOfLife.Herder)).toBeLessThan(0.8);
  expect(g(WayOfLife.Farmer)).toBeGreaterThanOrEqual(0.8);
});
