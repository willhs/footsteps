'use client';

import React, { useEffect, useRef, useState } from 'react';
import { evidenceAt, populationRangeAt, populationRangeLabel } from '@/lib/time';
import { formatPopulation, formatYear } from '@/lib/format';
import { sunTimeLabel } from '@/lib/sunTime';
import { ZOOM } from '../hooks/peopleView';

const LOD_SUMMARY: Record<number, string> = {
  0: 'LOD 0 · Regional clusters (~1° ≈ 111 km)',
  1: 'LOD 1 · Subregional clusters (~0.5° ≈ 55 km)',
  2: 'LOD 2 · Local clusters (~0.2° ≈ 22 km)',
  3: 'LOD 3 · Detailed settlements (original dots)',
};

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
  viewState: { zoom: number; longitude?: number };
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

/** Close in, the map runs on today's clock: the time of day where you are looking. */
function SunTime({ lon }: { lon: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div
      className="ov-note mt-1"
      data-testid="sun-time"
      title="Local sun time right now at the centre of the map (a sundial's reading, within ~15 minutes). Close in, people move in real time."
    >
      ☀ {sunTimeLabel(lon, now)}, local sun time
    </div>
  );
}

function SupportingText({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  lodLevel,
  cacheSize,
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
  // Mirror the population behaviour for dots count
  const [displayDotCount, setDisplayDotCount] = useState<number>(dotCount);
  const dotsDebounceRef = useRef<number | null>(null);
  const dotsZeroGuardRef = useRef<number | null>(null);

  // Micro-interactions: brief highlight/dim transitions
  const [yearFlash, setYearFlash] = useState(false);
  const [popFlash, setPopFlash] = useState(false);
  const [dotsFlash, setDotsFlash] = useState(false);
  const yearFlashTimeout = useRef<number | null>(null);
  const popFlashTimeout = useRef<number | null>(null);
  const dotsFlashTimeout = useRef<number | null>(null);

  // PMTiles memory cache stats (cross-layer LRU)
  type CacheStats = { hits: number; misses: number; tiles: number; bytes: number };
  const [cacheStats, setCacheStats] = useState<CacheStats>({ hits: 0, misses: 0, tiles: 0, bytes: 0 });
  const formatBytes = (n: number) => {
    if (!n || n < 1024) return `${n || 0} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = n; let u = -1;
    do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[u]}`;
  };
  useEffect(() => {
    const onStats = (e: Event) => {
      const detail = (e as CustomEvent).detail as CacheStats;
      if (detail && typeof detail.hits === 'number') setCacheStats(detail);
    };
    globalThis.addEventListener('pmtiles-cache-stats', onStats as EventListener);
    // Seed with current values if present
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = globalThis as any;
      if (g.__pmtilesFeatureStats) setCacheStats(g.__pmtilesFeatureStats as CacheStats);
    } catch {}
    return () => globalThis.removeEventListener('pmtiles-cache-stats', onStats as EventListener);
  }, []);

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

  // Keep showing the last committed dots value until the new one is ready.
  useEffect(() => {
    // Always clear any pending timers before handling the new state
    if (dotsDebounceRef.current) {
      window.clearTimeout(dotsDebounceRef.current);
      dotsDebounceRef.current = null;
    }
    if (dotsZeroGuardRef.current) {
      window.clearTimeout(dotsZeroGuardRef.current);
      dotsZeroGuardRef.current = null;
    }

    if (loading) {
      // Keep showing the last committed value while loading
      return;
    }

    // Not loading: decide how to commit the value
    if (dotCount > 0) {
      // Commit promptly with a tiny debounce to coalesce rapid updates
      dotsDebounceRef.current = window.setTimeout(() => {
        setDisplayDotCount(dotCount);
      }, 120);
    } else {
      // Zero-guard: delay showing 0 briefly to avoid flashing during transitions
      dotsZeroGuardRef.current = window.setTimeout(() => {
        setDisplayDotCount(0);
      }, 500);
    }

    return () => {
      if (dotsDebounceRef.current) {
        window.clearTimeout(dotsDebounceRef.current);
        dotsDebounceRef.current = null;
      }
      if (dotsZeroGuardRef.current) {
        window.clearTimeout(dotsZeroGuardRef.current);
        dotsZeroGuardRef.current = null;
      }
    };
  }, [loading, dotCount]);

  // Trigger micro highlight on year change
  useEffect(() => {
    if (yearFlashTimeout.current) {
      window.clearTimeout(yearFlashTimeout.current);
    }
    setYearFlash(true);
    yearFlashTimeout.current = window.setTimeout(() => setYearFlash(false), 180);
    return () => {
      if (yearFlashTimeout.current) window.clearTimeout(yearFlashTimeout.current);
    };
  }, [year]);

  // Trigger gentle dim/brighten on metric updates
  useEffect(() => {
    if (popFlashTimeout.current) window.clearTimeout(popFlashTimeout.current);
    setPopFlash(true);
    popFlashTimeout.current = window.setTimeout(() => setPopFlash(false), 120);
    return () => {
      if (popFlashTimeout.current) window.clearTimeout(popFlashTimeout.current);
    };
  }, [displayPopulation]);

  useEffect(() => {
    if (dotsFlashTimeout.current) window.clearTimeout(dotsFlashTimeout.current);
    setDotsFlash(true);
    dotsFlashTimeout.current = window.setTimeout(() => setDotsFlash(false), 120);
    return () => {
      if (dotsFlashTimeout.current) window.clearTimeout(dotsFlashTimeout.current);
    };
  }, [displayDotCount]);

  // Before HYDE the total is the model's range, never a single figure.
  const modelled = evidenceAt(year) === 'modelled';
  return (
    <div
      className="ov-panel ov-stats absolute z-30 px-3.5 py-3 sm:px-4"
      style={{ top: 'var(--ov-top)', left: 'var(--ov-left)' }}
    >
      {/* Current year */}
      <div
        className={`text-[15px] font-medium leading-tight text-[var(--ov-text-2)] tabular-nums year-text metric-value ${yearFlash ? 'metric-flash' : ''}`}
        aria-live="polite"
      >
        {formatYear(year)}
      </div>

      {/* Population: the headline number */}
      <div className="mt-0.5 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-tight text-[var(--ov-text)] tabular-nums sm:text-2xl">
        <span className={`metric-value ${popFlash ? 'metric-flash' : ''}`}>
          {modelled
            ? `~${populationRangeLabel(populationRangeAt(year))}`
            : formatPopulation(displayPopulation)}
        </span>
      </div>
      {modelled && (
        <div
          className="ov-note mt-0.5"
          title="A model, not data: low to high world total from the literature. Where people sit follows plant productivity, climate and when people arrived."
        >
          modelled, not measured
        </div>
      )}

      {viewState.zoom >= ZOOM.groups && viewState.longitude !== undefined && (
        <SunTime lon={viewState.longitude} />
      )}

      {/* Progressive loading feedback */}
      {progressiveRenderStatus &&
        progressiveRenderStatus.rendered < progressiveRenderStatus.total && (
          <div className="ov-note mt-2">
            Loading settlements:{' '}
            {(
              (progressiveRenderStatus.rendered /
                progressiveRenderStatus.total) *
              100
            ).toFixed(0)}
            %
          </div>
        )}

      {/* Technical details: secondary */}
      <div className="ov-debug mt-2.5 space-y-0.5 border-t border-[var(--ov-divider)] pt-2 tabular-nums">
        <div>
          Zoom {viewState.zoom.toFixed(1)}x
          {/* LOD and tile cache only describe the Dots tiles (cacheSize > 0). */}
          {cacheSize > 0 && <> · {LOD_SUMMARY[lodLevel] ?? `LOD ${lodLevel}`}</>}
        </div>
        <div>
          Dots drawn{' '}
          <span className={`metric-value ${dotsFlash ? 'metric-flash' : ''}`}>
            {displayDotCount.toLocaleString()}
          </span>
        </div>
        {cacheSize > 0 && <div>
          Cache:{' '}
          <span title="Tiles held in memory">{cacheStats.tiles}</span>{' '}tiles ·{' '}
          <span title="Approximate memory used">{formatBytes(cacheStats.bytes)}</span>{' '}·{' '}
          <span title="Memory cache hits / misses">{cacheStats.hits}/{cacheStats.misses}</span>{' '}
          <span title="Memory cache hit rate">
            ({(cacheStats.hits + cacheStats.misses) > 0
              ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)
              : 0}%)
          </span>
        </div>}
      </div>
    </div>
  );
}

export default React.memo(SupportingText);
