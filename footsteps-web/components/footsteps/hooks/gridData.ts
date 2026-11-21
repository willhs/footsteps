import { buildUnits, type Units } from '../layers/units';
import { TARGET_YEARS } from '@/lib/constants';
import { classifyCell } from '@/lib/waysOfLife';
import { allocateCities, loadSettlementCatalog, type AllocatedCity, type SettlementCatalog } from '@/lib/settlements';
import { buildSettlementUnits } from '../layers/settlementUnits';
import { loadDwellings, type DwellingTable } from '@/lib/dwellings';
import { createSiteRanker, type SiteRanker, type SiteTerrain } from '../layers/siteRanking';
import { habitatStep, habitatUrl } from '@/lib/habitat';
import { seaLevelAt } from '@/lib/climate';
import { loadPastWater, NO_EPOCHS, pastWaterEpochs, type Epochs, type PastWaterLayers } from '@/lib/pastWater';
import { landSubcells, type TerrainSea } from './landSubcells';
import { adjustedGridUrl, adjustedSpreadYear, spreadTotalOk } from '@/lib/adjustedSpread';

// Both must match grid_image.py: level 0 is "no people", level q > 0 is
// expm1(q / LEVELS * log1p(MAX_PEOPLE)) people.
const MAX_PEOPLE = 5_000_000;
const LEVELS = 1023;
const LOG_MAX = Math.log1p(MAX_PEOPLE);
export type GridData = {
  length: number;
  positions: Float32Array;
  people: Float32Array;
  cellIds: Uint32Array; // row * width + col, stable across years
  ways: Uint8Array; // WayOfLife of each cell (lib/waysOfLife.ts), from HYDE land use
  cellDeg: number;
  total: number;
  /** Modelled years with a land mask: blocks that are all sea at the year's sea level, whose people stay on every sub-cell. */
  seaBlocks?: number;
  /** `?spread=1`: the cells came from the climate-adjusted image (lib/adjustedSpread.ts), not HYDE's. Absent means HYDE's or the model's. */
  adjusted?: true;
};

export type PointBuffers = {
  length: number;
  attributes: {
    getPosition: { value: Float32Array; size: 2 };
    getRadius: { value: Float32Array; size: 1 };
    getFillColor: { value: Uint8ClampedArray; size: 4 };
  };
};

export type YearGrid = {
  year: number;
  data: GridData;
  units: Pick<Units, 'length' | 'counts' | 'unresolved'>;
  gridPoints: PointBuffers;
  cities?: AllocatedCity[];
};
export type DecodedYearGrid = YearGrid & { units: Units };

/** HYDE images are 4320 × 2160 (5′ cells). The modelled pre-HYDE images are
 * 720 × 360 (0.5°); they are decoded as 6 × 6 blocks of 5′ cells so every year
 * shares one cell grid: unit ids and the year morph all
 * assume it. A block's people go to its land sub-cells (landSubcells.ts), equally. */
const HYDE_WIDTH = 4320;
const isModelled = (year: number) => year < TARGET_YEARS[0];

/** Level of a cell holding 1/`parts` of the people at `level`; never 0 (0 means empty). */
function sharedLevel(level: number, parts: number) {
  if (level === 0 || parts === 1) return level;
  const people = Math.expm1((level / LEVELS) * LOG_MAX) / parts;
  return Math.min(LEVELS, Math.max(1, Math.round((Math.log1p(people) / LOG_MAX) * LEVELS)));
}

export function gridUrl(year: number, adjusted = false) {
  return adjusted ? adjustedGridUrl(year) : `/grid/humans_${year}.webp`;
}

/** HYDE land use for a year: same 4320 × 2160 cells; R = cropland share, G = grazing share
 * (0–255 = 0–1). Written by `grid_image.py --landuse` (docs/ops/grid-images.md). */
