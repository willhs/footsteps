import { renderHook, act } from '@testing-library/react';
import { yearToSlider, sliderToYear, formatYear, useYear } from './useYear';

describe('yearToSlider and sliderToYear', () => {
  it('maps known years to slider positions', () => {
    expect(yearToSlider(-10000)).toBe(0);
    expect(yearToSlider(1000)).toBe(100);
    expect(yearToSlider(0)).toBeCloseTo(69.8678, 4);
  });

  it('maps known slider positions to years', () => {
    expect(sliderToYear(0)).toBe(-10000);
    expect(sliderToYear(100)).toBe(1000);
    expect(sliderToYear(yearToSlider(0))).toBe(0);
  });

  it('round trips target years', () => {
    const targetYears = [
      -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000, 0,
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
    ];

    for (const year of targetYears) {
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
    expect(result.current.year).toBe(1000);
    expect(result.current.formattedYear).toBe('1000 CE');
  });
});
