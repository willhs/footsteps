// Continental shares across the hand-over to HYDE, 13,000-4,000 BCE (footstep-generator/holocene_shares.py,
// docs/research/0016-holocene-hand-over). HYDE 3.5's 10,000 BCE map is a shrunken modern one (Africa 5% of the world,
// the just-settled Americas 51%), so blending the pre-HYDE model into it moved ~2 million people from Africa to the
// Americas in 4,000 years. These multipliers set each continent's total to the forager model's share, fading back to
// HYDE's by 3000 BCE; cells keep their pattern inside a continent and the world total is unchanged. Modelled.
import table from './holoceneShares.json';

type Box = readonly [number, number, number, number]; // west, south, east, north
type Table = { continents: { id: string; boxes: number[][] }[]; factors: Record<string, Record<string, number>> };

const TABLE = table as Table;
const CONTINENTS = TABLE.continents.map((c) => ({ id: c.id, boxes: c.boxes as unknown as Box[] }));

/** The years with a row (the rest draw their image as it is). */
export const HOLOCENE_SHARE_YEARS: readonly number[] = Object.keys(TABLE.factors).map(Number).sort((a, b) => a - b);

/** Index of the first continent whose box holds the point, else -1 (as `continent_map` in the generator). */
export function continentAt(lon: number, lat: number): number {
  for (let i = 0; i < CONTINENTS.length; i++) {
    for (const [w, s, e, n] of CONTINENTS[i].boxes) {
      if (lon >= w && lon < e && lat >= s && lat < n) return i;
    }
  }
  return -1;
}

export function continentId(index: number): string | null {
  return CONTINENTS[index]?.id ?? null;
}

const maps = new Map<string, Int8Array>();

function continentMap(width: number, height: number): Int8Array {
  const key = `${width}x${height}`;
  let map = maps.get(key);
  if (!map) {
    map = new Int8Array(width * height);
    for (let row = 0; row < height; row++) {
      const lat = 90 - ((row + 0.5) * 180) / height;
      for (let col = 0; col < width; col++) map[row * width + col] = continentAt(-180 + ((col + 0.5) * 360) / width, lat);
    }
    maps.set(key, map);
  }
  return map;
}

/** One multiplier per cell of a `width` × `height` population image for `year`, or null when the year has no row or the image
 * is not a whole-world grid (720 × 360 or finer, 2:1). */
export function shareFactors(year: number, width: number, height: number): Float32Array | null {
  const row = TABLE.factors[String(year)];
  if (!row || width < 720 || width !== height * 2) return null;
  const byContinent = CONTINENTS.map((c) => row[c.id] ?? 1);
  const map = continentMap(width, height);
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = map[i] < 0 ? 1 : byContinent[map[i]];
  return out;
}