export function landUseUrl(year: number) {
  return `/grid/landuse_${year}.png`;
}

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/** Exact bytes of an encoded image: no colour conversion, no premultiplication. */
async function readPixels(url: string, label: string): Promise<Pixels> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const { width, height } = bmp;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Grid decoder requires a 2D canvas');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** Land use is a refinement: without it (missing file, a modelled year) everyone is
 * classed by head count alone, so a failed fetch never loses the people. */
async function readLandUse(year: number): Promise<Pixels | null> {
  if (isModelled(year)) return null; // no land use before HYDE: the model has none
  try {
    return await readPixels(landUseUrl(year), `Land use ${year}`);
  } catch (error) {
    console.warn('[grid] no land use for', year, error);
    return null;
  }
}

function points(
  positions: Float32Array,
  radii: Float32Array,
  colors: Uint8ClampedArray,
): PointBuffers {
  return {
    length: radii.length,
    attributes: {
      getPosition: { value: positions, size: 2 },
      getRadius: { value: radii, size: 1 },
      getFillColor: { value: colors, size: 4 },
    },
  };
}

/** Prepare every CPU-derived render attribute once, off the UI thread. */
export function prepareYearGrid(
  year: number,
  data: GridData,
  settlement?: { catalog: SettlementCatalog; habitat: Uint8ClampedArray | null; sites?: SiteRanker | null; dwellings?: DwellingTable | null; epochs?: Epochs },
): DecodedYearGrid {
  const allocation = settlement ? allocateCities(data, settlement.catalog.cities, year) : null;
  const units = settlement && allocation
    ? buildSettlementUnits(allocation.residual, settlement.catalog, year, settlement.habitat, settlement.sites, settlement.dwellings, settlement.epochs ?? NO_EPOCHS)
    : buildUnits(
    data.cellIds,
    data.positions,
    data.people,
    data.cellDeg,
    data.ways,
  );
  const gridRadii = new Float32Array(data.length);
  const gridColors = new Uint8ClampedArray(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    gridRadii[i] = Math.min(Math.sqrt(data.people[i]) * 30, 25_000);
    const t = Math.min(Math.log1p(data.people[i]) / Math.log1p(1_000_000), 1);
    gridColors.set([0, 220, 255, Math.round(12 + 243 * t * t * t)], i * 4);
  }
  return {
    year,
    data,
    units,
    gridPoints: points(data.positions, gridRadii, gridColors),
    ...(allocation ? { cities: allocation.cities } : {}),
  };
}

/** Read some channels of an image band by band, so a 2.5′ world image never exists as one 150 MB RGBA array. */
async function readChannels(url: string, label: string, channels: number[]): Promise<{ width: number; height: number; planes: Uint8Array[] }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const { width, height } = bmp;
  const BAND = 256;
  const canvas = new OffscreenCanvas(width, BAND);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bmp.close();
    throw new Error('Grid decoder requires a 2D canvas');
  }
  const planes = channels.map(() => new Uint8Array(width * height));
  for (let top = 0; top < height; top += BAND) {
    const rows = Math.min(BAND, height - top);
    ctx.clearRect(0, 0, width, BAND);
    ctx.drawImage(bmp, 0, top, width, rows, 0, 0, width, rows);
    const { data } = ctx.getImageData(0, 0, width, rows);
    for (let p = 0; p < width * rows; p++) channels.forEach((c, k) => { planes[k][top * width + p] = data[p * 4 + c]; });
  }
  bmp.close();
  return { width, height, planes };
}

/** The baked site terrain (docs/ops/site-terrain.md), read once per worker: it places groups under `?settlements=1` and, for every
 * modelled year, says which sub-cells of a 0.5° block are land. Without it modelled people are shared equally; a failed fetch never loses them. */
let siteTerrain: Promise<{ terrain: SiteTerrain; width: number; height: number } | null> | undefined;
function loadSiteTerrain() {
  if (!siteTerrain) {
    siteTerrain = readChannels('/sites/site_terrain.webp', 'Site terrain', [0, 1])
      .then((t) => {
        // Each HYDE cell must be a whole number of terrain pixels across; anything else is a bad file.
        if (t.width % HYDE_WIDTH !== 0 || t.height * 2 !== t.width) throw new Error(`site terrain is ${t.width}×${t.height}`);
        return { width: t.width, height: t.height, terrain: { width: t.width, height: t.height, depth: t.planes[0], packed: t.planes[1] } };
      })
      .catch((error) => {
        console.warn('[grid] no site terrain; modelled people are not kept off the sea, groups keep their old positions', error);
        siteTerrain = undefined;
        return null;
      });
  }
  return siteTerrain;
}

