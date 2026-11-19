// The level above a camp: a regional group (`?settlements=1` only). Research 0012 "2. Nested levels":
// Hamilton et al. 2007 (Proc R Soc B 274:2195, Table 1) put Binford's hunter-gatherer regional populations at
// 839 people (95% CI 736-954), "a few hundred to about 850", each level three to four times the one below.
//
// What the data does NOT give is who belonged to whom ("we know sizes, not who belonged to whom"). So the
// membership here is a modelling choice: a regional group is a block of the HYDE 5' cell grid, square and
// aligned, 2^level cells a side. Blocks nest (a level-3 block holds exactly four level-2 blocks), they do not
// depend on the year, and a group belongs to the block its cell is in. What the year changes is only how
// big a block must be to hold about 840 people: the smallest level whose block reaches that. Where one cell
// already holds several regional groups' worth (a 1900 CE town) or the whole reachable land holds fewer
// than a camp or two, no regional group is modelled: the answer is null, not a made-up number.
//
// Labels (docs/philosophy/vision.md): the people counted are modelled; the block edge is imagined, so it is
// only ever drawn as a soft tint, for the one group under the cursor.
import type { GridData } from '@/components/footsteps/hooks/gridData';

/** Hamilton et al. 2007, Table 1: geometric mean regional population. */
export const REGION_TARGET_PEOPLE = 840;
/** Upper tail of the lognormal (each level is 3-4 times the one below: 840 x 4). */
export const REGION_MAX_PEOPLE = 3360;
/** Below this the surrounding land holds no more than a camp or two; saying "regional group" would mislead. */
export const REGION_MIN_PEOPLE = 100;
/** Largest block: 2^6 = 64 cells of 5' = 5.3 degrees (about 590 km). */
export const REGION_MAX_LEVEL = 6;

export type RegionalGroup = {
  level: number;
  /** Block row and column at that level (cell row/col shifted right by `level`). */
  row: number;
  col: number;
  /** Edge of the block in degrees. */
  west: number;
  south: number;
  east: number;
  north: number;
  /** Modelled people in the block that year. */
  people: number;
};

/** The block that holds cell (cellRow, cellCol) at `level`. Pure: no year, no population. */
export function blockOf(cellRow: number, cellCol: number, level: number, cellDeg: number) {
  const row = cellRow >> level;
  const col = cellCol >> level;
  const side = cellDeg * (1 << level);
  // The last block of a row or column can run off the edge of the world; cut it there.
  return {
    level, row, col,
    west: -180 + col * side, east: Math.min(180, -180 + (col + 1) * side),
    north: 90 - row * side, south: Math.max(-90, 90 - (row + 1) * side),
  };
}

/** Visit the populated cells of a block. Cell ids are `row * width + col` (gridData.ts) and sorted, so each row's cells in the
 * block are one contiguous id range found by binary search. */
export function forEachCellInBlock(grid: GridData, b: ReturnType<typeof blockOf>, visit: (i: number) => void) {
  const width = Math.round(360 / grid.cellDeg);
  const height = Math.round(180 / grid.cellDeg);
  const span = 1 << b.level;
  const r0 = b.row * span;
  const c0 = b.col * span;
  for (let r = r0; r < Math.min(height, r0 + span); r++) {
    const first = r * width + c0;
    const last = Math.min(r * width + width - 1, first + span - 1);
    let lo = 0;
    let hi = grid.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (grid.cellIds[mid] < first) lo = mid + 1;
      else hi = mid;
    }
    for (let at = lo; at < grid.length && grid.cellIds[at] <= last; at++) visit(at);
  }
}

function peopleInBlock(grid: GridData, b: ReturnType<typeof blockOf>) {
  let sum = 0;
  forEachCellInBlock(grid, b, (i) => { sum += grid.people[i]; });
  return sum;
}

/** The regional group of the cell under (lon, lat), or null when the cell is empty or no sensible regional
 * group exists (see the top of the file). */
export function regionalGroupAt(grid: GridData, lon: number, lat: number): RegionalGroup | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const height = Math.round(180 / grid.cellDeg);
  const col = Math.floor((((lon + 180) % 360 + 360) % 360) / grid.cellDeg);
  const row = Math.min(height - 1, Math.floor((90 - lat) / grid.cellDeg));
  let previous: RegionalGroup | null = null;
  for (let level = 0; level <= REGION_MAX_LEVEL; level++) {
    const b = blockOf(row, col, level, grid.cellDeg);
    const people = peopleInBlock(grid, b);
    if (level === 0 && people <= 0) return null;
    const here = { ...b, people };
    if (people >= REGION_TARGET_PEOPLE) {
      if (people <= REGION_MAX_PEOPLE) return here;
      // Jumped past the tail: the level below, if it is still a regional group's worth.
      return previous && previous.people >= REGION_MIN_PEOPLE ? previous : null;
    }
    previous = here;
  }
  return previous && previous.people >= REGION_MIN_PEOPLE ? previous : null;
}

/** "about 840": two figures, so the number reads as the estimate it is. */
export function aboutPeople(n: number): string {
  return Number(n.toPrecision(2)).toLocaleString('en-US');
}
