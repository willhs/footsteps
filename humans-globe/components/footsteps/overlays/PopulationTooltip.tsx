'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  getTooltipPosition,
  getPopulationScale,
  formatCoordinates,
} from './tooltipUtils';

interface TooltipData {
  population: number;
  coordinates: [number, number];
  year: number;
  settlementType?: string;
  clickPosition: { x: number; y: number };
}

interface PopulationTooltipProps {
  data: TooltipData | null;
  onClose: () => void;
}

/**
 * Minimalist tooltip for displaying population data when clicking on dots.
 * Follows the established design philosophy of data-driven minimalism.
 */
export default function PopulationTooltip({
  data,
  onClose,
}: PopulationTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 200); // Allow fade-out animation to complete
  }, [onClose]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (data) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [data, handleClose]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    if (data) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [data, handleClose]);

  if (!data) return null;

  const position = getTooltipPosition(data.clickPosition);
  const populationScale = getPopulationScale(data.population);

  const roundedPopulation = Math.round(data.population);
  const populationLabel = roundedPopulation === 1 ? 'person' : 'people';

  return (
    <>
      {/* Tooltip (hover-friendly: container doesn't capture pointer events) */}
      <div
        className={`fixed pointer-events-none transition-all duration-200 ease-out z-50 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          minWidth: '220px',
          maxWidth: '260px',
        }}
      >
        <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-sm rounded-md p-3 pr-4 text-white shadow-xl border border-slate-700/40">
          {/* Population (primary) */}
          <div className="mb-2">
            <div className="text-3xl font-semibold text-orange-300 leading-none tracking-tight">
              <span className="font-mono">
                {roundedPopulation.toLocaleString()}
              </span>{' '}
              <span className="text-base font-normal text-slate-300">
                {populationLabel}
              </span>
            </div>
          </div>

          {/* Subheader: Year + Scale badge + Close */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="text-xs text-slate-400 truncate">
              {data.year < 0 ? `${Math.abs(data.year)} BC` : `${data.year} CE`}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                {populationScale.scale}
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200 text-base leading-none w-6 h-6 flex items-center justify-center rounded"
                title="Close (ESC)"
                aria-label="Close tooltip"
              >
                ×
              </button>
            </div>
          </div>

          {/* Coordinates */}
          <div className="text-[11px] text-slate-400">
            {formatCoordinates(data.coordinates)}
          </div>
        </div>
      </div>
    </>
  );
}
