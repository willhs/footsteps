'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';

/** The spot under the cursor: screen position (for the card) and the lon/lat beneath it. */
export type HoverPoint = { x: number; y: number; lon: number; lat: number };
export type Unproject = (x: number, y: number) => [number, number] | null;

/** Desktop only: a precise pointer that can hover. Touch and pen get no card. */
const hasFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Tracks the cursor over the map for the hover card. One update per animation frame; no
 * point while a button is held (dragging), while `suspended` (the view is zooming or
 * panning, so the spot under a still cursor keeps changing), or off a precise pointer.
 * Spread `bind` on the element the cursor moves over.
 */
export default function useHoverPoint({
  enabled,
  suspended,
  unprojectRef,
}: {
  enabled: boolean;
  suspended: boolean;
  unprojectRef: MutableRefObject<Unproject | null>;
}) {
  const [point, setPoint] = useState<HoverPoint | null>(null);
  const [fine, setFine] = useState(false);
  const last = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const frame = useRef(0);
  const on = enabled && fine;

  useEffect(() => setFine(hasFinePointer()), []);

  const resolve = useCallback(() => {
    frame.current = 0;
    const p = last.current;
    const lonLat = p && unprojectRef.current?.(p.x, p.y);
    setPoint(p && lonLat ? { x: p.clientX, y: p.clientY, lon: lonLat[0], lat: lonLat[1] } : null);
  }, [unprojectRef]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(resolve);
  }, [resolve]);

  const clear = useCallback(() => {
    last.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setPoint(null);
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!on || e.pointerType !== 'mouse' || e.buttons !== 0) {
        if (last.current) clear();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      last.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY };
      schedule();
    },
    [on, schedule, clear],
  );

  // After a zoom or pan settles the cursor has not moved, but the ground under it has.
  useEffect(() => {
    if (!suspended && last.current) schedule();
  }, [suspended, schedule]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return {
    point: on && !suspended ? point : null,
    bind: { onPointerMove, onPointerDown: clear, onPointerLeave: clear },
  };
}
