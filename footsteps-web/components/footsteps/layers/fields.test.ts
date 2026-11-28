// Generation and draping only; the layer class needs WebGL and is not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { MESH_STEP } from '@/lib/close3d';
import { cropsAround, herdsAround, type FoodData } from '@/lib/food';
import {
  CROP_LOOK,
  FARM_RADIUS_M,
  farmedArea,
  SUBSISTENCE_M2_PER_PERSON,
  fieldsParam,
  growing,
  isSwidden,
  landPatches,
  patchArea,
  WATER_PATH_MAX_M,
  waterHere,
  type AreaPatch,
  type LandContext,
  type LandGroup,
  type LandPatch,
} from './fields';
import { drapeLand, tileLandKey, NOT_FARMED_FROM_DEG, TERRACE_FROM_DEG } from './fieldsDrape';
import { UnitKind } from './units';

const ctx: LandContext = { season: 'off', crops: () => ['wheat', 'barley'] };
const village = (lon: number, lat: number, crop: number, extra: Partial<LandGroup> = {}): LandGroup => ({
  lon, lat, kind: UnitKind.Village, people: 300, crop, grazing: 0.1, cellShare: 1, water: null, ...extra,
});
const isArea = (p: LandPatch): p is AreaPatch => p.kind !== 'path';
const FARM = new Set(['field', 'fallow', 'pasture']);
const farmed = (patches: LandPatch[]) => patches.filter(isArea).filter((p) => FARM.has(p.kind)).reduce((a, p) => a + patchArea(p), 0);
const centre = (p: AreaPatch): [number, number] => [p.corners.reduce((a, c) => a + c[0], 0) / 4, p.corners.reduce((a, c) => a + c[1], 0) / 4];
const metres = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111_320);

test('on unless ?fields=0', () => {
  expect(fieldsParam('')).toBe(true);
  expect(fieldsParam('?year=-3000&fields=1')).toBe(true);
  expect(fieldsParam('?fields=0')).toBe(false);
});

test('the same groups always give the same land', () => {
  const groups = [village(31.2, 30.0, 0.3, { water: { metres: 800, dir: [1, 0] } }), village(31.23, 30.01, 0.2)];
  expect(landPatches(groups, [], ctx)).toEqual(landPatches(groups, [], ctx));
  expect(landPatches(groups, [], ctx).length).toBeGreaterThan(50);
});

test("farmed area is the cell's HYDE cropland times the group's share of the cell's people", () => {
  // Averaged over villages far apart, so each farms its whole share.
  const spots = Array.from({ length: 12 }, (_, k) => [10 + k * 0.5, 45 + (k % 3) * 0.3] as const);
  const drawn = (crop: number, cellShare = 1) =>
    spots.reduce((a, [lon, lat]) => a + farmed(landPatches([village(lon, lat, crop, { cellShare, people: 20 })], [], ctx)) / farmedArea(0.02, lat, 1), 0) / spots.length;
  const low = drawn(0.02);
  // Strips leave balks between them (~8 % of a block), so a little under the HYDE area is drawn.
  expect(low).toBeGreaterThan(0.8);
  expect(low).toBeLessThan(1.05);
  expect(drawn(0.06) / low).toBeGreaterThan(2.6);
  expect(drawn(0.06) / low).toBeLessThan(3.4);
  expect(drawn(0.06, 0.5) / low).toBeGreaterThan(1.3);
  expect(drawn(0.06, 0.5) / low).toBeLessThan(1.7);
  expect(farmedArea(0, 45, 1)).toBe(0);
  expect(farmedArea(0.1, 0, 1)).toBeCloseTo(0.1 * (111_320 / 12) ** 2, -3);
});

test('a village with almost no HYDE cropland still farms its subsistence plots', () => {
  const g = village(31.25, 29.85, 0, { people: 300 });
  const area = farmed(landPatches([g], [], ctx));
  expect(area).toBeGreaterThan(300 * SUBSISTENCE_M2_PER_PERSON * 0.6);
  expect(area).toBeLessThan(300 * SUBSISTENCE_M2_PER_PERSON * 1.4);
});

