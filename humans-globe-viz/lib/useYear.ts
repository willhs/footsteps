'use client';

import { useState, useCallback } from 'react';

// Available target years from HYDE 3.5 data (matches process_hyde.py TARGET_YEARS)
// Complete deep history dataset - 26 time periods from Ice Age to Renaissance
const TARGET_YEARS = [
  // Deep Prehistory - Every millennium
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,
  
  // Classical Period - Complete coverage every century
  0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  
  // Medieval Period  
  1000, 1100, 1200, 1300, 1400, 1500
];

// Data range constants (based on our available HYDE 3.3 data)
const MIN_YEAR = TARGET_YEARS[0]; // -10000 BCE
const MAX_YEAR = TARGET_YEARS[TARGET_YEARS.length - 1]; // 1500 CE

// Time scale compression factor - ADJUST THIS VALUE TO CHANGE TIME SCALING
// Lower values (10-100) = more expansion of recent years
// Higher values (500-2000) = less expansion of recent years
// Current: 200 gives balanced scaling for deep history (10k BCE to 1500 CE)
// Compression factor controls how much recent years are compressed.
// Increase this value to make 1400-1500 take less space; decrease to expand them.
const COMPRESSION_FACTOR = 800;

// Natural logarithmic scale based on years ago (recent dates naturally expanded)
function getScaledPosition(year: number): number {
  const minYear = MIN_YEAR; // -10000
  const maxYear = MAX_YEAR; // 1940
  
  // Calculate "years ago" from the most recent year (1500)
  // More recent years have smaller "years ago" values
  const yearsAgo = maxYear - year;
  const maxYearsAgo = maxYear - minYear;
  
  const compressionFactor = COMPRESSION_FACTOR;
  
  const logYearsAgo = Math.log(yearsAgo + compressionFactor);
  const logMaxYearsAgo = Math.log(maxYearsAgo + compressionFactor);
  
  // Invert: recent years (small logYearsAgo) get high slider positions
  const position = 1 - (logYearsAgo / logMaxYearsAgo);
  
  return position * 100;
}



// Convert year to slider position (0-100) using normalised logarithmic scale
// Raw maximum position computed for MAX_YEAR (most recent)
const RAW_MAX_POSITION = getScaledPosition(MAX_YEAR);

// Convert year to slider position (0-100) normalised over raw max
export function yearToSlider(year: number): number {
  const raw = getScaledPosition(Math.min(Math.max(year, MIN_YEAR), MAX_YEAR));
  return (raw / RAW_MAX_POSITION) * 100;
}

// Reverse the natural logarithmic scaling to get year from slider position
function getYearFromScaledPosition(position: number): number {
  const minYear = MIN_YEAR;
  const maxYear = MAX_YEAR;
  const maxYearsAgo = maxYear - minYear;

    const compressionFactor = COMPRESSION_FACTOR;
  
  // position is 0-100 normalised; map back to raw 0-RAW_MAX_POSITION
  const positionRatio = (position / 100);
  const rawPos = positionRatio * RAW_MAX_POSITION;
  // Convert rawPos to same ratio for log calculation
  const logPositionRatio = rawPos / RAW_MAX_POSITION;

  const logMaxYearsAgo = Math.log(maxYearsAgo + compressionFactor);
  const logYearsAgo = (1 - logPositionRatio) * logMaxYearsAgo;
    let yearsAgo = Math.exp(logYearsAgo) - compressionFactor;
  if (yearsAgo < 0) yearsAgo = 0; // prevent overshoot beyond most recent year
  const year = maxYear - yearsAgo;

  return Math.round(year);
}

// Convert slider position (0-100) to year (snaps to available target years)
export function sliderToYear(position: number): number {
  const clamped = Math.min(Math.max(position, 0), 100);
  // Map slider 0-100 back to raw position
  const rawPos = (clamped / 100) * RAW_MAX_POSITION;
  const theoreticalYear = getYearFromScaledPosition(rawPos);

  // Snap to nearest target year
  let closestYear = TARGET_YEARS[0];
  let minDistance = Math.abs(theoreticalYear - closestYear);

  for (const targetYear of TARGET_YEARS) {
    const distance = Math.abs(theoreticalYear - targetYear);
    if (distance < minDistance) {
      minDistance = distance;
      closestYear = targetYear;
    }
  }
    return closestYear;
}

// Format year for display
export function formatYear(year: number): string {
  if (year < 0) {
    const absYear = Math.abs(year);
    return `${absYear} BC`;
  } else if (year === 0) {
    return '1 CE';
  } else {
    return `${year} CE`;
  }
}

// Custom hook for year state management
export function useYear(initialYear: number = 0) {
  const [year, setYear] = useState(initialYear);
  const [sliderValue, setSliderValue] = useState(yearToSlider(initialYear));
  
  const updateYear = useCallback((newYear: number) => {
    setYear(newYear);
    setSliderValue(yearToSlider(newYear));
  }, []);
  
  const updateSlider = useCallback((newSliderValue: number) => {
    const newYear = sliderToYear(newSliderValue);
    setSliderValue(newSliderValue);
    setYear(newYear);
  }, []);
  
  return {
    year,
    sliderValue,
    updateYear,
    updateSlider,
    formattedYear: formatYear(year)
  };
}
