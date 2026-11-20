import { DISPERSE_POOL, HAMLET_BASE, HAMLET_STEP, layGroups } from './settlementLayout';
import { buildSettlementUnits } from './settlementUnits';
import type { CellSpots, SiteRanker } from './siteRanking';
import type { GridData } from '../hooks/gridData';
import type { Layout, SettlementCatalog } from '@/lib/settlements';
import { WayOfLife } from '@/lib/waysOfLife';
import { NO_SOCIETY, parseDwellings } from '@/lib/dwellings';
import { buildUnitMorph } from '../hooks/unitMorph';
import { sliceUnits, WORLD } from '../hooks/unitRegion';

/** A ranked list of `n` usable spots: the best four run up the east side (a river bank, a fifth of a cell apart, as the 4 × 4 grid makes
 * real candidates), the worse ones are spread west. */
function spotsOf(n: number, dry = n): CellSpots {
  const x = new Float64Array(16);
  const y = new Float64Array(16);
  for (let k = 0; k < n; k++) {
    x[k] = k < 4 ? 0.3 + 0.03 * (k % 2) : -0.4 + 0.1 * (k - 4);
    y[k] = k < 4 ? -0.3 + 0.2 * k : -0.35 + 0.15 * ((k - 4) % 5);
  }
  return { x, y, dry };
}
const dryEverywhere = () => false;
const spread = (p: { x: Float64Array; y: Float64Array }) => {
  let sum = 0;
  let pairs = 0;
  for (let a = 0; a < p.x.length; a++) for (let b = a + 1; b < p.x.length; b++) { sum += Math.hypot(p.x[a] - p.x[b], p.y[a] - p.y[b]); pairs++; }
  return sum / pairs;
};
const of = (layout: Layout, n: number): Layout[] => Array(n).fill(layout);