test('no field lies beyond the farmed radius, however much cropland', () => {
  const g = village(10, 45, 1);
  const far = Math.max(...landPatches([g], [], ctx).filter(isArea).filter((p) => FARM.has(p.kind)).map((p) => metres(centre(p), [g.lon, g.lat])));
  expect(far).toBeLessThan(FARM_RADIUS_M);
  expect(far).toBeGreaterThan(FARM_RADIUS_M * 0.8);
});

test("neighbouring villages split the land: no field lies nearer the other village", () => {
  const a = village(12.0, 42.0, 0.4);
  const b = village(12.02, 42.0, 0.4); // ~1.65 km east
  const alone = (g: LandGroup) => new Set(landPatches([g], [], ctx).filter(isArea).map((p) => JSON.stringify(p.corners)));
  const [onlyA, onlyB] = [alone(a), alone(b)];
  const both = landPatches([a, b], [], ctx).filter(isArea).filter((p) => FARM.has(p.kind));
  expect(both.length).toBeGreaterThan(100);
  for (const p of both) {
    const key = JSON.stringify(p.corners);
    const c = centre(p);
    // Ownership is decided at a strip's centre; its corners are jittered by up to 6 % of a block, so the corners' mean can sit ~18 m off.
    if (onlyA.has(key)) expect(metres(c, [a.lon, a.lat])).toBeLessThanOrEqual(metres(c, [b.lon, b.lat]) + 20);
    else {
      expect(onlyB.has(key)).toBe(true);
      expect(metres(c, [b.lon, b.lat])).toBeLessThanOrEqual(metres(c, [a.lon, a.lat]) + 20);
    }
  }
});

test('herders get a corral and grazed grass, foragers only a clearing, and nobody plants without cropland', () => {
  const camp = landPatches([{ lon: 105, lat: 47, kind: UnitKind.Camp, people: 60, crop: 0, grazing: 0.5, cellShare: 1, water: null }], [], ctx);
  expect(new Set(camp.map((p) => p.kind))).toEqual(new Set(['grazed', 'corral']));
  expect(camp.filter((p) => p.kind === 'grazed').every((p) => p.wash)).toBe(true);
  const band = landPatches([{ lon: 20, lat: -20, kind: UnitKind.Band, people: 30, crop: 0.2, grazing: 0, cellShare: 1, water: null }], [], ctx);
  expect(new Set(band.map((p) => p.kind))).toEqual(new Set(['clearing']));
});

test('a town has gardens among its roofs and a ring of fields beyond them', () => {
  const town = { lon: 12.5, lat: 41.9, people: 20000, crop: 0.3, cellShare: 1, water: null };
  const land = landPatches([], [town], ctx).filter(isArea);
  const gardens = land.filter((p) => p.kind === 'garden');
  const fields = land.filter((p) => FARM.has(p.kind));
  expect(gardens.length).toBeGreaterThan(100);
  expect(fields.length).toBeGreaterThan(100);
  const inner = Math.max(...gardens.map((p) => metres(centre(p), [town.lon, town.lat])));
  const nearestField = Math.min(...fields.map((p) => metres(centre(p), [town.lon, town.lat])));
  expect(nearestField).toBeGreaterThan(inner * 0.95);
});

test('a path leads towards fresh water, no longer than the cap', () => {
  const g = village(30, 10, 0, { water: { metres: 50_000, dir: [0, 1] } });
  const path = landPatches([g], [], ctx).filter((p) => p.kind === 'path');
  expect(path.length).toBeGreaterThan(3);
  const ends = path.flatMap((p) => (p.kind === 'path' ? p.line : []));
  const far = ends.reduce((a, e) => (metres(e, [g.lon, g.lat]) > metres(a, [g.lon, g.lat]) ? e : a));
  expect(far[1]).toBeGreaterThan(g.lat); // north, the way the water lies
  expect(metres(far, [g.lon, g.lat])).toBeLessThan(WATER_PATH_MAX_M * 1.05);
  // Water in the cell (under the minimum) draws no track.
  expect(landPatches([village(30, 10, 0, { water: { metres: 20, dir: [0, 1] } })], [], ctx).some((p) => p.kind === 'path')).toBe(false);
});

