// Rivers in the close-up 3D: Natural Earth 10m river centrelines (present-day courses), baked by footstep-generator/rivers_asset.py
// into public/water/rivers.json and draped on each ground tile as a path (layers/Close3DLayer.ts). Before this the app had no river
// geometry at close-up zooms, only the ~9 km freshwater-distance grid, so even the Nile did not show.
//
// Courses are today's: a river that moved (the Yellow River, the Nile's delta branches) is drawn where it runs now, and the 1:10
// million source is good to a few hundred metres to a km, so a river can sit on a valley side rather than its floor. Rivers are not
// drawn under the ice sheet, in the sea or in past water.
import { EXAGGERATION, MESH_STEP, type Bbox, type Ground } from './close3d';
import type { LakePlane } from './pastWater';

/** `?rivers=0` turns the close-up's rivers off; on by default. */
export function riversParam(search: string): boolean {
  return new URLSearchParams(search).get('rivers') !== '0';
}

type RiversFile = { version: 1; scale: number; rivers: number[][] };
/** One decoded river line: Natural Earth scalerank (0 largest) and lon, lat pairs, smoothed. */
export type RiverLine = { rank: number; coords: Float64Array; west: number; east: number; south: number; north: number };
export type Rivers = { lines: RiverLine[]; bins: Map<number, number[]> };

/** Drawn width in metres by scalerank: the Nile and the Amazon (0-1) several hundred metres, the smallest mapped streams tens. */
export const RIVER_WIDTH_M = [800, 600, 400, 300, 200, 150, 100, 70, 50, 35, 25];
/** Never thinner than this on screen, so a stream stays a line from afar. */
export const RIVER_MIN_PX = 1.2;
/** River water as it looks from above: a dark, slightly green blue (the Nile at Luxor, the Danube), not the teal of shallow sea, which read
 * as painted on. Silty rivers (the Yellow River, the Amazon's white-water tributaries) are browner; one colour is used for all. */
export const RIVER_RGB: [number, number, number] = [52, 86, 92];
/** Drawn metres a river stands above the ground under it, so the relief does not cut it. */
const LIFT_M = 2;

const binKey = (lon: number, lat: number) => (Math.floor(lat) + 90) * 360 + (Math.floor(lon) + 180);

/** Chaikin corner cutting, `rounds` times, keeping both ends: the simplified source's corners read as kinks up close. */
export function smooth(coords: Float64Array, rounds = 2): Float64Array {
  let c = coords;
  for (let r = 0; r < rounds; r++) {
    const n = c.length / 2;
    if (n < 3) return c;
    const out = new Float64Array(4 * n);
    let k = 0;
    out[k++] = c[0];
    out[k++] = c[1];
    for (let i = 0; i < n - 1; i++) {
      const ax = c[i * 2], ay = c[i * 2 + 1], bx = c[i * 2 + 2], by = c[i * 2 + 3];
      if (i > 0) { out[k++] = 0.75 * ax + 0.25 * bx; out[k++] = 0.75 * ay + 0.25 * by; }
      if (i < n - 2) { out[k++] = 0.25 * ax + 0.75 * bx; out[k++] = 0.25 * ay + 0.75 * by; }
    }
    out[k++] = c[(n - 1) * 2];
    out[k++] = c[(n - 1) * 2 + 1];
    c = out.slice(0, k);
  }
  return c;
}

/** The file's integer deltas as smoothed lines, indexed by the 1° cells their points fall in. */
export function decodeRivers(file: RiversFile): Rivers {
  const lines: RiverLine[] = [];
  const bins = new Map<number, number[]>();
  for (const row of file.rivers) {
    const n = (row.length - 1) / 2;
    const raw = new Float64Array(n * 2);
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      x += row[1 + i * 2];
      y += row[2 + i * 2];
      raw[i * 2] = x / file.scale;
      raw[i * 2 + 1] = y / file.scale;
    }
    const coords = smooth(raw);
    let west = 180, east = -180, south = 90, north = -90;
    const keys = new Set<number>();
    for (let i = 0; i < coords.length; i += 2) {
      west = Math.min(west, coords[i]); east = Math.max(east, coords[i]);
      south = Math.min(south, coords[i + 1]); north = Math.max(north, coords[i + 1]);
      keys.add(binKey(coords[i], coords[i + 1]));
    }
    const id = lines.push({ rank: row[0], coords, west, east, south, north }) - 1;
    for (const key of keys) {
      const list = bins.get(key);
      if (list) list.push(id);
      else bins.set(key, [id]);
    }
  }
  return { lines, bins };
}