describe('layGroups', () => {
  it('puts nucleated groups on the best free spots in rank order, as groups did before layouts', () => {
    const spots = spotsOf(16);
    const p = layGroups(of('nucleated', 4), spots, dryEverywhere, 7);
    expect(Array.from(p.x)).toEqual(Array.from(spots.x.slice(0, 4)));
    expect(Array.from(p.y)).toEqual(Array.from(spots.y.slice(0, 4)));
  });

  it('stacks the groups beyond the usable spots on them, never elsewhere', () => {
    const spots = spotsOf(16, 2);
    const p = layGroups(of('nucleated', 4), spots, dryEverywhere, 7);
    expect(Array.from(p.x)).toEqual([spots.x[0], spots.x[1], spots.x[0], spots.x[1]]);
    // Nothing usable (a data conflict): everyone on spot 0, the least wet one.
    const none = spotsOf(16, 0);
    expect(Array.from(layGroups(of('hamlet', 2), none, dryEverywhere, 7).x)).toEqual([none.x[0], none.x[0]]);
  });

  it('scatters dispersed farmsteads wider than villages, and hamlets into a tight cluster', () => {
    const spots = spotsOf(16);
    const wide = spread(layGroups(of('dispersed', 4), spots, dryEverywhere, 7));
    const apart = spread(layGroups(of('nucleated', 4), spots, dryEverywhere, 7));
    const tight = spread(layGroups(of('hamlet', 4), spots, dryEverywhere, 7));
    expect(wide).toBeGreaterThan(apart);
    expect(apart).toBeGreaterThan(tight);
    // A hamlet's houses stand within a few hundred metres of the first.
    const p = layGroups(of('hamlet', 4), spots, dryEverywhere, 7);
    for (let c = 1; c < 4; c++) {
      const d = Math.hypot(p.x[c] - p.x[0], p.y[c] - p.y[0]);
      expect(d).toBeGreaterThan(HAMLET_BASE * 0.99);
      expect(d).toBeLessThan(HAMLET_BASE + HAMLET_STEP * 2 + 1e-9);
    }
  });

  it('keeps a hamlet out of the sea and inside the cell, falling back on the first house', () => {
    const spots = spotsOf(16);
    const first = layGroups(of('hamlet', 1), spots, dryEverywhere, 7);
    const allWet = (x: number, y: number) => Math.hypot(x - first.x[0], y - first.y[0]) > 1e-9;
    const p = layGroups(of('hamlet', 3), spots, allWet, 7);
    expect([p.x[1], p.y[1]]).toEqual([p.x[0], p.y[0]]);
    const edge: CellSpots = { x: Float64Array.of(0.45), y: Float64Array.of(0.45), dry: 1 };
    const q = layGroups(of('hamlet', 4), edge, dryEverywhere, 3);
    for (const v of [...q.x, ...q.y]) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
  });

  it('depends only on the groups before it: adding groups leaves the earlier ones where they were', () => {
    const mixed: Layout[] = ['hamlet', 'dispersed', 'hamlet', 'nucleated', 'dispersed'];
    const spots = spotsOf(16);
    const few = layGroups(mixed.slice(0, 3), spots, dryEverywhere, 11);
    const all = layGroups(mixed, spots, dryEverywhere, 11);
    expect(Array.from(all.x.slice(0, 3))).toEqual(Array.from(few.x));
    expect(Array.from(all.y.slice(0, 3))).toEqual(Array.from(few.y));
    // and is a pure function of its inputs
    expect(Array.from(layGroups(mixed, spots, dryEverywhere, 11).x)).toEqual(Array.from(all.x));
  });

  it('gives the same places into a caller\'s scratch arrays as into fresh ones', () => {
    const mixed: Layout[] = ['hamlet', 'dispersed', 'hamlet', 'nucleated'];
    const fresh = layGroups(mixed, spotsOf(16), dryEverywhere, 5);
    const scratch = { x: new Float64Array(20).fill(9), y: new Float64Array(20).fill(9) };
    layGroups(['nucleated', 'nucleated', 'nucleated', 'nucleated', 'nucleated'], spotsOf(16), dryEverywhere, 6, scratch); // a longer earlier call
    const into = layGroups(mixed, spotsOf(16), dryEverywhere, 5, scratch);
    expect(into).toBe(scratch);
    expect(Array.from(into.x.slice(0, 4))).toEqual(Array.from(fresh.x));
    expect(Array.from(into.y.slice(0, 4))).toEqual(Array.from(fresh.y));
  });

  it('only draws on spots the caller has filled', () => {
    expect(DISPERSE_POOL).toBeLessThanOrEqual(16);
    const spots = spotsOf(DISPERSE_POOL);
    const p = layGroups(of('dispersed', 4), spots, dryEverywhere, 1);
    for (let c = 0; c < 4; c++) expect(Number.isFinite(p.x[c] + p.y[c])).toBe(true);
    const known = new Set(Array.from(spots.x.slice(0, DISPERSE_POOL)));
    for (const v of p.x) expect(known.has(v)).toBe(true);
  });
});

// The whole path: buildSettlementUnits with a ranker, over a farming cell of a catalog whose analogs share one pattern.
const ranker: SiteRanker = {
  spotsFor: (_id, _sea, count = 16) => {
    const s = spotsOf(16);
    for (let k = count; k < 16; k++) { s.x[k] = NaN; s.y[k] = NaN; } // spots beyond `count` are not filled
    return s;
  },
  isWet: () => false,
  size: 0,
};
function farmCatalog(pattern: number): SettlementCatalog {
  const profile = { components: [{ weight: 1, size: 100, moves: null, pattern, mode: 'settled' as const, society: 's' }], storage: null };
  return { version: 1, cities: [], regions: { '17,36': [profile, profile, profile, profile] }, climate: {} };
}
function farmGrid(): GridData {
  const ids = [899 * 3600 + 1800, 899 * 3600 + 1801];
  return { length: 2, cellIds: new Uint32Array(ids), positions: new Float32Array([0.05, 0.05, 0.15, 0.05]), people: new Float32Array([330, 50]),
    ways: new Uint8Array([WayOfLife.Farmer, WayOfLife.Forager]), cellDeg: 0.1, total: 380 };
}
const centre = (u: ReturnType<typeof buildSettlementUnits>, from: number, to: number) => {
  const xs = Array.from(u.positions.slice(from * 2, to * 2).filter((_, i) => i % 2 === 0));
  return xs.length;
};

