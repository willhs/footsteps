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
    const tooltipWidth = 280;
    const tooltipHeight = 120;
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

  // Classify settlement type based on population
  const getSettlementType = (population: number): string => {
    if (population > 100000) return 'Massive City';
    if (population > 50000) return 'Major City';
    if (population > 20000) return 'Large Settlement';
    if (population > 5000) return 'Medium Settlement';
    if (population > 1000) return 'Small Settlement';
    if (population > 100) return 'Village';
    return 'Tiny Settlement';
  };

  // Format coordinates
  const formatCoordinates = (coords: [number, number]): string => {
    const [lon, lat] = coords;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
  };

  const position = getTooltipPosition();

  return (
    <>
      {/* Invisible backdrop for click-outside detection */}
      <div 
        className="fixed inset-0 z-40"
        onClick={handleClose}
        style={{ background: 'transparent' }}
      />
      
      {/* Tooltip */}
      <div
        className={`fixed bg-black/95 backdrop-blur-sm rounded-lg p-4 text-white font-sans shadow-2xl border border-gray-700/50 transition-all duration-200 ease-out z-50 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          minWidth: '280px',
          maxWidth: '320px'
        }}
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors duration-150 text-lg leading-none w-6 h-6 flex items-center justify-center"
          title="Close (ESC)"
        >
          ×
        </button>

        {/* Settlement type */}
        <div className="text-sm text-blue-300 font-medium mb-2">
          {getSettlementType(data.population)}
        </div>

        {/* Population - Hero number */}
        <div className="text-2xl font-bold text-orange-400 font-mono mb-3">
          {data.population.toLocaleString()} people
        </div>

        {/* Details */}
        <div className="space-y-1 text-xs text-gray-300">
          <div>
            <span className="text-gray-400">Location:</span> {formatCoordinates(data.coordinates)}
          </div>
          <div>
            <span className="text-gray-400">Year:</span> {data.year < 0 ? `${Math.abs(data.year)} BC` : `${data.year} CE`}
          </div>
        </div>

        {/* Visual indicator */}
        <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-50" />
      </div>
    </>
  );
}