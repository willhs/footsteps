import { renderHook, act } from '@testing-library/react';
import { yearToSlider, sliderToYear, formatYear, useYear } from './useYear';
import { TARGET_YEARS } from './constants';

const FIRST = TARGET_YEARS[0];
const LAST = TARGET_YEARS[TARGET_YEARS.length - 1];

describe('yearToSlider and sliderToYear', () => {
  it('maps known years to slider positions', () => {
    expect(yearToSlider(FIRST)).toBe(0);
    expect(yearToSlider(LAST)).toBe(100);
    // Log scale: positions rise strictly with time
    const positions = TARGET_YEARS.map(yearToSlider);
    positions.slice(1).forEach((p, i) => expect(p).toBeGreaterThan(positions[i]));
  });

  it('maps known slider positions to years', () => {
    expect(sliderToYear(0)).toBe(FIRST);
    expect(sliderToYear(100)).toBe(LAST);
    expect(sliderToYear(yearToSlider(0))).toBe(0);
  });

  it('round trips target years', () => {
    for (const year of TARGET_YEARS) {
      const pos = yearToSlider(year);
      expect(sliderToYear(pos)).toBe(year);
    }
  });
});

describe('formatYear', () => {
  it('formats BC years', () => {
    expect(formatYear(-44)).toBe('44 BC');
  });

  it('formats year 0 as 1 CE', () => {
    expect(formatYear(0)).toBe('1 CE');
  });

  it('formats CE years', () => {
    expect(formatYear(1000)).toBe('1000 CE');
  });
});

describe('useYear hook', () => {
  it('updates through updateYear and updateSlider', () => {
    const { result } = renderHook(() => useYear(0));

    expect(result.current.year).toBe(0);
    expect(result.current.sliderValue).toBeCloseTo(yearToSlider(0));
    expect(result.current.formattedYear).toBe('1 CE');

    act(() => result.current.updateYear(1000));
    expect(result.current.year).toBe(1000);
    expect(result.current.sliderValue).toBeCloseTo(yearToSlider(1000));
    expect(result.current.formattedYear).toBe('1000 CE');

    act(() => result.current.updateSlider(100));
    expect(result.current.sliderValue).toBe(100);
    expect(result.current.year).toBe(LAST);
    expect(result.current.formattedYear).toBe(formatYear(LAST));
  });
});
