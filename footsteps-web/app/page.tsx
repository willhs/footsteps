'use client';

import { useState } from 'react';
import { useYearWithInterpolation } from '../lib/useYearWithInterpolation';
import FootstepsVizWithInterpolation from '../components/footsteps/FootstepsVizWithInterpolation';
import TimeSlider from '../components/ui/TimeSlider';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);

  const {
    year,
    sliderValue,
    updateSlider,
    updateSliderContinuous,
    stopAnimation,
    shouldInterpolate,
    interpolationFromYear,
    interpolationToYear,
    interpolationProgress,
  } = useYearWithInterpolation(-1000, {
    enableInterpolation: true,
    interpolationThreshold: 50,
    autoAnimateThreshold: 200,
    animationDurationMs: 2000,
  });

  const handleSliderChange = (value: number) => {
    if (isDragging) {
      updateSliderContinuous(value);
    } else {
      updateSlider(value);
    }
  };

  const handleBeforeChange = () => {
    setIsDragging(true);
    stopAnimation();
  };

  const handleAfterChange = () => {
    setIsDragging(false);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ErrorBoundary>
        {/* Globe visualization */}
        <FootstepsVizWithInterpolation
          year={year}
          enableInterpolation={true}
          manualInterpolation={
            shouldInterpolate
              ? {
                  fromYear: interpolationFromYear,
                  toYear: interpolationToYear,
                  t: interpolationProgress,
                }
              : undefined
          }
        />
      </ErrorBoundary>

      {/* Time control slider */}
      <TimeSlider
        value={sliderValue}
        onChange={handleSliderChange}
        onBeforeChange={handleBeforeChange}
        onAfterChange={handleAfterChange}
      />
    </main>
  );
}
