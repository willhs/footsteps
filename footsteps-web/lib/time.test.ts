import { TARGET_YEARS, TERRAIN_YEARS } from './constants';
import {
  HYDE_MIN,
  HYDE_TOTALS,
  TIME_MIN,
  bracket,
  dataStatus,
  nearestDataYear,
  populationAt,
  terrainBracket,
} from './time';

describe('continuous time', () => {
  it('has a total for every data year', () => {
    for (const y of TARGET_YEARS) expect(HYDE_TOTALS[y]).toBeGreaterThan(0);
  });

  it('brackets a year between its data years', () => {
    expect(bracket(1350)).toEqual({ y0: 1300, y1: 1400, f: 0.5 });
    expect(bracket(-10000)).toMatchObject({ y0: -10000, f: 0 });
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

  it('reaches back to 100,000 BCE, with people data only from HYDE_MIN', () => {
    expect(TIME_MIN).toBe(-100000);
    expect(HYDE_MIN).toBe(-10000);
    expect(populationAt(-20000)).toBe(0);
    expect(populationAt(HYDE_MIN)).toBeCloseTo(HYDE_TOTALS[-10000], -3);
    expect(bracket(-50000)).toMatchObject({ y0: -10000, f: 0 });
    expect(terrainBracket(-50500)).toEqual({ y0: -51000, y1: -50000, f: 0.5 });
  });

  it('brackets terrain images: 1,000-year steps BCE, 100-year steps CE', () => {
    for (const y of TARGET_YEARS) expect(TERRAIN_YEARS).toContain(y);
    expect(terrainBracket(-5500)).toEqual({ y0: -6000, y1: -5000, f: 0.5 });
    expect(terrainBracket(1850)).toEqual({ y0: 1800, y1: 1900, f: 0.5 });
    expect(terrainBracket(1900)).toMatchObject({ y0: 1800, y1: 1900, f: 1 });
  });
});
