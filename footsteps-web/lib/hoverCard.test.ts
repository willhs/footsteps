import { formatPlace, hoverCardRows, lonLatAt } from './hoverCard';
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

describe('regional group row (?settlements=1)', () => {
  const base = { time: 1500, habitat: null, today: null, people: null, landUse: null };
  it('says it is part of a regional group, modelled, only when one is given', () => {
    expect(hoverCardRows(base).some((r) => r.id === 'region')).toBe(false);
    expect(hoverCardRows({ ...base, region: null }).some((r) => r.id === 'region')).toBe(false);
    expect(hoverCardRows({ ...base, region: { people: 1234 } }).find((r) => r.id === 'region')).toMatchObject({
      text: 'Part of a regional group of about 1,200 people',
      evidence: 'modelled',
    });
  });
});

describe('largest settlement row (?settlements=1)', () => {
  const base = { time: 1000, habitat: null, today: null, people: null, landUse: null };
  it('only appears when given, in two figures, with the assumed exponent called imagined', () => {
    expect(hoverCardRows(base).some((r) => r.id === 'largest')).toBe(false);
    expect(hoverCardRows({ ...base, largest: null }).some((r) => r.id === 'largest')).toBe(false);
    const row = hoverCardRows({ ...base, largest: { people: 12_345, exponent: 0.9, city: null, blockKm: 150, bound: { kind: 'ceiling', capped: true } } }).find((r) => r.id === 'largest')!;
    expect(row).toMatchObject({ text: 'Largest settlement around here: about 12,000 people', evidence: 'modelled' });
    expect(row.detail).toContain('exponent 0.9 assumed (imagined)');
    expect(row.detail).toContain('150 km');
    expect(row.detail).toContain('capped at 5,000');
  });
  it('names a city when one is the biggest, without an exponent', () => {
    const row = hoverCardRows({ ...base, largest: { people: 450_000, exponent: 0.9, city: 'Rome', blockKm: 150, bound: { kind: 'block' } } }).find((r) => r.id === 'largest')!;
    expect(row.text).toBe('Largest settlement around here: Rome, about 450,000 people');
    expect(row.detail).not.toContain('exponent');
  });
});

describe('hover card language line', () => {
  const block = {
    tier: 'attested' as const,
    baseline_year: 1500,
    n_languages: 194,
    n_families: 5,
    families: [
      { glottocode: 'otom1299', name: 'Otomanguean', n: 165 },
      { glottocode: 'utoa1244', name: 'Uto-Aztecan', n: 17 },
      { glottocode: 'mixe1284', name: 'Mixe-Zoque', n: 8 },
      { glottocode: 'tequ1244', name: 'Tequistlatecan', n: 3 },
      { glottocode: 'huav1256', name: 'Huavean', n: 1 },
    ],
    nearest: [
      { glottocode: 'diux1235', name: 'Diuxi-Tilantongo Mixtec', family: 'Otomanguean', km: 20 },
      { glottocode: 'tida1235', name: 'Tidaá Mixtec', family: 'Otomanguean', km: 20 },
    ],
  };
  const at = (time: number, languages: typeof block | null = block) =>
    hoverCardRows({ time, habitat: land('Tropical savanna', 24, 800), today: null, people: null, landUse: null, languages });

  test.each([1500, 1900])('is shown at %i, labelled as the recorded baseline', (time) => {
    const row = at(time).find((r) => r.id === 'languages');
    expect(row?.text).toBe('Languages recorded here (about 1500 CE): Otomanguean 165, Uto-Aztecan 17, Mixe-Zoque 8 and 2 more families');
    expect(row?.detail).toContain('194 languages · nearest: Diuxi-Tilantongo Mixtec (20 km)');
    expect(row?.detail).toContain('colonial and later movement not applied');
    expect(row?.evidence).toBe('measured');
  });

  test.each([1499, 0, -3000, -80_000])('is never shown at %i, even when handed a block', (time) => {
    expect(ids(at(time))).not.toContain('languages');
  });

  test('absent while loading or off land; a cell with no point says so and names the nearest', () => {
    expect(ids(at(1500, null))).not.toContain('languages');
    const empty = { ...block, n_languages: 0, n_families: 0, families: [], nearest: [block.nearest[0]] };
    const row = at(1500, empty).find((r) => r.id === 'languages');
    expect(row?.text).toBe('No language recorded in this cell (about 1500 CE)');
    expect(row?.detail).toContain('nearest: Diuxi-Tilantongo Mixtec (20 km)');
  });
});
