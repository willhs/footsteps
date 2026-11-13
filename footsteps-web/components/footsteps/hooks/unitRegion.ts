import type { Units } from '../layers/units';

/** A lon/lat box in degrees. West/east may run past ±180 on a globe; the slice
 * wraps them. Units are only built for cells inside the current region. */
export type Region = { west: number; south: number; east: number; north: number };

export const WORLD: Region = { west: -180, south: -90, east: 180, north: 90 };

const ID_SLOTS = 32; // units.ts: id = cell * 32 + slot

function lowerBound(ids: Uint32Array, value: number) {
  let lo = 0;
  let hi = ids.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ids[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Column ranges [first, last] covered by west..east, split at the antimeridian. */
function columnRanges(region: Region, width: number): [number, number][] {
  const cellDeg = 360 / width;
  if (region.east - region.west >= 360) return [[0, width - 1]];
  const first = Math.floor((region.west + 180) / cellDeg);
  const last = Math.floor((region.east + 180) / cellDeg);
  const wrap = (c: number) => ((c % width) + width) % width;
  const [a, b] = [wrap(first), wrap(last)];
  // Ascending order keeps the slice sorted by id, which the year morph merges on.
  return a <= b ? [[a, b]] : [[0, b], [a, width - 1]];
}

/** Copy out the units whose cell lies in `region`, keeping id order. Units are
 * sorted by id and ids are row-major cells, so each row is one contiguous run
 * per column range: two binary searches per row, no scan of the whole year. */
export function sliceUnits(units: Units, width: number, region: Region): Units {
  const cellDeg = 360 / width;
  const height = Math.round(width / 2);
  const firstRow = Math.max(0, Math.floor((90 - region.north) / cellDeg));
  const lastRow = Math.min(height - 1, Math.floor((90 - region.south) / cellDeg));
  const columns = columnRanges(region, width);
  const runs: number[] = [];
  let total = 0;
  for (let row = firstRow; row <= lastRow; row++) {
    for (const [a, b] of columns) {
      const start = lowerBound(units.ids, (row * width + a) * ID_SLOTS);
      const end = lowerBound(units.ids, (row * width + b + 1) * ID_SLOTS);
      if (end > start) {
        runs.push(start, end);
        total += end - start;
      }
    }
  }
  const out: Units = {
    length: total,
    positions: new Float32Array(total * 2),
    people: new Float32Array(total),
    kind: new Uint8Array(total),
    ids: new Uint32Array(total),
    counts: [0, 0, 0, 0],
  };
  let j = 0;
  for (let r = 0; r < runs.length; r += 2) {
    const [start, end] = [runs[r], runs[r + 1]];
    out.positions.set(units.positions.subarray(start * 2, end * 2), j * 2);
    out.people.set(units.people.subarray(start, end), j);
    out.kind.set(units.kind.subarray(start, end), j);
    out.ids.set(units.ids.subarray(start, end), j);
    j += end - start;
  }
  for (let i = 0; i < total; i++) out.counts[out.kind[i]]++;
  return out;
}
