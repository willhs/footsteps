'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TARGET_YEARS } from './constants';
import { formatYear, yearToSlider, sliderToYearContinuous } from './useYear';

export { formatYear };

// Enhanced hook that supports smooth interpolation between years
export function useYearWithInterpolation(
  initialYear: number = 0,
  options: {
    enableInterpolation?: boolean;
    interpolationThreshold?: number;
    autoAnimateThreshold?: number; // Threshold for auto-animation on large jumps
    animationDurationMs?: number;
  } = {},
) {
  const {
    enableInterpolation = true,
    interpolationThreshold = 50,
    autoAnimateThreshold = 200, // Auto-animate jumps larger than 200 years
    animationDurationMs = 2000,
  } = options;

  const [targetYear, setTargetYear] = useState(initialYear);
  const [sliderValue, setSliderValue] = useState(yearToSlider(initialYear));
  const [isAnimating, setIsAnimating] = useState(false);

  // For smooth interpolation during animation
  const [animatedYear, setAnimatedYear] = useState(initialYear);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const fromYearRef = useRef<number>(initialYear);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsAnimating(false);
    startTimeRef.current = null;
  }, []);

  const animate = useCallback(
    (timestamp: number, targetYear: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / animationDurationMs, 1);

      // Smooth easing function
      const easedProgress = progress * progress * (3 - 2 * progress);

      const fromYear = fromYearRef.current;
      const currentYear = fromYear + (targetYear - fromYear) * easedProgress;
      setAnimatedYear(currentYear);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame((ts) =>
          animate(ts, targetYear),
        );
      } else {
        setAnimatedYear(targetYear);
        setIsAnimating(false);
        animationRef.current = null;
        startTimeRef.current = null;
      }
    },
    [animationDurationMs],
  );

  const startAnimation = useCallback(
    (toYear: number) => {
      stopAnimation();

      fromYearRef.current = animatedYear;
      setIsAnimating(true);
      startTimeRef.current = null;

      animationRef.current = requestAnimationFrame((ts) => animate(ts, toYear));
    },
    [animate, animatedYear, stopAnimation],
  );

  const updateYear = useCallback(
    (newYear: number) => {
      const yearDiff = Math.abs(newYear - animatedYear);

      setTargetYear(newYear);
      setSliderValue(yearToSlider(newYear));

      if (
        enableInterpolation &&
        yearDiff > autoAnimateThreshold &&
        !isAnimating
      ) {
        startAnimation(newYear);
      } else {
        stopAnimation();
        setAnimatedYear(newYear);
      }
    },
    [
      animatedYear,
      enableInterpolation,
      autoAnimateThreshold,
      isAnimating,
      startAnimation,
      stopAnimation,
    ],
  );

  const updateSlider = useCallback(
    (newSliderValue: number) => {
      const newYear = sliderToYearContinuous(newSliderValue);
      setSliderValue(newSliderValue);

      const yearDiff = Math.abs(newYear - animatedYear);

      if (enableInterpolation && yearDiff > interpolationThreshold) {
        setTargetYear(newYear);
        if (yearDiff > autoAnimateThreshold && !isAnimating) {
          startAnimation(newYear);
        } else if (!isAnimating) {
          // For smaller jumps, update immediately but still allow interpolation layer
          setAnimatedYear(newYear);
          setTargetYear(newYear);
        }
      } else {
        stopAnimation();
        setAnimatedYear(newYear);
        setTargetYear(newYear);
      }
    },
    [
      animatedYear,
      enableInterpolation,
      interpolationThreshold,
      autoAnimateThreshold,
      isAnimating,
      startAnimation,
      stopAnimation,
    ],
  );

  // Handle continuous slider dragging
  const updateSliderContinuous = useCallback(
    (newSliderValue: number) => {
      const newYear = sliderToYearContinuous(newSliderValue);
      setSliderValue(newSliderValue);

      // During continuous dragging, stop animation and update directly
      stopAnimation();
      setAnimatedYear(newYear);
      setTargetYear(newYear);
    },
    [stopAnimation],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const getBoundingYears = useCallback((year: number) => {
    let from = TARGET_YEARS[0];
    let to = TARGET_YEARS[TARGET_YEARS.length - 1];
    for (const y of TARGET_YEARS) {
      if (y <= year) from = y;
      if (y >= year) {
        to = y;
        break;
      }
    }
    return { from, to };
  }, []);

  const { from: interpFrom, to: interpTo } = getBoundingYears(animatedYear);
  const range = interpTo - interpFrom;
  const progress = range === 0 ? 0 : (animatedYear - interpFrom) / range;

  return {
    year: animatedYear, // The year to actually display
    targetYear,
    sliderValue,
    updateYear,
    updateSlider,
    updateSliderContinuous, // Use this during active dragging
    formattedYear: formatYear(Math.round(animatedYear)),
    isAnimating,
    stopAnimation,

    shouldInterpolate: enableInterpolation && range > 0 && progress > 0,
    interpolationFromYear: interpFrom,
    interpolationToYear: interpTo,
    interpolationProgress: progress,
  };
}
