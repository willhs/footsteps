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

  // Get historical era context
  const getHistoricalEra = (year: number): { era: string; context: string; color: string } => {
    if (year < -10000) return { era: 'Paleolithic', context: 'Hunter-Gatherers', color: 'text-amber-300' };
    if (year < -3000) return { era: 'Neolithic', context: 'Early Agriculture', color: 'text-green-300' };
    if (year < 0) return { era: 'Ancient', context: 'Early Civilizations', color: 'text-blue-300' };
    if (year < 500) return { era: 'Classical', context: 'Empire Era', color: 'text-purple-300' };
    if (year < 1500) return { era: 'Medieval', context: 'Middle Ages', color: 'text-orange-300' };
    if (year < 1800) return { era: 'Early Modern', context: 'Age of Exploration', color: 'text-cyan-300' };
    if (year < 1900) return { era: 'Industrial', context: 'Industrial Revolution', color: 'text-yellow-300' };
    if (year < 2000) return { era: 'Modern', context: '20th Century', color: 'text-pink-300' };
    return { era: 'Contemporary', context: '21st Century', color: 'text-indigo-300' };
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
  const historicalEra = getHistoricalEra(data.year);
  const populationScale = getPopulationScale(data.population);

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
        className={`fixed bg-slate-900/95 backdrop-blur-sm rounded-lg p-4 text-white shadow-2xl border border-slate-600/40 transition-all duration-200 ease-out z-50 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          minWidth: '300px',
          maxWidth: '340px'
        }}
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-full"
          title="Close (ESC)"
        >
          ×
        </button>

        {/* Header: Era & Context */}
        <div className="mb-5">
          <div className={`text-sm font-semibold ${historicalEra.color} mb-1.5`}>
            {historicalEra.era} Era
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            {historicalEra.context}
          </div>
        </div>

        {/* Settlement Type & Icon */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-700/30">
          <div className="text-2xl flex-shrink-0" role="img" aria-label="Settlement type">
            {populationScale.icon}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-amber-400 leading-tight">
              {populationScale.scale}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {populationScale.significance}
            </div>
          </div>
        </div>
        
        {/* Population - Hero Number */}
        <div className="text-center mb-5 py-2">
          <div className="text-3xl font-bold text-orange-400 font-mono leading-none">
            {data.population.toLocaleString()}
          </div>
          <div className="text-sm text-slate-300 font-sans mt-1">
            people
          </div>
        </div>

        {/* Location & Time Details */}
        <div className="space-y-3 text-sm pt-3 border-t border-slate-700/30">
          <div className="grid grid-cols-3 gap-2 items-center">
            <span className="text-slate-400 text-xs">Location:</span>
            <span className="text-slate-200 font-mono text-xs col-span-2 text-right">
              {formatCoordinates(data.coordinates)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 items-center">
            <span className="text-slate-400 text-xs">Year:</span>
            <span className="text-slate-200 font-mono text-sm col-span-2 text-right font-semibold">
              {data.year < 0 ? `${Math.abs(data.year)} BC` : `${data.year} CE`}
            </span>
          </div>
        </div>

        {/* Simple bottom indicator */}
        <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-orange-400/50" />
      </div>
    </>
  );
}