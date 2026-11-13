import meta from '../public/habitat_meta.json';
import {
  cellOffset,
  climateChange,
  decodePrecip,
  decodeTemp,
  habitatStep,
  readHabitat,
  readLandUse,
  wayOfLife,
} from './habitat';

/** A blank decoded image (RGBA) with one cell set. */
function image(lon: number, lat: number, [r, g, b]: [number, number, number]) {
  const rgba = new Uint8ClampedArray(meta.width * meta.height * 4);
  const o = cellOffset(lon, lat);
  rgba.set([r, g, b, 255], o);
  return rgba;
}

describe('habitat step', () => {
  test('is the nearest 1,000-year step before 1950, like habitat_lookup.year_to_ka', () => {
    expect(habitatStep(-80_000)).toBe(82);
    expect(habitatStep(-20_000)).toBe(22);
    expect(habitatStep(1500)).toBe(0);
    expect(habitatStep(1900)).toBe(0);
    expect(habitatStep(0)).toBe(2);
    expect(habitatStep(-100_000)).toBe(102);
  });
  test('is clamped to the series', () => {
    expect(habitatStep(2600)).toBe(0);
    expect(habitatStep(-500_000)).toBe(meta.maxKa);
  });
});

describe('cell lookup', () => {
  test('maps the corners of the image', () => {
    expect(cellOffset(-179.9, 89.9)).toBe(0);
    expect(cellOffset(179.9, -89.9)).toBe((meta.width * meta.height - 1) * 4);
  });
  test('wraps longitude and clamps latitude', () => {
    expect(cellOffset(180.1, 0)).toBe(cellOffset(-179.9, 0));
    expect(cellOffset(0, 90)).toBe(cellOffset(0, 89.9));
    expect(cellOffset(0, -90)).toBe(cellOffset(0, -89.9));
  });
  test('central Amazon is row 186, column 239', () => {
    expect(cellOffset(-60.1, -3.1)).toBe((186 * meta.width + 239) * 4);
  });
});

describe('byte decoding (same pairs as test_habitat_lookup.py)', () => {
  test('temperature', () => {
    expect([1, 101, 255].map(decodeTemp)).toEqual([-50, 0, 77]);
  });
  test('precipitation', () => {
    expect(decodePrecip(1)).toBe(0);
    expect(decodePrecip(255)).toBeCloseTo(10_000, 3);
  });
});

describe('readHabitat', () => {
  test('land: biome name and decoded climate', () => {
    const cell = readHabitat(image(30, 10, [12, 141, 150]), 30, 10);
    expect(cell.surface).toBe('land');
    expect(cell.biome).toBe('Tropical savanna');
    expect(cell.tempC).toBe(20);
    expect(cell.precipMm).toBeGreaterThan(0);
  });
  test('sea has no biome name; byte 0 climate is unknown, not 0', () => {
    const cell = readHabitat(image(0, 0, [0, 0, 0]), 0, 0);
    expect(cell).toEqual({ surface: 'sea', biome: null, tempC: null, precipMm: null });
  });
  test('ice is its own surface', () => {
    const cell = readHabitat(image(0, 80, [meta.iceBiome, 51, 40]), 0, 80);
    expect(cell.surface).toBe('ice');
    expect(cell.biome).toBeNull();
    expect(cell.tempC).toBe(-25);
  });
});

test('land use shares', () => {
  const use = readLandUse(image(5, 5, [51, 255, 0]), 5, 5);
  expect(use.crop).toBeCloseTo(0.2);
  expect(use.grazing).toBe(1);
});

describe('climate change against today', () => {
  const cell = (tempC: number | null, precipMm: number | null) => ({ surface: 'land' as const, biome: null, tempC, precipMm });
  test('differences, with rain as a percentage', () => {
    const c = climateChange(cell(2, 300), cell(10, 600));
    expect(c?.tempC).toBe(-8);
    expect(c?.precipPct).toBe(-50);
  });
  test('no rain percentage where today is a desert', () => {
    expect(climateChange(cell(25, 50), cell(24, 5))?.precipPct).toBeNull();
  });
  test('nothing to compare when today has no cell or no values', () => {
    expect(climateChange(cell(1, 1), null)).toBeNull();
    expect(climateChange(cell(1, 1), cell(null, null))).toBeNull();
  });
});

describe('way of life', () => {
  test.each([
    [{ crop: 0.3, grazing: 0.1 }, 'Farming'],
    [{ crop: 0.01, grazing: 0.4 }, 'Herding and grazing'],
    [{ crop: 0.01, grazing: 0.05 }, 'Foraging, with a little farming or herding'],
    [{ crop: 0, grazing: 0 }, 'Foraging'],
  ])('%j -> %s', (use, label) => {
    expect(wayOfLife(use)).toBe(label);
  });
});
