'use client';

import { useState, useRef, useEffect } from 'react';

export const YEAR_FADE_MS = 300;
export const NEW_YEAR_FADE_MS = 120;

export default function useYearCrossfade(year: number) {
  const previousYearRef = useRef<number>(year);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  const [previousYear, setPreviousYear] = useState<number | null>(null);
  const [currentOpacity, setCurrentOpacity] = useState(1);
  const [previousOpacity, setPreviousOpacity] = useState(0);

  useEffect(() => {
    if (year === previousYearRef.current) {
      return;
    }

    const fromYear = previousYearRef.current;
    previousYearRef.current = year;
    setPreviousYear(fromYear);
    setCurrentOpacity(0);
    setPreviousOpacity(1);

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

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
      }
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [year]);

  return { previousYear, currentOpacity, previousOpacity };
}
