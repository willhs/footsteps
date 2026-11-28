import { continentAt, continentId, HOLOCENE_SHARE_YEARS, shareFactors } from './holoceneShares';
import table from './holoceneShares.json';
import { gridDataFrom } from '@/components/footsteps/hooks/gridData';

const FACTORS = (table as { factors: Record<string, Record<string, number>> }).factors;

// grid_image.py's encoding: level = round(log1p(people) / log1p(MAX_PEOPLE) * LEVELS), stored as R << 8 | G.
const MAX_PEOPLE = 5_000_000;
const LEVELS = 1023;
const LOG_MAX = Math.log1p(MAX_PEOPLE);

const WORLD_WIDTH = 720; // the 0.5° grid
const WORLD_HEIGHT = 360;
const CELLS_PER_DEGREE = 2;

const at = (lon: number, lat: number) => continentId(continentAt(lon, lat));

test('places fall in the continent a reader expects (same boxes as holocene_shares.py)', () => {
  expect(at(36.8, -1.3)).toBe('africa'); // Nairobi
  expect(at(31.2, 30.0)).toBe('africa'); // Cairo, on the Nile, not West Asia
  expect(at(35.2, 31.8)).toBe('west_asia'); // Jerusalem
  expect(at(44.4, 33.3)).toBe('west_asia'); // Baghdad
  expect(at(32.9, 39.9)).toBe('west_asia'); // Ankara
  expect(at(-3.7, 40.4)).toBe('europe'); // Madrid
  expect(at(77.2, 28.6)).toBe('south_asia'); // Delhi
  expect(at(116.4, 39.9)).toBe('east_asia'); // Beijing
  expect(at(106.8, -6.2)).toBe('southeast_asia'); // Jakarta
  expect(at(151.2, -33.9)).toBe('sahul'); // Sydney
  expect(at(87.0, 55.0)).toBe('north_central_asia'); // Siberia
  expect(at(-99.1, 19.4)).toBe('north_america'); // Mexico City
  expect(at(-60.0, -3.1)).toBe('south_america'); // Manaus
  expect(at(-157.8, 21.3)).toBeNull(); // Honolulu: remote Pacific keeps its people as they are
});

test('a row for every hand-over and fade year, none from 3000 BCE', () => {
  expect(HOLOCENE_SHARE_YEARS).toEqual([-13000, -12000, -11000, -10000, -9000, -8000, -7000, -6000, -5000, -4000]);
  expect(shareFactors(-3000, 4320, 2160)).toBeNull();
  expect(shareFactors(-14000, WORLD_WIDTH, WORLD_HEIGHT)).toBeNull();
  expect(shareFactors(-10000, 3, 1)).toBeNull(); // not a whole-world grid
});

test('10,000 BCE: Africa gains and the Americas lose against HYDE, West Asia is kept', () => {
  const factors = FACTORS['-10000'];
  expect(factors.africa).toBeGreaterThan(4);
  expect(factors.north_america).toBeLessThan(0.6);
  expect(factors.south_america).toBeLessThan(1);
  expect(factors.west_asia).toBeCloseTo(1, 6);
});

test('the shares fade toward HYDE: factors move toward 1 year by year after 10,000 BCE', () => {
  // Summed |log factor|: 0 when every continent is left as HYDE has it.
  const distanceFromHyde = (year: number) =>
    Object.values(FACTORS[String(year)]).reduce((sum, factor) => sum + Math.abs(Math.log(factor)), 0);

  for (let year = -10000; year < -4000; year += 1000) {
    expect(distanceFromHyde(year + 1000)).toBeLessThan(distanceFromHyde(year));
  }
});

test("decoding applies the multipliers and keeps the image's world total", () => {
  const data = new Uint8ClampedArray(WORLD_WIDTH * WORLD_HEIGHT * 4);
  const level = Math.round((Math.log1p(1000) / LOG_MAX) * LEVELS); // a cell of 1,000 people

  const put = (lon: number, lat: number) => {
    const row = Math.floor((90 - lat) * CELLS_PER_DEGREE);
    const col = Math.floor((lon + 180) * CELLS_PER_DEGREE);
    const pixel = (row * WORLD_WIDTH + col) * 4;
    data[pixel] = level >> 8;
    data[pixel + 1] = level & 255;
  };
  put(36.8, -1.3); // Africa
  put(-99.1, 19.4); // North America

  const image = { width: WORLD_WIDTH, height: WORLD_HEIGHT, data };
  const before = gridDataFrom(-3000, image, null); // no row: as decoded
  const after = gridDataFrom(-10000, image, null);

  expect(after.total).toBeCloseTo(before.total, 3);

  const eastOfGreenwich = (grid: typeof after) =>
    grid.people.filter((_, i) => grid.positions[i * 2] > 0).reduce((sum, people) => sum + people, 0);
  expect(eastOfGreenwich(after)).toBeGreaterThan(eastOfGreenwich(before) * 1.5);
});
