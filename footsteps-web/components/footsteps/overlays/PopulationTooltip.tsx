'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { formatCoordinates } from './tooltipUtils';
import { getPopulationScale } from '@/lib/format';
import type { TooltipData } from './TooltipOverlay';
import { CloseIcon } from '@/components/ui/icons';

interface PopulationTooltipProps {
  data: TooltipData | null;
  onClose: () => void;
}

/**
 * Population at a clicked dot (Dots mode), shown in the left column.
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

  const populationScale = getPopulationScale(data.population);

  const roundedPopulation = Math.round(data.population);
  const populationLabel = roundedPopulation === 1 ? 'person' : 'people';

  return (
        <div
          className={`ov-panel ov-panel-strong pointer-events-auto shrink-0 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
          data-testid="population-info"
        >
          {/* Population (primary) */}
          <div className="mb-2">
            <div className="text-3xl font-semibold text-[var(--ov-amber)] leading-none tracking-tight">
              <span className="tabular-nums">
                {roundedPopulation.toLocaleString()}
              </span>{' '}
              <span className="text-base font-normal text-[var(--ov-text-2)]">
                {populationLabel}
              </span>
            </div>
          </div>

          {/* Subheader: Year + Scale badge + Close */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="ov-note truncate">
              {data.year < 0 ? `${Math.abs(data.year)} BC` : `${data.year} CE`}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="ov-chip text-[var(--ov-text-3)]">
                {populationScale.scale}
              </div>
              <button
                onClick={handleClose}
                className="ov-icon-btn -mr-2 h-7 w-7"
                title="Close (ESC)"
                aria-label="Close tooltip"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Coordinates */}
          <div className="ov-debug">
            {formatCoordinates(data.coordinates)}
          </div>
        </div>
  );
}