let loading: Promise<Rivers> | null = null;
/** The rivers, fetched once per page load. */
export function loadRivers(): Promise<Rivers> {
  loading ??= fetch('/water/rivers.json')
    .then((r) => {
      if (!r.ok) throw new Error(`rivers.json: HTTP ${r.status}`);
      return r.json() as Promise<RiversFile>;
    })
    .then(decodeRivers)
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

export type RiverPath = { path: [number, number, number][]; width: number };

/** The rivers on one ground tile, densified to its mesh spacing and set on the drawn surface: each point at the highest of the four mesh
 * vertices round it (plus a lift), so the flat triangles between vertices never hide it. A run stops where the ground is sea, past water
 * or ice, and outside the tile. */
export function riversForTile(rivers: Rivers, heights: Float32Array, bbox: Bbox, sea: number, ground: Ground, lake: LakePlane | null = null): RiverPath[] {
  const { west, east, south, north } = bbox;
  const ids = new Set<number>();
  for (let lat = Math.floor(south); lat <= Math.floor(north); lat++)
    for (let lon = Math.floor(west); lon <= Math.floor(east); lon++) for (const id of rivers.bins.get(binKey(lon, lat)) ?? []) ids.add(id);
  if (!ids.size) return [];
  const size = 256;
  const cell = (east - west) / (size / MESH_STEP); // degrees of longitude between mesh vertices
  const at = (px: number, py: number) => heights[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))];
  /** Drawn height at a point inside the tile, or null where no river should show. */
  const surface = (lon: number, lat: number): number | null => {
    const fx = ((lon - west) / (east - west)) * size;
    const fy = ((north - lat) / (north - south)) * size;
    const h = at(Math.floor(fx), Math.floor(fy));
    if (h <= sea || (lake && lake.levelAt(lon, lat, h) !== null) || ground.biomeAt(lon, lat) === 28) return null;
    const x0 = Math.floor(fx / MESH_STEP) * MESH_STEP, y0 = Math.floor(fy / MESH_STEP) * MESH_STEP;
    let top = h;
    for (const yy of [y0, y0 + MESH_STEP]) for (const xx of [x0, x0 + MESH_STEP]) top = Math.max(top, at(xx, yy));
    return top;
  };
  const inside = (lon: number, lat: number) => lon >= west && lon <= east && lat >= south && lat <= north;
  const out: RiverPath[] = [];
  for (const id of ids) {
    const line = rivers.lines[id];
    if (line.east < west || line.west > east || line.north < south || line.south > north) continue;
    const width = RIVER_WIDTH_M[Math.min(RIVER_WIDTH_M.length - 1, Math.max(0, line.rank))];
    let run: [number, number, number][] = [];
    const flush = () => {
      if (run.length >= 2) out.push({ path: run, width });
      run = [];
    };
    const c = line.coords;
    for (let i = 0; i + 2 < c.length; i += 2) {
      const ax = c[i], ay = c[i + 1], bx = c[i + 2], by = c[i + 3];
      if (Math.max(ax, bx) < west || Math.min(ax, bx) > east || Math.max(ay, by) < south || Math.min(ay, by) > north) {
        flush();
        continue;
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / cell));
      for (let s = run.length ? 1 : 0; s <= steps; s++) {
        const lon = ax + ((bx - ax) * s) / steps;
        const lat = ay + ((by - ay) * s) / steps;
        const h = inside(lon, lat) ? surface(lon, lat) : null;
        if (h === null) flush();
        else run.push([lon, lat, h * EXAGGERATION + LIFT_M]);
      }
    }
    flush();
  }
  return out;
}
