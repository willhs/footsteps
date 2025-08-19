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

    expect(result.current.previousYear).toBeNull();
    expect(result.current.currentOpacity).toBe(1);
    expect(result.current.previousOpacity).toBe(0);

    act(() => {
      rerender({ year: 1500 });
    });

    expect(result.current.previousYear).toBe(1000);
    expect(result.current.currentOpacity).toBe(0);
    expect(result.current.previousOpacity).toBe(1);

    // Trigger the crossfade manually (this is how it works now)
    act(() => {
      result.current.startCrossfade();
    });

    act(() => {
      jest.advanceTimersByTime(YEAR_FADE_MS + 20);
    });

    expect(result.current.previousYear).toBeNull();
    expect(result.current.currentOpacity).toBeCloseTo(1);
    expect(result.current.previousOpacity).toBeCloseTo(0);
  });
});
