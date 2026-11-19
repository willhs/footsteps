// Which 5′ sub-cells of a 0.5° modelled block are land at a year's sea level, so the block's people go only there
// (docs/ops/prehistory-population.md "Land sub-cells"). Reads the baked site terrain (docs/ops/site-terrain.md): a 2.5′ image, each
// HYDE 5′ cell being 2 × 2 pixels.
import terrainMeta from '../../../public/sites/site_terrain.json';

/** The channels of `site_terrain.webp` that decide sea: `depth` (R) and `packed` (G, bits 4-7 = sea share today, 0..15). */
export type TerrainSea = { width: number; height: number; depth: Uint8Array; packed: Uint8Array };

/** A sub-cell is land when under this share of its 2 × 2 pixels is sea (the same edge siteRanking.ts calls wet). */
export const WET_EDGE = 0.5;
const SEA_LEVELS: number = terrainMeta.sea_levels;

/** Share of the 5′ cell (col, row) that is sea at `drop` metres below today's sea level, 0..1. A pixel's sea counts only while it is
 * still under water (`depth > drop`), as in the ranker. */
export function seaShare(terrain: TerrainSea, col: number, row: number, cellsAcross: number, drop: number): number {
  const scale = terrain.width / cellsAcross;
  const { width, depth, packed } = terrain;
  let sea = 0;
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      const i = (row * scale + dy) * width + col * scale + dx;
      if (depth[i] > drop) sea += packed[i] >> 4;
    }
  }
  return sea / (SEA_LEVELS * scale * scale);
}

/** The sub-cells of a block that take its people: land (under half sea), else any with some land, else, for a block that is all
 * sea at this level, every sub-cell (the model put people there; they stay). `sea` is a per-sub-cell scratch the size of the block.
 * Returns the chosen sub-cell flags in `keep` (reused) and how many there are; `allSea` says the last fallback applied. */
export function landSubcells(
  terrain: TerrainSea,
  blockCol: number,
  blockRow: number,
  scale: number,
  cellsAcross: number,
  drop: number,
  keep: Uint8Array,
): { count: number; allSea: boolean } {
  const n = scale * scale;
  let land = 0;
  let some = 0;
  for (let k = 0; k < n; k++) {
    const share = seaShare(terrain, blockCol * scale + (k % scale), blockRow * scale + Math.floor(k / scale), cellsAcross, drop);
    keep[k] = share < WET_EDGE ? 1 : share < 1 ? 2 : 0; // 1 = land, 2 = a little land only, 0 = all sea
    if (keep[k] === 1) land++;
    else if (keep[k] === 2) some++;
  }
  if (land) {
    for (let k = 0; k < n; k++) keep[k] = keep[k] === 1 ? 1 : 0;
    return { count: land, allSea: false };
  }
  if (some) {
    for (let k = 0; k < n; k++) keep[k] = keep[k] === 2 ? 1 : 0;
    return { count: some, allSea: false };
  }
  keep.fill(1, 0, n);
  return { count: n, allSea: true };
}
