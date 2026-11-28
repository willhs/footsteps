// Close-up light, sky and water (`?sky=1`, off until Will has looked at it on prod; docs/ops/close-up-scene.md).
// The sun clock (lib/sunTime.ts, lib/solarClock.ts: `?utc=`, `?warp=`) says where the sun is over the view; this turns that into the
// light the close-up ground is drawn with (layers/skyLight.ts) and the sky behind it. All of it is imagined presentation: the relief
// and the sea level are measured or modelled, the colour of the light and the haze are not data.
import { solarAltitude, sunPosition, type SunPosition } from './sunTime';

export type Rgb01 = [number, number, number];

/** The light one close-up view is drawn with: one sun for the whole view (a view is at most ~100 km across). */
export type SceneLight = {
  /** Changes only when the picture would (rounded values), for layer update triggers. */
  key: string;
  /** Unit vector toward the light, east-north-up: the sun by day, an imagined moon opposite it at night. */
  sun: Rgb01;
  /** Direct light colour × strength (0..~1.2). */
  direct: Rgb01;
  /** Light from the whole sky, never zero (the floor at night). */
  ambient: Rgb01;
  /** Sky colour overhead. */
  zenith: Rgb01;
  /** Sky colour at the horizon; distance haze takes this colour. */
  horizon: Rgb01;
  /** 0..1 strength of the light's reflection on water. */
  glint: number;
};

/** `?sky=1` turns it on. */
export function skyParam(search: string): boolean {
  return new URLSearchParams(search).get('sky') !== '0';
}

/** Unit vector from a place toward the sun, east-north-up (mean solar position, like the rest of the sun clock). */
export function sunVector(lon: number, lat: number, sun: SunPosition): Rgb01 {
  const rad = Math.PI / 180;
  const hourAngle = (lon - sun.longitude) * rad; // > 0: the sun is west of the meridian (afternoon)
  const dec = sun.declination * rad;
  const phi = lat * rad;
  return [
    -Math.cos(dec) * Math.sin(hourAngle),
    Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(hourAngle),
    solarAltitude(lon, lat, sun),
  ];
}

type Key = { alt: number; direct: Rgb01; ambient: Rgb01; zenith: Rgb01; horizon: Rgb01; glint: number };

/** The look by the sun's altitude in degrees, interpolated between rows: a drawing table, not data. Night has a moonlit blue-grey
 * floor so the hearths (drawn elsewhere) carry the scene; low sun is warm; high sun is white with a blue sky. */
const KEYS: Key[] = [
  { alt: -90, direct: [0.15, 0.19, 0.28], ambient: [0.12, 0.14, 0.21], zenith: [0.02, 0.03, 0.07], horizon: [0.07, 0.09, 0.15], glint: 0.25 },
  { alt: -18, direct: [0.15, 0.19, 0.28], ambient: [0.12, 0.14, 0.21], zenith: [0.02, 0.03, 0.07], horizon: [0.07, 0.09, 0.15], glint: 0.25 },
  { alt: -8, direct: [0.08, 0.1, 0.16], ambient: [0.14, 0.15, 0.24], zenith: [0.05, 0.07, 0.17], horizon: [0.2, 0.18, 0.28], glint: 0.1 },
  { alt: -3, direct: [0.05, 0.05, 0.08], ambient: [0.26, 0.24, 0.32], zenith: [0.13, 0.18, 0.36], horizon: [0.62, 0.4, 0.38], glint: 0.1 },
  { alt: 0, direct: [0.55, 0.28, 0.12], ambient: [0.34, 0.3, 0.34], zenith: [0.22, 0.32, 0.55], horizon: [0.93, 0.56, 0.34], glint: 0.9 },
  { alt: 4, direct: [0.95, 0.6, 0.34], ambient: [0.38, 0.36, 0.4], zenith: [0.3, 0.45, 0.7], horizon: [0.95, 0.72, 0.5], glint: 1 },
  { alt: 10, direct: [1.0, 0.82, 0.6], ambient: [0.4, 0.42, 0.48], zenith: [0.32, 0.52, 0.8], horizon: [0.82, 0.82, 0.78], glint: 1 },
  { alt: 25, direct: [1.0, 0.95, 0.86], ambient: [0.4, 0.44, 0.52], zenith: [0.28, 0.5, 0.84], horizon: [0.74, 0.83, 0.92], glint: 0.9 },
  { alt: 90, direct: [1.02, 1.0, 0.95], ambient: [0.4, 0.44, 0.52], zenith: [0.22, 0.45, 0.82], horizon: [0.7, 0.81, 0.93], glint: 0.8 },
];