describe('farming layouts through buildSettlementUnits', () => {
  it.each([5, 6, 7])('keeps the totals, ids and kinds of every cell whatever the pattern (EA030 %i)', (pattern) => {
    const data = farmGrid();
    const plain = buildSettlementUnits(data, farmCatalog(pattern), 0, null, null);
    const laid = buildSettlementUnits(data, farmCatalog(pattern), 0, null, ranker);
    expect(Array.from(laid.ids)).toEqual(Array.from(plain.ids));
    expect(Array.from(laid.people)).toEqual(Array.from(plain.people));
    expect(Array.from(laid.kind)).toEqual(Array.from(plain.kind));
    expect(Array.from(laid.people).reduce((a, b) => a + b, 0)).toBeCloseTo(380, 3);
    expect(centre(laid, 0, laid.length)).toBe(laid.length);
  });

  it('draws dispersed farmsteads wider apart than hamlets in the same cell, with no change for villages versus the old ranked spots', () => {
    const data = farmGrid();
    const sp = (pattern: number) => {
      const u = buildSettlementUnits(data, farmCatalog(pattern), 0, null, ranker);
      const farm = Array.from(u.kind).map((k, i) => (k === 1 ? i : -1)).filter((i) => i >= 0);
      expect(farm.length).toBeGreaterThanOrEqual(3);
      const p = { x: Float64Array.from(farm.map((i) => u.positions[i * 2])), y: Float64Array.from(farm.map((i) => u.positions[i * 2 + 1])) };
      return spread(p);
    };
    expect(sp(5)).toBeGreaterThan(sp(7));
    expect(sp(7)).toBeGreaterThan(sp(6));
    // villages sit on the ranked spots exactly as before layouts
    const u = buildSettlementUnits(data, farmCatalog(7), 0, null, ranker);
    const first = u.positions[0] - data.positions[0];
    expect(first / data.cellDeg).toBeCloseTo(spotsOf(16).x[0], 5);
  });
});

describe('the analog society a group was drawn from travels with it (for the close-up shelters)', () => {
  const table = parseDwellings({
    version: 1, caveat: '', codes: { plan: {}, walls: {}, roof: {} }, columns: ['id', 'name', 'year', 'plan', 'walls', 'roof'],
    societies: [['a', 'A', 1900, 5, 3, 8], ['s', 'S', 1930, 2, 11, 8]],
  });

  it('indexes each group’s society in the dwelling table, and leaves NO_SOCIETY without one', () => {
    const withTable = buildSettlementUnits(farmGrid(), farmCatalog(7), 0, null, ranker, table);
    expect(Array.from(withTable.society!)).toEqual(Array(withTable.length).fill(1));
    const without = buildSettlementUnits(farmGrid(), farmCatalog(7), 0, null, ranker);
    expect(Array.from(without.society!)).toEqual(Array(without.length).fill(NO_SOCIETY));
  });

  it('survives slicing a region and the year morph', () => {
    const units = buildSettlementUnits(farmGrid(), farmCatalog(7), 0, null, ranker, table);
    const morph = buildUnitMorph(sliceUnits(units, 3600, WORLD), units);
    expect(Array.from(morph.info.society)).toEqual(Array(morph.length).fill(1));
    expect(buildUnitMorph(units, units).info.society.length).toBe(units.length);
  });
});
