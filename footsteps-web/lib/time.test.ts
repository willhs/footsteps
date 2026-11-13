import { MODELLED_YEARS, PEOPLE_YEARS, TARGET_YEARS, TERRAIN_YEARS } from './constants';
import {
  HYDE_MIN,
  HYDE_TOTALS,
  PEOPLE_TOTALS,
  TIME_MIN,
  bracket,
  dataStatus,
  evidenceAt,
  nearestDataYear,
  populationAt,
  populationRangeAt,
  populationRangeLabel,
  terrainBracket,
} from './time';

describe('continuous time', () => {
  it('has a total for every data year', () => {
    for (const y of TARGET_YEARS) expect(HYDE_TOTALS[y]).toBeGreaterThan(0);
  });

  it('brackets a year between its data years', () => {
    expect(bracket(1350)).toEqual({ y0: 1300, y1: 1400, f: 0.5 });
    expect(bracket(-10000)).toEqual({ y0: -11000, y1: -10000, f: 1 });
    expect(nearestDataYear(1349)).toBe(1300);
    expect(nearestDataYear(1351)).toBe(1400);
  });

  it('interpolates population geometrically and hits data years exactly', () => {
    for (const y of TARGET_YEARS) expect(populationAt(y)).toBeCloseTo(HYDE_TOTALS[y], -3);
    const mid = populationAt(-5500);
    expect(mid).toBeCloseTo(Math.sqrt(HYDE_TOTALS[-6000] * HYDE_TOTALS[-5000]), -3);
  });

  it('marks data years as data and the rest as estimates', () => {
    expect(dataStatus(1300).exact).toBe(true);
    expect(dataStatus(1350).exact).toBe(false);
  });

  it('reaches back to 100,000 BCE with a population at every moment, modelled before HYDE_MIN', () => {
    expect(TIME_MIN).toBe(-100000);
    expect(HYDE_MIN).toBe(-10000);
    expect(PEOPLE_YEARS[0]).toBe(TIME_MIN);
    expect(evidenceAt(-10001)).toBe('modelled');
    expect(evidenceAt(HYDE_MIN)).toBe('measured');
    expect(populationAt(-20000)).toBeGreaterThan(1e6);
    expect(populationAt(HYDE_MIN)).toBeCloseTo(HYDE_TOTALS[-10000], -3);
    expect(bracket(-50500)).toEqual({ y0: -51000, y1: -50000, f: 0.5 });
    expect(terrainBracket(-50500)).toEqual({ y0: -51000, y1: -50000, f: 0.5 });
  });

  it('has a low / central / high total for every people-image year, closing at the HYDE hand-over', () => {
    for (const y of PEOPLE_YEARS) {
      const t = PEOPLE_TOTALS[y];
      expect(t).toBeDefined();
      expect(t.low).toBeLessThanOrEqual(t.central);
      expect(t.central).toBeLessThanOrEqual(t.high);
    }
    expect(Object.keys(PEOPLE_TOTALS).map(Number).sort((a, b) => a - b)).toEqual([...PEOPLE_YEARS]);
    for (const y of TARGET_YEARS) expect(PEOPLE_TOTALS[y].low).toBe(PEOPLE_TOTALS[y].high);
    expect(PEOPLE_TOTALS[MODELLED_YEARS[0]].high).toBeGreaterThan(PEOPLE_TOTALS[MODELLED_YEARS[0]].low * 1.5);
  });

  it('has no jump in the total or the range across 10,000 BCE', () => {
    const before = populationRangeAt(-10010);
    const at = populationRangeAt(HYDE_MIN);
    for (const k of ['low', 'central', 'high'] as const) expect(Math.abs(before[k] / at[k] - 1)).toBeLessThan(0.01);
    // Over the last 1,000 modelled years the range narrows to HYDE's single figure.
    expect(populationRangeAt(-11000).high - populationRangeAt(-11000).low).toBeGreaterThan(
      populationRangeAt(-10500).high - populationRangeAt(-10500).low,
    );
  });

  it('words a range for the counter, and a single figure for measured years', () => {
    expect(populationRangeLabel({ low: 2.1e6, central: 3.7e6, high: 8.3e6 })).toBe('2.1–8.3 million');
    expect(populationRangeLabel({ low: 1.02e6, central: 2e6, high: 2.96e6 })).toBe('1–3 million');
    expect(populationRangeLabel({ low: 1.0e5, central: 2.0e5, high: 4.0e5 })).toBe('100–400 thousand');
    expect(populationRangeLabel(populationRangeAt(1500))).toBe('516 million');
    expect(populationRangeLabel(populationRangeAt(HYDE_MIN))).toBe('4.6 million');
  });

  it('brackets terrain images: 1,000-year steps BCE, 100-year steps CE', () => {
    for (const y of TARGET_YEARS) expect(TERRAIN_YEARS).toContain(y);
    expect(terrainBracket(-5500)).toEqual({ y0: -6000, y1: -5000, f: 0.5 });
    expect(terrainBracket(1850)).toEqual({ y0: 1800, y1: 1900, f: 0.5 });
    expect(terrainBracket(1900)).toMatchObject({ y0: 1800, y1: 1900, f: 1 });
  });
});
