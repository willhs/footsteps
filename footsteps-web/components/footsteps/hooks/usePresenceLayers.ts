'use client';

// Prototype presence styles over the population data, chosen in the viewer:
// - lights: 'classic' keeps the per-cell glow / night lights; 'fire' draws
//   flickering firelight sprites instead (FireLayer).
import { useEffect, useMemo, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { bracket } from '@/lib/time';
import { TARGET_YEARS } from '@/lib/constants';
import { loadGrid } from './gridLoader';
import FireLayer, { buildFireMarks, fireData, fireVisibleFraction, type FireMarks } from '../layers/FireLayer';

export type Presence = { lights: 'classic' | 'fire' };
export const DEFAULT_PRESENCE: Presence = { lights: 'fire' };

export function presenceFromUrl(): Presence {
  if (typeof window === 'undefined') return DEFAULT_PRESENCE;
  const q = new URLSearchParams(window.location.search);
  return {
    lights: q.get('lights') === 'classic' ? 'classic' : 'fire',
  };
}

type Built = { marks: FireMarks; data: ReturnType<typeof fireData> };
const built = new Map<number, Built>();
async function marksFor(year: number): Promise<Built> {
  const hit = built.get(year);
  if (hit) return hit;
  const grid = await loadGrid(year);
  const marks = buildFireMarks(year, grid.data);
  const b = { marks, data: fireData(marks) };
  built.set(year, b);
  if (built.size > 6) built.delete(built.keys().next().value!);
  return b;
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
}): { layers: LayersList; animating: boolean } {
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
        // Warm the years either side so scrubbing on does not wait.
        const i = TARGET_YEARS.indexOf(y0);
        for (const y of [TARGET_YEARS[i - 1], TARGET_YEARS[i + 2]])
          if (y !== undefined) void marksFor(y).catch(() => {});
      })
      .catch((e) => console.warn('[presence] marks failed', y0, y1, e));
    return () => {
      live = false;
    };
  }, [wanted, y0, y1]);

  // While the next pair builds, hold the old one at its nearer end rather than
  // dropping to nothing.
  const current = pair;
  const fresh = !!pair && pair.a.marks.year === y0 && pair.b.marks.year === y1;
  const fade = fresh ? f : pair && time > pair.b.marks.year ? 1 : 0;
  const visibleFraction = fireVisibleFraction(view.zoom);

  const fireLayers = useMemo(
    () =>
      current
        ? [current.a, current.b].map(
            (b) => new FireLayer({ id: `fire-${b.marks.year}`, data: b.data as never, visibleFraction: 1 }),
          )
        : [],
    [current],
  );

  const layers: LayersList = [];
  if (enabled && presence.lights === 'fire' && far > 0)
    fireLayers.forEach((l, i) =>
      layers.push(l.clone({ visibleFraction, opacity: far * (i === 0 ? 1 - fade : fade), visible: true })),
    );
  return { layers, animating: layers.length > 0 };
}
