'use client';

import Slider from 'rc-slider';
import { formatYear, sliderToYear } from '@/lib/useYear';
import useSliderMarks from './hooks/useSliderMarks';

/**
 * Time navigation component for scrubbing through historical years.
 * 
 * Features:
 * - Non-linear time scaling optimized for deep history (100k BCE → 2025 CE)
 * - Responsive slider marks with automatic spacing
 * - Current year highlight using design system colors
 */
interface TimeSliderProps {
  /** Current slider position (0-100) */
  value: number;
  /** Callback when slider position changes */
  onChange: (value: number) => void;
}

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
  const marks = useSliderMarks(value);
  const currentYear = sliderToYear(value);

  const handleSliderChange = (sliderValue: number | number[]) => {
    onChange(Array.isArray(sliderValue) ? sliderValue[0] : sliderValue);
  };

  return (
    <div className="time-slider-container">
      <div className="w-full">
        {/* Current year display - Hero element using Mega typography */}
        <div className="flex items-center justify-end mb-4">
          <div className="text-2xl font-bold text-blue-400">
            {formatYear(currentYear)}
          </div>
        </div>

        {/* Time slider - Primary interaction */}
        <div className="px-4 pb-8 w-full">
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={handleSliderChange}
            marks={marks}
            step={0.1}
            className="time-slider mb-8 w-full"
          />
        </div>
      </div>
    </div>
  );
}
