'use client';

import Slider from 'rc-slider';
import { formatYear, sliderToYear } from '@/lib/useYear';
import useSliderMarks from './hooks/useSliderMarks';

interface TimeSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
  const marks = useSliderMarks(value);
  const currentYear = sliderToYear(value);

  return (
    <div className="time-slider-container">
      <div className="w-full">
        {/* Current year display */}
        <div className="flex items-center justify-end mb-4">
          <div className="text-2xl font-bold text-blue-400">
            {formatYear(currentYear)}
          </div>
        </div>

        {/* Slider */}
        <div className="px-4 pb-8 w-full">
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={(value) =>
              onChange(Array.isArray(value) ? value[0] : value)
            }
            marks={marks}
            step={0.1}
            className="time-slider mb-8 w-full"
          />
        </div>
      </div>
    </div>
  );
}
