// Footsteps: a few hundred walkers among the fires in view, moving by way of
// life. Foragers (sparse cells, the same band threshold as units) roam between
// nearby camps; farmers (denser cells) walk from home out to a field and back
// and otherwise stay put. Paths are illustrative and time-compressed: they show
// the pattern of movement, not real routes. Drawn with deck.gl's TripsLayer, so
// the trails animate on the GPU from one `currentTime`.
import { BAND_MAX_CELL } from './units';
import type { FireMarks } from './FireLayer';

export type Walk = { path: [number, number][]; timestamps: number[]; farmer: boolean };
type Bounds = { west: number; south: number; east: number; north: number };

/** Seconds before the walks repeat. */
export const WALK_PERIOD = 60;
/** Seconds of trail behind each walker. */
export const WALK_TRAIL = 2.5;
export const MAX_WALKERS = 320;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Footsteps fade in between these zooms: from farther out a day's walk is far
 * below a pixel, and trails between distant marks read as noise. */
export const STEPS_ZOOM: [number, number] = [2.8, 3.6];
export function stepsOpacity(zoom: number) {
  const [a, b] = STEPS_ZOOM;
  return Math.min(1, Math.max(0, (zoom - a) / (b - a)));
}

/** Degrees per screen pixel at a Web Mercator zoom (at the equator). */
export const degPerPx = (zoom: number) => 360 / (512 * Math.pow(2, zoom));

export function buildWalks(
  marks: FireMarks,
  bounds: Bounds,
  zoom: number,
  visibleFraction: number,
  max = MAX_WALKERS,
): Walk[] {
  // Marks that are on screen and shown at this zoom.
  const inView: number[] = [];
  for (let i = 0; i < marks.length; i++) {
    if (marks.rank[i] > visibleFraction) continue;
    const lon = marks.positions[i * 2];
    const lat = marks.positions[i * 2 + 1];
    if (lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north) inView.push(i);
  }
  if (!inView.length) return [];
  const r = rng(marks.year * 7919 + Math.round(bounds.west * 10) * 31 + Math.round(zoom * 4));
  const px = degPerPx(zoom);
  const speed = 16 * px; // degrees per second: a stylised, time-compressed walk
  const reach = 70 * px;
  const hop = 12 * px; // shortest move worth drawing
  // Bucket marks by `reach` so a walker finds its neighbours without scanning
  // every mark in view (at street zoom a random pick is almost never nearby).
  const buckets = new Map<number, number[]>();
  const key = (bx: number, by: number) => bx * 100003 + by;
  for (const i of inView) {
    const k = key(Math.floor(marks.positions[i * 2] / reach), Math.floor(marks.positions[i * 2 + 1] / reach));
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }
  const near: number[] = [];
  const neighbour = (x: number, y: number): number | null => {
    near.length = 0;
    const bx = Math.floor(x / reach);
    const by = Math.floor(y / reach);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const m of buckets.get(key(bx + dx, by + dy)) ?? []) {
          const d = Math.hypot(marks.positions[m * 2] - x, marks.positions[m * 2 + 1] - y);
          if (d < reach && d > hop) near.push(m);
        }
    return near.length ? near[Math.floor(r() * near.length)] : null;
  };
  const n = Math.min(max, inView.length);
  const walks: Walk[] = [];
  for (let w = 0; w < n; w++) {
    const home = inView[Math.floor(r() * inView.length)];
    const hx = marks.positions[home * 2];
    const hy = marks.positions[home * 2 + 1];
    const farmer = marks.cellPeople[home] >= BAND_MAX_CELL;
    const path: [number, number][] = [[hx, hy]];
    const ts: number[] = [0];
    let t = r() * 8; // staggered start
    let x = hx;
    let y = hy;
    const go = (nx: number, ny: number, pace: number) => {
      path.push([x, y]);
      ts.push(t);
      t += Math.hypot(nx - x, ny - y) / (speed * pace);
      x = nx;
      y = ny;
      path.push([x, y]);
      ts.push(t);
    };
    const end = WALK_PERIOD + WALK_TRAIL;
    while (t < end) {
      if (farmer) {
        // out to a field, work, home again, rest
        const a = r() * Math.PI * 2;
        const d = (8 + r() * 10) * px;
        go(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 0.5);
        t += 1 + r() * 2;
        go(hx, hy, 0.5);
        t += 1 + r() * 3;
      } else {
        // roam to a nearby camp; with none close, stay (never into empty land or sea)
        const m = neighbour(x, y);
        if (m === null) t += 2 + r() * 2;
        else go(marks.positions[m * 2], marks.positions[m * 2 + 1], 0.8 + r() * 0.5);
        t += r() * 1.5;
      }
    }
    // hold the last spot until the loop ends (a wait adds time without a point)
    path.push([x, y]);
    ts.push(t);
    walks.push({ path, timestamps: ts, farmer });
  }
  return walks;
}
