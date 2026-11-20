// Where a person's footprints are, in metres from their spot, at a moment of the clock.
//
// THE SAME MATHS RUNS ON THE GPU: the `gait` GLSL string in components/footsteps/layers/people.ts
// draws the prints from this. Change one, change the other (lib/gait.test.ts pins values). The
// one thing not shared is the person's hash `h`: GPU `sin` of a large number differs between
// cards, so `gaitSeed` is computed here and sent to the shader as an attribute.
//
// This is what lets a name tag follow a walker: the tag asks for the newest print's place.

import { animSeconds } from './still';
import { WALK_MS, stateAt, styleOf, type DayPlan, type State } from './routine';

/** The shared animation clock (seconds), as the shader's `peopleAnim.time` uniform gets it. */
export const animClock = () => animSeconds(100_000);

const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A stable number in [0, 1) for a place (the shader's old `fract(sin(dot(...)))` hash), rounded to
 * float32 so the GPU reads exactly what this code used. */
export function gaitSeed(lon: number, lat: number): number {
  return Math.fround(fract(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453));
}

export type Gait = {
  /** Metres east and north of the person's spot (print `k`). */
  x: number;
  y: number;
  /** Unit vector the print points along (east, north). */
  dirX: number;
  dirY: number;
  /** True while walking, false while standing. */
  moving: boolean;
  /** How strongly the print shows, 0-1 (the shader's `vPrintAlpha`). */
  alpha: number;
};

/** Print `k` (0 newest, 1 and 2 the fading ones behind it) of the person with hash `h` at `clock` seconds.
 * `style` is the daily routine's (lib/routine.ts `styleOf`): 0 as the person is by default, 1 asleep (both
 * feet together, no steps), 2 playing (on the move, in a wide loop), 3 working at the end of a trip (on
 * the move in a small, slow loop). */
export function gaitAt(h: number, clock: number, k = 0, style = 0): Gait {
  // About three in ten are on the move a lot (a loop of up to ~25 m at 0.8-1.4 m/s); the rest
  // stand or sit at their spot and now and then take a few steps within a couple of metres.
  const walker = style > 1.5 || (h >= 0.7 && style < 0.5) ? 1 : 0;
  let reach = mix(1 + 1.5 * fract(h * 7), 8 + 16 * fract(h * 7), walker);
  let speed = mix(0.6, 0.8 + 0.6 * fract(h * 13), walker);
  if (style > 2.5) {
    reach = 4 + 8 * fract(h * 7);
    speed = 0.5 + 0.4 * fract(h * 13);
  }
  const w = speed / reach;
  const period = 25 + 70 * fract(h * 17);
  const walkFrac = style > 0.5 && style < 1.5 ? 0 : mix(0.1, 0.5 + 0.35 * fract(h * 19), walker);
  // Walked time: the clock runs only while walking, so the path is continuous through stops.
  const t = clock + h * 977;
  const cyc = Math.floor(t / period);
  const within = t - cyc * period;
  const walkT = walkFrac * period;
  const s = cyc * walkT + Math.min(within, walkT);
  const moving = within < walkT;
  const stepT = 0.7 / speed; // a ~0.7 m step
  const n = Math.floor(s / stepT);
  const phase = fract(s / stepT);
  const sk = moving ? (n - k + 0.5) * stepT : s;
  const a1 = sk * w + h * 6.2832;
  const a2 = sk * w * 0.8 + h * 3.7;
  const dx = Math.cos(a1) + 1e-4;
  const dy = -0.8 * Math.sin(a2) + 1e-4;
  const len = Math.hypot(dx, dy);
  const alpha = moving
    ? k < 0.5
      ? smoothstep(0, 0.2, phase)
      : k < 1.5
        ? mix(1, 0.55, phase)
        : mix(0.55, 0, phase)
    : k < 1.5
      ? 1
      : 0;
  return { x: reach * Math.sin(a1), y: reach * Math.cos(a2), dirX: dx / len, dirY: dy / len, moving, alpha };
}

/** Print `k` of a person on the road (the out or back leg of a trip): a straight line along the bearing,
 * one ~0.7 m step at a time at WALK_MS. KEEP IN SYNC with the `transit` branch of the shader. */
function transitGait(s: Extract<State, { activity: 'trip' }>, k: number): Gait {
  const stepT = STEP_M / WALK_MS;
  const n = Math.floor(s.legSeconds / stepT);
  const phase = fract(s.legSeconds / stepT);
  const outward = s.leg === 'out';
  const along = (n - k + 0.5) * STEP_M;
  const at = clamp(outward ? along : s.dist - along, 0, s.dist);
  const dx = Math.cos(s.bearing) * (outward ? 1 : -1);
  const dy = Math.sin(s.bearing) * (outward ? 1 : -1);
  const alpha = k < 0.5 ? smoothstep(0, 0.2, phase) : k < 1.5 ? mix(1, 0.55, phase) : mix(0.55, 0, phase);
  return { x: Math.cos(s.bearing) * at, y: Math.sin(s.bearing) * at, dirX: dx, dirY: dy, moving: true, alpha };
}

const STEP_M = 0.7;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** `gaitAt` for a person with a daily routine (`?routine=1`): where print `k` is, in metres from their spot, at
 * `clock` seconds and the local sun hour `localHour`. The state picks the style; on a trip the person is
 * also carried along the road to the end of it. KEEP IN SYNC with the routine block of the `gait` GLSL. */
export function routineGaitAt(plan: DayPlan, h: number, clock: number, localHour: number, k = 0): Gait {
  const state = stateAt(plan, localHour);
  if (state.activity === 'trip' && state.leg !== 'there') return transitGait(state, k);
  const g = gaitAt(h, clock, k, styleOf(state));
  if (state.activity !== 'trip') return g;
  return { ...g, x: g.x + Math.cos(state.bearing) * state.dist, y: g.y + Math.sin(state.bearing) * state.dist };
}

const M_PER_DEG_LAT = 111_320;

/** Where a person's newest print is, as [lon, lat], given their spot and hash. With a routine (their `plan`,
 * and the local sun hour there) the day has moved them. */
export function newestPrint(
  position: readonly [number, number],
  h: number,
  clock: number,
  routine?: { plan: DayPlan; localHour: number },
): [number, number] {
  const { x, y } = routine ? routineGaitAt(routine.plan, h, clock, routine.localHour, 0) : gaitAt(h, clock, 0);
  const mPerDegLon = M_PER_DEG_LAT * Math.max(0.2, Math.cos((position[1] * Math.PI) / 180));
  return [position[0] + x / mPerDegLon, position[1] + y / M_PER_DEG_LAT];
}
