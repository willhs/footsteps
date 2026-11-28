import { continentAt, continentId, HOLOCENE_SHARE_YEARS, shareFactors } from './holoceneShares';
import table from './holoceneShares.json';
import { gridDataFrom } from '@/components/footsteps/hooks/gridData';

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
  expect(shareFactors(-14000, 720, 360)).toBeNull();
  expect(shareFactors(-10000, 3, 1)).toBeNull(); // not a whole-world grid
});

test('10,000 BCE: Africa gains and the Americas lose against HYDE, West Asia is kept', () => {
  const f = (table as { factors: Record<string, Record<string, number>> }).factors['-10000'];
  expect(f.africa).toBeGreaterThan(4);
  expect(f.north_america).toBeLessThan(0.6);
  expect(f.south_america).toBeLessThan(1);
  expect(f.west_asia).toBeCloseTo(1, 6);
});

test('the shares fade toward HYDE: factors move toward 1 year by year after 10,000 BCE', () => {
  const f = (table as { factors: Record<string, Record<string, number>> }).factors;
  const dist = (y: number) => Object.values(f[String(y)]).reduce((a, v) => a + Math.abs(Math.log(v)), 0);
  for (let y = -10000; y < -4000; y += 1000) expect(dist(y + 1000)).toBeLessThan(dist(y));
});

test('decoding applies the multipliers and keeps the image\'s world total', () => {
  const LOG_MAX = Math.log1p(5_000_000);
  const width = 720;
  const height = 360;
  const data = new Uint8ClampedArray(width * height * 4);
  const q = Math.round((Math.log1p(1000) / LOG_MAX) * 1023);
  const put = (lon: number, lat: number) => {
    const i = Math.floor((90 - lat) * 2) * width + Math.floor((lon + 180) * 2);
    data[i * 4] = q >> 8; data[i * 4 + 1] = q & 255;
  };
  put(36.8, -1.3); // Africa
  put(-99.1, 19.4); // North America
  const before = gridDataFrom(-3000, { width, height, data }, null); // no row: as decoded
  const after = gridDataFrom(-10000, { width, height, data }, null);
  expect(after.total).toBeCloseTo(before.total, 3);
  const africa = (g: typeof after) => g.people.filter((_, i) => g.positions[i * 2] > 0).reduce((a, b) => a + b, 0);
  expect(africa(after)).toBeGreaterThan(africa(before) * 1.5);
});
