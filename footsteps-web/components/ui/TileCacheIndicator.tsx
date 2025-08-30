'use client';

import { useEffect, useState } from 'react';

type Stats = { hits: number; misses: number; tiles: number; bytes: number };

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let u = -1;
  let v = n;
  do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[u]}`;
}

export default function TileCacheIndicator() {
  const [stats, setStats] = useState<Stats>({ hits: 0, misses: 0, tiles: 0, bytes: 0 });
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const onStats = (e: Event) => {
      const detail = (e as CustomEvent).detail as Stats;
      if (detail && typeof detail.hits === 'number') {
        setStats(detail);
        setVisible(true);
      }
    };
    globalThis.addEventListener('pmtiles-cache-stats', onStats as EventListener);

    // Best-effort: pull initial values if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = globalThis as any;
      const s = g.__pmtilesFeatureStats as Stats | undefined;
      if (s) { setStats(s); setVisible(true); }
    } catch {}

    // Gentle auto-hide when inactive for a while
    let hideTimer: number | null = null;
    const scheduleHide = () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setVisible(false), 5000);
    };
    scheduleHide();

    return () => {
      globalThis.removeEventListener('pmtiles-cache-stats', onStats as EventListener);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  const hitRate = (stats.hits + stats.misses) > 0
    ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
    : 0;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-10"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="glass-panel"
        style={{
          padding: '8px 10px',
          minWidth: 0,
          opacity: visible ? 1 : 0,
          transition: 'opacity 220ms ease-out',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--color-muted, #94a3b8)' }}>
          Cache: <span style={{ color: 'var(--foreground, #ededed)' }}>{stats.tiles}</span> tiles •
          <span title="Memory used" style={{ marginLeft: 6 }}>{formatBytes(stats.bytes)}</span> •
          <span title="Memory cache hits/misses" style={{ marginLeft: 6 }}>{stats.hits} / {stats.misses}</span>
          <span title="Memory cache hit rate" style={{ marginLeft: 6 }}>({hitRate}%)</span>
        </div>
      </div>
    </div>
  );
}

