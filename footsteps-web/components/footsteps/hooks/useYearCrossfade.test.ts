import { act, renderHook } from '@testing-library/react';
import useYearCrossfade from './useYearCrossfade';

describe('decoded year crossfade', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  test('holds the old snapshot while loading and blends for 300 ms', () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useYearCrossfade(snapshot),
      {
        initialProps: { snapshot: null as number | null },
      },
    );
    expect(result.current).toEqual([]);
    rerender({ snapshot: 100 });
    expect(result.current).toEqual([{ snapshot: 100, opacity: 1 }]);
    advance(500);
    expect(result.current).toEqual([{ snapshot: 100, opacity: 1 }]);
    rerender({ snapshot: 200 });
    advance(150);
    expect(result.current.map((f) => f.snapshot)).toEqual([100, 200]);
    expect(result.current[1].opacity).toBeCloseTo(0.5, 1);
    expect(result.current.reduce((sum, f) => sum + f.opacity, 0)).toBe(1);
    advance(170);
    expect(result.current).toEqual([{ snapshot: 200, opacity: 1 }]);
  });

  test('finishes an interrupted blend, skips superseded years and handles reversal', () => {
    const { result, rerender } = renderHook(
      ({ year }) => useYearCrossfade(year),
      {
        initialProps: { year: 100 },
      },
    );
    rerender({ year: 200 });
    advance(100);
    const before = result.current;
    rerender({ year: 300 });
    rerender({ year: 100 });
    expect(result.current.map((f) => f.snapshot)).toEqual([100, 200]);
    expect(result.current[1].opacity).toBeGreaterThanOrEqual(before[1].opacity);
    advance(220);
    expect(result.current.map((f) => f.snapshot)).toEqual([200, 100]);
    expect(result.current.reduce((sum, f) => sum + f.opacity, 0)).toBe(1);
    advance(320);
    expect(result.current).toEqual([{ snapshot: 100, opacity: 1 }]);
  });

  test('cancels animation when disabled or unmounted and starts cleanly on re-entry', () => {
    const { result, rerender, unmount } = renderHook(
      ({ year, enabled }) => useYearCrossfade(year, enabled),
      { initialProps: { year: 100, enabled: true } },
    );
    rerender({ year: 200, enabled: true });
    advance(100);
    rerender({ year: 200, enabled: false });
    expect(result.current).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    rerender({ year: 300, enabled: true });
    expect(result.current).toEqual([{ snapshot: 300, opacity: 1 }]);
    rerender({ year: 400, enabled: true });
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('keeps valid weights when an animation timestamp precedes the effect start', () => {
    let animate: FrameRequestCallback = () => {};
    const request = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animate = callback;
        return 1;
      });
    const { result, rerender } = renderHook(
      ({ year }) => useYearCrossfade(year),
      {
        initialProps: { year: 100 },
      },
    );
    rerender({ year: 200 });
    act(() => animate(performance.now() - 5));
    expect(result.current).toEqual([
      { snapshot: 100, opacity: 1 },
      { snapshot: 200, opacity: 0 },
    ]);
    request.mockRestore();
  });
});
