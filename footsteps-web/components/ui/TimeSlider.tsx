'use client';

import { useState } from 'react';
import Slider from 'rc-slider';
import { formatYear, sliderToYear } from '@/lib/useYear';
import useSliderMarks from './hooks/useSliderMarks';

/**
 * Time navigation component for scrubbing through historical years.
 * 
 * Follows design philosophy:
 * - Hero interaction: "Dragging should feel like controlling time itself"
 * - Immediate impact: Current year display as the dominant visual element
 * - Data-driven minimalism: Every pixel serves historical communication
 * - Anti-duck principle: Interface becomes invisible, users see time travel
 */
interface TimeSliderProps {
  /** Current slider position (0-100) */
  value: number;
  /** Callback when slider position changes */
  onChange: (value: number) => void;
}

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const marks = useSliderMarks(value);
  const currentYear = sliderToYear(value);

  const handleSliderChange = (sliderValue: number | number[]) => {
    onChange(Array.isArray(sliderValue) ? sliderValue[0] : sliderValue);
  };

  const handleBeforeChange = () => {
    setIsDragging(true);
  };

  const handleAfterChange = () => {
    setIsDragging(false);
  };

  return (
    <div className="time-slider-container">
      <div className="w-full">
        {/* Time slider - Primary interaction with enhanced feedback */}
        <div className="px-6 py-4">
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={handleSliderChange}
            onBeforeChange={handleBeforeChange}
            onAfterChange={handleAfterChange}
            marks={marks}
            step={0.1}
            className={`time-slider w-full transition-all duration-200 ${
              isDragging ? 'scale-[1.02]' : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
}