const lerp3 = (a: Rgb01, b: Rgb01, t: number): Rgb01 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The table's row at an altitude (degrees), interpolated. */
function lookAt(alt: number): Omit<Key, 'alt'> {
  let i = 1;
  while (i < KEYS.length - 1 && KEYS[i].alt < alt) i++;
  const [a, b] = [KEYS[i - 1], KEYS[i]];
  const t = Math.min(1, Math.max(0, (alt - a.alt) / (b.alt - a.alt)));
  return {
    direct: lerp3(a.direct, b.direct, t),
    ambient: lerp3(a.ambient, b.ambient, t),
    zenith: lerp3(a.zenith, b.zenith, t),
    horizon: lerp3(a.horizon, b.horizon, t),
    glint: a.glint + (b.glint - a.glint) * t,
  };
}

/** Altitude (degrees) the imagined moon stands at when the sun is down. */
const MOON_ALTITUDE = 35;

/** The light over (lon, lat) at a sun-clock time (ms since the epoch). */
export function sceneLight(lon: number, lat: number, ms: number): SceneLight {
  const sunVec = sunVector(lon, lat, sunPosition(new Date(ms)));
  const alt = (Math.asin(Math.max(-1, Math.min(1, sunVec[2]))) * 180) / Math.PI;
  const look = lookAt(alt);
  // Day: the sun itself. Night: a moon opposite the sun's bearing, MOON_ALTITUDE up. Between, the light swaps where both are weak
  // (from the sun 2° below the horizon to 6° below), so the shading never swings while it is bright.
  const flat = Math.hypot(sunVec[0], sunVec[1]) || 1;
  const m = (MOON_ALTITUDE * Math.PI) / 180;
  const moon: Rgb01 = [(-sunVec[0] / flat) * Math.cos(m), (-sunVec[1] / flat) * Math.cos(m), Math.sin(m)];
  const sunAbove: Rgb01 = [sunVec[0], sunVec[1], Math.max(sunVec[2], 0.03)];
  const toMoon = Math.min(1, Math.max(0, (-2 - alt) / 4));
  const mixed = lerp3(sunAbove, moon, toMoon);
  const len = Math.hypot(...mixed) || 1;
  const sun: Rgb01 = [mixed[0] / len, mixed[1] / len, mixed[2] / len];
  const r = (v: number) => v.toFixed(2);
  return {
    key: [...sun, ...look.direct, ...look.horizon].map(r).join(','),
    sun,
    ...look,
  };
}

/** deck.gl's default field of view for a map view (altitude 1.5), in degrees. */
const FOVY = (2 * Math.atan(0.5 / 1.5) * 180) / Math.PI;

/** How far down the screen (0 top, 1 bottom) the horizon is for a camera pitch in degrees; below 0 when it is off the top. */
export function horizonRow(pitch: number): number {
  const half = Math.tan(((FOVY / 2) * Math.PI) / 180);
  return 0.5 - (0.5 * Math.tan(((90 - pitch) * Math.PI) / 180)) / half;
}

const css = (c: Rgb01, a = 1) => `rgba(${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')},${a})`;

/** The sky behind the close-up as a CSS background: zenith at the top, the horizon colour at the horizon and everywhere below it
 * (below the horizon it shows only past the far end of the drawn ground, which the haze has already turned that colour). */
export function skyBackdrop(light: SceneLight, pitch: number): string {
  const h = Math.max(0, horizonRow(pitch)) * 100;
  const glow = lerp3(light.horizon, light.zenith, 0.45);
  return `linear-gradient(to bottom, ${css(light.zenith)} 0%, ${css(glow)} ${(h * 0.55).toFixed(1)}%, ${css(light.horizon)} ${h.toFixed(1)}%, ${css(light.horizon)} 100%)`;
}

/** Metres the camera stands from the view centre (deck.gl: 1.5 viewport heights in pixels at the centre's scale). */
export function cameraDistanceM(zoom: number, lat: number, heightPx: number): number {
  return 1.5 * heightPx * ((40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom));
}

/** Drawn metres to lift the whole camera (deck.gl viewState `position[2]`) with `?sky=1`, so the view centre sits on the ground and the
 * camera never ends up inside a mountain. deck.gl measures the camera from sea level: at the sky tilt and zoom 13 it is ~2.4 km above
 * sea level, under the Alps' drawn summits. `hCentre`, `hCamera`: ground heights (m, measured) at the view centre and under the camera;
 * `exaggeration`: how much taller relief is drawn (lib/close3d.ts EXAGGERATION). Never below 0: lowland views are not lowered. */
export function cameraLift(hCentre: number, hCamera: number, distM: number, pitch: number, exaggeration: number): number {
  const above = distM * Math.cos((pitch * Math.PI) / 180); // camera height above the centre
  const clearance = Math.max(80, 0.25 * above);
  return Math.max(0, hCentre * exaggeration, hCamera * exaggeration + clearance - above);
}
