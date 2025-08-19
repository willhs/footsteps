import { renderHook, act } from '@testing-library/react';
import useYearCrossfade, {
  YEAR_FADE_MS,
} from '@/components/footsteps/hooks/useYearCrossfade';

describe('useYearCrossfade', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('crossfades between years with expected timing', () => {
    const { result, rerender } = renderHook(
      ({ year }: { year: number }) => useYearCrossfade(year),
      {
        initialProps: { year: 1000 },
      },
    );

    expect(result.current.prevYear).toBeNull();
    expect(result.current.currentYearOpacity).toBe(1);
    expect(result.current.prevYearOpacity).toBe(0);
    expect(result.current.isYearCrossfading).toBe(false);

    act(() => {
      rerender({ year: 1500 });
    });

    expect(result.current.prevYear).toBe(1000);
    expect(result.current.currentYearOpacity).toBe(0);
    expect(result.current.prevYearOpacity).toBe(1);
    expect(result.current.isYearCrossfading).toBe(true);

    act(() => {
      result.current.startCrossfade();
    });

    expect(result.current.prevYear).toBe(1000);
    expect(result.current.currentYearOpacity).toBe(1);
    expect(result.current.prevYearOpacity).toBe(0);
    expect(result.current.isYearCrossfading).toBe(true);

    act(() => {
      jest.advanceTimersByTime(YEAR_FADE_MS + 60);
    });

    expect(result.current.prevYear).toBeNull();
    expect(result.current.isYearCrossfading).toBe(false);
  });
});
