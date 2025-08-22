import { renderHook } from '@testing-library/react';
import useYearCrossfade from '@/components/footsteps/hooks/useYearCrossfade';

describe('useYearCrossfade', () => {
  it('always returns current year as visible without crossfade', () => {
    const { result } = renderHook(() => useYearCrossfade(1500));

    expect(result.current.previousYear).toBeNull();
    expect(result.current.currentOpacity).toBe(1);
    expect(result.current.previousOpacity).toBe(0);
    expect(result.current.newLayerReadyRef.current).toBe(true);
    expect(typeof result.current.startCrossfade).toBe('function');
  });

  it('maintains same state when year changes', () => {
    const { result, rerender } = renderHook(({ year }) => useYearCrossfade(year), {
      initialProps: { year: 1500 },
    });

    rerender({ year: 1600 });

    // No crossfade - always shows current year
    expect(result.current.previousYear).toBeNull();
    expect(result.current.currentOpacity).toBe(1);
    expect(result.current.previousOpacity).toBe(0);
  });
});
