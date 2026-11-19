// The biggest settlement "around here" (`?settlements=1`, hover card only; never map geometry). Research 0012
// "3. Farmer settlement hierarchy", option B: a rank-size tail with one stated exponent per region.
//
// The shape is supported (Johnson 1980: pre-industrial rank-size curves are usually convex, flatter at the top than Zipf's
// z = 1, more so where places are loosely integrated; Drennan & Peterson 2004). The exponent is NOT: research 0012 found no
// pre-industrial value, and Europe's cities only followed Zipf after about 1500. So the exponents below are assumptions,
// stated on the card as such: 0.6 for scattered farmsteads, 0.7 for hamlet country, 0.8 for villages and towns, each below 1 and
// ordered by how integrated the settlement system is likely to be. A region's exponent is the mix of those by its analogs'
// EA030 shares (lib/settlements.ts `Layout`), rounded to 0.05.
//
// The model: the block of 2^6 cells (5.3°, about 590 km, the largest regional-group block, so it nests with them and does not
// depend on the year) holds P farming and town people in settlements of mean size m (the region's analog mix), so n = P / m of
// them. Settlement r has size S1 / r^q and the sizes sum to P, so S1 = P / H(n, q). The biggest is then at least the largest
// named city (Reba et al. 2016: a modelled estimate) and at least the largest HYDE town cell in the block (drawn as one glow),
// so the card never calls a place smaller than the one under the cursor.
import type { GridData } from '@/components/footsteps/hooks/gridData';
import { WayOfLife } from './waysOfLife';
import { blockOf, forEachCellInBlock, REGION_MAX_LEVEL } from './regionalGroup';
import { cityPopulation, layoutOfPattern, profileAt, type Layout, type SettlementCatalog, type SettlementProfile } from './settlements';

/** Assumed rank-size exponents by settlement layout. Imagined: see the top of the file. */
export const RANK_SIZE_EXPONENT: Record<Layout, number> = { dispersed: 0.6, hamlet: 0.7, nucleated: 0.8 };

/** The region's exponent: its analogs' layouts, weighted, rounded to 0.05. */
export function regionExponent(profile: SettlementProfile): number {
  let weight = 0;
  let sum = 0;
  for (const c of profile.components) {
    weight += c.weight;
    sum += c.weight * RANK_SIZE_EXPONENT[layoutOfPattern(c.pattern)];
  }
  return weight > 0 ? Math.round((sum / weight) * 20) / 20 : RANK_SIZE_EXPONENT.nucleated;
}

/** Generalised harmonic number H(n, q) = sum of r^-q for r = 1..n, for real n >= 1 (Euler-Maclaurin, first three terms). Exact at n = 1. */
export function harmonic(n: number, q: number): number {
  if (!(n > 1)) return 1;
  const integral = Math.abs(q - 1) < 1e-9 ? Math.log(n) : (n ** (1 - q) - 1) / (1 - q);
  return integral + (1 + n ** -q) / 2 + (q * (1 - n ** (-q - 1))) / 12;
}

/** Size of the biggest of n settlements totalling `people` under exponent q. Never more than `people`, never less than their mean. */
export function largestOf(people: number, n: number, q: number): number {
  return Math.min(people, people / harmonic(n, q));
}

export type LargestSettlement = {
  /** People in the biggest settlement. */
  people: number;
  /** The exponent used (the model's tail), even when a named city is the answer. */
  exponent: number;
  /** Set when a named city is the biggest (its modelled population is the answer, not the tail). */
  city: string | null;
  /** Edge of the block it is the biggest of, km (north-south). */
  blockKm: number;
};

const KM_PER_DEG = 111.2;

/** The biggest settlement in the block around (lon, lat), or null where the model has nothing to say: no one in the cell, a year
 * before farming is mapped, or fewer farming people around than one village of the region's analogs. */
export function largestSettlementAt(
  grid: GridData, catalog: SettlementCatalog, lon: number, lat: number, year: number,
): LargestSettlement | null {
  if (year < -10000 || !Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const width = Math.round(360 / grid.cellDeg);
  const height = Math.round(180 / grid.cellDeg);
  const col = Math.floor((((lon + 180) % 360 + 360) % 360) / grid.cellDeg);
  const row = Math.min(height - 1, Math.floor((90 - lat) / grid.cellDeg));
  const block = blockOf(row, col, REGION_MAX_LEVEL, grid.cellDeg);
  let settled = 0;
  let town = 0;
  let here = 0;
  forEachCellInBlock(grid, block, (i) => {
    if (grid.cellIds[i] === row * width + col) here = grid.people[i];
    if (grid.ways[i] === WayOfLife.Farmer || grid.ways[i] === WayOfLife.Urban) settled += grid.people[i];
    if (grid.ways[i] === WayOfLife.Urban) town = Math.max(town, grid.people[i]);
  });
  if (!(here > 0)) return null;
  const profile = profileAt(catalog, (col + 0.5) * grid.cellDeg - 180, 90 - (row + 0.5) * grid.cellDeg, WayOfLife.Farmer, year, null);
  const weight = profile.components.reduce((s, c) => s + c.weight, 0);
  if (!(weight > 0)) return null;
  const mean = profile.components.reduce((s, c) => s + c.size * c.weight, 0) / weight;
  if (!(settled >= mean)) return null;
  const exponent = regionExponent(profile);
  const model = Math.max(largestOf(settled, settled / mean, exponent), town);
  let city: { name: string; people: number } | null = null;
  for (const c of catalog.cities) {
    if (c.lon < block.west || c.lon >= block.east || c.lat < block.south || c.lat >= block.north) continue;
    const people = cityPopulation(c, year);
    if (people > (city?.people ?? 0)) city = { name: c.name, people };
  }
  const named = city !== null && city.people >= model;
  return {
    people: named ? city!.people : model,
    exponent,
    city: named ? city!.name : null,
    blockKm: Math.round((block.north - block.south) * KM_PER_DEG / 10) * 10,
  };
}
