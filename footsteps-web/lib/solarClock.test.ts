import { configureSolarClock, onSolarClockChange, resetSolarClock, setSolarClockAt, solarClockBent, solarClockParams, solarNowMs } from './solarClock';

afterEach(() => {
  resetSolarClock();
  jest.useRealTimers();
});

describe('the sun clock', () => {
  it('is the real time unless the URL bends it', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?routine=1');
    expect(solarClockBent()).toBe(false);
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 9, 30));
  });

  it('?utc= starts at that hour of today and then runs in real time', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?utc=3.5');
    expect(solarClockBent()).toBe(true);
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 3, 30));
    jest.advanceTimersByTime(90_000);
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 3, 31, 30));
  });

  it('?warp= speeds it up, from now or from ?utc=', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?utc=6&warp=60');
    jest.advanceTimersByTime(60_000);
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 7, 0));
    configureSolarClock('?warp=3600');
    jest.advanceTimersByTime(1000);
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 9, 31, 0) + 3_600_000);
  });

  it('ignores nonsense and keeps running when asked again with the same string', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?utc=abc&warp=-4');
    expect(solarClockBent()).toBe(false);
    configureSolarClock('?utc=1');
    jest.advanceTimersByTime(60_000);
    configureSolarClock('?utc=1');
    expect(solarNowMs()).toBe(Date.UTC(2026, 10, 20, 1, 1));
  });
});

describe('the time-of-day dial on the sun clock', () => {
  it('stops the clock at the dial instant, over any URL bend, and tells the listeners', () => {
    jest.useFakeTimers().setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    configureSolarClock('?warp=60');
    const heard = jest.fn();
    const stop = onSolarClockChange(heard);
    setSolarClockAt(Date.UTC(2024, 3, 22, 22));
    jest.advanceTimersByTime(60_000);
    expect(solarNowMs()).toBe(Date.UTC(2024, 3, 22, 22));
    expect(solarClockBent()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    setSolarClockAt(Date.UTC(2024, 3, 22, 22));
    expect(heard).toHaveBeenCalledTimes(1); // the same instant again is not news
    stop();
    setSolarClockAt(Date.UTC(2024, 3, 22, 23));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('knows when a URL sets the clock', () => {
    expect(solarClockParams('?utc=3')).toBe(true);
    expect(solarClockParams('?warp=60')).toBe(true);
    expect(solarClockParams('?still=1')).toBe(false);
    expect(solarClockParams('?year=-5000&hour=22')).toBe(false);
  });
});
