'use client';

import { useYearWithInterpolation } from '../../lib/useYearWithInterpolation';
import FootstepsVizWithInterpolation from '../../components/footsteps/FootstepsVizWithInterpolation';
import TimeSlider from '../../components/ui/TimeSlider';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { useState } from 'react';

export default function InterpolationDemo() {
  const [enableInterpolation, setEnableInterpolation] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const {
    year,
    targetYear,
    sliderValue,
    updateSlider,
    updateSliderContinuous,
    formattedYear,
    isAnimating,
    stopAnimation,
    shouldInterpolate,
    interpolationFromYear,
    interpolationToYear,
    interpolationProgress,
  } = useYearWithInterpolation(-1000, {
    enableInterpolation,
    interpolationThreshold: 50,
    autoAnimateThreshold: 200,
    animationDurationMs: 2500,
  });

  const handleSliderChange = (value: number) => {
    if (isDragging) {
      // During dragging, use continuous updates (no interpolation)
      updateSliderContinuous(value);
    } else {
      // On click/tap, use interpolation
      updateSlider(value);
    }
  };

  const handleBeforeChange = () => {
    setIsDragging(true);
    stopAnimation(); // Stop any ongoing animation when user starts dragging
  };

  const handleAfterChange = () => {
    setIsDragging(false);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ErrorBoundary>
        {/* Globe visualization with interpolation */}
        <FootstepsVizWithInterpolation
          year={year}
          enableInterpolation={enableInterpolation}
        />
      </ErrorBoundary>

      {/* Enhanced time control slider */}
      <div className="relative">
        <TimeSlider
          value={sliderValue}
          onChange={handleSliderChange}
          onBeforeChange={handleBeforeChange}
          onAfterChange={handleAfterChange}
        />

        {/* Current year display - show the animated year */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 text-center pointer-events-none">
          <div className="bg-black bg-opacity-60 px-4 py-2 rounded-lg">
            <div className="text-white text-2xl font-bold">{formattedYear}</div>
            {isAnimating && (
              <div className="text-white text-xs opacity-75 mt-1">
                Animating to {targetYear}...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls panel */}
      <div className="absolute top-4 left-4 z-10 bg-black bg-opacity-50 text-white p-3 rounded-lg">
        <h3 className="text-lg font-bold mb-2">
          Population Interpolation Demo
        </h3>

        <label className="flex items-center mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableInterpolation}
            onChange={(e) => setEnableInterpolation(e.target.checked)}
            className="mr-2"
          />
          Enable Interpolation
        </label>

        <div className="text-xs text-gray-300 space-y-1">
          <div>Current Year: {year}</div>
          <div>Target Year: {targetYear}</div>
          <div>Animating: {isAnimating ? 'Yes' : 'No'}</div>
          {shouldInterpolate && (
            <>
              <div>
                Interpolation: {interpolationFromYear} → {interpolationToYear}
              </div>
              <div>Progress: {Math.round(interpolationProgress * 100)}%</div>
            </>
          )}
          <div>Dragging: {isDragging ? 'Yes' : 'No'}</div>
        </div>

        <div className="mt-3 pt-2 border-t border-gray-600 text-xs text-gray-400">
          <p>
            <strong>Instructions:</strong>
          </p>
          <p>• Click on distant years to see smooth interpolation</p>
          <p>• Drag slider for immediate scrubbing</p>
          <p>• Toggle interpolation on/off to compare</p>
        </div>
      </div>

      {/* Quick jump buttons for testing */}
      <div className="absolute bottom-20 right-4 z-10 flex flex-col gap-2">
        {[-10000, -5000, -1000, 0, 500, 1000].map((testYear) => (
          <button
            key={testYear}
            onClick={() => updateSlider(testYear)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
            disabled={isAnimating}
          >
            {testYear > 0 ? `${testYear} CE` : `${Math.abs(testYear)} BCE`}
          </button>
        ))}
      </div>
    </main>
  );
}
