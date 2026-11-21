'use client';
// Drives the `?tour=1` guided tour (lib/tour.ts, docs/ops/tour.md) through the app's own setters: the year through
// `setTime` (the page's slider state), the camera through `onViewStateChange` (the same path WASD pan uses).
// A flight is a requestAnimationFrame tween; the user's own pointer, wheel or keys stop it where it is, so the tour
// never fights a drag. Without the flag the hook does nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FLY_MS, TOUR_STOPS, flyFrame, stepTour, tourKeyAction, tourParam, type TourState, type TourStop, type TourView } from '@/lib/tour';
import type { ViewState } from '@/lib/parseInitialViewState';

type Options = {
  viewState: ViewState;
  onViewStateChange: (p: { viewState: TourView }) => void;
  setTime?: (time: number) => void;
};

export type Tour = {
  stop: TourStop;
  index: number;
  count: number;
  next: () => void;
  back: () => void;
  exit: () => void;
};

export default function useTour({ viewState, onViewStateChange, setTime }: Options): Tour | null {
  const [index, setIndex] = useState<TourState>(null);
  // The flag is read after mount, like the app's other query flags (the static HTML has no address).
  useEffect(() => {
    if (setTime && tourParam(window.location.search)) setIndex(0);
  }, [setTime]);

  const viewRef = useRef(viewState);
  viewRef.current = viewState;
  const changeRef = useRef(onViewStateChange);
  changeRef.current = onViewStateChange;
  const frame = useRef(0);
  const cancelFlight = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  // Each new stop: set the year once, then fly from wherever the camera is.
  useEffect(() => {
    if (index === null) return;
    const stop = TOUR_STOPS[index];
    setTime?.(stop.year);
    const v = viewRef.current;
    const from: TourView = { latitude: v.latitude, longitude: v.longitude, zoom: v.zoom, pitch: v.pitch ?? 0, bearing: v.bearing ?? 0 };
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / FLY_MS);
      changeRef.current({ viewState: flyFrame(from, stop.view, t) });
      frame.current = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    cancelFlight();
    frame.current = requestAnimationFrame(tick);
    return cancelFlight;
  }, [index, setTime, cancelFlight]);

  const exit = useCallback(() => {
    cancelFlight();
    setIndex(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('tour');
    window.history.replaceState(null, '', url);
  }, [cancelFlight]);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (index === null) return;
      const to = stepTour(index, dir);
      if (to === null) exit();
      else setIndex(to);
    },
    [index, exit],
  );
  const next = useCallback(() => step(1), [step]);
  const back = useCallback(() => step(-1), [step]);

  const active = index !== null;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const action = tourKeyAction(e, el && { tagName: el.tagName, role: el.getAttribute?.('role'), isContentEditable: el.isContentEditable });
      if (!action) {
        cancelFlight(); // WASD pan, the slider's keys: the user is steering now
        return;
      }
      e.preventDefault();
      if (action === 'next') next();
      else if (action === 'back') back();
      else exit();
    };
    // A press or wheel on the map (or anywhere) hands the camera back to the user mid-flight.
    const onPointer = () => cancelFlight();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('wheel', onPointer, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('wheel', onPointer, true);
    };
  }, [active, next, back, exit, cancelFlight]);

  if (index === null) return null;
  return { stop: TOUR_STOPS[index], index, count: TOUR_STOPS.length, next, back, exit };
}
