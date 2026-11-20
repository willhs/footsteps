// The clock the sun-time features run on: the real time, unless the URL bends it for checking.
//   ?utc=6.5   start at 06:30 UTC (today's date) instead of now
//   ?warp=60   run this many times faster than real time (60: a day in 24 minutes)
// The stats panel's sun time, the Day/night shading and the daily routine (lib/routine.ts) all read it,
// so a bent clock shows the same hour everywhere. Without either parameter it is `Date.now()`.

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

/** Whether the URL bent the clock so it moves (the page then redraws the sun time every second). A still clock does not move. */
export const solarClockBent = () => bend !== null && bend.warp !== 0;

/** The clock now, in milliseconds since the epoch. */
export function solarNowMs(): number {
  if (!bend) return Date.now();
  return bend.start + (Date.now() - bend.realStart) * bend.warp;
}

/** Forget the bend (tests). */
export function resetSolarClock(): void {
  bend = null;
  configuredFor = null;
}
