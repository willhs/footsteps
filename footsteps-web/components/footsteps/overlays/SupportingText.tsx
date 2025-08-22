'use client';

import React, { useEffect, useRef, useState } from 'react';
import { formatPopulation, getDetailContext, formatYear } from '@/lib/format';

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

function SupportingText({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  lodLevel,
  progressiveRenderStatus,
  year,
  // Additional props intentionally omitted to avoid unused var warnings
}: Props) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Keep showing the last committed value until the new one is ready.
  const [displayPopulation, setDisplayPopulation] = useState<number>(
    totalPopulation,
  );
  const debounceRef = useRef<number | null>(null);
  const zeroGuardRef = useRef<number | null>(null);

  useEffect(() => {
    // Always clear any pending timers before handling the new state
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (zeroGuardRef.current) {
      window.clearTimeout(zeroGuardRef.current);
      zeroGuardRef.current = null;
    }

    if (loading) {
      // Keep showing the last committed value while loading
      return;
    }

    // Not loading: decide how to commit the value
    if (totalPopulation > 0) {
      // Commit promptly with a tiny debounce to coalesce rapid updates
      debounceRef.current = window.setTimeout(() => {
        setDisplayPopulation(totalPopulation);
      }, 120);
    } else {
      // Zero-guard: delay showing 0 briefly to avoid flashing during transitions
      zeroGuardRef.current = window.setTimeout(() => {
        setDisplayPopulation(0);
      }, 500);
    }

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (zeroGuardRef.current) {
        window.clearTimeout(zeroGuardRef.current);
        zeroGuardRef.current = null;
      }
    };
  }, [loading, totalPopulation]);

  return (
    <div
      className="absolute backdrop-blur-md bg-black/40 bg-opacity-50 rounded-md p-3 text-slate-200 font-sans"
      style={{ top: '1rem', left: '1rem', zIndex: 30 }}
    >
      {/* Current year */}
      <div className="text-xs text-slate-400 mb-1">{formatYear(year)}</div>

      {/* Title and primary metric */}
      <div className="text-sm mb-1">Human presence</div>
      <div className="text-xl font-semibold mb-2">
        {formatPopulation(displayPopulation)}
      </div>

      {/* Current view context */}
      <div className="text-xs text-slate-400 mb-1">
        {getDetailContext(viewState.zoom)}
      </div>

      {/* Progressive loading feedback */}
      {progressiveRenderStatus &&
        progressiveRenderStatus.rendered < progressiveRenderStatus.total && (
          <div className="text-xs text-slate-300 mt-2">
            Loading settlements:{' '}
            {(
              (progressiveRenderStatus.rendered /
                progressiveRenderStatus.total) *
              100
            ).toFixed(0)}
            %
          </div>
        )}

      {/* Development debugging */}
      {isDevelopment && (
        <details open className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Debug</summary>
          <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1">
            <div>
              Zoom: {viewState.zoom.toFixed(1)}x • LOD: {lodLevel}
            </div>
            <div>Dots drawn: {dotCount.toLocaleString()}</div>
          </div>
        </details>
      )}
    </div>
  );
}

export default React.memo(SupportingText);
