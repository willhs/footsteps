import { HOUSEHOLD_SIZES, householdSizeFor, householdsOf } from './households';

describe('household sizes', () => {
  it('shares sum to 1 and average Binford\'s 4.48 (Hamilton et al. 2007 CI 4.31-4.67)', () => {
    expect(HOUSEHOLD_SIZES.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 10);
    const mean = HOUSEHOLD_SIZES.reduce((s, [n, p]) => s + n * p, 0);
    expect(mean).toBeGreaterThan(4.31);
    expect(mean).toBeLessThan(4.67);
  });

  it('draws sizes in proportion to the shares', () => {
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += householdSizeFor((i + 0.5) / n);
    expect(sum / n).toBeCloseTo(HOUSEHOLD_SIZES.reduce((s, [k, p]) => s + k * p, 0), 1);
  });
});

describe('householdsOf', () => {
  const take = (seed: number, n: number) => {
    const out = [];
    for (const h of householdsOf(seed, 40)) {
      out.push(h);
      if (out.length === n) break;
    }
    return out;
  };

  it('is a pure function of the seed, and the first n households never depend on how many are asked for', () => {
    expect(take(7, 10)).toEqual(take(7, 10));
    expect(take(7, 30).slice(0, 10)).toEqual(take(7, 10));
    expect(take(7, 5)).not.toEqual(take(8, 5));
  });

  it('puts household 0 on the spot and keeps the rest apart (no two on top of each other)', () => {
    const hs = take(99, 60);
    expect(Math.hypot(hs[0].x, hs[0].y)).toBeLessThan(1e-9 + 40 * 0.15);
    let nearest = Infinity;
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) nearest = Math.min(nearest, Math.hypot(hs[i].x - hs[j].x, hs[i].y - hs[j].y));
    expect(nearest).toBeGreaterThan(15);
  });
});