test('neighbours within a few km are joined by one track', () => {
  const pair = [village(30, 10, 0), village(30.02, 10, 0)];
  const paths = landPatches(pair, [], ctx).filter((p) => p.kind === 'path');
  expect(paths.length).toBeGreaterThan(0);
  const apart = [village(30, 10, 0), village(30.1, 10, 0)]; // ~11 km
  expect(landPatches(apart, [], ctx).some((p) => p.kind === 'path')).toBe(false);
});

test('fields are coloured by crop and season', () => {
  expect(growing('off', 50)).toBe(true);
  expect(growing('december', 50)).toBe(false);
  expect(growing('december', -30)).toBe(true);
  expect(growing('june', 5)).toBe(true);
  const rice: LandContext = { season: 'off', crops: () => ['rice'] };
  const g = village(110, 25, 0.5);
  const colours = new Set(landPatches([g], [], rice).filter((p) => p.kind === 'field').map((p) => p.rgb[1] > p.rgb[0]));
  expect(colours).toEqual(new Set([true])); // paddies are green
  expect(CROP_LOOK.wheat.grow[0]).toBeGreaterThan(CROP_LOOK.wheat.grow[2]); // ripening wheat is golden
});

test('cropsAround reads the 5° cell at the era, staples first', () => {
  const food: FoodData = {
    version: 1, eras: [-10000, -3000, 1000],
    taxa: [{ id: 'wheat', name: 'Wheat', kind: 'crop' }, { id: 'sheep', name: 'Sheep', kind: 'animal' }, { id: 'maize', name: 'Maize', kind: 'crop' }],
    cells: { '30,30': { wheat: [1, 'high', true], sheep: [1, 'high', true], maize: [2, 'low', false] } },
    biomes: {},
  };
  expect(cropsAround(food, 31, 31, -3000)).toEqual(['wheat']);
  expect(cropsAround(food, 31, 31, 1500)).toEqual(['wheat', 'maize']);
  expect(cropsAround(food, 31, 31, -12000)).toEqual([]);
  expect(cropsAround(food, 0, 0, 1000)).toEqual([]);
});

test('cropsAround puts the longest-grown staples first and side crops last: central Mexico at 1600 is maize, not wheat', () => {
  const food: FoodData = {
    version: 1, eras: [-10000, -5000, -2000, 1600],
    taxa: ['wheat', 'barley', 'maize', 'squash', 'common_bean'].map((id): FoodData['taxa'][number] => ({ id, name: id, kind: 'crop' }))
      .concat([{ id: 'turkey', name: 'Turkey', kind: 'animal' }, { id: 'sheep', name: 'Sheep', kind: 'animal' }]),
    cells: { '15,-100': { squash: [1, 'high', true], maize: [2, 'high', true], common_bean: [2, 'high', true], turkey: [2, 'high', true],
      wheat: [3, 'high', true], barley: [3, 'high', true], sheep: [3, 'high', true] } },
    biomes: {},
  };
  expect(cropsAround(food, -99, 19, 1600)).toEqual(['maize', 'wheat', 'barley', 'squash', 'common_bean']);
  expect(herdsAround(food, -99, 19, 1000)).toBe(false); // turkeys graze no pasture
  expect(herdsAround(food, -99, 19, 1600)).toBe(true);
});

test('no pasture where no grazing animal had arrived', () => {
  const noHerds: LandContext = { ...ctx, herds: () => false };
  expect(landPatches([village(31, 30, 0.3)], [], ctx).some((p) => p.kind === 'pasture')).toBe(true);
  expect(landPatches([village(31, 30, 0.3)], [], noHerds).some((p) => p.kind === 'pasture')).toBe(false);
});

