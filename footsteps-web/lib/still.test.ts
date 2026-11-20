import { configureSolarClock, resetSolarClock, solarClockBent, solarNowMs } from './solarClock';
import { STILL_DAY_UTC_MS, STILL_SECONDS, animSeconds, resetStill, stillRequested } from './still';

afterEach(() => {
  resetSolarClock();
  resetStill();
  jest.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('?still=1', () => {
  it('is asked for only by ?still=1', () => {
    expect(stillRequested('?still=1')).toBe(true);
    expect(stillRequested('?year=-3000&still=1')).toBe(true);
    expect(stillRequested('')).toBe(false);
    expect(stillRequested('?still=0')).toBe(false);
  });

  it('gives the shader clock one instant, however long the page has run', () => {
    window.history.replaceState(null, '', '/?still=1');
    const a = animSeconds(1000);
    jest.spyOn(performance, 'now').mockReturnValue(999_000);
    expect(animSeconds(1000)).toBe(a);
    expect(a).toBe(STILL_SECONDS);
  });

  it('lets the shader clock run without it, wrapped', () => {
    jest.spyOn(performance, 'now').mockReturnValue(1_234_500);
    expect(animSeconds(1000)).toBeCloseTo(234.5);
  });

  it('stops the sun clock on a fixed day, at noon or at ?utc=', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?still=1');
    expect(solarNowMs()).toBe(STILL_DAY_UTC_MS + 12 * 3_600_000);
    jest.advanceTimersByTime(3_600_000);
    expect(solarNowMs()).toBe(STILL_DAY_UTC_MS + 12 * 3_600_000);
    expect(solarClockBent()).toBe(false); // nothing to redraw every second
    configureSolarClock('?still=1&utc=6.5');
    jest.advanceTimersByTime(3_600_000);
    expect(solarNowMs()).toBe(STILL_DAY_UTC_MS + 6.5 * 3_600_000);
  });
});
