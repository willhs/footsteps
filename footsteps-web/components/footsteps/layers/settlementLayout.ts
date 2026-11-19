// How a farming cell's groups sit relative to each other (`?settlements=1` only). The catalog says, per region, how much of its
// farming is dispersed homesteads, hamlets or villages (D-PLACE EA030, lib/settlements.ts `Layout`); each group takes the
// layout of the analog society it was drawn from. The "where" is still the cell's ranked spots (siteRanking.ts: flat, near fresh
// water, near the coast, never in the sea); the layout only decides which spot, or how close to the last one.
//
//   nucleated  the best spot nobody has taken: villages stand apart, each on a good place (what every group did before layouts).
//   dispersed  the free spot farthest from every group already placed, among the better half of the spots: farmsteads scatter.
//   hamlet     the first hamlet takes the best free spot; the next ones stand within a few hundred metres of it, a tight cluster.
//
// A group's place depends only on the cell and on the groups before it, never on those after it, so adding or removing groups
// (a year with more people) leaves the earlier ones where they were. Cell totals, ids and sizes are untouched: only positions change.
// The layout is a modelled reading of ethnography; the exact spot and the cluster's shape are imagined (docs/ops/settlements.md).
import type { Layout } from '@/lib/settlements';
import type { CellSpots } from './siteRanking';

/** Dispersed groups choose among this many of the best-ranked spots (the better half of a cell's 16 candidates). */
export const DISPERSE_POOL = 8;
/** A hamlet's later houses stand this far from its first (cell widths; 0.05 is about 460 m on a 5′ cell, where candidate spots are at least
 * 0.07 apart and usually 0.2), growing slowly with the count. */
export const HAMLET_BASE = 0.025;
export const HAMLET_STEP = 0.025;
/** Offsets never leave the cell (cell widths from its centre). */
const EDGE = 0.5;
const GOLDEN_ANGLE = 2.399963229728653;

export type Placed = { x: Float64Array; y: Float64Array };

const used = new Uint8Array(16);

/** Offsets (cell widths from the cell centre) of `layouts.length` groups. `spots` are the cell's usable ranked spots (read before
 * the next `spotsFor` call reuses them); `isWet` says whether an offset is sea or lake at the year's sea level. The worker lays out
 * every farming cell of a year (hundreds of thousands), so it passes its own `into` arrays, at least as long as `layouts`, and
 * reads them before the next call; without `into` the result is fresh. */
export function layGroups(
  layouts: readonly Layout[], spots: CellSpots, isWet: (x: number, y: number) => boolean, cellId: number,
  into?: Placed,
): Placed {
  const n = layouts.length;
  const out: Placed = into ?? { x: new Float64Array(n), y: new Float64Array(n) };
  const dry = spots.dry;
  if (!dry) {
    // Nothing usable (a data conflict the caller counts): every group on the least wet spot, as before.
    for (let c = 0; c < n; c++) { out.x[c] = spots.x[0]; out.y[c] = spots.y[0]; }
    return out;
  }
  used.fill(0);
  let hamlet = -1; // group index of the first hamlet house, the cluster's anchor
  let followers = 0;
  const phase = (Math.imul(cellId ^ 0x9e3779b9, 0x85ebca6b) >>> 8) / 0x1000000 * Math.PI * 2;
  for (let c = 0; c < n; c++) {
    const layout = layouts[c];
    if (layout === 'hamlet' && hamlet >= 0) {
      followers++;
      const radius = HAMLET_BASE + HAMLET_STEP * Math.sqrt(followers);
      let placed = false;
      for (let t = 0; t < 8 && !placed; t++) {
        const angle = phase + (followers + t * 3) * GOLDEN_ANGLE;
        const x = Math.max(-EDGE, Math.min(EDGE, out.x[hamlet] + Math.cos(angle) * radius));
        const y = Math.max(-EDGE, Math.min(EDGE, out.y[hamlet] + Math.sin(angle) * radius));
        if (!isWet(x, y)) { out.x[c] = x; out.y[c] = y; placed = true; }
      }
      if (!placed) { out.x[c] = out.x[hamlet]; out.y[c] = out.y[hamlet]; }
      continue;
    }
    let pick = -1;
    if (layout === 'dispersed' && c > 0) {
      let far = -1;
      for (let k = 0; k < Math.min(dry, DISPERSE_POOL); k++) {
        if (used[k]) continue;
        let nearest = Infinity;
        for (let p = 0; p < c; p++) nearest = Math.min(nearest, (spots.x[k] - out.x[p]) ** 2 + (spots.y[k] - out.y[p]) ** 2);
        if (nearest > far) { far = nearest; pick = k; }
      }
    }
    if (pick < 0) for (let k = 0; k < dry; k++) if (!used[k]) { pick = k; break; }
    if (pick < 0) pick = c % dry; // more groups than usable spots: stack, never in the sea
    used[pick] = 1;
    out.x[c] = spots.x[pick];
    out.y[c] = spots.y[pick];
    if (layout === 'hamlet') hamlet = c;
  }
  return out;
}
