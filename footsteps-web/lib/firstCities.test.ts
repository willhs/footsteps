import { citiesBy, firstCityYear, FIRST_CITIES } from './firstCities';

test('central Mexico is not a city in the Late Archaic, but is by Teotihuacan', () => {
  expect(citiesBy(-99.1, 19.4, -3000)).toBe(false);
  expect(citiesBy(-99.1, 19.4, 0)).toBe(true);
});

test('the first regions have cities when their first towns stood', () => {
  expect(citiesBy(45.6, 31.3, -3500)).toBe(true); // Uruk
  expect(citiesBy(45.6, 31.3, -4000)).toBe(false);
  expect(firstCityYear(68.1, 27.3)).toBe(-2600); // Mohenjo-daro: the Indus, not the later Ganges date
  expect(firstCityYear(-77.5, -10.9)).toBe(-2600); // Caral
  expect(firstCityYear(-90.1, 38.7)).toBe(1000); // Cahokia
});

test('places with no listed region wait until 1500', () => {
  expect(firstCityYear(150, -33)).toBe(1500); // Sydney
});

test("no city in the catalogue stands before its region's first towns", () => {
  const catalogue = require('../public/settlements.json') as { cities: { name: string; lon: number; lat: number; observations: [number, number][] }[] };
  const early = catalogue.cities.filter((c) => c.observations[0][0] < firstCityYear(c.lon, c.lat)).map((c) => c.name);
  expect(early).toEqual([]);
});

test('every region names a source', () => {
  for (const r of FIRST_CITIES) expect(r.source.length).toBeGreaterThan(10);
});
