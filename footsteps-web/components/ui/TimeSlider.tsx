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
      <div className="w-full space-y-6">
        {/* Current year display - Hero element with immediate visual impact */}
        <div className="flex items-center justify-center">
          <div 
            className={`text-4xl sm:text-5xl md:text-6xl font-bold transition-all duration-200 ${
              isDragging 
                ? 'text-sky-300 scale-105 drop-shadow-[0_0_20px_rgba(125,211,252,0.6)]' 
                : 'text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.4)]'
            }`}
            style={{ 
              color: isDragging ? '#7dd3fc' : '#0ea5e9',
              textShadow: isDragging 
                ? '0 0 30px rgba(14, 165, 233, 0.8), 0 0 60px rgba(14, 165, 233, 0.4)' 
                : '0 0 20px rgba(14, 165, 233, 0.5)'
            }}
          >
            {formatYear(currentYear)}
          </div>
        </div>

        {/* Time travel tagline - Contextual guidance */}
        <div className="text-center">
          <p className="text-slate-400 text-sm font-light tracking-wide">
            {isDragging ? 'Traveling through time...' : 'Drag to explore human history'}
          </p>
        </div>

        {/* Time slider - Primary interaction with enhanced feedback */}
        <div className="px-6 pb-4">
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
