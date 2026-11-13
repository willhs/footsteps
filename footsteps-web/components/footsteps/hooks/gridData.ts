import { buildUnits, type Units } from '../layers/units';
import { TARGET_YEARS } from '@/lib/constants';
import { classifyCell } from '@/lib/waysOfLife';

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
  units: Pick<Units, 'length' | 'counts'>;
  gridPoints: PointBuffers;
};
export type DecodedYearGrid = YearGrid & { units: Units };

/** HYDE images are 4320 × 2160 (5′ cells). The modelled pre-HYDE images are
 * 720 × 360 (0.5°); they are decoded as 6 × 6 blocks of 5′ cells so every year
 * shares one cell grid: unit ids and the year morph all
 * assume it. Each sub-cell takes an equal share of its block's people. */
const HYDE_WIDTH = 4320;
const isModelled = (year: number) => year < TARGET_YEARS[0];

/** Level of a cell holding 1/`parts` of the people at `level`; never 0 (0 means empty). */
function sharedLevel(level: number, parts: number) {
  if (level === 0 || parts === 1) return level;
  const people = Math.expm1((level / LEVELS) * LOG_MAX) / parts;
  return Math.min(LEVELS, Math.max(1, Math.round((Math.log1p(people) / LOG_MAX) * LEVELS)));
}

export function gridUrl(year: number) {
  return `/grid/humans_${year}.webp`;
}

/** HYDE land use for a year: same 4320 × 2160 cells; R = cropland share, G = grazing share
 * (0–255 = 0–1). Written by `grid_image.py --landuse` (docs/ops/grid-images.md). */
export function landUseUrl(year: number) {
  return `/grid/landuse_${year}.png`;
}

type Pixels = { width: number; height: number; data: Uint8ClampedArray };

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
): DecodedYearGrid {
  const units = buildUnits(
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
  };
}

export async function decodeYearGrid(year: number): Promise<DecodedYearGrid> {
  const [{ width: sw, height: sh, data: px }, landUse] = await Promise.all([
    readPixels(gridUrl(year), `Grid ${year}`),
    readLandUse(year),
  ]);
  const scale = isModelled(year) ? Math.round(HYDE_WIDTH / sw) : 1;
  const w = sw * scale;
  const h = sh * scale;
  // Land use shares the population image's cells; a different size is a bad file.
  const land = landUse?.width === w && landUse.height === h ? landUse : null;
  if (landUse && !land) console.warn(`[grid] land use ${year} is ${landUse.width}×${landUse.height}, expected ${w}×${h}`);
  // Level of each source cell, then of each of its sub-cells.
  const levels = new Uint16Array(sw * sh);
  let occupied = 0;
  for (let i = 0; i < sw * sh; i++) {
    const level = (px[i * 4] << 8) | px[i * 4 + 1];
    levels[i] = sharedLevel(level, scale * scale);
    if (level) occupied++;
  }
  const length = occupied * scale * scale;
  const positions = new Float32Array(length * 2);
  const people = new Float32Array(length);
  const cellIds = new Uint32Array(length);
  const ways = new Uint8Array(length);
  const cellDeg = 360 / w;
  let index = 0;
  let total = 0;
  for (let row = 0; row < h; row++) {
    const sourceRow = Math.floor(row / scale) * sw;
    for (let col = 0; col < w; col++) {
      const value = levels[sourceRow + Math.floor(col / scale)];
      if (!value) continue;
      const population = Math.expm1((value / LEVELS) * LOG_MAX);
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
  return prepareYearGrid(
    year,
    { length, positions, people, cellIds, ways, cellDeg, total },
  );
}
