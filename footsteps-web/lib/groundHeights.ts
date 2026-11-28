// The close-up ground's heights, for what is not part of the close-up layer: the dwellings stand on a tile's height (layers/Close3DLayer.ts),
// and the hearths' smoke and firelight (`?smoke=1`, lib/hearths.ts) are drawn above all the tiles (a tile's ground is drawn after the tiles before
// it, so a layer inside one tile would be painted over by the next), but still keep off water. Close3DLayer calls `rememberGround` for each Terrarium
// tile it loads; `wetAt` reads them back. Where no tile is loaded yet a place is not called wet.
import { EXAGGERATION, MESH_STEP, type Bbox } from './close3d';

/** How many cells the ground mesh has across a 256-pixel tile (MESH_STEP pixels apart). */
const MESH_CELLS = 256 / MESH_STEP;

/** The ground height under a point of a tile, metres (unexaggerated), or null outside the tile. The ground mesh has a vertex every MESH_STEP
 * pixels and slopes between them, so a pixel sample can sit under it on a hill: this is the highest of the four vertices round the point
 * (the surface there is never above it). */
export function groundAt(heights: Float32Array, bbox: Bbox, lon: number, lat: number): number | null {
  const u = (lon - bbox.west) / (bbox.east - bbox.west);
  const w = (bbox.north - lat) / (bbox.north - bbox.south);
  if (u < 0 || u >= 1 || w < 0 || w >= 1) return null;
  const fx = u * MESH_CELLS;
  const fy = w * MESH_CELLS;
  const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
  let h = -Infinity;
  for (const gy of [y0, Math.min(MESH_CELLS, y0 + 1)])
    for (const gx of [x0, Math.min(MESH_CELLS, x0 + 1)])
      h = Math.max(h, heights[Math.min(255, gy * MESH_STEP) * 256 + Math.min(255, gx * MESH_STEP)]);
  return h;
}

/** The close-up keeps about this many tiles (Close3DLayer `maxCacheSize`); so does this, newest last. */
const MAX_TILES = 128;
const loaded = new Map<string, { bbox: Bbox; heights: Float32Array }>();
const listeners = new Set<() => void>();
let version = 0;
let pending = false;

/** Keep a loaded tile's heights, and tell the listeners (once for a burst of tiles). */
export function rememberGround(key: string, bbox: Bbox, heights: Float32Array): void {
  loaded.delete(key);
  loaded.set(key, { bbox, heights });
  if (loaded.size > MAX_TILES) loaded.delete(loaded.keys().next().value as string);
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    version++;
    listeners.forEach((fn) => fn());
  }, 150);
}

/** `useSyncExternalStore` parts: changes when a tile has been added. */
export const subscribeGround = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const groundVersion = () => version;

/** The ground height (m, unexaggerated) under a point in the newest loaded tile covering it (the finest), or null where none is loaded. */
export function heightAt(lon: number, lat: number): number | null {
  const tiles = [...loaded.values()];
  for (let i = tiles.length - 1; i >= 0; i--) {
    const h = groundAt(tiles[i].heights, tiles[i].bbox, lon, lat);
    if (h !== null) return h;
  }
  return null;
}

/** Whether the ground under a point is at or below `seaLevel` in a loaded tile (the newest tile covering it, which is the finest). */
export function wetAt(lon: number, lat: number, seaLevel: number): boolean {
  const h = heightAt(lon, lat);
  return h !== null && h <= seaLevel;
}

/** Drawn heights by place (~10 m), for the current set of loaded tiles; emptied when a tile is added. */
const drawnCache = new Map<number, number>();
let drawnFor = -1;

/** Where something standing on the close-up ground is drawn (deck.gl z, metres): the ground's height × the close-up's relief factor, never
 * below the sea's surface (z = 0), 0 where no tile is loaded. People, their footprints, hearth smoke and firelight use it so they stand where
 * the dwellings and fields are (before 2026-11-28 they stayed at z = 0, and in a tilted view a village's people sat off to one side of its
 * huts as a pale patch). Cached per ~10 m, so thousands of people cost one tile search each per tile load. */
export function drawnGroundZ(lon: number, lat: number): number {
  if (drawnFor !== version) {
    drawnCache.clear();
    drawnFor = version;
  }
  const key = Math.round((lon + 180) * 1e4) * 4e6 + Math.round((lat + 90) * 1e4);
  let z = drawnCache.get(key);
  if (z === undefined) {
    z = Math.max(0, heightAt(lon, lat) ?? 0) * EXAGGERATION;
    drawnCache.set(key, z);
  }
  return z;
}
