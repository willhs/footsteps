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
    <div
      className="fixed bg-black/80 backdrop-blur-sm rounded-lg p-6"
      style={{ bottom: '2rem', left: '2rem', right: '2rem', zIndex: 40 }}
    >
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
            className="mb-8 w-full"
            trackStyle={{ backgroundColor: '#0ea5e9', height: 6 }}
            railStyle={{ backgroundColor: '#334155', height: 6 }}
            handleStyle={{
              backgroundColor: '#1e293b',
              border: '3px solid #0ea5e9',
              width: 24,
              height: 24,
              marginTop: -9,
              boxShadow: '0 0 10px rgba(14, 165, 233, 0.5)',
            }}
            dotStyle={{
              backgroundColor: '#475569',
              border: '2px solid #64748b',
            }}
            activeDotStyle={{
              backgroundColor: '#0ea5e9',
              border: '2px solid #38bdf8',
            }}
          />
        </div>
      </div>
    </div>
  );
}
