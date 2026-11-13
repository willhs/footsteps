// Large animals per 1° cell per 1 ka step, read from the files footstep-generator/fauna/export_web.py
// writes (docs/ops/fauna.md). Pure: fetching lives in hooks/useFauna.ts. Modelled: a species is listed
// when its natural range holds the cell and no extinction has happened yet, not because anyone saw it.

export type Species = { common: string; kg: number; role: 'prey' | 'predator' | 'herd'; extinct: boolean };
export type FaunaBlock = {
  /** cell id -> [species id, first step shown, ...] */
  c: Record<string, number[]>;
  /** cell id -> steps at which the cell is land ice */
  i: Record<string, number[]>;
};

/** Degrees per block file; keep in sync with export_web.py. */
const BLOCK = 30;
/** Bump when the files are regenerated: Cloudflare caches /fauna for a day. */
const FAUNA_VERSION = 1;
export const MAX_ANIMALS = 4;

export const speciesUrl = () => `/fauna/species.json?v=${FAUNA_VERSION}`;

/** Cell id (row * 360 + col, row 0 = 90N..89N, col 0 = 180W) of the 1° cell holding lon/lat; null south of the grid. */
export function faunaCell(lon: number, lat: number): number | null {
  const row = Math.floor(90 - lat);
  const col = Math.floor((((lon + 180) % 360) + 360) % 360);
  return row < 0 || row > 179 ? null : row * 360 + col;
}

export function blockKey(cell: number): string {
  const row = Math.floor(cell / 360);
  return `${Math.floor(row / BLOCK)}_${Math.floor((cell % 360) / BLOCK)}`;
}

export const blockUrl = (key: string) => `/fauna/r_${key}.json?v=${FAUNA_VERSION}`;

/** Species ids present in a cell at a 1 ka step (0 = 1900 CE). */
export function presentAt(block: FaunaBlock, cell: number, ka: number): number[] {
  if ((block.i[cell]?.indexOf(ka) ?? -1) >= 0) return [];
  const flat = block.c[cell] ?? [];
  const ids: number[] = [];
  for (let k = 0; k < flat.length; k += 2) if (ka >= flat[k + 1]) ids.push(flat[k]);
  return ids;
}

/**
 * Up to four notable animals, biggest first: the three largest plant eaters and the largest
 * predator ("mammoth, reindeer, wolf, cave lion"-style mix), then any other large animals if
 * a group is short. Names repeat across genera, so each name is listed once.
 */
export function notableAnimals(species: Species[], ids: number[], max = MAX_ANIMALS): string[] {
  const byKg = Array.from(new Set(ids)).map((id) => species[id]).filter(Boolean).sort((a, b) => b.kg - a.kg);
  const names = new Set<string>();
  const unique = byKg.filter((s) => !names.has(s.common) && names.add(s.common));
  const predators = unique.filter((s) => s.role === 'predator').slice(0, 1);
  const rest = unique.filter((s) => predators.indexOf(s) < 0);
  const picked = [...rest.slice(0, max - predators.length), ...predators];
  for (const s of unique) if (picked.length < max && picked.indexOf(s) < 0) picked.push(s);
  return picked.sort((a, b) => b.kg - a.kg).map((s) => s.common.toLowerCase());
}
