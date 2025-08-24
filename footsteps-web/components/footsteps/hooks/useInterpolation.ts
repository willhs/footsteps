import { useState, useEffect, useRef, useCallback } from 'react';

interface UseInterpolationResult {
  isInterpolating: boolean;
  fromYear: number;
  toYear: number;
  interpolationT: number;
  currentDisplayYear: number;
  startInterpolation: (from: number, to: number) => void;
  stopInterpolation: () => void;
  updateInterpolation: (targetYear: number) => void;
}

interface UseInterpolationOptions {
  animationDurationMs?: number;
  interpolationThreshold?: number; // Years difference to trigger interpolation
  onInterpolationComplete?: (year: number) => void;
}

/**
 * Hook for managing smooth year-to-year interpolation with animation
 */
export function useInterpolation(
  currentYear: number,
  options: UseInterpolationOptions = {}
): UseInterpolationResult {
  const {
    animationDurationMs = 2000,
    interpolationThreshold = 0,
    onInterpolationComplete,
  } = options;

  const [isInterpolating, setIsInterpolating] = useState(false);
  const [fromYear, setFromYear] = useState(currentYear);
  const [toYear, setToYear] = useState(currentYear);
  const [interpolationT, setInterpolationT] = useState(0);
  
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Calculate the display year based on interpolation state
  const currentDisplayYear = isInterpolating 
    ? Math.round(fromYear + (toYear - fromYear) * interpolationT)
    : currentYear;

  const stopInterpolation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsInterpolating(false);
    setInterpolationT(0);
    startTimeRef.current = null;
  }, []);

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / animationDurationMs, 1);
    
    // Smooth easing function (ease-in-out)
    const easedProgress = progress * progress * (3 - 2 * progress);
    
    setInterpolationT(easedProgress);

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      // Animation complete
      setIsInterpolating(false);
      setInterpolationT(0);
      animationRef.current = null;
      startTimeRef.current = null;
      
      if (onInterpolationComplete) {
        onInterpolationComplete(toYear);
      }
    }
  }, [animationDurationMs, toYear, onInterpolationComplete]);

  const startInterpolation = useCallback((from: number, to: number) => {
    // Stop any existing animation
    stopInterpolation();
    
    setFromYear(from);
    setToYear(to);
    setInterpolationT(0);
    setIsInterpolating(true);
    startTimeRef.current = null;
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
  }, [animate, stopInterpolation]);

  const updateInterpolation = useCallback((targetYear: number) => {
    const yearDiff = Math.abs(targetYear - currentYear);
    
    if (yearDiff > interpolationThreshold && !isInterpolating) {
      startInterpolation(currentYear, targetYear);
    } else if (yearDiff <= interpolationThreshold) {
      stopInterpolation();
    }
  }, [currentYear, interpolationThreshold, isInterpolating, startInterpolation, stopInterpolation]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Auto-trigger interpolation when currentYear changes significantly
  useEffect(() => {
    if (!isInterpolating) {
      const prevYear = fromYear || currentYear;
      const yearDiff = Math.abs(currentYear - prevYear);
      
      if (yearDiff > interpolationThreshold) {
        startInterpolation(prevYear, currentYear);
      }
    }
  }, [currentYear, fromYear, isInterpolating, interpolationThreshold, startInterpolation]);

  return {
    isInterpolating,
    fromYear,
    toYear,
    interpolationT,
    currentDisplayYear,
    startInterpolation,
    stopInterpolation,
    updateInterpolation,
  };
}