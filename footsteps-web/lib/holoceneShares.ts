// Continental shares across the hand-over to HYDE, 13,000-4,000 BCE (footstep-generator/holocene_shares.py,
// docs/research/0016-holocene-hand-over). HYDE 3.5's 10,000 BCE map is a shrunken modern one (Africa 5% of the world,
// the just-settled Americas 51%), so blending the pre-HYDE model into it moved ~2 million people from Africa to the
// Americas in 4,000 years. These multipliers set each continent's total to the forager model's share, fading back to
// HYDE's by 3000 BCE; cells keep their pattern inside a continent and the world total is unchanged. Modelled.
import table from './holoceneShares.json';

type Box = readonly [west: number, south: number, east: number, north: number]; // degrees
type Table = { continents: { id: string; boxes: number[][] }[]; factors: Record<string, Record<string, number>> };

const TABLE = table as Table;
const CONTINENTS = TABLE.continents.map((c) => ({ id: c.id, boxes: c.boxes as unknown as Box[] }));

const NO_CONTINENT = -1;
const UNCHANGED = 1; // multiplier for cells outside every continent box (the remote Pacific)

// The table was fitted on whole-world images at 0.5° (720 × 360, the pre-HYDE model's grid) or finer (HYDE's 4320 × 2160).
// Anything smaller or not 2:1 is not such an image (a test fixture, a cropped tile), so it is drawn as it is.
const MIN_WORLD_WIDTH = 720;

/** The years with a row (the rest draw their image as it is). */
export const HOLOCENE_SHARE_YEARS: readonly number[] = Object.keys(TABLE.factors)
  .map(Number)
  .sort((a, b) => a - b);

/** Index of the first continent whose box holds the point, else -1 (as `continent_map` in the generator). */
export function continentAt(lon: number, lat: number): number {
  for (let index = 0; index < CONTINENTS.length; index++) {
    for (const [west, south, east, north] of CONTINENTS[index].boxes) {
      if (lon >= west && lon < east && lat >= south && lat < north) return index;
    }
  }
  return NO_CONTINENT;
}

export function continentId(index: number): string | null {
  return CONTINENTS[index]?.id ?? null;
}

const continentMapsBySize = new Map<string, Int8Array>();

/** Continent index of each cell of a whole-world `width` × `height` grid (row 0 = north, column 0 = 180° W), cached per size. */
function continentMap(width: number, height: number): Int8Array {
  const key = `${width}x${height}`;
  const cached = continentMapsBySize.get(key);
  if (cached) return cached;

  const map = new Int8Array(width * height);
  for (let row = 0; row < height; row++) {
    const lat = 90 - ((row + 0.5) * 180) / height;
    for (let col = 0; col < width; col++) {
      const lon = -180 + ((col + 0.5) * 360) / width;
      map[row * width + col] = continentAt(lon, lat);
    }
  }

  continentMapsBySize.set(key, map);
  return map;
}

/** One multiplier per cell of a `width` × `height` population image for `year`, or null when the year has no row or the
 * image is not a whole-world grid (MIN_WORLD_WIDTH wide or finer, 2:1). */
export function shareFactors(year: number, width: number, height: number): Float32Array | null {
  const yearRow = TABLE.factors[String(year)];
  const isWorldGrid = width >= MIN_WORLD_WIDTH && width === height * 2;
  if (!yearRow || !isWorldGrid) return null;

  const byContinent = CONTINENTS.map((c) => yearRow[c.id] ?? UNCHANGED);
  const map = continentMap(width, height);

  const factors = new Float32Array(width * height);
  for (let cell = 0; cell < factors.length; cell++) {
    const continent = map[cell];
    factors[cell] = continent === NO_CONTINENT ? UNCHANGED : byContinent[continent];
  }
  return factors;
}