/** The baked terrain and water-distance images behind group placement (siteRanking.ts). Without them groups keep the old
 * invented positions: a failed fetch never loses the people. One ranker per worker, so its per-cell cache outlives each year. */
const siteRankers = new Map<boolean, Promise<SiteRanker | null>>(); // with and without the past-water layers (`?pastwater=1`), so each keeps its own per-cell cache
function loadSiteRanker(pastWater: PastWaterLayers | null): Promise<SiteRanker | null> {
  let ranker = siteRankers.get(pastWater !== null);
  if (!ranker) {
    ranker = Promise.all([
      loadSiteTerrain(),
      readChannels('/water/water_distance.webp', 'Water distance', [0]),
    ]).then(([t, w]) => {
      if (!t) return null;
      return createSiteRanker({
        terrain: t.terrain,
        water: { width: w.width, height: w.height, code: w.planes[0] },
        pastWater,
      }, HYDE_WIDTH);
    }).catch((error) => {
      console.warn('[grid] no site terrain; groups keep their old positions', error);
      return null;
    });
    siteRankers.set(pastWater !== null, ranker);
  }
  return ranker;
}

/** The cells of one year from its decoded population image (and HYDE land use, when there is one).
 * A modelled block's people go only to its land sub-cells at the year's sea level when `sea` (the baked terrain) is given, so block
 * totals are exact and nobody starts in the sea; a block that is all sea at that level keeps them on every sub-cell
 * (`seaBlocks` counts those). Without `sea` each sub-cell takes an equal share. */
export function gridDataFrom(year: number, { width: sw, height: sh, data: px }: Pixels, landUse: Pixels | null, sea: TerrainSea | null = null): GridData {
  const scale = isModelled(year) ? Math.round(HYDE_WIDTH / sw) : 1;
  const w = sw * scale;
  const h = sh * scale;
  const parts = scale * scale;
  // Land use shares the population image's cells; a different size is a bad file.
  const land = landUse?.width === w && landUse.height === h ? landUse : null;
  if (landUse && !land) console.warn(`[grid] land use ${year} is ${landUse.width}×${landUse.height}, expected ${w}×${h}`);
  const mask = scale > 1 ? sea : null;
  const drop = Math.max(0, -seaLevelAt(year));
  // Level of each source cell, then of each of its sub-cells (equal share), or its land sub-cells (mask).
  const levels = new Uint16Array(sw * sh);
  const slot = mask ? new Int32Array(sw * sh).fill(-1) : null; // source cell → its row in `keep`
  let occupied = 0;
  let seaBlocks = 0;
  const keeps: Uint8Array[] = [];
  const counts: number[] = [];
  const scratch = new Uint8Array(parts);
  for (let i = 0; i < sw * sh; i++) {
    const level = (px[i * 4] << 8) | px[i * 4 + 1];
    if (!level) continue;
    occupied++;
    if (mask && slot) {
      const { count, allSea } = landSubcells(mask, i % sw, Math.floor(i / sw), scale, w, drop, scratch);
      slot[i] = keeps.length;
      keeps.push(scratch.slice());
      counts.push(count);
      levels[i] = level;
      if (allSea) seaBlocks++;
    } else {
      levels[i] = sharedLevel(level, parts);
    }
  }
  const length = mask ? counts.reduce((a, b) => a + b, 0) : occupied * parts;
  const positions = new Float32Array(length * 2);
  const people = new Float32Array(length);
  const cellIds = new Uint32Array(length);
  const ways = new Uint8Array(length);
  const cellDeg = 360 / w;
  let index = 0;
  let total = 0;
  for (let row = 0; row < h; row++) {
    const blockRow = Math.floor(row / scale);
    const sourceRow = blockRow * sw;
    for (let col = 0; col < w; col++) {
      const block = sourceRow + Math.floor(col / scale);
      const value = levels[block];
      if (!value) continue;
      let population: number;
      if (slot) {
        const s = slot[block];
        if (!keeps[s][(row % scale) * scale + (col % scale)]) continue;
        population = Math.expm1((value / LEVELS) * LOG_MAX) / counts[s];
      } else {
        population = Math.expm1((value / LEVELS) * LOG_MAX);
      }
      positions[index * 2] = -180 + (col + 0.5) * cellDeg;
      positions[index * 2 + 1] = 90 - (row + 0.5) * cellDeg;
      people[index] = population;
      cellIds[index] = row * w + col;
      const px4 = (row * w + col) * 4;
      ways[index] = land
        ? classifyCell(population, land.data[px4] / 255, land.data[px4 + 1] / 255)
        : classifyCell(population, 0, 0);
      total += population;
      index++;
    }
  }
  return { length, positions, people, cellIds, ways, cellDeg, total, seaBlocks };
}

