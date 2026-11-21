// Coarser elevation tiles for the far part of the tilted close-up (components/footsteps/layers/Close3DLayer.ts).
//
// deck.gl takes every tile of a view tilted under 60° at the same zoom, so the far rows of the 55° close-up cost as
// many tiles as the near ones although each is drawn a fraction of the size. `coarsenFar` merges four sibling tiles
// into their parent while the parent would still be no wider on screen than a tile at the screen centre: the ground's
// vertices are then never further apart on screen than in the middle of the view, with fewer requests.

export type TileIndex = { x: number; y: number; z: number };

const keyOf = (t: TileIndex) => `${t.z}/${t.x}/${t.y}`;
const parentOf = (t: TileIndex): TileIndex => ({ x: t.x >> 1, y: t.y >> 1, z: t.z - 1 });

/**
 * The same ground as `indices` (one zoom, or already mixed) with far tiles merged into their parents, up to `levels`
 * times. `widthPx(tile)` is how wide the tile is on screen (Infinity when unknown, e.g. behind the camera: kept).
 * A parent replaces its children only when every tile under it in the set is one of its direct children, so no two
 * tiles of the result overlap. Parents also cover children that were off screen; that only adds ground at the edge.
 */
export function coarsenFar(indices: readonly TileIndex[], widthPx: (t: TileIndex) => number, maxPx: number, levels = 2, minZ = 0): TileIndex[] {
  let cur = [...indices];
  for (let level = 0; level < levels; level++) {
    const groups = new Map<string, TileIndex[]>();
    for (const t of cur) {
      if (t.z <= minZ) continue;
      const k = keyOf(parentOf(t));
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
    // Parents that some finer, non-child tile also lies under: merging them would overlap it.
    const blocked = new Set<string>();
    for (const t of cur) {
      for (let a = parentOf(parentOf(t)); a.z >= minZ; a = parentOf(a)) {
        blocked.add(keyOf(a));
        if (a.z === 0) break;
      }
    }
    const merged = new Set<string>();
    for (const [k, kids] of groups) {
      if (blocked.has(k)) continue;
      if (widthPx(parentOf(kids[0])) <= maxPx) merged.add(k);
    }
    if (!merged.size) break;
    const next: TileIndex[] = [];
    const seen = new Set<string>();
    for (const t of cur) {
      const k = t.z > minZ ? keyOf(parentOf(t)) : '';
      if (merged.has(k)) {
        if (!seen.has(k)) next.push(parentOf(t));
        seen.add(k);
      } else next.push(t);
    }
    cur = next;
  }
  return cur;
}
