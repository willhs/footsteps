'use client';

import { useState, useCallback } from 'react';

// Available target years from HYDE 3.3 data (matches process_hyde.py TARGET_YEARS)
const TARGET_YEARS = [
  // BCE years
  -10000, -1000,
  // CE years  
  0, 100, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700,
  // 10-year intervals from 1710-1940
  1710, 1720, 1730, 1740, 1750, 1760, 1770, 1780, 1790, 
  1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880, 1890,
  1900, 1910, 1920, 1930, 1940
];

// Data range constants (based on our available HYDE 3.3 data)
const MIN_YEAR = TARGET_YEARS[0]; // -10000 BCE
const MAX_YEAR = TARGET_YEARS[TARGET_YEARS.length - 1]; // 1940 CE

// Time scale compression factor - ADJUST THIS VALUE TO CHANGE TIME SCALING
// Lower values (10-100) = more expansion of recent years
// Higher values (500-2000) = less expansion of recent years
// Current: 200 gives ~60% of slider to last 70 years (1870-1940)
const COMPRESSION_FACTOR = 1;

// Natural logarithmic scale based on years ago (recent dates naturally expanded)
function getScaledPosition(year: number): number {
  const minYear = MIN_YEAR; // -10000
  const maxYear = MAX_YEAR; // 1940
  
  // Calculate "years ago" from the most recent year (1940)
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

// Convert year to slider position (0-100)
export function yearToSlider(year: number): number {
  if (year <= MIN_YEAR) return 0;
  if (year >= MAX_YEAR) return 100;
  
  return getScaledPosition(year);
}

// Reverse the natural logarithmic scaling to get year from slider position
function getYearFromScaledPosition(position: number): number {
  const minYear = MIN_YEAR; // -10000
  const maxYear = MAX_YEAR; // 1940
  const maxYearsAgo = maxYear - minYear;
  
  const compressionFactor = COMPRESSION_FACTOR;
  
  // Reverse the natural log scaling
  const positionRatio = position / 100;
  const logMaxYearsAgo = Math.log(maxYearsAgo + compressionFactor);
  const logYearsAgo = (1 - positionRatio) * logMaxYearsAgo;
  const yearsAgo = Math.exp(logYearsAgo) - compressionFactor;
  const year = maxYear - yearsAgo;
  
  return Math.round(year);
}

// Convert slider position (0-100) to year (snaps to available target years)
export function sliderToYear(position: number): number {
  if (position <= 0) return TARGET_YEARS[0];
  if (position >= 100) return TARGET_YEARS[TARGET_YEARS.length - 1];
  
  // Get the theoretical year from scaled position
  const theoreticalYear = getYearFromScaledPosition(position);
  
  // Find the closest available target year
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
    if (absYear >= 1000) {
      return `${Math.round(absYear / 1000)}k BCE`;
    }
    return `${absYear} BCE`;
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
