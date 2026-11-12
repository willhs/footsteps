'use client';

// Prototype presence styles over the population data, chosen in the viewer:
// - lights: 'classic' keeps the per-cell glow / night lights; 'fire' draws
//   flickering firelight sprites instead (FireLayer).
import { useEffect, useMemo, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { bracket } from '@/lib/time';
import { TARGET_YEARS } from '@/lib/constants';
import { loadGrid } from './gridLoader';
import FireLayer, { buildFireMarks, fireData, fireVisibleFraction } from '../layers/FireLayer';

export type Presence = { lights: 'classic' | 'fire' };
export const DEFAULT_PRESENCE: Presence = { lights: 'fire' };

export function presenceFromUrl(): Presence {
  if (typeof window === 'undefined') return DEFAULT_PRESENCE;
  const q = new URLSearchParams(window.location.search);
  return {
    lights: q.get('lights') === 'classic' ? 'classic' : 'fire',
  };
}

// Fire marks per data year, kept compact (positions, radius, rank) so every
// year can stay in memory and scrubbing never waits once they are warm.
type Built = { year: number; data: ReturnType<typeof fireData> };
const built = new Map<number, Built>();
const inFlight = new Map<number, Promise<Built>>();
const deviceMemory = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined;
/** ~2.4 MB per year: all 31 years on a roomy device, a dozen on a small one. */
const MAX_BUILT = deviceMemory !== undefined && deviceMemory < 8 ? 12 : TARGET_YEARS.length;

function marksFor(year: number): Promise<Built> {
  const hit = built.get(year);
  if (hit) {
    built.delete(year);
    built.set(year, hit);
    return Promise.resolve(hit);
  }
  const pending = inFlight.get(year);
  if (pending) return pending;
  const p = loadGrid(year)
    .then((grid) => {
      const b = { year, data: fireData(buildFireMarks(year, grid.data)) };
      built.set(year, b);
      if (built.size > MAX_BUILT) built.delete(built.keys().next().value!);
      return b;
    })
    .finally(() => inFlight.delete(year));
  inFlight.set(year, p);
  return p;
}

// Background warm-up: build the remaining years one at a time, nearest to the
// current time first, yielding between years so on-demand loads go first.
let warmCenter = 0;
let warming = false;
function warm(center: number) {
  warmCenter = center;
  if (warming) return;
  warming = true;
  const step = () => {
    const next = [...TARGET_YEARS]
      .sort((a, b) => Math.abs(a - warmCenter) - Math.abs(b - warmCenter))
      .slice(0, MAX_BUILT)
      .find((y) => !built.has(y));
    if (next === undefined || inFlight.size > 0) {
      warming = next !== undefined;
      if (warming) setTimeout(step, 300);
      return;
    }
    marksFor(next)
      .catch(() => {})
      .finally(() => setTimeout(step, 150));
  };
  setTimeout(step, 500);
}

type View = { longitude: number; latitude: number; zoom: number };

export default function usePresenceLayers({
  enabled,
  presence,
  time,
  view,
  /** 0..1: how much the far-out look (glow) is showing; fires fade with it. */
  far,
}: {
  enabled: boolean;
  presence: Presence;
  time: number;
  view: View;
  far: number;
}): { layers: LayersList; animating: boolean; waiting: [number, number] | null } {
  const { y0, y1, f } = bracket(time);
  const [pair, setPair] = useState<{ a: Built; b: Built } | null>(null);
  const wanted = enabled && (presence.lights === 'fire');
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    Promise.all([marksFor(y0), marksFor(y1)])
      .then(([a, b]) => {
        if (!live) return;
        setPair({ a, b });
        warm(y0);
      })
      .catch((e) => console.warn('[presence] marks failed', y0, y1, e));
    return () => {
      live = false;
    };
  }, [wanted, y0, y1]);

  // While the next pair builds, hold the old one at its nearer end rather than
  // dropping to nothing.
  const current = pair;
  const fresh = !!pair && pair.a.year === y0 && pair.b.year === y1;
  const fade = fresh ? f : pair && time > pair.b.year ? 1 : 0;
  const visibleFraction = fireVisibleFraction(view.zoom);

  const fireLayers = useMemo(
    () =>
      current
        ? [current.a, current.b].map(
            (b) => new FireLayer({ id: `fire-${b.year}`, data: b.data as never, visibleFraction: 1 }),
          )
        : [],
    [current],
  );

  const layers: LayersList = [];
  if (enabled && presence.lights === 'fire' && far > 0)
    fireLayers.forEach((l, i) =>
      // Held from another time while this one builds: dimmed, so it reads as
      // waiting rather than as the answer.
      layers.push(
        l.clone({ visibleFraction, opacity: far * (fresh ? 1 : 0.4) * (i === 0 ? 1 - fade : fade), visible: true }),
      ),
    );
  const waiting: [number, number] | null = wanted && !fresh ? [y0, y1] : null;
  return { layers, animating: layers.length > 0, waiting };
}
