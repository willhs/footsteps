'use client';

import React, { useEffect, useState, useCallback } from 'react';

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
export default function PopulationTooltip({ data, onClose }: PopulationTooltipProps) {
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

  // Calculate tooltip position with boundary detection
  const getTooltipPosition = () => {
    const tooltipWidth = 260;
    const tooltipHeight = 100;
    const padding = 16;
    
    let left = data.clickPosition.x + 16; // Offset from cursor
    let top = data.clickPosition.y - tooltipHeight - 16; // Above cursor

    // Boundary detection
    if (typeof window !== 'undefined') {
      // Right boundary
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = data.clickPosition.x - tooltipWidth - 16; // Show on left
      }
      
      // Top boundary
      if (top < padding) {
        top = data.clickPosition.y + 16; // Show below cursor
      }
      
      // Bottom boundary
      if (top + tooltipHeight > window.innerHeight - padding) {
        top = window.innerHeight - tooltipHeight - padding;
      }
      
      // Left boundary
      if (left < padding) {
        left = padding;
      }
    }

    return { left, top };
  };

  

  // Get population scale with more nuanced categories
  const getPopulationScale = (population: number): { scale: string; icon: string; significance: string } => {
    if (population > 1000000) return { scale: 'Megacity', icon: '🏙️', significance: 'Major urban center' };
    if (population > 500000) return { scale: 'Metropolis', icon: '🌆', significance: 'Large city' };
    if (population > 100000) return { scale: 'City', icon: '🏘️', significance: 'Urban settlement' };
    if (population > 50000) return { scale: 'Large Town', icon: '🏘️', significance: 'Regional center' };
    if (population > 10000) return { scale: 'Town', icon: '🏘️', significance: 'Local hub' };
    if (population > 2000) return { scale: 'Village', icon: '🏠', significance: 'Rural community' };
    if (population > 500) return { scale: 'Hamlet', icon: '🏡', significance: 'Small settlement' };
    return { scale: 'Outpost', icon: '⛺', significance: 'Remote presence' };
  };

  // Format coordinates
  const formatCoordinates = (coords: [number, number]): string => {
    const [lon, lat] = coords;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
  };

  const position = getTooltipPosition();
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
          maxWidth: '260px'
        }}
      >
        <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-sm rounded-md p-3 pr-4 text-white shadow-xl border border-slate-700/40">
        {/* Population (primary) */}
        <div className="mb-2">
          <div className="text-3xl font-semibold text-orange-300 leading-none tracking-tight">
            <span className="font-mono">{roundedPopulation.toLocaleString()}</span>{' '}
            <span className="text-base font-normal text-slate-300">{populationLabel}</span>
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