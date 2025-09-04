'use client';

import {
  createElement,
  useMemo,
  type CSSProperties,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { sliderToYear, yearToSlider } from '@/lib/useYear';
import { TARGET_YEARS } from '@/lib/constants';
import useWindowWidth from './useWindowWidth';

// Helper to format individual year label
// If `compact` is true, use a shortened representation to save space on narrow screens
const formatLabel = (year: number, compact = false) => {
  if (compact) {
    // Show "10kBC" for -10_000, "9kBC" for -9_000, etc. Keep BC for clarity in compact mode
    if (year <= -1000 && year % 1000 === 0) return `${Math.abs(year / 1000)}kBC`;
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
// Packs as many labels as possible without overlap, prioritising milestones first.
function getMinLabelSpacingPx(width: number): number {
  // Slightly larger spacing on very small screens to avoid crowding
  if (width <= 480) return 84;
  if (width <= 640) return 72;
  return 70;
}

export const getResponsiveYears = (width: number): number[] => {
  const thresholdPercent = (getMinLabelSpacingPx(width) / width) * 100;

  const isMilestone = (year: number) => Math.abs(year) >= 1000 && Math.abs(year) % 1000 === 0;
  const positions = YEARS_SORTED.map((y) => ({ year: y, pos: YEAR_SLIDER_MAP[y] }));

  const selected: number[] = [];
  const tooCloseToSelected = (pos: number) =>
    selected.some((sel) => Math.abs(pos - YEAR_SLIDER_MAP[sel]) < thresholdPercent);

  // Pass 1: add milestones greedily if they fit spacing
  positions.forEach(({ year, pos }) => {
    if (!isMilestone(year)) return;
    if (!tooCloseToSelected(pos)) selected.push(year);
  });

  // Pass 2: fill remaining slots with non-milestones where spacing allows
  positions.forEach(({ year, pos }) => {
    if (isMilestone(year)) return;
    if (!tooCloseToSelected(pos)) selected.push(year);
  });

  return selected.sort((a, b) => a - b);
};

// Build a clickable label ReactNode so clicking a mark jumps to its position
function makeClickableLabel(
  year: number,
  position: number,
  labelText: string,
  onSelect?: (position: number) => void,
): ReactNode {
  const aria = year < 0 ? `${Math.abs(year)} BC` : `${year}`;
  return createElement(
    'span',
    {
      role: 'button',
      tabIndex: 0,
      ['aria-label']: `Jump to ${aria}`,
      onMouseDown: (e: ReactMouseEvent) => {
        e.stopPropagation();
        onSelect?.(position);
      },
      onTouchStart: (e: ReactTouchEvent) => {
        e.stopPropagation();
        onSelect?.(position);
      },
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect?.(position);
        }
      },
      ['data-year']: year,
    },
    labelText || '\u00A0',
  );
}

export default function useSliderMarks(
  currentSliderValue: number,
  onSelect?: (position: number) => void,
) {
  const width = useWindowWidth();
  const compact = width < 640; // Tailwind's sm breakpoint (640px)

  const keyYears = useMemo(() => getResponsiveYears(width), [width]);

  // Build a marks object with a tick for every available year. Labels are applied
  // only to a responsive subset to avoid overlap; others remain unlabeled.
  const baseMarks = useMemo(() => {
    const marks: Record<
      number,
      { label: ReactNode; style?: CSSProperties }
    > = {};

    // 1) Create an unlabeled tick for all target years
    YEARS_SORTED.forEach((year) => {
      const position = YEAR_SLIDER_MAP[year];
      if (!marks[position]) {
        marks[position] = {
          label: makeClickableLabel(year, position, '', onSelect),
          style: { opacity: 0.85 },
        };
      }
    });

    // Helper: decide whether to show a text label for a given year
    const shouldShowLabel = (year: number) => {
      // Keep all CE labels as-is
      if (year >= 0) return true;
      const abs = Math.abs(year);
      // Suppress crowded far-left odd-thousand BCE labels (e.g., 9000 BC, 7000 BC),
      // but keep their ticks. Allow even-thousand labels and anything closer to present.
      if (abs >= 7000 && abs % 2000 !== 0) return false;
      return true;
    };

    // 2) Overlay labels for the responsive subset of years
    keyYears.forEach((year) => {
      const position = YEAR_SLIDER_MAP[year];
      const isMilestone = Math.abs(year) >= 1000 && Math.abs(year) % 1000 === 0;
      // Only assign a visible label if allowed; otherwise leave the tick unlabeled
      marks[position] = {
        label: shouldShowLabel(year)
          ? makeClickableLabel(year, position, formatLabel(year, compact), onSelect)
          : makeClickableLabel(year, position, '', onSelect),
        style: shouldShowLabel(year)
          ? {
              color: isMilestone ? '#38bdf8' : '#f1f5f9',
              fontWeight: isMilestone ? 500 : 400,
              fontSize: compact ? '0.7rem' : undefined,
              opacity: isMilestone ? 0.95 : compact ? 0.8 : 0.85,
              letterSpacing: compact ? '0.01em' : '0.015em',
              transition: 'all 200ms ease-out',
            }
          : { opacity: 0.85 },
      };
    });

    return marks;
  }, [keyYears, compact, onSelect]);

  return useMemo(() => {
    const currentYear = sliderToYear(currentSliderValue);
    const position = YEAR_SLIDER_MAP[currentYear];
    const marks = { ...baseMarks };

    // Make current year clearly emphasized (larger, time-blue, subtle glow)
    if (!marks[position]) {
      marks[position] = {
        label: makeClickableLabel(
          currentYear,
          position,
          formatLabel(currentYear, compact),
          onSelect,
        ),
        style: {
          color: '#0ea5e9',
          fontWeight: 700,
          fontSize: compact ? '0.9rem' : '1.125rem',
          textShadow: compact
            ? '0 0 8px rgba(14, 165, 233, 0.35)'
            : '0 0 20px rgba(14, 165, 233, 0.5)',
          opacity: 1,
          letterSpacing: compact ? '0.005em' : '0.01em',
        },
      };
    } else {
      marks[position] = {
        // Always ensure the current year has a visible label, even if the base mark was unlabeled
        ...marks[position],
        label: makeClickableLabel(
          currentYear,
          position,
          formatLabel(currentYear, compact),
          onSelect,
        ),
        style: {
          ...marks[position].style,
          color: '#0ea5e9',
          fontWeight: 700,
          fontSize: compact ? '0.9rem' : '1.125rem',
          textShadow: compact
            ? '0 0 8px rgba(14, 165, 233, 0.35)'
            : '0 0 20px rgba(14, 165, 233, 0.5)',
          opacity: 1,
        },
      };
    }

    // Subtle neighbor emphasis for context (previous/next years) if already present
    const idx = YEARS_SORTED.indexOf(currentYear);
    const neighborYears = [
      YEARS_SORTED[idx - 1],
      YEARS_SORTED[idx + 1],
    ].filter((y): y is number => typeof y === 'number');

    neighborYears.forEach((ny) => {
      const npos = YEAR_SLIDER_MAP[ny];
      if (marks[npos] && marks[npos].label) {
        marks[npos] = {
          ...marks[npos],
          style: {
            ...marks[npos].style,
            color: '#38bdf8',
            fontWeight: 600,
            fontSize: compact ? '0.8rem' : '1rem',
            opacity: 0.95,
          },
        };
      }
    });

    return marks;
  }, [currentSliderValue, baseMarks, compact, onSelect]);
}
