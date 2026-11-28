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

// --- past water (?pastwater=1) ----------------------------------------------------------------------------------------------
// The inland cell (row 1, col 6; terrain pixels x 12-13, y 2-3) is inside a modelled lake. The year's active epochs are [1]; [] means none.

const EPOCH = [1];
/** The lake over `pixels` (x, y) of the terrain grid, and (optionally) cells of the distance grid whose code the patch sets to 0. */
function withLake(pixels: [number, number][], waterCells: [number, number][] = [], seaUntilPixel = 9): SiteLayers {
  const base = world(undefined, seaUntilPixel);
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const lake = { x0: Math.min(...xs), y0: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1, wet: new Uint8Array(0) };
  lake.wet = new Uint8Array(lake.width * lake.height);
  for (const [x, y] of pixels) lake.wet[(y - lake.y0) * lake.width + (x - lake.x0)] = 1;
  const wx = waterCells.map(([c]) => c);
  const wy = waterCells.map(([, r]) => r);
  const patch = waterCells.length
    ? { x0: Math.min(...wx), y0: Math.min(...wy), width: Math.max(...wx) - Math.min(...wx) + 1, height: Math.max(...wy) - Math.min(...wy) + 1, code: new Uint8Array(0) }
    : { x0: 6, y0: 1, width: 1, height: 1, code: new Uint8Array(0) }; // static distances everywhere (the patch has none to give)
  patch.code = new Uint8Array(patch.width * patch.height).fill(255);
  for (const [c, r] of waterCells) patch.code[(r - patch.y0) * patch.width + (c - patch.x0)] = 0;
  return { ...base, pastWater: { epochs: [{ id: 1, lake, water: patch, level: { kind: 'plane', m: 329, clip_to_dem: true } }] } };
}
// the lake over the cell and its neighbours (pixels x 10-15, y 0-5): a spot's bilinear reach is a pixel, so only a lake that goes past the cell wets all of it
const LAKE_ALL: [number, number][] = Array.from({ length: 36 }, (_, i) => [10 + (i % 6), Math.floor(i / 6)]);

test('with no epoch, a ranker given the past water is the ranker without it', () => {
  const plain = createSiteRanker(world(), CELLS);
  const wet = createSiteRanker(withLake(LAKE_ALL), CELLS);
  for (let cell = 0; cell < CELLS * 4; cell++) expect(snap(wet.spotsFor(cell, 0))).toEqual(snap(plain.spotsFor(cell, 0)));
  expect(wet.spotsFor(INLAND_CELL, 0).unresolved).toBeFalsy();
});

test('in the epoch a cell the lake covers has nothing usable: unresolved, and wet everywhere', () => {
  const ranker = createSiteRanker(withLake(LAKE_ALL), CELLS);
  const spots = ranker.spotsFor(INLAND_CELL, 0, CANDIDATES, EPOCH);
  expect(spots.dry).toBe(0);
  expect(spots.unresolved).toBe(true);
  expect(ranker.isWet(INLAND_CELL, 0, 0, 0, EPOCH)).toBe(true);
  expect(ranker.isWet(INLAND_CELL, 0, 0, 0)).toBe(false); // the same point with no epoch is dry land
});

test('an epoch change re-ranks a cached cell even though the sea level did not change', () => {
  const ranker = createSiteRanker(withLake(LAKE_ALL), CELLS);
  const dry = snap(ranker.spotsFor(INLAND_CELL, -5)); // a cell with no sea anywhere around it: its list is the same at every sea level
  expect(dry.dry).toBe(CANDIDATES);
  expect(ranker.spotsFor(INLAND_CELL, -5, CANDIDATES, EPOCH).unresolved).toBe(true);
  expect(snap(ranker.spotsFor(INLAND_CELL, -5))).toEqual(dry); // and back: the no-epoch list again
  expect(ranker.spotsFor(INLAND_CELL, -5).unresolved).toBeFalsy();
});

