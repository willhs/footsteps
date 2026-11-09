import { buildUnits, type Units } from '../layers/units';

// Both must match grid_image.py: level 0 is "no people", level q > 0 is
// expm1(q / LEVELS * log1p(MAX_PEOPLE)) people.
const MAX_PEOPLE = 5_000_000;
const LEVELS = 1023;
const LOG_MAX = Math.log1p(MAX_PEOPLE);
// Rows beyond this latitude are left out of the glow image: Web Mercator cannot
// draw the poles, and HYDE records almost nobody there.
export const GLOW_MAX_LAT = 85;

export type GridData = {
  length: number;
  positions: Float32Array;
  people: Float32Array;
  cellIds: Uint32Array; // row * width + col, stable across years
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

/** One byte per cell: 255 * log1p(people) / log1p(MAX_PEOPLE), rows ±GLOW_MAX_LAT.
 * The GPU turns it into colour, so a year costs one texture whatever its size. */
export type GlowImage = {
  data: Uint8Array;
  width: number;
  height: number;
  format: 'r8unorm';
};

export type YearGrid = {
  year: number;
  data: GridData;
  glow: GlowImage;
  units: Pick<Units, 'length' | 'counts'>;
  gridPoints: PointBuffers;
};
export type DecodedYearGrid = YearGrid & { units: Units };

export function gridUrl(year: number) {
  return `/grid/humans_${year}.webp`;
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
  glow: GlowImage,
): DecodedYearGrid {
  const units = buildUnits(
    data.cellIds,
    data.positions,
    data.people,
    data.cellDeg,
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
    glow,
    units,
    gridPoints: points(data.positions, gridRadii, gridColors),
  };
}

export async function decodeYearGrid(year: number): Promise<DecodedYearGrid> {
  const response = await fetch(gridUrl(year));
  if (!response.ok) throw new Error(`Grid ${year}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const { width: w, height: h } = bmp;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('Grid decoder requires a 2D canvas');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  let length = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 4] | px[i * 4 + 1]) length++;
  const positions = new Float32Array(length * 2);
  const people = new Float32Array(length);
  const cellIds = new Uint32Array(length);
  const cellDeg = 360 / w;
  const crop = Math.min(Math.floor(h / 2), Math.round((90 - GLOW_MAX_LAT) / cellDeg));
  const glow: GlowImage = {
    data: new Uint8Array(w * (h - 2 * crop)),
    width: w,
    height: h - 2 * crop,
    format: 'r8unorm',
  };
  let index = 0;
  let total = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const offset = (row * w + col) * 4;
      const value = (px[offset] << 8) | px[offset + 1];
      if (!value) continue;
      if (row >= crop && row < h - crop)
        glow.data[(row - crop) * w + col] = Math.max(
          1,
          Math.round((value * 255) / LEVELS),
        );
      const population = Math.expm1((value / LEVELS) * LOG_MAX);
      positions[index * 2] = -180 + (col + 0.5) * cellDeg;
      positions[index * 2 + 1] = 90 - (row + 0.5) * cellDeg;
      people[index] = population;
      cellIds[index] = row * w + col;
      total += population;
      index++;
    }
  }
  return prepareYearGrid(
    year,
    { length, positions, people, cellIds, cellDeg, total },
    glow,
  );
}
