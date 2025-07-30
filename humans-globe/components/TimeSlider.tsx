'use client';

import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { formatYear, sliderToYear, yearToSlider } from '../lib/useYear';

interface TimeSliderProps {
  value: number;
  onChange: (value: number) => void;
}

// Available target years (must match lib/useYear.ts)
const TARGET_YEARS = [
  -10000, -1000, 0, 100, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700,
  1710, 1720, 1730, 1740, 1750, 1760, 1770, 1780, 1790, 
  1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880, 1890,
  1900, 1910, 1920, 1930, 1940
];

// Generate slider marks using logarithmic scaling (recent years get more space)
const SLIDER_MARKS = (() => {
  const marks: Record<number, string> = {};
  const keyYears = [-10000, -1000, 0, 1000, 1400, 1700, 1870, 1940]; // Key years to show
  
  keyYears.forEach(year => {
    if (TARGET_YEARS.includes(year)) {
      // Use the same yearToSlider function to ensure consistency
      const position = yearToSlider(year);
      
      if (year === -10000) marks[position] = '10k BCE';
      else if (year === -1000) marks[position] = '1k BCE';
      else if (year === 0) marks[position] = '0 CE';
      else if (year === 1000) marks[position] = '1k CE';
      else marks[position] = year.toString();
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