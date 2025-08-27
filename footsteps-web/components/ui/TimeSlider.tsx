'use client';

import { useCallback, useRef, useState } from 'react';
import Slider from 'rc-slider';
import useSliderMarks from './hooks/useSliderMarks';
import { sliderToYear } from '@/lib/useYear';
import { formatYear } from '@/lib/format';

/**
 * Time navigation component for scrubbing through historical years.
 * 
 * Follows design philosophy:
 * - Hero interaction: "Dragging should feel like controlling time itself"
 * - Immediate impact: Current year display as the dominant visual element
 * - Data-driven minimalism: Every pixel serves historical communication
 * - Anti-duck principle: Interface becomes invisible, users see time travel
 */
interface TimeSliderProps {
  /** Current slider position (0-100) */
  value: number;
  /** Callback when slider position changes */
  onChange: (value: number) => void;
  /** Optional callback when dragging starts */
  onBeforeChange?: () => void;
  /** Optional callback when dragging ends */
  onAfterChange?: () => void;
}

export default function TimeSlider({ value, onChange, onBeforeChange, onAfterChange }: TimeSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleSelectMark = useCallback((pos: number) => {
    onChange(pos);
  }, [onChange]);
  const marks = useSliderMarks(value, handleSelectMark);

  // rAF-throttled change handler to maintain smooth 60fps scrubbing
  const rafIdRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);

  const flushChange = useCallback(() => {
    rafIdRef.current = null;
    if (pendingValueRef.current == null) return;
    onChange(pendingValueRef.current);
    pendingValueRef.current = null;
  }, [onChange]);

  const handleSliderChange = useCallback(
    (sliderValue: number | number[]) => {
      const next = Array.isArray(sliderValue) ? sliderValue[0] : sliderValue;
      if (isDragging) {
        pendingValueRef.current = next;
        if (rafIdRef.current == null) {
          rafIdRef.current = requestAnimationFrame(flushChange);
        }
      } else {
        onChange(next);
      }
    },
    [flushChange, isDragging, onChange],
  );

  const handleBeforeChange = useCallback(() => {
    setIsDragging(true);
    onBeforeChange?.();
  }, [onBeforeChange]);

  const handleAfterChange = useCallback(() => {
    setIsDragging(false);
    // Ensure final position applies immediately
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    if (pendingValueRef.current != null) {
      onChange(pendingValueRef.current);
      pendingValueRef.current = null;
    }
    onAfterChange?.();
  }, [onChange, onAfterChange]);

  // Derive and format the current year for the hero display
  const currentYear = sliderToYear(value);

  return (
    <div className="time-slider-container">
      <div className="w-full flex flex-col items-center gap-2">
        {/* Hero current year display */}
        <div
          className="text-hero select-none"
          aria-live="polite"
          role="status"
          aria-atomic="true"
        >
          {formatYear(currentYear)}
        </div>

        {/* Time slider - Hero interaction */}
        <div className="w-full py-4">
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={handleSliderChange}
            onBeforeChange={handleBeforeChange}
            onAfterChange={handleAfterChange}
            marks={marks}
            step={null}
            dots={true}
            included={true}
            className="time-slider w-full"
            aria-label="Time slider"
          />
        </div>
      </div>
    </div>
  );
}
