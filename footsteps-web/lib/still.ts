// `?still=1` stops every time-based animation, so a screenshot of the same scene has the same pixels each run
// (the visual regression run, docs/ops/visual-regression.md). It freezes three things:
//   - the shader clock (fire flicker, morph shimmer, walking feet, animal sway): `animSeconds` is a fixed instant;
//   - the sun clock (night shading, the stats panel's sun time, the routine): with `?utc=`, `solarClock.ts` pins it to
//     one fixed date at those hours; without, the time-of-day dial's default (lib/timeOfDay.ts) is a fixed instant too;
//   - nothing else: data, layout and the picked scene are exactly what a visitor sees.
// Off unless the URL says `?still=1`; no visitor link has it.

/** Where the frozen shader clock stands, in seconds. Any value: it only has to be the same every run. */
export const STILL_SECONDS = 7.25;

/** The fixed day the frozen sun clock reads (the June solstice: a plain, far-from-edge sun). */
export const STILL_DAY_UTC_MS = Date.UTC(2024, 5, 21);

/** Whether a query string asks for a still scene. */
export function stillRequested(search: string): boolean {
  return new URLSearchParams(search).get('still') === '1';
}

let cached: boolean | null = null;

/** Whether this page is still. Read once from the address bar in the browser (the app is one page per URL);
 * on the server there is no address, so it is not cached and is false. */
export function stillOn(): boolean {
  if (typeof window === 'undefined') return false;
  if (cached === null) cached = stillRequested(window.location.search);
  return cached;
}

/** Forget the cached answer (tests). */
export function resetStill(): void {
  cached = null;
}

/**
 * The shared animation clock in seconds, wrapped at `wrap` so a float32 uniform keeps its precision.
 * Real time is `performance.now()`; a still page gets `STILL_SECONDS`.
 */
export function animSeconds(wrap: number): number {
  return stillOn() ? STILL_SECONDS % wrap : (performance.now() / 1000) % wrap;
}
