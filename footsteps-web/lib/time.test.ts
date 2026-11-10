import { TARGET_YEARS, TERRAIN_YEARS } from './constants';
import {
  HYDE_TOTALS,
  bracket,
  dataStatus,
  livesFraction,
  nearestDataYear,
  populationAt,
  terrainBracket,
  timeAtLivesFraction,
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

  it('lives-lived scale is monotonic and invertible', () => {
    let last = -1;
    for (const y of TARGET_YEARS) {
      const q = livesFraction(y);
      expect(q).toBeGreaterThanOrEqual(last);
      last = q;
      expect(Math.abs(timeAtLivesFraction(q) - y)).toBeLessThan(10);
    }
    expect(livesFraction(TARGET_YEARS[0])).toBe(0);
    expect(livesFraction(TARGET_YEARS[TARGET_YEARS.length - 1])).toBeCloseTo(1, 5);
  });

  it('brackets terrain images: 1,000-year steps BCE, 100-year steps CE', () => {
    for (const y of TARGET_YEARS) expect(TERRAIN_YEARS).toContain(y);
    expect(terrainBracket(-5500)).toEqual({ y0: -6000, y1: -5000, f: 0.5 });
    expect(terrainBracket(1850)).toEqual({ y0: 1800, y1: 1900, f: 0.5 });
    expect(terrainBracket(1900)).toMatchObject({ y0: 1800, y1: 1900, f: 1 });
  });
});