/** `?spread=1`: the year's cells from the climate-adjusted image, or null (with a warning) when it cannot be read or does not keep
 * HYDE's world total, so the caller draws HYDE's and nothing is labelled adjusted that is not. */
function adjustedGridData(year: number, read: Pixels | Error, landUse: Pixels | null): GridData | null {
  if (read instanceof Error) {
    console.warn('[grid] no adjusted spread for', year, "- drawing HYDE's", read);
    return null;
  }
  const data = gridDataFrom(year, read, landUse);
  if (!spreadTotalOk(data.total, year)) {
    console.warn(`[grid] adjusted spread ${year} holds ${Math.round(data.total)} people, not HYDE's total; drawing HYDE's`);
    return null;
  }
  return { ...data, adjusted: true };
}

export async function decodeYearGrid(year: number, settlements = false, sites = true, pastWater = false, spread = false): Promise<DecodedYearGrid> {
  // `?pastwater=1`: every scenario's patches load once; if they fail, groups are placed as without the flag (the screen's note then says nothing is applied).
  const lake = pastWater && settlements && sites ? await loadPastWater().catch((error) => { console.warn('[grid] no past water; the scenarios are not applied', error); return null; }) : null;
  // `?spread=1`: HYDE's image is fetched only if the adjusted one fails, so the flag costs no extra download. Without the flag the
  // requests go out exactly as before: population image, land use, then (modelled years) the site terrain.
  const adjustedRead = spread && adjustedSpreadYear(year)
    ? readPixels(gridUrl(year, true), `Adjusted grid ${year}`).catch((error: Error) => error)
    : null;
  const hydeRead = adjustedRead ? null : readPixels(gridUrl(year), `Grid ${year}`);
  const landUse = readLandUse(year); // never rejects: a missing file classes by head count
  const hyde = (pixels: Promise<Pixels>) =>
    Promise.all([pixels, landUse, isModelled(year) ? loadSiteTerrain() : null])
      .then(([px, use, sea]) => gridDataFrom(year, px, use, sea?.terrain ?? null));
  const data = (adjustedRead && adjustedGridData(year, await adjustedRead, await landUse))
    || await hyde(hydeRead ?? readPixels(gridUrl(year), `Grid ${year}`));
  return prepareYearGrid(
    year,
    data,
    settlements ? {
      catalog: await loadSettlementCatalog(),
      habitat: isModelled(year) ? (await readPixels(habitatUrl(habitatStep(year)), 'Settlement climate')).data : null,
      sites: sites ? await loadSiteRanker(lake) : null,
      epochs: lake ? pastWaterEpochs(year) : NO_EPOCHS,
      // Only the close-up shelters read it (?shelters=1); the model runs without it if the small file is missing.
      dwellings: await loadDwellings().catch(() => null),
    } : undefined,
  );
}
