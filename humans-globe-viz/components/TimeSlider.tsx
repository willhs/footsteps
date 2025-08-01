'use client';

import Slider from 'rc-slider';
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

// Generate responsive slider marks with compact year labels
const SLIDER_MARKS = (() => {
  const marks: Record<number, string> = {};
  
  // Responsive mark selection based on available space - show more marks when there's room
  const getKeyYears = () => {
    // Include ALL BCE (negative) years
    const bcYears = TARGET_YEARS.filter(y => y < 0);

    // Positive (CE) selections – keep a concise yet useful subset
    const ceYears = [0, 500, 800, 1000, 1200, 1300, 1400, 1500];

    return [...bcYears, ...ceYears].sort((a, b) => a - b);
  };
  
  const keyYears = getKeyYears();
  
  keyYears.forEach(year => {
    if (TARGET_YEARS.includes(year)) {
      const position = yearToSlider(year);
      
      // Compact year labels - use -10k, -5k, -2k, -1k, 0, 500, 1k, 1.5k format
      // BCE years: display full absolute value with " BC" suffix (e.g., -5000 → 5000 BC)
      if (year < 0) {
        marks[position] = `${Math.abs(year)} BC`;
      }
      // Year 0 stays as "0"
      else if (year === 0) {
        marks[position] = '0';
      }
      // CE thousands (e.g., 1000 → 1k, 2000 → 2k)
      else if (year >= 1000) {
        if (year % 1000 === 0 && year !== 1000) {
          marks[position] = `${year/1000}k`;
        } else {
          marks[position] = year.toString();
        }
      }
      // All other years render as full number
      else {
        marks[position] = year.toString();
      }
    }
  });
  
  return marks;
})();

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
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
            marks={SLIDER_MARKS}
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