test('tropical root-crop villages farm scattered swidden clearings, not strip fields', () => {
  const amazon: LandContext = { season: 'off', crops: () => ['cassava', 'maize'], herds: () => false };
  const g = village(-60, -3, 0.05);
  const patches = landPatches([g], [], amazon).filter(isArea);
  const fields = patches.filter((p) => p.kind === 'field' || p.kind === 'fallow');
  expect(fields.length).toBeGreaterThan(0);
  expect(patches.some((p) => p.kind === 'pasture')).toBe(false);
  // Clearings are fans of thin spokes round a centre, not 150 m strips: no patch has a side near a field block's.
  expect(Math.max(...fields.map(patchArea))).toBeLessThan(1500);
  // Not where paddies or highland potatoes say the fields were permanent (Java, the Andes).
  expect(isSwidden(['taro', 'banana', 'rice'], -7)).toBe(false);
  expect(isSwidden(['cassava', 'maize', 'potato'], -14)).toBe(false);
  expect(isSwidden(['yam', 'sorghum'], 7)).toBe(true);
  // The same crops at 40°N are ordinary fields.
  expect(landPatches([village(-60, 40, 0.05)], [], amazon).filter(isArea).some((p) => p.kind === 'field' && patchArea(p) > 3000)).toBe(true);
});

// --- Drape -----------------------------------------------------------------------------------------------------------

const bbox = { west: 31.0, south: 30.0, east: 31.1, north: 30.1 };
const tile = (h: (px: number, py: number) => number) => {
  const heights = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) heights[y * 256 + x] = h(x, y);
  return heights;
};
const square = (lon: number, lat: number, half: number, kind: AreaPatch['kind'] = 'field'): AreaPatch => ({
  kind, rgb: [200, 180, 90], wash: false,
  corners: [[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half]],
});
const usedLons = (m: { positions: Float32Array; indices: Uint32Array } | null) => (m ? [...m.indices].map((i) => bbox.west + m.positions[i * 3]) : []);

test('nothing is draped on water: pieces over the sea are left out', () => {
  // West half below sea level, east half dry land at 20 m.
  const heights = tile((x) => (x < 128 ? -5 : 20));
  const patches = [square(31.02, 30.05, 0.01), square(31.05, 30.05, 0.01), square(31.08, 30.05, 0.01)];
  const land = drapeLand(heights, bbox, 12, patches, 0);
  const lons = usedLons(land.solid);
  expect(lons.length).toBeGreaterThan(0);
  // A piece needs all four ground vertices round each corner dry: the first dry column is at 128 px.
  expect(Math.min(...lons)).toBeGreaterThanOrEqual(31.0 + 0.1 * (128 - MESH_STEP) / 256);
  // All water: nothing.
  expect(drapeLand(tile(() => -1), bbox, 12, patches, 0).pieces).toBe(0);
});

test('nothing is draped on ice', () => {
  const ice = { key: 'i', shareAt: (lon: number) => (lon < 31.05 ? 1 : 0) };
  const land = drapeLand(tile(() => 100), bbox, 12, [square(31.02, 30.05, 0.01), square(31.08, 30.05, 0.01)], 0, null, ice);
  expect(Math.min(...usedLons(land.solid))).toBeGreaterThan(31.045);
});

test('a patch on flat ground lies on it, a little lifted; a wash is painted into the ground vertices inside it, never on water', () => {
  const land = drapeLand(tile(() => 50), bbox, 12, [square(31.05, 30.05, 0.005), { ...square(31.03, 30.03, 0.005, 'grazed'), wash: true }], 0);
  const z = [...land.solid!.indices].map((i) => land.solid!.positions[i * 3 + 2]);
  expect(Math.min(...z)).toBeGreaterThan(50 * 1.6);
  expect(Math.max(...z)).toBeLessThan(50 * 1.6 + 8);
  // The wash spans 0.01° of the 0.1° tile: about a tenth of the 129 vertices each way.
  const painted = [...land.paint!.weight].filter((w) => w > 0).length;
  expect(painted).toBeGreaterThan(100);
  expect(painted).toBeLessThan(250);
  const wet = drapeLand(tile(() => -5), bbox, 12, [{ ...square(31.03, 30.03, 0.005, 'grazed'), wash: true }], 0);
  expect(wet.paint).toBeNull();
});

