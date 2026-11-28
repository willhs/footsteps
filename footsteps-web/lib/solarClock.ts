// The clock the sun-time features run on: the real time, unless the URL bends it for checking.
//   ?utc=6.5   start at 06:30 UTC (today's date) instead of now
//   ?warp=60   run this many times faster than real time (60: a day in 24 minutes)
// The stats panel's sun time, the night shading and the daily routine (lib/routine.ts) all read it,
// so a bent clock shows the same hour everywhere. Without either parameter it is `Date.now()`.
//
// The time-of-day dial (components/ui/TimeOfDayDial.tsx) sets it too: `setSolarClockAt` stops the clock at
// the dial's instant and tells every listener (`onSolarClockChange`), so the map redraws as the dial turns.

import { STILL_DAY_UTC_MS, stillRequested } from './still';

type Bend = { start: number; realStart: number; warp: number };
let bend: Bend | null = null;
let configuredFor: string | null = null;

/** Read `?utc=` and `?warp=` from a query string. Safe to call again with the same string (the clock
 * keeps running); a different string restarts it. */
export function configureSolarClock(search: string): void {
  if (configuredFor === search) return;
  configuredFor = search;
  const params = new URLSearchParams(search);
  const utc = Number(params.get('utc'));
  const warp = Number(params.get('warp'));
  const hasUtc = params.get('utc') !== null && Number.isFinite(utc);
  const hasWarp = params.get('warp') !== null && Number.isFinite(warp) && warp > 0;
  if (stillRequested(search)) {
    // ?still=1 (lib/still.ts): a stopped clock on one fixed day, at ?utc= hours (default noon).
    bend = { start: STILL_DAY_UTC_MS + (hasUtc ? utc : 12) * 3_600_000, realStart: Date.now(), warp: 0 };
    return;
  }
  if (!hasUtc && !hasWarp) {
    bend = null;
    return;
  }
  const real = Date.now();
  const midnight = real - (real % 86_400_000);
  bend = { start: hasUtc ? midnight + utc * 3_600_000 : real, realStart: real, warp: hasWarp ? warp : 1 };
}

/** Whether a query string sets the hour (`?utc=` or `?warp=`): the time-of-day dial then follows that clock until it is turned.
 * `?still=1` alone does not: a still page starts at the dial's default hour, which is fixed too. */
export function solarClockParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get('utc') !== null || params.get('warp') !== null;
}

/** Whether the URL bent the clock so it moves (the page then redraws the sun time every second). A still clock does not move. */
export const solarClockBent = () => bend !== null && bend.warp !== 0;

/** The clock now, in milliseconds since the epoch. */
export function solarNowMs(): number {
  if (!bend) return Date.now();
  return bend.start + (Date.now() - bend.realStart) * bend.warp;
}

// --- the time-of-day dial ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

/** Call `listener` whenever the dial moves the clock. Returns the unsubscribe. */
export function onSolarClockChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stop the clock at `ms` (the time-of-day dial), replacing any bend the URL made, and tell the listeners. */
export function setSolarClockAt(ms: number): void {
  if (bend && bend.warp === 0 && bend.start === ms) return;
  bend = { start: ms, realStart: Date.now(), warp: 0 };
  for (const listener of listeners) listener();
}

/** Forget the bend (tests). */
export function resetSolarClock(): void {
  bend = null;
  configuredFor = null;
}
