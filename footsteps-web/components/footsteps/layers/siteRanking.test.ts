import { CANDIDATES, candidateOffsets, createSiteRanker, type CellSpots, type SiteLayers } from './siteRanking';
import { buildSettlementUnits } from './settlementUnits';
import type { GridData } from '../hooks/gridData';
import type { SettlementCatalog } from '@/lib/settlements';
import { seaLevelAt } from '@/lib/climate';

// A small world: 8 × 4 cells, each 2 × 2 terrain pixels (16 × 8) and one water pixel. Cell id = row * 8 + col.
// By default the left of the map is sea 50 m deep (pixels x < 9), the right is flat land with no water nearby.
const CELLS = 8;
const TW = 16;
const TH = 8;
type Pixel = { depth: number; share: number; slope: number; lake: boolean };
function world(
  edit: (set: (x: number, y: number, v: Partial<Pixel>) => void, water: Uint8Array) => void = () => {},
  seaUntilPixel = 9,
): SiteLayers {
  const depth = new Uint8Array(TW * TH);
  const packed = new Uint8Array(TW * TH);
  const water = new Uint8Array(CELLS * (TH / 2)).fill(255);
  for (let y = 0; y < TH; y++) for (let x = 0; x < seaUntilPixel; x++) { depth[y * TW + x] = 50; packed[y * TW + x] = 15 << 4; }
  edit(
    (x, y, v) => {
      const i = y * TW + x;
      if (v.depth !== undefined) depth[i] = v.depth;
      if (v.share !== undefined) packed[i] = (packed[i] & 15) | (v.share << 4);
      if (v.slope !== undefined) packed[i] = (packed[i] & ~7) | v.slope;
      if (v.lake !== undefined) packed[i] = v.lake ? packed[i] | 8 : packed[i] & ~8;
    },
    water,
  );
  return { terrain: { width: TW, height: TH, depth, packed }, water: { width: CELLS, height: TH / 2, code: water } };
}
/** The scratch result of spotsFor copied, so two calls can be compared. */
const snap = (s: CellSpots) => ({ x: Array.from(s.x), y: Array.from(s.y), dry: s.dry });
const COAST_CELL = 1 * CELLS + 4; // pixel 8 is sea, pixel 9 land: the cell's west half is wet at today's sea level
const INLAND_CELL = 1 * CELLS + 6;

test('candidate offsets depend on the cell alone and stay inside it', () => {
  expect(candidateOffsets(12)).toEqual(candidateOffsets(12));
  expect(candidateOffsets(12).x).not.toEqual(candidateOffsets(13).x);
  const { x, y } = candidateOffsets(12);
  expect(x).toHaveLength(CANDIDATES);
  for (let k = 0; k < CANDIDATES; k++) expect(Math.max(Math.abs(x[k]), Math.abs(y[k]))).toBeLessThan(0.5);
});

test('candidates span the whole cell, right out to its edges', () => {
  let edge = 0;
  for (let cell = 0; cell < 200; cell++) {
    const { x, y } = candidateOffsets(cell);
    for (let k = 0; k < CANDIDATES; k++) if (Math.max(Math.abs(x[k]), Math.abs(y[k])) > 0.45) edge++;
  }
  // the old spots never went past 0.45; now about 1 in 9 does (the outer strata of the 4 × 4 grid reach 0.475)
  expect(edge).toBeGreaterThan(200 * CANDIDATES * 0.08);
});

test('on ground that scores the same everywhere the best spot is not the same place in every cell', () => {
  // an all-land test world, flat with no water near: every candidate ties on slope, water and coast
  const ranker = createSiteRanker(world(undefined, 0), CELLS);
  const stratum = new Set<number>();
  const quadrants = new Set<string>();
  for (const row of [0, 1, 2, 3]) {
    for (const col of [2, 3, 4]) {
      const cell = row * CELLS + col;
      const best = ranker.spotsFor(cell, 0, 1);
      const { x, y } = candidateOffsets(cell);
      let k = 0;
      for (let c = 1; c < CANDIDATES; c++) if (Math.hypot(x[c] - best.x[0], y[c] - best.y[0]) < Math.hypot(x[k] - best.x[0], y[k] - best.y[0])) k = c;
      stratum.add(k);
      quadrants.add(`${Math.sign(best.x[0])},${Math.sign(best.y[0])}`);
    }
  }
  // 12 cells: before the score factor every one took candidate 0 (index order), the same corner of the cell
  expect(stratum.size).toBeGreaterThanOrEqual(6);
  expect(quadrants.size).toBe(4);
});

test('no dry spot is in the sea at today\'s sea level; the wet ones come last', () => {
  const ranker = createSiteRanker(world(), CELLS);
  const spots = ranker.spotsFor(COAST_CELL, 0);
  expect(spots.dry).toBeGreaterThan(0);
  expect(spots.dry).toBeLessThan(CANDIDATES);
  for (let k = 0; k < spots.dry; k++) expect(ranker.isWet(COAST_CELL, spots.x[k], spots.y[k], 0)).toBe(false);
  expect(ranker.isWet(COAST_CELL, spots.x[CANDIDATES - 1], spots.y[CANDIDATES - 1], 0)).toBe(true);
  // a cell wholly inland has every spot dry
  expect(ranker.spotsFor(INLAND_CELL, 0).dry).toBe(CANDIDATES);
});

