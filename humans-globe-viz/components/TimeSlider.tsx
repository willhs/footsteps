'use client';

import Slider from 'rc-slider';
import { useMemo, useState, useEffect } from 'react';
import 'rc-slider/assets/index.css';
import { formatYear, sliderToYear, yearToSlider } from '../lib/useYear';

interface TimeSliderProps {
  value: number;
  onChange: (value: number) => void;
}

// Available target years (must match lib/useYear.ts)
// Complete deep history dataset - 26 time periods 
const TARGET_YEARS = [
  // Deep Prehistory - Every millennium
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,
  // Classical Period - Complete coverage every century
  0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  // Medieval Period
  1000, 1100, 1200, 1300, 1400, 1500
];

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
  if (year >= 1000 && year % 1000 === 0 && year !== 1000) return `${year / 1000}k`;
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
    const tooClose = selected.some((sel) => Math.abs(pos - yearToSlider(sel)) < thresholdPercent);
    if (!tooClose) {
      selected.push(year);
    }
  });
  // Ensure the currentYear is always included
  if (!selected.includes(currentYear)) {
    selected.push(currentYear);
    selected.sort((a,b)=>a-b);
  }
  return selected;
};
  
// Generate dynamic marks emphasising the currently selected year
// Determine viewport width once per resize – used to decide when to switch to compact labels
const useWindowWidth = () => {
  // Start with a neutral default that is the same for both server and client.
  // The actual `window.innerWidth` will be populated after the first mount.
  const [width, setWidth] = useState<number>(1024);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
};

const useSliderMarks = (currentSliderValue: number) => {
  const width = useWindowWidth();
  const compact = width < 640; // Tailwind's sm breakpoint (640px)

  return useMemo(() => {
    const marks: Record<number, { label: string; style?: React.CSSProperties }> = {};
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
  }, [currentSliderValue, compact]);
};

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
  const marks = useSliderMarks(value);
  const currentYear = sliderToYear(value);

  
  return (
    <div 
      className="fixed bg-black/80 backdrop-blur-sm rounded-lg p-6"
      style={{ bottom: '2rem', left: '2rem', right: '2rem', zIndex: 40 }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Current year display */}
        <div className="flex items-center justify-end mb-4">
          <div className="text-2xl font-bold text-blue-400">
            {formatYear(currentYear)}
          </div>
        </div>
        
        {/* Slider */}
        <div className="px-4 pb-8">
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={(value) => onChange(Array.isArray(value) ? value[0] : value)}
            marks={marks}
            step={0.1}
            className="mb-8"
            trackStyle={{ backgroundColor: '#0ea5e9', height: 6 }}
            railStyle={{ backgroundColor: '#334155', height: 6 }}
            handleStyle={{
              backgroundColor: '#1e293b',
              border: '3px solid #0ea5e9',
              width: 24,
              height: 24,
              marginTop: -9,
              boxShadow: '0 0 10px rgba(14, 165, 233, 0.5)'
            }}
            dotStyle={{
              backgroundColor: '#475569',
              border: '2px solid #64748b'
            }}
            activeDotStyle={{
              backgroundColor: '#0ea5e9',
              border: '2px solid #38bdf8'
            }}
          />
        </div>
        
      </div>
    </div>
  );
}