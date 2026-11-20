// How regular a set of group positions looks (a measurement, not used by the app): the "rows and grid" Will saw under ?settlements=1.
// Two numbers, both read off the positions alone:
//
//  - Nearest-neighbour spread: `cv` is the standard deviation of each group's distance to its nearest neighbour over the mean.
//    A random scatter has cv about 0.52; a lattice has cv near 0. `clarkEvans` is the mean distance over the one a random scatter of the
//    same density would have (1 = random, above 1 = more evenly spaced than random, 2.15 = a perfect hexagonal lattice).
//  - Square order `square`: how much the directions to nearest neighbours cluster on the grid axes, |mean exp(4iθ)| (0..1). About 0.1-0.2
//    for a random scatter, near 1 for rows and columns.
//  - Cell alignment: `alignX`, `alignY` are the length (0..1) of the mean of exp(2πi·f), where f is how far across its 5′ cell a group
//    sits. 0 = groups sit at every position in their cells equally, 1 = every group sits at the same place in its cell (a lattice).
//    This is the one that sees rows: groups that all take the same corner of their cell line up with the cell grid.
//
// Positions are in degrees; distances are measured in cell widths with longitude scaled by cos(latitude).

export type Regularity = {
  n: number;
  /** mean nearest-neighbour distance, in cell widths */
  meanNN: number;
  /** std / mean of the nearest-neighbour distance (about 0.52 for a random scatter, near 0 for a lattice) */
  cv: number;
  /** mean nearest-neighbour distance ÷ the random-scatter expectation 0.5 / sqrt(density) (1 random, 2.15 hexagonal lattice) */
  clarkEvans: number;
  /** how much nearest-neighbour directions cluster on the grid axes (0 none .. 1 rows and columns; about 0.15 for a random scatter) */
  square: number;
  /** 0 (uniform across the cell) .. 1 (always the same place), east-west and north-south */
  alignX: number;
  alignY: number;
};

export type Box = { west: number; east: number; south: number; north: number };

/** Regularity of the groups of `positions` (lon, lat pairs) with ids `ids` (cell × 32 + slot) inside `box`. The density that Clark-Evans
 * compares with is groups per *occupied* cell, so sea and empty land do not make a scatter look clustered. */
export function regularity(
  positions: ArrayLike<number>, ids: ArrayLike<number>, box: Box, cellDeg: number, cellsAcross: number,
): Regularity {
  const cos = Math.cos(((box.south + box.north) / 2) * Math.PI / 180);
  const xs: number[] = [];
  const ys: number[] = [];
  let cx = 0;
  let sx = 0;
  let cy = 0;
  let sy = 0;
  const occupied = new Set<number>();
  for (let u = 0; u < ids.length; u++) {
    const lon = positions[u * 2];
    const lat = positions[u * 2 + 1];
    if (lon < box.west || lon > box.east || lat < box.south || lat > box.north) continue;
    xs.push((lon * cos) / cellDeg);
    ys.push(lat / cellDeg);
    const cell = Math.floor(ids[u] / 32);
    occupied.add(cell);
    const row = Math.floor(cell / cellsAcross);
    const col = cell - row * cellsAcross;
    const fx = (lon + 180) / cellDeg - col - 0.5; // -0.5 .. 0.5 across the cell
    const fy = (90 - lat) / cellDeg - row - 0.5;
    cx += Math.cos(2 * Math.PI * fx);
    sx += Math.sin(2 * Math.PI * fx);
    cy += Math.cos(2 * Math.PI * fy);
    sy += Math.sin(2 * Math.PI * fy);
  }
  const n = xs.length;
  if (n < 3) return { n, meanNN: 0, cv: 0, clarkEvans: 0, square: 0, alignX: 0, alignY: 0 };
  // nearest neighbour through a bucket grid of 2-cell squares, widening the search ring until a neighbour is closer than the ring
  const SIZE = 2;
  const buckets = new Map<number, number[]>();
  const key = (bx: number, by: number) => bx * 100003 + by;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(xs[i] / SIZE), Math.floor(ys[i] / SIZE));
    const list = buckets.get(k);
    if (list) list.push(i); else buckets.set(k, [i]);
  }
  const nn = new Float64Array(n);
  let c4 = 0;
  let s4 = 0;
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(xs[i] / SIZE);
    const by = Math.floor(ys[i] / SIZE);
    let best = Infinity;
    let angle = 0;
    for (let ring = 0; ring < 60; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const list = buckets.get(key(bx + dx, by + dy));
          if (!list) continue;
          for (const j of list) {
            if (j === i) continue;
            const d = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
            if (d < best) { best = d; angle = Math.atan2(ys[j] - ys[i], xs[j] - xs[i]); }
          }
        }
      }
      if (best <= ring * SIZE) break; // everything farther lies outside the rings searched
    }
    nn[i] = best;
    c4 += Math.cos(4 * angle);
    s4 += Math.sin(4 * angle);
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += nn[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (nn[i] - mean) ** 2;
  const area = occupied.size * cos; // occupied cells, each cos(lat) cell widths wide in these units
  return {
    n,
    meanNN: mean,
    cv: Math.sqrt(variance / n) / mean,
    clarkEvans: mean / (0.5 / Math.sqrt(n / area)),
    square: Math.hypot(c4, s4) / n,
    alignX: Math.hypot(cx, sx) / n,
    alignY: Math.hypot(cy, sy) / n,
  };
}
