import { cardAnchor, formatPlace, hoverCardRows, lonLatAt } from './hoverCard';
import type { HabitatCell } from './habitat';

const land = (biome: string, tempC: number, precipMm: number): HabitatCell => ({ surface: 'land', biome, tempC, precipMm });
const sea: HabitatCell = { surface: 'sea', biome: null, tempC: null, precipMm: null };
const ice: HabitatCell = { surface: 'ice', biome: null, tempC: -22.5, precipMm: 140 };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('hover card rows', () => {
  test('ancient land: habitat and climate are modelled, people are modelled with no way of life', () => {
    const rows = hoverCardRows({
      time: -80_000,
      habitat: land('Tropical savanna', 24.4, 812),
      today: land('Tropical savanna', 26.1, 1000),
      people: { count: 3.4, evidence: 'modelled', cellDeg: 0.5 },
      landUse: null,
    });
    expect(ids(rows)).toEqual(['habitat', 'climate', 'people']);
    expect(rows[0]).toMatchObject({ text: 'Tropical savanna', evidence: 'modelled' });
    expect(rows[0].detail).toMatch(/^global sea −\d+ m$/);
    expect(rows[1].text).toBe('24.4 °C · 810 mm rain a year');
    expect(rows[1].detail).toBe('vs today −1.7 °C, rain −19%');
    expect(rows[2]).toMatchObject({ text: '≈ 3 people', detail: 'in this ~55 km block', evidence: 'modelled' });
  });

  test('HYDE era: people are measured, way of life follows land use', () => {
    const rows = hoverCardRows({
      time: 1500,
      habitat: land('Temperate deciduous forest', 9.5, 640),
      today: land('Temperate deciduous forest', 9.5, 640),
      people: { count: 1234, evidence: 'measured', cellDeg: 360 / 4320 },
      landUse: { crop: 0.31, grazing: 0.002 },
    });
    expect(ids(rows)).toEqual(['habitat', 'climate', 'people', 'life']);
    expect(rows[1].detail).toBe('same as today');
    expect(rows[2]).toMatchObject({ text: '≈ 1,200 people', detail: 'in this ~10 km cell', evidence: 'measured' });
    expect(rows[3]).toMatchObject({ text: 'Farming', detail: '31% cropland, <1% grazing', evidence: 'modelled' });
  });

  test('open sea with nobody in it is just the sea', () => {
    const rows = hoverCardRows({
      time: -20_000,
      habitat: sea,
      today: sea,
      people: { count: 0, evidence: 'modelled', cellDeg: 0.5 },
      landUse: null,
    });
    expect(ids(rows)).toEqual(['habitat']);
    expect(rows[0].text).toBe('Open sea');
  });

  test('ice shows its climate and says no one was modelled', () => {
    const rows = hoverCardRows({
      time: -20_000,
      habitat: ice,
      today: land('Dwarf shrub tundra', -8, 300),
      people: { count: 0, evidence: 'modelled', cellDeg: 0.5 },
      landUse: null,
    });
    expect(rows.map((r) => r.text)).toEqual(['Land ice', '−22.5 °C · 140 mm rain a year', 'No one modelled']);
  });

  test('before the lookup has loaded the card still shows people', () => {
    const rows = hoverCardRows({
      time: 1000,
      habitat: null,
      today: null,
      people: { count: 0, evidence: 'measured', cellDeg: 360 / 4320 },
      landUse: null,
    });
    expect(rows).toEqual([expect.objectContaining({ id: 'people', text: 'No one counted' })]);
  });

  test('no way of life where no one lives', () => {
    const rows = hoverCardRows({
      time: 1000,
      habitat: land('Desert', 20, 30),
      today: null,
      people: { count: 0, evidence: 'measured', cellDeg: 0.08 },
      landUse: { crop: 0, grazing: 0 },
    });
    expect(ids(rows)).toEqual(['habitat', 'climate', 'people']);
  });
});

test('place is rough lat/lon', () => {
  expect(formatPlace(-60.04, -3.2)).toBe('3.2°S 60.0°W');
  expect(formatPlace(30.26, 10.01)).toBe('10.0°N 30.3°E');
});

test('the card grows away from the nearer edges', () => {
  expect(cardAnchor(100, 100, 1000, 800)).toEqual({ left: 116, top: 116 });
  expect(cardAnchor(900, 700, 1000, 800)).toEqual({ right: 116, bottom: 116 });
});

test('the card goes above the cursor when it would not fit below', () => {
  expect(cardAnchor(100, 300, 1000, 800)).toEqual({ left: 116, top: 316 });
  expect(cardAnchor(100, 500, 1000, 800)).toEqual({ left: 116, bottom: 316 });
});

test('in a short window the card is pinned inside it', () => {
  expect(cardAnchor(100, 310, 1000, 640)).toEqual({ left: 116, top: 272 });
  expect(cardAnchor(100, 10, 1000, 300)).toEqual({ left: 116, top: 8 });
});

describe('lonLatAt', () => {
  // A flat 1 px per degree map, 360 px wide, origin at the top-left.
  const flat = {
    unproject: ([x, y]: [number, number]) => [x - 180, 90 - y],
    project: ([lon, lat]: [number, number]) => [lon + 180, 90 - lat],
  };
  // A globe whose limb clamps: pixels beyond x = 300 come back as the nearest limb point.
  const globe = {
    unproject: ([x, y]: [number, number]) => [Math.min(x, 300) - 180, 90 - y],
    project: ([lon, lat]: [number, number]) => [lon + 180, 90 - lat],
  };
  test('returns the coordinate where the pixel is on the map', () => {
    expect(lonLatAt(flat, 200, 90)).toEqual([20, 0]);
    expect(lonLatAt(globe, 250, 90)).toEqual([70, 0]);
  });
  test('returns null in space beyond the limb', () => {
    expect(lonLatAt(globe, 340, 90)).toBeNull();
  });
  test('returns null for no viewport, non-finite or polar-overshoot results', () => {
    expect(lonLatAt(undefined, 1, 1)).toBeNull();
    expect(lonLatAt({ ...flat, unproject: () => [NaN, 0] }, 1, 1)).toBeNull();
    expect(lonLatAt(flat, 10, -10)).toBeNull(); // 100°N
  });
});

describe('animals row', () => {
  const base = { time: -20_000, habitat: land('Tundra', -10, 300), today: land('Tundra', -8, 300), people: null, landUse: null };

  test('lists the animals on land, labelled modelled', () => {
    const rows = hoverCardRows({ ...base, animals: ['mammoth', 'reindeer', 'wolf'] });
    expect(rows[rows.length - 1]).toMatchObject({ id: 'animals', text: 'mammoth, reindeer, wolf', evidence: 'modelled' });
  });

  test('no row while loading, with none modelled, or over sea and ice', () => {
    expect(ids(hoverCardRows({ ...base, animals: null }))).not.toContain('animals');
    expect(ids(hoverCardRows({ ...base, animals: [] }))).not.toContain('animals');
    expect(ids(hoverCardRows({ ...base, habitat: sea, animals: ['wolf'] }))).not.toContain('animals');
    expect(ids(hoverCardRows({ ...base, habitat: ice, animals: ['wolf'] }))).not.toContain('animals');
  });
});