test('a partly lake cell keeps its groups on the dry side', () => {
  const ranker = createSiteRanker(withLake([[12, 2], [12, 3]]), CELLS); // the west half of the cell
  const spots = ranker.spotsFor(INLAND_CELL, 0, CANDIDATES, EPOCH);
  expect(spots.unresolved).toBe(false);
  expect(spots.dry).toBeGreaterThan(0);
  expect(spots.dry).toBeLessThan(CANDIDATES);
  for (let k = 0; k < spots.dry; k++) {
    expect(ranker.isWet(INLAND_CELL, spots.x[k], spots.y[k], 0, EPOCH)).toBe(false);
    expect(spots.x[k]).toBeGreaterThan(-0.1);
  }
});

test('cells outside the past-water region are exactly as without it, at any epoch', () => {
  const plain = createSiteRanker(world(), CELLS);
  const wet = createSiteRanker(withLake(LAKE_ALL), CELLS);
  for (const cell of [0, 1, CELLS, CELLS + 1, 2 * CELLS + 1, 3 * CELLS]) {
    expect(wet.inScenario(cell)).toBe(false);
    expect(snap(wet.spotsFor(cell, 0, CANDIDATES, EPOCH))).toEqual(snap(plain.spotsFor(cell, 0)));
  }
  expect(wet.inScenario(INLAND_CELL)).toBe(true);
});

test('the distance patch replaces the static distances inside its cells only', () => {
  const none = createSiteRanker(world(), CELLS);
  const ranker = createSiteRanker(withLake([[12, 2]], [[6, 1]]), CELLS); // the cell's own distance cell now holds water
  const off = snap(none.spotsFor(INLAND_CELL, 0));
  const noEpoch = snap(ranker.spotsFor(INLAND_CELL, 0));
  expect(noEpoch).toEqual(off); // the patch is only read in the epoch
  const on = ranker.spotsFor(INLAND_CELL, 0, CANDIDATES, EPOCH);
  expect(snap(on)).not.toEqual(off);
  // water at the cell's own centre beats water 2,000 km away: its best spots lie nearer the centre than its worst
  const reach = (k: number) => Math.max(Math.abs(on.x[k]), Math.abs(on.y[k]));
  expect((reach(0) + reach(1) + reach(2)) / 3).toBeLessThan((reach(on.dry - 1) + reach(on.dry - 2) + reach(on.dry - 3)) / 3);
});

test('the builder keeps lake groups out, counts them, and keeps every other group and every person it was given', () => {
  const data = cells([300, 200], [INLAND_CELL, 3 * CELLS]); // a lake cell and a dry one far from it (all land: no sea in this world)
  const layers = withLake(LAKE_ALL, [], 0);
  const ranker = createSiteRanker(layers, CELLS);
  const without = buildSettlementUnits(data, catalog(), -6000, null, ranker);
  const wet = buildSettlementUnits(data, catalog(), -6000, null, ranker, null, EPOCH);
  const inLake = (id: number) => id >> 5 === INLAND_CELL;
  expect(Array.from(without.ids).some(inLake)).toBe(true);
  expect(Array.from(wet.ids).some(inLake)).toBe(false);
  expect(wet.unresolved?.people).toBeCloseTo(300, 3);
  expect(wet.unresolved?.groups).toBe(without.length - wet.length);
  expect(wet.unresolved?.groups).toBeGreaterThan(0);
  expect(sum(wet.people) + (wet.unresolved?.people ?? 0)).toBeCloseTo(data.total, 2); // nothing vanished: placed + unresolved = the cells' people
  expect(data.total).toBe(500); // the cells themselves are untouched
  expect(without.unresolved).toBeUndefined();
  // the dry cell's groups are the ones the no-epoch build placed
  const dryOnly = (u: typeof wet) => Array.from(u.ids).map((id, i) => [id, u.positions[i * 2], u.positions[i * 2 + 1]]).filter(([id]) => !inLake(id));
  expect(dryOnly(wet)).toEqual(dryOnly(without));
});

test('an epoch with no lake patch changes nothing and reports no unresolved groups', () => {
  const data = cells([300], [INLAND_CELL]);
  const ranker = createSiteRanker(world(), CELLS);
  const a = buildSettlementUnits(data, catalog(), -6000, null, ranker);
  const b = buildSettlementUnits(data, catalog(), -6000, null, ranker, null, EPOCH);
  expect(b.positions).toEqual(a.positions);
  expect(b.unresolved).toMatchObject({ groups: 0, people: 0, ice: { groups: 0 }, water: { groups: 0 } });
});

