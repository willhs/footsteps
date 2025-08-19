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

// Determine which years to label based on available slider width and logarithmic scale
// Ensures a minimum pixel spacing between labels to avoid overlap on medium screens
const MIN_LABEL_SPACING_PX = 70;

const getResponsiveYears = (width: number, currentYear: number): number[] => {
  // Calculate minimum spacing in slider % units
  const thresholdPercent = (MIN_LABEL_SPACING_PX / width) * 100;
  const yearsSorted = [...TARGET_YEARS].sort((a, b) => a - b);
  const selected: number[] = [];
  yearsSorted.forEach((year) => {
    const pos = yearToSlider(year);
    const tooClose = selected.some(
      (sel) => Math.abs(pos - yearToSlider(sel)) < thresholdPercent,
    );
    if (!tooClose) {
      selected.push(year);
    }
  });
  // Ensure the currentYear is always included
  if (!selected.includes(currentYear)) {
    selected.push(currentYear);
    selected.sort((a, b) => a - b);
  }
  return selected;
};

export default function useSliderMarks(currentSliderValue: number) {
  const width = useWindowWidth();
  const compact = width < 640; // Tailwind's sm breakpoint (640px)

  return useMemo(() => {
    const marks: Record<
      number,
      { label: string; style?: React.CSSProperties }
    > = {};
    const currentYear = sliderToYear(currentSliderValue);
    const keyYears = getResponsiveYears(width, currentYear);

    keyYears.forEach((year: number) => {
      if (!TARGET_YEARS.includes(year)) return;
      const position = yearToSlider(year);
      const isCurrent = Math.abs(currentSliderValue - position) < 0.05; // slider uses 0.1 step
      marks[position] = {
        label: formatLabel(year, compact),
        style: {
          color: isCurrent ? '#38bdf8' : '#f1f5f9',
          fontWeight: isCurrent ? 600 : 400,
          fontSize: compact ? '0.7rem' : undefined,
        },
      };
    });
    return marks;
  }, [currentSliderValue, compact, width]);
}
