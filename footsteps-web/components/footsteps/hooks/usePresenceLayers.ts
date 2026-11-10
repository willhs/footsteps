'use client';

// Prototype presence styles over the population data, chosen in the viewer:
// - lights: 'classic' keeps the per-cell glow / night lights; 'fire' draws
//   flickering firelight sprites instead (FireLayer).
// - steps: walkers by way of life between the fires in view (footsteps.ts).
import { useEffect, useMemo, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { bracket, nearestDataYear } from '@/lib/time';
import { loadGrid } from './gridLoader';
import { viewBounds } from './peopleView';
import FireLayer, { buildFireMarks, fireData, fireVisibleFraction, type FireMarks } from '../layers/FireLayer';
import WalkLayer from '../layers/WalkLayer';
import { buildWalks, stepsOpacity, WALK_TRAIL } from '../layers/footsteps';

export type Presence = { lights: 'classic' | 'fire'; steps: boolean };
export const DEFAULT_PRESENCE: Presence = { lights: 'fire', steps: true };

export function presenceFromUrl(): Presence {
  if (typeof window === 'undefined') return DEFAULT_PRESENCE;
  const q = new URLSearchParams(window.location.search);
  return {
    lights: q.get('lights') === 'classic' ? 'classic' : 'fire',
    steps: q.get('steps') !== '0',
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
  size,
  /** 0..1: how much the far-out look (glow) is showing; fires fade with it. */
  far,
  /** 0..1: individual people at street zoom; footsteps fade out under them. */
  people,
}: {
  enabled: boolean;
  presence: Presence;
  time: number;
  view: View;
  size: { width: number; height: number };
  far: number;
  people: number;
}): { layers: LayersList; animating: boolean } {
  const { y0, y1, f } = bracket(time);
  const near = nearestDataYear(time);
  const [pair, setPair] = useState<{ a: Built; b: Built } | null>(null);
  const wanted = enabled && (presence.lights === 'fire' || presence.steps);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    Promise.all([marksFor(y0), marksFor(y1)])
      .then(([a, b]) => live && setPair({ a, b }))
      .catch((e) => console.warn('[presence] marks failed', y0, y1, e));
    return () => {
      live = false;
    };
  }, [wanted, y0, y1]);

  const current = pair && pair.a.marks.year === y0 && pair.b.marks.year === y1 ? pair : null;
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

  // Walks: rebuilt when the view settles somewhere new (snapped), not every frame.
  const snap = (v: number, s: number) => Math.round(v / s) * s;
  const b = viewBounds(view, size.width, size.height);
  const zoomKey = snap(view.zoom, 0.5);
  const boundsKey = [b.west, b.south, b.east, b.north].map((v) => snap(v, 2 / Math.pow(2, zoomKey))).join();
  const nearMarks = current ? (near === y0 ? current.a.marks : current.b.marks) : null;
  const walks = useMemo(
    () =>
      presence.steps && nearMarks && zoomKey >= 2.5 ? buildWalks(nearMarks, b, zoomKey, fireVisibleFraction(zoomKey)) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presence.steps, nearMarks, boundsKey, zoomKey],
  );
  const walkLayer = useMemo(
    () =>
      walks.length
        ? new WalkLayer({
            id: 'footsteps',
            data: walks,
            getPath: (w) => w.path,
            getTimestamps: (w) => w.timestamps,
            getColor: (w) => (w.farmer ? [255, 214, 150] : [255, 236, 200]),
            widthUnits: 'pixels',
            getWidth: 1.4,
            widthMinPixels: 1,
            capRounded: true,
            jointRounded: true,
            fadeTrail: true,
            trailLength: WALK_TRAIL,
          })
        : null,
    [walks],
  );

  const layers: LayersList = [];
  if (enabled && presence.lights === 'fire' && far > 0)
    fireLayers.forEach((l, i) =>
      layers.push(l.clone({ visibleFraction, opacity: far * (i === 0 ? 1 - f : f), visible: true })),
    );
  const steps = (1 - people) * stepsOpacity(view.zoom);
  if (enabled && walkLayer && steps > 0) layers.push(walkLayer.clone({ opacity: 0.85 * steps, visible: true }));
  return { layers, animating: layers.length > 0 };
}
