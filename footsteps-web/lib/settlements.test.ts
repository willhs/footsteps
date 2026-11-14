import { allocateCities, blendCities, cityPopulation, type HistoricalCity, type SettlementCatalog } from './settlements';
import type { GridData } from '@/components/footsteps/hooks/gridData';
import { prepareYearGrid } from '@/components/footsteps/hooks/gridData';
import { buildSettlementUnits } from '@/components/footsteps/layers/settlementUnits';
import { sliceUnits, WORLD } from '@/components/footsteps/hooks/unitRegion';
import { buildUnitMorph } from '@/components/footsteps/hooks/unitMorph';
import { cellOffset } from './habitat';

const city: HistoricalCity = { id: 'a', name: 'Known city', lat: 0.05, lon: 0.05, source: 'test', observations: [[0, 100], [100, 200], [1000, 400]] };
function grid(populations = [60, 80]): GridData {
  const ids = populations.map((_, i) => 899 * 3600 + 1800 + i);
  return { length: ids.length, cellIds: new Uint32Array(ids),
    positions: new Float32Array(ids.flatMap((_, i) => [0.05 + i * 0.1, 0.05])),
    people: new Float32Array(populations), ways: new Uint8Array(ids.length), cellDeg: 0.1,
    total: populations.reduce((a, b) => a + b, 0) };
}
function catalog(size = 30): SettlementCatalog {
  const profile = { components: [{ weight: 1, size, moves: 10, pattern: 1, mode: 'mobile' as const, society: 'observed society' }], storage: null };
  return { version: 1, cities: [], regions: { '17,36': [profile, profile, profile, profile] }, climate: {} };
}
const sum = (values: Float32Array) => Array.from(values).reduce((a, b) => a + b, 0);

test('city dates interpolate within support, never bridge large gaps or extrapolate', () => {
  expect([-1, 0, 50, 100, 500, 1000, 1001].map((year) => cityPopulation(city, year)))
    .toEqual([0, 100, 150, 200, 0, 400, 0]);
});

test('overlapping city claims debit cells once and expose shortfall without mutating the grid', () => {
  const data = grid();
  const result = allocateCities(data, [city, { ...city, id: 'b' }], 0);
  expect(result.cities.map((c) => c.people)).toEqual([100, 40]);
  expect(result.cities.map((c) => c.requested)).toEqual([100, 100]);
  expect(Array.from(result.residual.people)).toEqual([0, 0]);
  expect(Array.from(data.people)).toEqual([60, 80]);
  expect(result.cities[0].position).toEqual([0.05, 0.05]);
});

test('a city cannot drain a remote cell and the full budget is conserved', () => {
  const data = grid();
  data.positions[2] = 30;
  const result = allocateCities(data, [city], 0);
  expect(result.cities[0].people).toBe(60);
  expect(sum(result.residual.people)).toBe(80);
  expect(sum(result.residual.people) + result.cities[0].people).toBe(140);
});

test('city and residual interpolation retain the same budget halfway through a transition', () => {
  const before = allocateCities(grid([200, 200]), [city], 0);
  const after = allocateCities(grid([300, 300]), [city], 100);
  const cities = blendCities(before.cities, after.cities, 0.5);
  expect(cities[0].people).toBe(150);
  expect((sum(before.residual.people) + sum(after.residual.people)) / 2 + cities[0].people).toBe(500);
});

test('long-tail groups conserve sparse and dense cells and retain sorted stable IDs for slicing and morphs', () => {
  const data = grid([0.25, 600]);
  const units = buildSettlementUnits(data, catalog(), 0, null);
  expect(units.people[0]).toBe(0.25);
  expect(sum(units.people)).toBeCloseTo(600.25, 3);
  expect(new Set(units.people.slice(1)).size).toBeGreaterThan(1);
  expect(Array.from(units.ids)).toEqual([...units.ids].sort((a, b) => a - b));
  expect(new Set(units.ids).size).toBe(units.length);
  expect(sum(sliceUnits(units, 3600, WORLD).people)).toBeCloseTo(600.25, 3);
  const grown = buildSettlementUnits(grid([0.25, 900]), catalog(), 0, null);
  expect(grown.positions).toEqual(units.positions);
  const morph = buildUnitMorph(units, grown, true);
  expect(sum(morph.info.people)).toBeCloseTo(900.25, 3);
  expect(sum(morph.info.fromPeople)).toBeCloseTo(600.25, 3);
});

test('regional size analog changes counts without changing population or the default path', () => {
  const data = grid([120, 120]);
  expect(buildSettlementUnits(data, catalog(30), 0, null).length).toBe(8);
  expect(buildSettlementUnits(data, catalog(120), 0, null).length).toBe(2);
  const baseline = prepareYearGrid(0, data);
  const modelled = prepareYearGrid(0, data, { catalog: { ...catalog(), cities: [city] }, habitat: null });
  expect(sum(baseline.units.people)).toBe(240);
  expect(sum(modelled.units.people) + modelled.cities![0].people).toBeCloseTo(240, 4);
  expect(modelled.gridPoints).toEqual(baseline.gridPoints);
  expect(modelled.data).toEqual(baseline.data);
});

test('Beyer climate chooses a different forager residential scenario, including sedentary mobility', () => {
  const data = grid([120]);
  const mobile = catalog(30).regions['17,36'][0];
  const settled = { components: [{ weight: 1, size: 120, moves: 0, pattern: null, mode: 'settled' as const, society: 'aquatic analog' }], storage: null };
  const input: SettlementCatalog = { ...catalog(), climate: { '20,0': mobile, '25,0': settled } };
  const habitat = new Uint8ClampedArray(720 * 360 * 4);
  const offset = cellOffset(0.05, 0.05);
  habitat.set([4, 141, 1, 255], offset); // 20 C, no rain
  const a = buildSettlementUnits(data, input, -21000, habitat);
  habitat[offset + 1] = 151; // 25 C
  const b = buildSettlementUnits(data, input, -21000, habitat);
  expect(a.length).toBe(4);
  expect(b.length).toBe(1);
  expect(sum(a.people)).toBeCloseTo(120, 4);
  expect(Array.from(b.people)).toEqual([120]);
  expect(Array.from(b.mobility!)).toEqual([0]);
  expect(Array.from(sliceUnits(b, 3600, WORLD).mobility!)).toEqual([0]);
  const morph = buildUnitMorph(b, b, true);
  expect(Array.from(morph.attributes.getMobility.value)).toEqual([0, 0]);
});
