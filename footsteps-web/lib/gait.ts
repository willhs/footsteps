// Where a person's footprints are, in metres from their spot, at a moment of the clock.
//
// THE SAME MATHS RUNS ON THE GPU: the `gait` GLSL string in components/footsteps/layers/people.ts
// draws the prints from this. Change one, change the other (lib/gait.test.ts pins values). The
// one thing not shared is the person's hash `h`: GPU `sin` of a large number differs between
// cards, so `gaitSeed` is computed here and sent to the shader as an attribute.
//
// This is what lets a name tag follow a walker: the tag asks for the newest print's place.

/** The shared animation clock (seconds), as the shader's `peopleAnim.time` uniform gets it. */
export const animClock = () => (performance.now() / 1000) % 100_000;

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

/** Print `k` (0 newest, 1 and 2 the fading ones behind it) of the person with hash `h` at `clock` seconds. */
export function gaitAt(h: number, clock: number, k = 0): Gait {
  // About three in ten are on the move a lot (a loop of up to ~25 m at 0.8-1.4 m/s); the rest
  // stand or sit at their spot and now and then take a few steps within a couple of metres.
  const walker = h < 0.7 ? 0 : 1;
  const reach = mix(1 + 1.5 * fract(h * 7), 8 + 16 * fract(h * 7), walker);
  const speed = mix(0.6, 0.8 + 0.6 * fract(h * 13), walker);
  const w = speed / reach;
  const period = 25 + 70 * fract(h * 17);
  const walkFrac = mix(0.1, 0.5 + 0.35 * fract(h * 19), walker);
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

const M_PER_DEG_LAT = 111_320;

/** Where a person's newest print is, as [lon, lat], given their spot and hash. */
export function newestPrint(
  position: readonly [number, number],
  h: number,
  clock: number,
): [number, number] {
  const { x, y } = gaitAt(h, clock, 0);
  const mPerDegLon = M_PER_DEG_LAT * Math.max(0.2, Math.cos((position[1] * Math.PI) / 180));
  return [position[0] + x / mPerDegLon, position[1] + y / M_PER_DEG_LAT];
}
