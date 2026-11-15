import { partOfDay, solarAltitude, sunHours, sunPosition, sunTimeLabel } from './sunTime';

const noonUtc = new Date(Date.UTC(2026, 10, 14, 12, 0, 0));

test('sun time is UTC plus four minutes per degree east', () => {
  expect(sunHours(0, noonUtc)).toBeCloseTo(12);
  expect(sunHours(90, noonUtc)).toBeCloseTo(18);
  expect(sunHours(-90, noonUtc)).toBeCloseTo(6);
  expect(sunHours(180, noonUtc)).toBeCloseTo(0);
  expect(sunHours(-179, new Date(Date.UTC(2026, 10, 14, 0, 0, 0)))).toBeCloseTo(24 - 179 / 15);
});

test('UTC noon and midnight put the sun on opposite meridians', () => {
  const noon = sunPosition(new Date('2026-03-20T12:00:00Z'));
  expect(noon.longitude).toBe(0);
  expect(noon.declination).toBeCloseTo(0, 0);
  expect(solarAltitude(0, 0, noon)).toBeCloseTo(1, 3);
  expect(solarAltitude(180, 0, noon)).toBeCloseTo(-1, 3);
  expect(solarAltitude(90, 0, noon)).toBeCloseTo(0, 6);
  expect(sunPosition(new Date('2026-03-20T00:00:00Z')).longitude).toBe(180);
});

test('solstices give opposite polar days and latitude-aware clock labels', () => {
  const june = new Date('2026-06-21T00:00:00Z');
  const december = new Date('2026-12-21T12:00:00Z');
  expect(sunPosition(june).declination).toBeCloseTo(23.44, 0);
  expect(sunPosition(december).declination).toBeCloseTo(-23.44, 0);
  expect(solarAltitude(0, 90, sunPosition(june))).toBeCloseTo(0.398, 2);
  expect(solarAltitude(0, -90, sunPosition(june))).toBeCloseTo(-0.398, 2);
  expect(sunTimeLabel(0, june, 80)).toBe('12:00 am · daylight');
  expect(sunTimeLabel(0, december, 80)).toBe('12:00 pm · night');
});

test('longitude wraps across the dateline and leap-day solar position stays continuous', () => {
  const before = sunPosition(new Date('2024-02-29T12:00:00Z'));
  const after = sunPosition(new Date('2024-03-01T12:00:00Z'));
  expect(before.declination).toBeCloseTo(-7.9, 0);
  expect(after.declination - before.declination).toBeCloseTo(0.38, 1);
  expect(solarAltitude(-180, 40, before)).toBeCloseTo(solarAltitude(180, 40, before), 10);
  expect(sunHours(360, noonUtc)).toBe(12);
});

test('labels read as a clock and a part of the day', () => {
  expect(sunTimeLabel(0, noonUtc)).toBe('12:00 pm · midday');
  expect(sunTimeLabel(55, noonUtc)).toBe('3:40 pm · afternoon');
  expect(sunTimeLabel(-180, noonUtc)).toBe('12:00 am · night');
  expect(partOfDay(6)).toBe('dawn');
  expect(partOfDay(18.5)).toBe('dusk');
});
