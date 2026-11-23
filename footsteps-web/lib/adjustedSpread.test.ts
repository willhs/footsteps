import { ADJUSTED_SPREAD_LABEL, ADJUSTED_SPREAD_YEARS, adjustedGridUrl, adjustedSpreadYear, spreadNote, spreadParam, spreadTotalOk } from './adjustedSpread';
import { HYDE_TOTALS } from './time';
import { TARGET_YEARS } from './constants';

test('the flag is ?spread=1 and nothing else', () => {
  expect(spreadParam('?spread=1')).toBe(true);
  expect(spreadParam('?mode=grid&spread=1')).toBe(true);
  expect(spreadParam('')).toBe(false);
  expect(spreadParam('?spread=0')).toBe(false);
  expect(spreadParam('?spread=true')).toBe(false);
});

test('covers 10,000 to 4,000 BCE, every one a HYDE year with a world total', () => {
  expect(ADJUSTED_SPREAD_YEARS).toEqual([-10000, -9000, -8000, -7000, -6000, -5000, -4000]);
  for (const y of ADJUSTED_SPREAD_YEARS) {
    expect(TARGET_YEARS).toContain(y);
    expect(HYDE_TOTALS[y]).toBeGreaterThan(0);
  }
  expect(adjustedSpreadYear(-3000)).toBe(false);
  expect(adjustedSpreadYear(-11000)).toBe(false);
  expect(adjustedGridUrl(-6000)).toBe('/grid/adjusted/humans_-6000.webp?v=1');
});

test('the world total must be HYDE\'s, within rounding', () => {
  expect(spreadTotalOk(7.46e6, -8000)).toBe(true);
  expect(spreadTotalOk(7.46e6 * 1.004, -8000)).toBe(true);
  expect(spreadTotalOk(7.46e6 * 1.05, -8000)).toBe(false);
  expect(spreadTotalOk(7.46e6, -8500)).toBe(false); // no HYDE total for that year
});

describe('the note says what is drawn', () => {
  test('adjusted on screen: the label', () => {
    expect(spreadNote(-8000, 'units', true).label).toBe(ADJUSTED_SPREAD_LABEL);
    expect(spreadNote(-6000, 'grid', true).label).toBe('Adjusted spread (modelled on HYDE)');
    expect(spreadNote(-8000, 'units', true).title).toMatch(/world total is HYDE/);
  });
  test('Dots: not applied', () => {
    expect(spreadNote(-8000, 'dots', true).label).toBe('Adjusted spread: not applied to Dots');
  });
  test('outside its years: unchanged', () => {
    expect(spreadNote(-3000, 'units', undefined).label).toMatch(/10,000–4,000 BCE only/);
    expect(spreadNote(1900, 'grid', undefined).label).not.toMatch(/modelled on HYDE/);
  });
  test('the file could not be read: says HYDE is shown, never the label', () => {
    expect(spreadNote(-8000, 'units', false).label).toBe("Adjusted spread unavailable: showing HYDE's");
  });
  test('still loading', () => {
    expect(spreadNote(-8000, 'units', undefined).label).toMatch(/loading/);
  });
});
