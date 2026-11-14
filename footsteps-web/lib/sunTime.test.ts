import { partOfDay, sunHours, sunTimeLabel } from './sunTime';

const noonUtc = new Date(Date.UTC(2026, 10, 14, 12, 0, 0));

test('sun time is UTC plus four minutes per degree east', () => {
  expect(sunHours(0, noonUtc)).toBeCloseTo(12);
  expect(sunHours(90, noonUtc)).toBeCloseTo(18);
  expect(sunHours(-90, noonUtc)).toBeCloseTo(6);
  expect(sunHours(180, noonUtc)).toBeCloseTo(0);
  expect(sunHours(-179, new Date(Date.UTC(2026, 10, 14, 0, 0, 0)))).toBeCloseTo(24 - 179 / 15);
});

test('labels read as a clock and a part of the day', () => {
  expect(sunTimeLabel(0, noonUtc)).toBe('12:00 pm · midday');
  expect(sunTimeLabel(55, noonUtc)).toBe('3:40 pm · afternoon');
  expect(sunTimeLabel(-180, noonUtc)).toBe('12:00 am · night');
  expect(partOfDay(6)).toBe('dawn');
  expect(partOfDay(18.5)).toBe('dusk');
});
