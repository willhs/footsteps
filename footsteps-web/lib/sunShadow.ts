// Shadows on the close-up ground: which way and how far a thing's shadow falls, from the sun clock (lib/sunTime.ts, lib/solarClock.ts,
// the time-of-day dial). Seen from straight above, a shadow beside every tree, hut and person is what makes the ground read as a place
// rather than a map. One sun for the whole view, like lib/sky.ts. The shadows are imagined presentation: only the sun's direction is computed.
import { sunVector } from './sky';
import { sunPosition } from './sunTime';
import { solarNowMs } from './solarClock';

/** Where a thing's shadow falls: metres east and north per metre of the thing's height, and how dark it is (0 at night, 1 by day). */
export type SunShadow = { east: number; north: number; strength: number };

/** A shadow is never drawn longer than this many times the height of what casts it: at a low sun (under ~18° up) it would run
 * across the screen, and soft real shadows that long fade into the dusk anyway. */
export const MAX_SHADOW_PER_M = 3;
/** Sun altitude (sine) over which shadows fade in at dawn and out at dusk: from the horizon to about 8° up. */
const FADE_IN_SIN_ALT: [number, number] = [0, Math.sin((8 * Math.PI) / 180)];

const NO_SHADOW: SunShadow = { east: 0, north: 0, strength: 0 };

/** The shadow at a place for a clock time (ms since the epoch). */
export function sunShadowAt(lon: number, lat: number, ms: number): SunShadow {
  const [e, n, up] = sunVector(lon, lat, sunPosition(new Date(ms)));
  if (up <= FADE_IN_SIN_ALT[0]) return NO_SHADOW;
  const t = Math.min(1, (up - FADE_IN_SIN_ALT[0]) / (FADE_IN_SIN_ALT[1] - FADE_IN_SIN_ALT[0]));
  let east = -e / up;
  let north = -n / up;
  const len = Math.hypot(east, north);
  if (len > MAX_SHADOW_PER_M) {
    east *= MAX_SHADOW_PER_M / len;
    north *= MAX_SHADOW_PER_M / len;
  }
  return { east, north, strength: t * t * (3 - 2 * t) };
}

/** Recomputed at most this often (ms of real time) and per this many degrees of view centre: draw() calls it every frame per tile. */
const RECHECK_MS = 1000;
const PLACE_DEG = 0.25;
let last: { at: number; key: string; shadow: SunShadow } | null = null;

/** The shadow now (the solar clock, so the time-of-day dial turns it) at the view centre, cached for draw calls. */
export function sunShadowNow(lon: number, lat: number): SunShadow {
  const key = `${Math.round(lon / PLACE_DEG)},${Math.round(lat / PLACE_DEG)}`;
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  if (last && last.key === key && now - last.at < RECHECK_MS) return last.shadow;
  last = { at: now, key, shadow: sunShadowAt(lon, lat, solarNowMs()) };
  return last.shadow;
}
