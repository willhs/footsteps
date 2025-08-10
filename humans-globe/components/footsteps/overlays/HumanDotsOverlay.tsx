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
  lodEnabled: boolean; // Always true now (server-controlled)
  toggleLOD: () => void; // No-op for backward compatibility
  renderMetrics: RenderMetrics;
  cacheSize: number;
  progressiveRenderStatus?: { rendered: number; total: number };
  viewportBounds?: number[] | null; // For debugging viewport optimization
  is3DMode?: boolean; // For debugging which mode is active
}

/**
 * Floating overlay shown in top-left of the globe – extracted from FootstepsViz.tsx to keep
 * that file lean. Pure presentational; all heavy logic stays in the parent.
 */
export default function HumanDotsOverlay({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  samplingRate,
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
        className="absolute bg-black/90 rounded-lg p-4 text-white font-sans flex items-center justify-center"
        style={{ top: '2rem', left: '2rem', zIndex: 30, minWidth: '200px', minHeight: '120px' }}
      >
        <span className="animate-pulse text-sm text-gray-300">Loading data…</span>
      </div>
    );
  }
  // Show viewport debugging in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';
  return (
    <div
      className="absolute bg-black/90 rounded-lg p-4 text-white font-sans"
      style={{ top: '2rem', left: '2rem', zIndex: 30 }}
    >
      <div className="text-sm text-blue-300 font-normal">Deep History of Human Settlement</div>
      <div className="text-lg font-bold text-orange-400 font-mono">
        {dotCount.toLocaleString()} dots
      </div>
      <div className="text-xs text-gray-500 mt-1 font-normal">
        Dot size represents population (sqrt scaling)
      </div>
      <div className="text-xs text-gray-500 mt-1 font-normal">
        Total population ≈ {totalPopulation.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1 font-normal">
        Zoom level: {viewState.zoom.toFixed(1)}x
      </div>
      <div className="text-xs text-gray-500 mt-1 font-normal">
        Sampling rate: {samplingRate.toFixed(1)}%
      </div>

      {/* Server-side LOD info */}
      <div className="text-xs mt-1 font-normal">
        <div className="text-purple-400">
          LOD: {
            viewState.zoom < 4
              ? 'Regional'
              : viewState.zoom < 5
                ? 'Subregional'
                : viewState.zoom < 6
                  ? 'Local'
                  : 'Detailed'
          } (z{viewState.zoom.toFixed(1)})
        </div>
        <div className="text-gray-500 text-xs">
          Server-controlled based on zoom level
        </div>
      </div>

      {/* Progressive rendering status */}
      {progressiveRenderStatus && (
        <div className="text-xs text-yellow-400 mt-1">
          Rendering: {progressiveRenderStatus.rendered.toLocaleString()}/{progressiveRenderStatus.total.toLocaleString()} dots
          ({((progressiveRenderStatus.rendered / progressiveRenderStatus.total) * 100).toFixed(0)}%)
        </div>
      )}

      {/* Performance metrics */}
      <div className="text-xs text-gray-600 mt-2 border-t border-gray-700 pt-2">
        <div>Load: {renderMetrics.loadTime.toFixed(0)}ms</div>
        <div>Process: {renderMetrics.processTime.toFixed(0)}ms</div>
        <div>Render: {renderMetrics.renderTime.toFixed(0)}ms</div>
        <div>Cache: {cacheSize} years cached</div>
      </div>

      {/* Viewport debugging (development mode only) */}
      {isDevelopment && (
        <div className="text-xs text-cyan-400 mt-2 border-t border-gray-700 pt-2">
          <div className="font-semibold mb-1">Viewport Debug ({is3DMode ? '3D' : '2D'})</div>
          {viewportBounds ? (
            <div className="space-y-0.5">
              <div>Bounds: [{viewportBounds.map(b => b.toFixed(1)).join(', ')}]</div>
              <div>Area: {((viewportBounds[2] - viewportBounds[0]) * (viewportBounds[3] - viewportBounds[1])).toFixed(0)} deg²</div>
              <div className="text-green-400">✓ Viewport filtering active</div>
            </div>
          ) : (
            <div className="text-yellow-400">⚪ Global data (no filtering)</div>
          )}
        </div>
      )}
    </div>
  );
}
