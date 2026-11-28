// The close-up's snow line, smooth across the world: the same height at a point whichever ground tile asks.
//
// The climate is one annual mean temperature per 0.5° habitat cell, at the cell's mean height. Each ground tile used to take its own
// mean height as that height, so neighbouring tiles put the snow line hundreds of metres apart and the snow stopped in a straight
// line along the tile edge (the Alps at zoom 9, 18,000 BCE). Now each cell's mean height comes from one coarse elevation tile
// (zoom COARSE_Z, the tile holding the cell's centre), each cell gets its own snow line, and a point blends the four cells around
// it, so the line has no steps at tile or cell edges.
import meta from '../public/habitat_meta.json';
import { snowLine, type Bbox, type Ground } from './close3d';

/** Degrees per habitat cell (0.5°). */
export const CELL_DEG = 360 / meta.width;
const COLS = meta.width;
const ROWS = meta.height;
/** Zoom of the elevation tiles cells take their mean height from: 5.6° tiles, ~23 px across a cell. */
export const COARSE_Z = 6;
const TILE_PX = 256;

/** Mean height (m, sea floor as 0) of a cell, or null while its coarse tile hasn't loaded. */
export type CellHeight = (col: number, row: number) => number | null;

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
/** The tile (x, y) at zoom z holding a point. */
export function tileOf(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - mercY(Math.max(-85, Math.min(85, lat))) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}
const lonOfPx = (px: number, x: number, z: number) => ((x + px / TILE_PX) / 2 ** z) * 360 - 180;
const latOfPy = (py: number, y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / TILE_PX)) / 2 ** z))) * 180) / Math.PI;

const wrapCol = (c: number) => ((c % COLS) + COLS) % COLS;
const cellKey = (col: number, row: number) => row * COLS + col;

/** The mean heights of the cells whose centres lie in one coarse tile, from its 256×256 heights: only pixels inside both the cell
 * and the tile count, so every cell has exactly one owner tile and one value. */
export function cellMeansOfTile(heights: Float32Array, x: number, y: number, z = COARSE_Z): Map<number, number> {
  const sums = new Map<number, [number, number]>();
  const [west, east] = [lonOfPx(0, x, z), lonOfPx(TILE_PX, x, z)];
  const [north, south] = [latOfPy(0, y, z), latOfPy(TILE_PX, y, z)];
  const rowLat = new Int32Array(TILE_PX);
  for (let py = 0; py < TILE_PX; py++) rowLat[py] = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - latOfPy(py + 0.5, y, z)) / CELL_DEG)));
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const col = wrapCol(Math.floor((lonOfPx(px + 0.5, x, z) + 180) / CELL_DEG));
      const k = cellKey(col, rowLat[py]);
      const s = sums.get(k) ?? [0, 0];
      s[0] += Math.max(0, heights[py * TILE_PX + px]);
      s[1] += 1;
      sums.set(k, s);
    }
  }
  const out = new Map<number, number>();
  for (const [k, [sum, count]] of sums) {
    const col = k % COLS;
    const row = Math.floor(k / COLS);
    const cx = -180 + (col + 0.5) * CELL_DEG;
    const cy = 90 - (row + 0.5) * CELL_DEG;
    const inLon = cx >= west && cx < east;
    const inLat = cy <= north && cy > south;
    if (inLon && inLat) out.set(k, sum / count);
  }
  return out;
}

const means = new Map<number, number>();
const loading = new Map<string, Promise<void>>();

/** Load the coarse tiles a ground tile's snow line reads (its bbox and the cells around it); resolves to the shared lookup.
 * `fetchHeights` turns a tile into its 256×256 heights (the close-up's own DEM loader). A tile that fails leaves its cells null. */
export async function cellHeightsFor(bbox: Bbox, fetchHeights: (z: number, x: number, y: number) => Promise<Float32Array>): Promise<CellHeight> {
  const pad = CELL_DEG;
  const [x0, y0] = tileOf(bbox.west - pad, bbox.north + pad, COARSE_Z);
  const [x1, y1] = tileOf(bbox.east + pad, bbox.south - pad, COARSE_Z);
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const id = `${x}/${y}`;
      let job = loading.get(id);
      if (!job) {
        job = fetchHeights(COARSE_Z, x, y)
          .then((h) => cellMeansOfTile(h, x, y).forEach((v, k) => means.set(k, v)))
          .catch(() => {
            loading.delete(id); // try again with the next tile that needs it
          });
        loading.set(id, job);
      }
      jobs.push(job);
    }
  await Promise.all(jobs);
  return cellHeight;
}

/** The shared lookup: a cell's mean height, or null when unknown. */
export const cellHeight: CellHeight = (col, row) => means.get(cellKey(wrapCol(col), row)) ?? null;

/** Snow line (m) at a point, blended from the four cells around it. A cell without a temperature (sea) is left out of the blend;
 * a cell whose height hasn't loaded uses `fallbackBase`. With no cell temperature at all, the latitude rule (snowLine's null case). */
export function smoothSnowLine(ground: Pick<Ground, 'tempAt'>, heightOf: CellHeight, fallbackBase = 0): (lon: number, lat: number) => number {
  const lines = new Map<number, number>();
  const cellLine = (col: number, row: number): number => {
    const c = wrapCol(col);
    const r = Math.min(ROWS - 1, Math.max(0, row));
    const k = cellKey(c, r);
    let v = lines.get(k);
    if (v === undefined) {
      const cx = -180 + (c + 0.5) * CELL_DEG;
      const cy = 90 - (r + 0.5) * CELL_DEG;
      const t = ground.tempAt(cx, cy);
      v = t === null ? NaN : snowLine(t, cy, heightOf(c, r) ?? fallbackBase);
      lines.set(k, v);
    }
    return v;
  };
  return (lon, lat) => {
    const fx = (lon + 180) / CELL_DEG - 0.5;
    const fy = (90 - lat) / CELL_DEG - 0.5;
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const tx = fx - c0;
    const ty = fy - r0;
    let sum = 0;
    let weight = 0;
    for (const [dc, dr, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
      const v = cellLine(c0 + dc, r0 + dr);
      if (Number.isNaN(v) || w <= 0) continue;
      sum += v * w;
      weight += w;
    }
    return weight > 1e-6 ? sum / weight : snowLine(null, lat);
  };
}

/** Forget loaded cell heights (tests). */
export function resetCellHeights(): void {
  means.clear();
  loading.clear();
}
