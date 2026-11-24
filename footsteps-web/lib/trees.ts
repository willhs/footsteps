import { EXAGGERATION, MESH_STEP, hash2, plantsForTile, type Bbox, type Ground } from './close3d';
import type { LakePlane } from './pastWater';

export const TREE_KINDS = ['conifer', 'broadleaf', 'palm', 'acacia', 'shrub', 'dead'] as const;
export type TreeKind = typeof TREE_KINDS[number];
export type TreeInstance = { position: [number, number, number]; kind: TreeKind; variant: number; height: number; tint: [number, number, number, number] };
export type TreeClearing = { position: readonly [number, number]; radius: number };
/** Representative mature heights, not species identification. Sources and chosen ranges: close-up-scene.md. */
export const TREE_HEIGHT: Record<TreeKind, number> = { conifer: 25, broadleaf: 24, palm: 22, acacia: 10, shrub: 3, dead: 18 };

/** Higher density than legacy marks, bounded per DEM tile. Eligibility remains the shared biome/snow/sea rule. */
export function treesForTile(heights: Float32Array, bbox: Bbox, tile: [number, number, number], sea: number, ground: Ground, lake: LakePlane | null = null): TreeInstance[] {
  const out: TreeInstance[] = [];
  // Target roughly 14 m forest spacing where DEM tiles are finest; cap CPU and GPU work at lower zooms.
  const width = (bbox.east - bbox.west) * 111320 * Math.cos((bbox.north + bbox.south) * Math.PI / 360);
  const area = width * (bbox.north - bbox.south) * 110540;
  const candidates = Math.min(18000, Math.max(1, Math.round(area / 196)));
  for (const p of plantsForTile(heights, bbox, tile, sea, ground, candidates)) {
    const [lon, lat] = p.position;
    const px = Math.min(255, Math.floor((lon - bbox.west) / (bbox.east - bbox.west) * 256));
    const py = Math.min(255, Math.floor((bbox.north - lat) / (bbox.north - bbox.south) * 256));
    const h = heights[py * 256 + px];
    if (h <= sea || (lake && lake.levelAt(lon, lat, h) !== null)) continue;
    const seed = hash2(Math.round(lon * 1e6), Math.round(lat * 1e6));
    const biome = ground.biomeAt(lon, lat);
    const kind: TreeKind = seed < 0.025 && p.kind !== 'shrub' ? 'dead' : biome <= 2 && seed > 0.91 ? 'palm' : p.kind;
    // Match the rendered ground's mesh vertices, not an unmeshed DEM pixel on a slope.
    const x0 = Math.floor(px / MESH_STEP) * MESH_STEP, y0 = Math.floor(py / MESH_STEP) * MESH_STEP;
    let floor = h;
    for (const y of [y0, Math.min(255, y0 + MESH_STEP)]) for (const x of [x0, Math.min(255, x0 + MESH_STEP)]) floor = Math.max(floor, heights[y * 256 + x]);
    // Per-tree brightness plus a small warm/cool shift, so neighbouring crowns of one variant still differ.
    const light = 200 + hash2(Math.round(lat * 1e6), Math.round(lon * 1e6)) * 55;
    const warm = hash2(Math.round(lon * 1e6) + 17, Math.round(lat * 1e6)) - 0.5;
    const tint: [number, number, number, number] = [Math.min(255, light * (1 + warm * 0.12)), light, Math.min(255, light * (1 - warm * 0.12)), 255];
    out.push({ position: [lon, lat, floor * EXAGGERATION + 0.5], kind, variant: Math.min(2, Math.floor(seed * 3)), height: TREE_HEIGHT[kind] * p.scale, tint });
  }
  return out;
}

/** Distance LOD per DEM tile, from how many screen pixels a typical 20 m tree spans at the tile's corner nearest the camera.
 * Returns the share of the tile's trees to draw: all from 3 pixels, a thinning prefix below (candidates are in random order, so
 * a prefix is an even subsample), none under one pixel, where the shader's fade would discard them anyway and the ground's biome
 * colour stands in for the canopy. */
export function treeLodShare(pixelsPerTree: number): number {
  return pixelsPerTree < 1 ? 0 : Math.min(1, pixelsPerTree / 3);
}

/** Household-sized clearings, spatially indexed so dense woods do not scan every home per tree. 1 marks a tree standing in one. */
export function clearedMask(trees: readonly TreeInstance[], clearings: readonly TreeClearing[]): Uint8Array {
  const mask = new Uint8Array(trees.length);
  if (!clearings.length) return mask;
  const step = 0.002;
  const bins = new Map<string, TreeClearing[]>();
  for (const c of clearings) {
    const reach = c.radius + 20; // Includes the largest possible crown radius.
    const dx = reach / (111320 * Math.max(0.01, Math.cos(c.position[1] * Math.PI / 180)));
    const dy = reach / 110540;
    for (let x = Math.floor((c.position[0] - dx) / step); x <= Math.floor((c.position[0] + dx) / step); x++)
      for (let y = Math.floor((c.position[1] - dy) / step); y <= Math.floor((c.position[1] + dy) / step); y++) {
        const key = `${x},${y}`;
        const list = bins.get(key) ?? []; list.push(c); bins.set(key, list);
      }
  }
  trees.forEach((t, i) => {
    const near = bins.get(`${Math.floor(t.position[0] / step)},${Math.floor(t.position[1] / step)}`);
    if (near?.some(c => {
      const dx = (t.position[0] - c.position[0]) * 111320 * Math.cos(c.position[1] * Math.PI / 180);
      const dy = (t.position[1] - c.position[1]) * 110540;
      return Math.hypot(dx, dy) < c.radius + t.height * 0.35;
    })) mask[i] = 1;
  });
  return mask;
}

export function outsideClearings(trees: readonly TreeInstance[], clearings: readonly TreeClearing[]): TreeInstance[] {
  if (!clearings.length) return trees as TreeInstance[];
  const mask = clearedMask(trees, clearings);
  return trees.filter((_, i) => !mask[i]);
}

/** Content key for a clearings list: the scene hands over a fresh array on most renders, but the homes in it change far less often. */
export function clearingsKey(clearings: readonly TreeClearing[]): string {
  let h = clearings.length;
  for (const c of clearings) h = (Math.imul(h, 31) + Math.round(c.position[0] * 1e5) * 7 + Math.round(c.position[1] * 1e5) * 13 + Math.round(c.radius)) | 0;
  return `${clearings.length}:${h}`;
}