test('steep farmland is terraced along the contour; very steep is not farmed', () => {
  // A slope rising to the east: metres per pixel ≈ 0.1° × 96.4 km / 256 ≈ 37.7 m.
  const pxM = (0.1 * 111_320 * Math.cos((30.05 * Math.PI) / 180)) / 256;
  const ramp = (deg: number) => tile((x) => 100 + x * pxM * Math.tan((deg * Math.PI) / 180));
  const patch = square(31.05, 30.05, 0.003);
  const flat = drapeLand(ramp(2), bbox, 12, [patch], 0);
  const terraced = drapeLand(ramp((TERRACE_FROM_DEG + NOT_FARMED_FROM_DEG) / 2), bbox, 12, [patch], 0);
  const cliff = drapeLand(ramp(NOT_FARMED_FROM_DEG + 10), bbox, 12, [patch], 0);
  expect(flat.pieces).toBeGreaterThan(0);
  expect(terraced.pieces).toBeGreaterThan(0);
  expect(cliff.pieces).toBe(0);
  // Terrace beds run north-south here (along the contour): their vertices span more latitude than longitude.
  const m = terraced.solid!;
  const lons = [...m.indices].map((i) => m.positions[i * 3]);
  const lats = [...m.indices].map((i) => m.positions[i * 3 + 1]);
  const spanLon = (Math.max(...lons) - Math.min(...lons)) * Math.cos((30.05 * Math.PI) / 180);
  const spanLat = Math.max(...lats) - Math.min(...lats);
  expect(spanLat).toBeGreaterThan(spanLon * 0.9);
});

test('waterHere: distance between cell centres and the way towards the water', () => {
  // A river along column 2165 (≈ 0.4°E): distance grows by one cell per column away from it.
  const width = 10;
  const col0 = 2160;
  const code = new Uint8Array(width * 6);
  const cellM = (1 / 12) * 111_320;
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < width; c++) code[r * width + c] = Math.round(255 * Math.sqrt((Math.abs(col0 + c - 2165) * cellM) / 2_000_000));
  const w = { col0, row0: 540, width, height: 6, code };
  const west = waterHere(w, 0.15, 44.8)!; // west of the river
  expect(west.metres).toBeGreaterThan(10_000);
  expect(west.dir![0]).toBeGreaterThan(0.9); // head east
  const east = waterHere(w, 0.7, 44.8)!;
  expect(east.dir![0]).toBeLessThan(-0.9);
  expect(waterHere(w, 30, 44.8)).toBeNull();
});

describe('tileLandKey', () => {
  const bbox = { west: 12, south: 41, east: 12.1, north: 41.1 };
  const field = (lon: number, lat: number, rgb: [number, number, number] = [180, 160, 90]): LandPatch => ({
    kind: 'field', wash: false, rgb,
    corners: [[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001]],
  });
  it('follows the patches touching the tile, not the set they came in', () => {
    const inside = [field(12.05, 41.05), field(12.02, 41.08)];
    const key = tileLandKey(inside, bbox);
    // Fresh copies plus a patch far off: the tile keeps its drape.
    expect(tileLandKey([...[field(12.05, 41.05), field(12.02, 41.08)], field(13, 42)], bbox)).toBe(key);
    // A patch of its own changes: it drapes again.
    expect(tileLandKey([inside[0], field(12.02, 41.08, [120, 140, 80])], bbox)).not.toBe(key);
    expect(tileLandKey([inside[0]], bbox)).not.toBe(key);
  });
});

test('a big field on bumpy ground stands clear of every ground vertex under each of its pieces', () => {
  // Gentle bumps (under the terracing slope) a few cells across; a field 0.03° wide spans about 38 ground cells each way, more than the cuts.
  const height = (x: number, y: number) => 100 + 4 * Math.sin(x / 3) * Math.cos(y / 4);
  const land = drapeLand(tile(height), bbox, 12, [square(31.05, 30.05, 0.015)], 0);
  const m = land.solid!;
  const last = 256 / MESH_STEP;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => m.indices[t + k]);
    const fx = v.map((i) => (m.positions[i * 3] / 0.1) * last);
    const fy = v.map((i) => ((0.1 - m.positions[i * 3 + 1]) / 0.1) * last);
    const zMin = Math.min(...v.map((i) => m.positions[i * 3 + 2]));
    for (let j = Math.ceil(Math.min(...fy)); j <= Math.floor(Math.max(...fy)); j++)
      for (let i = Math.ceil(Math.min(...fx)); i <= Math.floor(Math.max(...fx)); i++)
        expect(height(Math.min(255, i * MESH_STEP), Math.min(255, j * MESH_STEP)) * 1.6).toBeLessThanOrEqual(zMin + 1e-3);
  }
});