test('the same cell gives the same spots in every year its coast does not change', () => {
  const ranker = createSiteRanker(world(), CELLS);
  const today = snap(ranker.spotsFor(COAST_CELL, 0));
  // the shelf is 50 m deep: any sea level above -50 m leaves this coast where it is
  expect(snap(ranker.spotsFor(COAST_CELL, -5))).toEqual(today);
  expect(snap(ranker.spotsFor(COAST_CELL, -49))).toEqual(today);
  expect(ranker.size).toBe(1); // one cached list served all three years
  // an inland cell never changes, at any sea level
  const inland = snap(ranker.spotsFor(INLAND_CELL, 0));
  expect(snap(ranker.spotsFor(INLAND_CELL, -120))).toEqual(inland);
});

test('when the sea falls past the shelf the cell\'s coast moves, so its spots do', () => {
  const ranker = createSiteRanker(world(), CELLS);
  const today = snap(ranker.spotsFor(COAST_CELL, 0));
  const low = snap(ranker.spotsFor(COAST_CELL, -60));
  expect(low.dry).toBe(CANDIDATES);
  expect(low).not.toEqual(today);
  // and back again: today's coast gets today's list
  expect(snap(ranker.spotsFor(COAST_CELL, 0))).toEqual(today);
  expect(today.dry).toBeLessThan(CANDIDATES);
});

test('a cell with no surely dry spot cycles its groups over the doubtful shore spots, driest first', () => {
  // one land pixel (x = 9) 30 % sea, between sea on its west and a lake pixel on its east: nothing in the cell is surely dry
  const ranker = createSiteRanker(world((set) => {
    for (let y = 0; y < TH; y++) { set(9, y, { depth: 3, share: 5 }); set(10, y, { lake: true }); set(11, y, { lake: true }); }
  }), CELLS);
  const spots = ranker.spotsFor(COAST_CELL, 0);
  expect(spots.dry).toBeLessThan(CANDIDATES);
  for (let k = 0; k < spots.dry; k++) expect(ranker.isWet(COAST_CELL, spots.x[k], spots.y[k], 0)).toBe(false);
});

test('a partly sea pixel is wet only while its sea is still under water', () => {
  // pixel 9 is a shore pixel 80 % sea, 3 m deep: sea today, land once the sea drops 3 m
  const ranker = createSiteRanker(world((set) => { for (let y = 0; y < TH; y++) set(9, y, { depth: 3, share: 12 }); }), CELLS);
  const today = ranker.spotsFor(COAST_CELL, 0).dry;
  const lower = ranker.spotsFor(COAST_CELL, -4).dry;
  expect(lower).toBeGreaterThan(today);
});

test('lakes are left out like the sea', () => {
  const ranker = createSiteRanker(world((set) => {
    for (const y of [2, 3]) set(13, y, { lake: true }); // the east pixel column of the cell
  }), CELLS);
  const spots = ranker.spotsFor(INLAND_CELL, 0);
  expect(spots.dry).toBeGreaterThan(0);
  expect(spots.dry).toBeLessThan(CANDIDATES);
  for (let k = 0; k < spots.dry; k++) expect(ranker.isWet(INLAND_CELL, spots.x[k], spots.y[k], 0)).toBe(false);
});

test('flatter ground ranks first', () => {
  // west pixel column of the cell flat, east one steep
  const ranker = createSiteRanker(world((set) => {
    for (const y of [2, 3]) { set(12, y, { slope: 0 }); set(13, y, { slope: 7 }); }
  }), CELLS);
  const spots = ranker.spotsFor(INLAND_CELL, 0);
  expect(spots.x[0]).toBeLessThan(0);
  expect(spots.x[CANDIDATES - 1]).toBeGreaterThan(0);
});

test('nearer fresh water ranks first', () => {
  // a river in the cell to the east (water pixel col 7 of row 1)
  const ranker = createSiteRanker(world((_, water) => { water[1 * CELLS + 7] = 0; }), CELLS);
  const spots = ranker.spotsFor(INLAND_CELL, 0);
  expect(spots.x[0]).toBeGreaterThan(0);
});

test('the sea pulls spots to the shore', () => {
  const ranker = createSiteRanker(world(), CELLS);
  const spots = ranker.spotsFor(COAST_CELL, 0);
  // the best dry spots lie nearer the sea (west) than the worst dry ones
  const mean = (a: Float64Array) => Array.from(a).reduce((x, y) => x + y, 0) / a.length;
  expect(mean(spots.x.slice(0, 3))).toBeLessThan(mean(spots.x.slice(spots.dry - 3, spots.dry)));
});

