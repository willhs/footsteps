import { MODELLED_YEARS, MODERN_YEARS, TARGET_YEARS } from './constants';
import { Y_MAX, Y_MIN, buildSeries, markerAt, yAt } from './populationSeries';
import { HYDE_MIN, HYDE_TOTALS, TIME_MAX, TIME_MIN, populationAt } from './time';
import { posAt, timeAt } from './timeScale';

describe('population chart series', () => {
  const { modelled, measured } = buildSeries();

  it('draws the measured line from HYDE_MIN with exactly HYDE totals, every HYDE year once', () => {
    expect(measured.map((p) => p.year)).toEqual([...TARGET_YEARS, ...MODERN_YEARS]);
    for (const p of measured) expect(p.people).toBe(HYDE_TOTALS[p.year]);
    expect(measured[0].year).toBe(HYDE_MIN);
  });

  it('draws the band for the modelled years, low <= central <= high', () => {
    expect(modelled.slice(0, -1).map((p) => p.year)).toEqual([...MODELLED_YEARS]);
    for (const p of modelled) {
      expect(p.low).toBeLessThanOrEqual(p.central);
      expect(p.central).toBeLessThanOrEqual(p.high);
    }
    expect(modelled.slice(0, -1).some((p) => p.high > p.low)).toBe(true); // a real range before HYDE
  });

  it('joins at HYDE_MIN without a gap or a double count', () => {
    const join = modelled[modelled.length - 1];
    const start = measured[0];
    // no gap: the band's last point is the line's first, same place on both axes
    expect(join.x).toBe(start.x);
    expect(join.low).toBe(start.people);
    expect(join.high).toBe(start.people);
    // no double count: HYDE_MIN is drawn once as a modelled year (the join), never as a modelled figure, and
    // no measured year sits left of it
    expect(modelled.filter((p) => p.year >= HYDE_MIN)).toHaveLength(1);
    expect(measured.filter((p) => p.year < HYDE_MIN)).toHaveLength(0);
    // the whole series is one strictly increasing run along x
    const xs = [...modelled, ...measured.slice(1)].map((p) => p.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(xs.length).toBe(MODELLED_YEARS.length + TARGET_YEARS.length + MODERN_YEARS.length);
  });

  it('keeps every point on the chart', () => {
    for (const p of modelled) {
      expect(yAt(p.low)).toBeGreaterThan(0);
      expect(yAt(p.high)).toBeLessThan(1);
    }
    for (const p of measured) expect(yAt(p.people)).toBeLessThan(1);
    expect(modelled[0].x).toBe(0);
    expect(measured[measured.length - 1].x).toBe(1);
  });
});

describe('population chart scales', () => {
  it('is logarithmic in people: equal ratios, equal heights', () => {
    const d1 = yAt(1e7) - yAt(1e6);
    const d2 = yAt(1e8) - yAt(1e7);
    const d3 = yAt(1e9) - yAt(1e8);
    expect(d1).toBeCloseTo(d2, 10);
    expect(d2).toBeCloseTo(d3, 10);
    expect(yAt(Y_MIN)).toBeCloseTo(0, 10);
    expect(yAt(Y_MAX)).toBeCloseTo(1, 10);
    expect(yAt(1)).toBe(0); // clamped
    expect(yAt(1e12)).toBe(1);
  });

  it('compresses time as the time bar does: the deep past is squeezed, the last 1,000 years stay readable', () => {
    expect(posAt(TIME_MIN)).toBeCloseTo(0, 10);
    expect(posAt(TIME_MAX)).toBeCloseTo(1, 10);
    const lastMillennium = posAt(TIME_MAX) - posAt(TIME_MAX - 1000);
    const oldestMillennium = posAt(TIME_MIN + 1000) - posAt(TIME_MIN);
    expect(lastMillennium).toBeGreaterThan(0.15); // 1000 of 101,900 years takes a fifth of the width...
    expect(oldestMillennium).toBeLessThan(0.002); // ...and the oldest 1000 a hair
    expect(lastMillennium / oldestMillennium).toBeGreaterThan(50);
  });
});

describe('population chart year marker', () => {
  it('sits at the slider year on both axes, using the counter population', () => {
    for (const t of [TIME_MIN, -50000, -10000, -5000, 0, 1347, TIME_MAX]) {
      const m = markerAt(t);
      expect(m.x).toBeCloseTo(posAt(t), 12);
      expect(m.y).toBeCloseTo(yAt(populationAt(t)), 12);
    }
  });

  it('is at the ends for the first and last year, and moves right as time goes on', () => {
    expect(markerAt(TIME_MIN).x).toBeCloseTo(0, 10);
    expect(markerAt(TIME_MAX).x).toBeCloseTo(1, 10);
    expect(markerAt(1000).x).toBeGreaterThan(markerAt(-1000).x);
  });

  it('a click at the marker position gives back the year (the chart sets the year with the bar scale)', () => {
    for (const t of [-90000, -50000, -5000, 0, 1500]) {
      expect(timeAt(markerAt(t).x)).toBeCloseTo(t, 6);
    }
  });

  it('is on the measured line at a HYDE year', () => {
    expect(markerAt(1900).y).toBeCloseTo(yAt(HYDE_TOTALS[1900]), 10);
  });
});
