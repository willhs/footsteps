"use client";

import React from 'react';

interface RenderMetrics {
  loadTime: number;
  processTime: number;
  renderTime: number;
  lastUpdate: number;
}

interface Props {
  loading?: boolean;
  dotCount: number;
  totalPopulation: number;
  viewState: { zoom: number };
  samplingRate: number;
  lodLevel: number;
  lodEnabled: boolean; // Always true now (server-controlled)
  toggleLOD: () => void; // No-op for backward compatibility
  renderMetrics: RenderMetrics;
  cacheSize: number;
  progressiveRenderStatus?: { rendered: number; total: number };
  viewportBounds?: number[] | null; // For debugging viewport optimization
  is3DMode?: boolean; // For debugging which mode is active
}

/**
 * Human presence info overlay - follows Tufte's "data ink" principle by focusing on 
 * historical narrative over technical details. Each pixel serves to tell the story
 * of human settlement patterns across deep time.
 */
export default function HumanDotsOverlay({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  samplingRate,
  lodLevel,
  // lodEnabled and toggleLOD intentionally not destructured to avoid unused vars
  renderMetrics,
  cacheSize,
  progressiveRenderStatus,
  viewportBounds,
  is3DMode
}: Props) {
  if (loading) {
    return (
      <div
        className="absolute backdrop-blur-md bg-black/50 rounded-lg p-4 text-white font-sans flex items-center justify-center"
        style={{ top: '2rem', left: '2rem', zIndex: 30, minWidth: '200px', minHeight: '120px' }}
      >
        <span className="animate-pulse text-sm text-gray-300">Loading human presence data…</span>
      </div>
    );
  }

  // Show development debugging only when needed
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Format population with appropriate scale indicators
  const formatPopulation = (pop: number): string => {
    if (pop >= 1_000_000_000) return `${(pop / 1_000_000_000).toFixed(1)}B people`;
    if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M people`;
    if (pop >= 1_000) return `${(pop / 1_000).toFixed(0)}K people`;
    return `${pop.toLocaleString()} people`;
  };

  // Contextual detail level description
  const getDetailContext = (zoom: number): string => {
    if (zoom < 4) return 'Regional clusters • Showing major population centers';
    if (zoom < 5) return 'Subregional detail • Country & province scale';
    if (zoom < 6) return 'Local communities • County & district scale';
    return 'Detailed settlements • Full resolution data';
  };

  return (
    <div
      className="absolute backdrop-blur-md bg-black/50 rounded-lg p-4 text-white font-sans"
      style={{ top: '2rem', left: '2rem', zIndex: 30 }}
    >
      {/* Hero content: what users are seeing */}
      <div className="text-sm text-sky-300 font-normal mb-1">Human Presence</div>
      <div className="text-xl font-bold text-orange-400 mb-2">
        {formatPopulation(totalPopulation)}
      </div>
      
      {/* Context about what each dot represents */}
      <div className="text-xs text-gray-300 mb-3 leading-relaxed">
        {dotCount.toLocaleString()} settlements • Each dot represents people living their lives
      </div>

      {/* Current view context */}
      <div className="text-xs text-gray-400 mb-1">
        {getDetailContext(viewState.zoom)}
      </div>

      {/* Progressive loading feedback (user-relevant) */}
      {progressiveRenderStatus && progressiveRenderStatus.rendered < progressiveRenderStatus.total && (
        <div className="text-xs text-amber-400 mt-2">
          Loading settlements: {((progressiveRenderStatus.rendered / progressiveRenderStatus.total) * 100).toFixed(0)}%
        </div>
      )}

      {/* Development debugging - default open in development */}
      {isDevelopment && (
        <details open className="mt-3 text-xs text-gray-600">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-400">Debug Info</summary>
          <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
            <div>Zoom: {viewState.zoom.toFixed(1)}x • LOD: {lodLevel} • Sampling: {samplingRate.toFixed(1)}%</div>
            <div>Load: {renderMetrics.loadTime.toFixed(0)}ms • Cache: {cacheSize}</div>
            <div>Dots drawn: {dotCount.toLocaleString()}</div>
            <div className="text-cyan-400">
              {is3DMode ? '3D Globe' : '2D Map'} • 
              {viewportBounds ? ` Filtered viewport` : ` Global data`}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