// --- the builder -------------------------------------------------------------------------------------------------------

function catalog(): SettlementCatalog {
  const profile = { components: [{ weight: 1, size: 30, moves: 10, pattern: 1, mode: 'mobile' as const, society: 'test' }], storage: null };
  return { version: 1, cities: [], regions: { '17,36': [profile, profile, profile, profile] }, climate: {} };
}
/** HYDE-sized cell ids near (lon 0.04, lat 0.04), which sits in catalogue region 17,36 */
function cells(populations: number[], base: number[]): GridData {
  return {
    length: populations.length, cellIds: new Uint32Array(base), positions: new Float32Array(base.flatMap((_, i) => [0.05 + i * 0.1, 0.05])),
    people: new Float32Array(populations), ways: new Uint8Array(populations.length), cellDeg: 0.1,
    total: populations.reduce((a, b) => a + b, 0),
  };
}
const sum = (values: Float32Array) => Array.from(values).reduce((a, b) => a + b, 0);
// 4320-wide cell ids on a made-up coast: the ranker below treats this world as 8 cells across, so ids are row * 8 + col
const IDS = [COAST_CELL, INLAND_CELL, 1 * CELLS + 5];

test('ranked spots keep every cell\'s people, its ids and its group count', () => {
  const data = cells([300, 120, 60], IDS);
  const ranker = createSiteRanker(world(), CELLS);
  const before = buildSettlementUnits(data, catalog(), 0, null);
  const after = buildSettlementUnits(data, catalog(), 0, null, ranker);
  expect(after.length).toBe(before.length);
  expect(Array.from(after.ids)).toEqual(Array.from(before.ids));
  expect(Array.from(after.people)).toEqual(Array.from(before.people));
  expect(Array.from(after.kind)).toEqual(Array.from(before.kind));
  expect(sum(after.people)).toBeCloseTo(480, 3);
  expect(after.positions).not.toEqual(before.positions);
});

test('no group is in the sea in a coastal year, even with more groups than dry spots', () => {
  // 800 people on the coast cell: 20+ bands, more than its dry spots; they stack on dry spots instead
  const data = cells([800], [COAST_CELL]);
  const ranker = createSiteRanker(world(), CELLS);
  const spots = ranker.spotsFor(COAST_CELL, seaLevelAt(1900));
  const units = buildSettlementUnits(data, catalog(), 1900, null, ranker);
  expect(units.length).toBeGreaterThan(spots.dry - 1);
  for (let u = 0; u < units.length; u++) {
    const x = (units.positions[u * 2] - 0.05) / 0.1;
    const y = (units.positions[u * 2 + 1] - 0.05) / 0.1;
    expect(ranker.isWet(COAST_CELL, x, y, seaLevelAt(1900))).toBe(false);
  }
  // with no ranker the old positions put some of them in the sea
  const old = buildSettlementUnits(data, catalog(), 1900, null);
  let wet = 0;
  for (let u = 0; u < old.length; u++) if (ranker.isWet(COAST_CELL, (old.positions[u * 2] - 0.05) / 0.1, (old.positions[u * 2 + 1] - 0.05) / 0.1, 0)) wet++;
  expect(wet).toBeGreaterThan(0);
});

test('a group stays where it is when the year changes but its coast does not, and moves when the sea falls', () => {
  const data = cells([120], [COAST_CELL]);
  const ranker = createSiteRanker(world(), CELLS);
  const a = buildSettlementUnits(data, catalog(), 1900, null, ranker);
  const b = buildSettlementUnits(data, catalog(), 0, null, ranker);
  const c = buildSettlementUnits(data, catalog(), -5000, null, ranker); // 6 m down: the 50 m shelf is still sea
  expect(b.positions).toEqual(a.positions);
  expect(c.positions).toEqual(a.positions);
  const lowSea = buildSettlementUnits(data, catalog(), -10000, null, ranker); // 50 m down, the shelf (50 m) is land
  expect(lowSea.length).toBe(a.length);
  expect(lowSea.positions).not.toEqual(a.positions);
});

test('adding people adds groups without moving the ones already there', () => {
  const ranker = createSiteRanker(world(), CELLS);
  const small = buildSettlementUnits(cells([60], [INLAND_CELL]), catalog(), 0, null, ranker);
  const large = buildSettlementUnits(cells([240], [INLAND_CELL]), catalog(), 0, null, ranker);
  expect(small.length).toBe(2);
  expect(large.length).toBe(8);
  expect(large.positions.slice(0, 4)).toEqual(small.positions);
  // and the cell's spot list is the same object either way
  expect(ranker.size).toBe(1);
});

test('without a ranker the builder keeps its old positions', () => {
  const data = cells([120, 60], [INLAND_CELL, INLAND_CELL + 1]);
  expect(buildSettlementUnits(data, catalog(), 0, null, null).positions).toEqual(buildSettlementUnits(data, catalog(), 0, null).positions);
});
