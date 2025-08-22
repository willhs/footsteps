'use client';

import { useMemo } from 'react';
import { sliderToYear, yearToSlider } from '@/lib/useYear';
import { TARGET_YEARS } from '@/lib/constants';
import useWindowWidth from './useWindowWidth';

// Helper to format individual year label
// If `compact` is true, use a shortened representation to save space on narrow screens
const formatLabel = (year: number, compact = false) => {
  if (compact) {
    // Show "10k" for -10_000, "9k" for -9_000, etc. Drop the BC suffix for brevity
    if (year <= -1000 && year % 1000 === 0) return `${Math.abs(year / 1000)}k`;
    if (year < 0) return `${Math.abs(year)}BC`; // e.g. -500 -> 500BC (no space)
    if (year >= 1000 && year % 100 === 0) {
      // 1000 -> 1k, 1200 -> 1.2k, 1500 -> 1.5k
      return `${(year / 1000).toFixed(year % 1000 === 0 ? 0 : 1)}k`;
    }
    return year.toString();
  }

  // Full labels (default)
  if (year < 0) return `${Math.abs(year)} BC`;
  if (year === 0) return '0';
  if (year >= 1000 && year % 1000 === 0 && year !== 1000)
    return `${year / 1000}k`;
  return year.toString();
};

// Precompute sorted years and corresponding slider positions
const YEARS_SORTED = [...TARGET_YEARS].sort((a, b) => a - b);
const YEAR_SLIDER_MAP = YEARS_SORTED.reduce<Record<number, number>>(
  (acc, year) => {
    acc[year] = yearToSlider(year);
    return acc;
  },
  {},
);

// Determine which years to label based on available slider width and logarithmic scale
// Ensures a minimum pixel spacing between labels to avoid overlap on medium screens
const MIN_LABEL_SPACING_PX = 70;

const getResponsiveYears = (width: number): number[] => {
  const thresholdPercent = (MIN_LABEL_SPACING_PX / width) * 100;
  const selected: number[] = [];
  YEARS_SORTED.forEach((year) => {
    const pos = YEAR_SLIDER_MAP[year];
    const tooClose = selected.some(
      (sel) => Math.abs(pos - YEAR_SLIDER_MAP[sel]) < thresholdPercent,
    );
    if (!tooClose) {
      selected.push(year);
    }
  });
  return selected;
};

export default function useSliderMarks(currentSliderValue: number) {
  const width = useWindowWidth();
  const compact = width < 640; // Tailwind's sm breakpoint (640px)

  const keyYears = useMemo(() => getResponsiveYears(width), [width]);

  const baseMarks = useMemo(() => {
    const marks: Record<
      number,
      { label: string; style?: React.CSSProperties }
    > = {};
    keyYears.forEach((year) => {
      const position = YEAR_SLIDER_MAP[year];
      const isMilestone = Math.abs(year) >= 1000 && Math.abs(year) % 1000 === 0;
      
      marks[position] = {
        label: formatLabel(year, compact),
        style: {
          color: isMilestone ? '#38bdf8' : '#f1f5f9',
          fontWeight: isMilestone ? 500 : 400,
          fontSize: compact ? '0.7rem' : undefined,
        },
      };
    });
    return marks;
  }, [keyYears, compact]);

  return useMemo(() => {
    const currentYear = sliderToYear(currentSliderValue);
    const position = YEAR_SLIDER_MAP[currentYear];
    const marks = { ...baseMarks };

    // Make current year clearly emphasized (larger, time-blue, subtle glow)
    if (!marks[position]) {
      marks[position] = {
        label: formatLabel(currentYear, compact),
        style: {
          color: '#0ea5e9',
          fontWeight: 700,
          fontSize: compact ? '0.9rem' : '1.125rem',
          textShadow: '0 0 20px rgba(14, 165, 233, 0.5)',
        },
      };
    } else {
      marks[position] = {
        ...marks[position],
        style: {
          ...marks[position].style,
          color: '#0ea5e9',
          fontWeight: 700,
          fontSize: compact ? '0.9rem' : '1.125rem',
          textShadow: '0 0 20px rgba(14, 165, 233, 0.5)',
        },
      };
    }

    return marks;
  }, [currentSliderValue, baseMarks, compact]);
}
