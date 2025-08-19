'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export const YEAR_FADE_MS = 300;
export const NEW_YEAR_FADE_MS = 120;
const CROSSFADE_TIMEOUT_MS = 2000;

export default function useYearCrossfade(year: number) {
  const previousYearRef = useRef<number>(year);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  const newLayerReadyRef = useRef<boolean>(false);
  const newLayerHasTileRef = useRef<boolean>(false);

  const [previousYear, setPreviousYear] = useState<number | null>(null);
  const [currentOpacity, setCurrentOpacity] = useState(1);
  const [previousOpacity, setPreviousOpacity] = useState(0);

  const startCrossfade = useCallback(() => {
    if (newLayerReadyRef.current || previousYear === null) {
      return;
    }
    newLayerReadyRef.current = true;

    startTimeRef.current = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const t = Math.min(elapsed / YEAR_FADE_MS, 1);
      setCurrentOpacity(t);
      setPreviousOpacity(1 - t);
      if (t < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        setPreviousYear(null);
        animationRef.current = undefined;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  }, [previousYear]);

  useEffect(() => {
    if (year === previousYearRef.current) {
      return;
    }

    const fromYear = previousYearRef.current;
    previousYearRef.current = year;
    setPreviousYear(fromYear);
    setCurrentOpacity(0);
    setPreviousOpacity(1);
    newLayerReadyRef.current = false;
    newLayerHasTileRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const timeout = setTimeout(() => {
      if (!newLayerReadyRef.current) {
        startCrossfade();
      }
    }, CROSSFADE_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [year, startCrossfade]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return {
    previousYear,
    currentOpacity,
    previousOpacity,
    newLayerReadyRef,
    newLayerHasTileRef,
    startCrossfade,
  };
}