test('an epoch only applies while it is active: another active epoch elsewhere leaves this cell as without the flag', () => {
  const plain = createSiteRanker(world(), CELLS);
  const wet = createSiteRanker(withLake(LAKE_ALL), CELLS);
  expect(snap(wet.spotsFor(INLAND_CELL, 0, CANDIDATES, [7]))).toEqual(snap(plain.spotsFor(INLAND_CELL, 0))); // id 7: not this cell's epoch
  expect(wet.spotsFor(INLAND_CELL, 0, CANDIDATES, [7, 1]).unresolved).toBe(true);
});

// --- ice sheets (?ice=1) ----------------------------------------------------------------------------------------------------
// An ice patch is one more exclusion: id 101, a mask and no distance patch. Its pixels load lazily, so the ranker reads them from the store.

const ICE_ID = 101;
function withIce(pixels: [number, number][], base: SiteLayers = world(undefined, 0)): SiteLayers {
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const patch = { x0: Math.min(...xs), y0: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 };
  const wet = new Uint8Array(patch.width * patch.height);
  for (const [x, y] of pixels) wet[(y - patch.y0) * patch.width + (x - patch.x0)] = 1;
  const meta = { ...patch, id: ICE_ID, region: 'Eurasia' as const, file: 'test.webp', bytes: 0, sha256: '', pixels: pixels.length, area_km2: 0 };
  return { ...base, ice: { patches: [meta], masks: new Map([[ICE_ID, { ...patch, id: ICE_ID, region: 'Eurasia' as const, wet }]]) } };
}

test('ice: a cell under the ice is unresolved, a cell half under it keeps its groups off it, and without the id nothing changes', () => {
  const plain = createSiteRanker(world(undefined, 0), CELLS);
  const all = createSiteRanker(withIce(LAKE_ALL), CELLS);
  expect(all.spotsFor(INLAND_CELL, 0, CANDIDATES, [ICE_ID]).unresolved).toBe(true);
  expect(snap(all.spotsFor(INLAND_CELL, 0))).toEqual(snap(plain.spotsFor(INLAND_CELL, 0)));
  const half = createSiteRanker(withIce([[12, 2], [12, 3]]), CELLS);
  const spots = half.spotsFor(INLAND_CELL, 0, CANDIDATES, [ICE_ID]);
  expect(spots.unresolved).toBe(false);
  expect(spots.dry).toBeGreaterThan(0);
  for (let k = 0; k < spots.dry; k++) expect(half.isWet(INLAND_CELL, spots.x[k], spots.y[k], 0, [ICE_ID])).toBe(false);
  expect(half.inScenario(INLAND_CELL)).toBe(true);
  expect(half.inScenario(0)).toBe(false);
});

test('ice: a mask not loaded yet excludes nothing', () => {
  const layers = withIce(LAKE_ALL);
  layers.ice!.masks.clear();
  expect(createSiteRanker(layers, CELLS).spotsFor(INLAND_CELL, 0, CANDIDATES, [ICE_ID]).unresolved).toBe(false);
});

test('ice and a past-water lake in the same cell: both are kept out, and the cache tells the combinations apart', () => {
  // the lake takes the cell's west half, the ice its east half: together they cover it
  const lake = withLake([[12, 2], [12, 3]], [], 0);
  const both = createSiteRanker(withIce([[13, 2], [13, 3], [14, 2], [14, 3]], lake), CELLS);
  const lakeOnly = snap(both.spotsFor(INLAND_CELL, 0, CANDIDATES, [1]));
  const iceOnly = snap(both.spotsFor(INLAND_CELL, 0, CANDIDATES, [ICE_ID]));
  const together = both.spotsFor(INLAND_CELL, 0, CANDIDATES, [1, ICE_ID]);
  expect(together.dry).toBeLessThan(Math.min(lakeOnly.dry, iceOnly.dry));
  for (let k = 0; k < together.dry; k++) expect(both.isWet(INLAND_CELL, together.x[k], together.y[k], 0, [1, ICE_ID])).toBe(false);
  expect(snap(both.spotsFor(INLAND_CELL, 0, CANDIDATES, [1]))).toEqual(lakeOnly);
});
