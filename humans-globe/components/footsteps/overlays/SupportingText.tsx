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
  lodLevel: number;
  lodEnabled: boolean; // Always true now (server-controlled)
  toggleLOD: () => void; // No-op for backward compatibility
  renderMetrics: RenderMetrics;
  cacheSize: number;
  progressiveRenderStatus?: { rendered: number; total: number };
  viewportBounds?: number[] | null; // For debugging viewport optimization
  is3DMode?: boolean; // For debugging which mode is active
  year: number; // Current year being rendered
}

export default function SupportingText({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  lodLevel,
  // lodEnabled and toggleLOD intentionally not destructured to avoid unused vars
  renderMetrics,
  cacheSize,
  progressiveRenderStatus,
  viewportBounds,
  is3DMode,
  year
}: Props) {
  if (loading) {
    return (
      <div
        className="absolute backdrop-blur-md bg-black/50 rounded-lg p-4 text-slate-200 font-sans flex items-center justify-center"
        style={{ top: '5rem', left: '2rem', zIndex: 30, minWidth: '200px', minHeight: '120px' }}
      >
        <span className="animate-pulse text-sm text-slate-300">Loading human presence data…</span>
      </div>
    );
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  const formatPopulation = (pop: number): string => {
    if (pop >= 1_000_000_000) return `${Math.round(pop / 1_000_000_000).toLocaleString()}B people`;
    if (pop >= 1_000_000) return `${Math.round(pop / 1_000_000).toLocaleString()}M people`;
    if (pop >= 1_000) return `${Math.round(pop / 1_000).toLocaleString()}K people`;
    return `${Math.round(pop).toLocaleString()} people`;
  };

  const getDetailContext = (zoom: number): string => {
    if (zoom < 4) return 'Regional clusters • Showing major population centers';
    if (zoom < 5) return 'Subregional detail • Country & province scale';
    if (zoom < 6) return 'Local communities • County & district scale';
    return 'Detailed settlements • Full resolution data';
  };

  const formatYear = (y: number): string => (y < 0 ? `${Math.abs(y)} BC` : `${y} CE`);

  return (
    <div
      className="absolute backdrop-blur-md bg-black/40 bg-opacity-50 rounded-md p-3 text-slate-200 font-sans"
      style={{ top: '1rem', left: '1rem', zIndex: 30 }}
    >
      {/* Current year */}
      <div className="text-xs text-slate-400 mb-1">{formatYear(year)}</div>

      {/* Title and primary metric */}
      <div className="text-sm mb-1">Human presence</div>
      <div className="text-xl font-semibold mb-2">{formatPopulation(totalPopulation)}</div>

      {/* Current view context */}
      <div className="text-xs text-slate-400 mb-1">{getDetailContext(viewState.zoom)}</div>

      {/* Progressive loading feedback */}
      {progressiveRenderStatus && progressiveRenderStatus.rendered < progressiveRenderStatus.total && (
        <div className="text-xs text-slate-300 mt-2">
          Loading settlements: {((progressiveRenderStatus.rendered / progressiveRenderStatus.total) * 100).toFixed(0)}%
        </div>
      )}

      {/* Development debugging */}
      {isDevelopment && (
        <details open className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Debug</summary>
          <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1">
            <div>Zoom: {viewState.zoom.toFixed(1)}x • LOD: {lodLevel}</div>
            <div>Dots drawn: {dotCount.toLocaleString()}</div>
          </div>
        </details>
      )}
    </div>
  );
}
