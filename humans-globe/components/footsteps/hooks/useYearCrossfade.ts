'use client';

import { useState, useRef, useEffect } from 'react';

export const YEAR_FADE_MS = 300;
export const NEW_YEAR_FADE_MS = 120;

export default function useYearCrossfade(year: number) {
  const [prevYear, setPrevYear] = useState<number | null>(null);
  const [isYearCrossfading, setIsYearCrossfading] = useState(false);
  const [currentYearOpacity, setCurrentYearOpacity] = useState(1);
  const [prevYearOpacity, setPrevYearOpacity] = useState(0);

  const prevPropYearRef = useRef<number>(year);
  const yearFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newLayerReadyRef = useRef(false);
  const newLayerHasTileRef = useRef(false);

  useEffect(() => {
    if (year !== prevPropYearRef.current) {
      const oldYear = prevPropYearRef.current;
      prevPropYearRef.current = year;
      setPrevYear(oldYear);
      setIsYearCrossfading(true);
      setPrevYearOpacity(1);
      setCurrentYearOpacity(0);
      newLayerReadyRef.current = false;
      newLayerHasTileRef.current = false;
      if (yearFadeTimeoutRef.current) {
        clearTimeout(yearFadeTimeoutRef.current);
        yearFadeTimeoutRef.current = null;
      }
    }
  }, [year]);

  useEffect(() => {
    return () => {
      if (yearFadeTimeoutRef.current) {
        clearTimeout(yearFadeTimeoutRef.current);
      }
    };
  }, []);

  const startCrossfade = () => {
    if (newLayerReadyRef.current || prevYear === null) {
      return;
    }
    newLayerReadyRef.current = true;
    setCurrentYearOpacity(1);
    setPrevYearOpacity(0);
    yearFadeTimeoutRef.current = setTimeout(() => {
      setPrevYear(null);
      setIsYearCrossfading(false);
      yearFadeTimeoutRef.current = null;
    }, YEAR_FADE_MS + 50);
  };

  const yearChangedThisRender = year !== prevPropYearRef.current;
  const renderPrevYear = yearChangedThisRender
    ? prevPropYearRef.current
    : prevYear;
  const renderCurrentOpacity = yearChangedThisRender ? 0 : currentYearOpacity;
  const renderPrevOpacity = yearChangedThisRender ? 1 : prevYearOpacity;

  return {
    prevYear: renderPrevYear,
    currentYearOpacity: renderCurrentOpacity,
    prevYearOpacity: renderPrevOpacity,
    isYearCrossfading,
    newLayerReadyRef,
    newLayerHasTileRef,
    startCrossfade,
    YEAR_FADE_MS,
    NEW_YEAR_FADE_MS,
  };
}
