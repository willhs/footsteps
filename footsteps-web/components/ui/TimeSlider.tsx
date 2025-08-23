'use client';

import { useCallback, useRef, useState } from 'react';
import Slider from 'rc-slider';
import useSliderMarks from './hooks/useSliderMarks';

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
}

export default function TimeSlider({ value, onChange }: TimeSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleSelectMark = useCallback(
    (pos: number) => {
      onChange(pos);
    },
    [onChange],
  );
  const marks = useSliderMarks(value, handleSelectMark);

  // Debounced change handler to limit updates while dragging
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<number | null>(null);

  const flushChange = useCallback(() => {
    if (timeoutIdRef.current != null) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    if (pendingValueRef.current == null) return;
    onChange(pendingValueRef.current);
    pendingValueRef.current = null;
  }, [onChange]);

  const handleSliderChange = useCallback(
    (sliderValue: number | number[]) => {
      const next = Array.isArray(sliderValue) ? sliderValue[0] : sliderValue;
      if (isDragging) {
        pendingValueRef.current = next;
        if (timeoutIdRef.current != null) {
          clearTimeout(timeoutIdRef.current);
        }
        timeoutIdRef.current = setTimeout(flushChange, 150);
      } else {
        onChange(next);
      }
    },
    [flushChange, isDragging, onChange],
  );

  const handleBeforeChange = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleAfterChange = useCallback(() => {
    setIsDragging(false);
    // Ensure final position applies immediately
    flushChange();
  }, [flushChange]);

  return (
    <div className="time-slider-container">
      <div className="w-full">
        {/* Time slider - Hero interaction */}
        <div className="px-6 py-6">
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
