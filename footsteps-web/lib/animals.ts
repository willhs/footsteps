// Presence is modelled; every individual, count, shape and movement is imagined.
import {
  blockKey,
  faunaCell,
  notableAnimals,
  presentAt,
  type FaunaBlock,
  type Species,
} from './fauna';
import { habitatStep } from './habitat';
import type { FoodData } from './food';
import { HYDE_MIN } from './time';
import { UnitKind } from '@/components/footsteps/layers/units';
import type { Person } from '@/components/footsteps/layers/people';

export type AnimalInstance = {
  id: string;
  position: [number, number];
  name: string;
  source: 'wild' | 'domestic';
  seed: number;
  /** Relative silhouette size, with larger species drawn larger (not literal metres). */
  size: number;
  shape: 0 | 1 | 2 | 3; // 0 quadruped, 1 elephant/mammoth, 2 camel, 3 horned ungulate
};
export type RangeData = { species: Species[]; block: FaunaBlock; key: string };
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const shapeOf = (name: string): AnimalInstance['shape'] =>
  /elephant|mammoth|mastodon/i.test(name)
    ? 1
    : /camel|llama|alpaca/i.test(name)
      ? 2
      : /cattle|bison|buffalo|goat|sheep|antelope|deer/i.test(name)
        ? 3
        : 0;
const longitudeMetresAt = (latitude: number) =>
  111320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
const DOMESTIC = /cattle|sheep|goat|horse|camel|llama|alpaca|dog/i;

/** Full domestic roster, without the hover card's four-food truncation. */
export function domesticAt(
  data: FoodData,
  lon: number,
  lat: number,
  year: number,
) {
  if (year < HYDE_MIN) return [];
  const west = Math.floor((((((lon + 180) % 360) + 360) % 360) - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  const cell = data.cells[`${south},${west}`];
  if (!cell) return [];
  let era = 0;
  while (era + 1 < data.eras.length && data.eras[era + 1] <= year) era++;
  return data.taxa
    .filter(
      (t) =>
        t.kind === 'animal' && DOMESTIC.test(t.name) && cell[t.id]?.[0] <= era,
    )
    .map((t) => t.name);
}

export function describeAnimal(a: AnimalInstance) {
  return {
    title: a.name,
    detail:
      a.source === 'wild'
        ? 'range modelled (PHYLACINE), this animal imagined'
        : 'availability modelled (food spread model), this domestic animal imagined',
  };
}

/** Stable local lattice, not a census: a few herds/singles per square kilometre, capped at 120.
 * Check each candidate's own range cell and land mask. Never invent a species when data is absent. */
export function animalsForView({
  lon,
  lat,
  year,
  range,
  food,
  people,
  land,
}: {
  lon: number;
  lat: number;
  year: number;
  range: RangeData | null;
  food: FoodData | null;
  people: readonly Person[];
  land: (lon: number, lat: number) => boolean;
}): AnimalInstance[] {
  const out: AnimalInstance[] = [];
  const near = people.filter(
    (p) =>
      Math.abs(p.position[0] - lon) < 0.035 &&
      Math.abs(p.position[1] - lat) < 0.035,
  );
  const lonM = longitudeMetresAt(lat);
  const distance = (x: number, y: number, p: Person) =>
    Math.hypot((x - p.position[0]) * lonM, (y - p.position[1]) * 111320);
  const add = (
    name: string,
    source: AnimalInstance['source'],
    x: number,
    y: number,
    seed: number,
    size: number,
    id: string,
  ) => {
    if (
      out.length >= (source === 'wild' ? 72 : 120) ||
      !land(x, y) ||
      ![-16, 16].every((a) =>
        [-16, 16].every((b) => land(x + a / lonM, y + b / 111320)),
      ) ||
      near.some((p) => distance(x, y, p) < (source === 'wild' ? 350 : 85))
    )
      return;
    out.push({
      id,
      name,
      source,
      position: [x, y],
      seed,
      size,
      shape: shapeOf(name),
    });
  };
  // Fixed geographic lattice: ~550 m in latitude, narrower east-west at higher latitudes.
  // Camera latitude must never rescale this world grid or animals jump when you pan.
  const dx = 550 / 111320,
    dy = 550 / 111320;
  const cx = Math.floor(lon / dx),
    cy = Math.floor(lat / dy);
  const tiles = Array.from({ length: 49 }, (_, i) => ({
    row: cy - 3 + Math.floor(i / 7),
    col: cx - 3 + (i % 7),
  })).sort(
    (a, b) =>
      Math.hypot(a.row - cy, a.col - cx) - Math.hypot(b.row - cy, b.col - cx),
  );
  if (range)
    for (const { row, col } of tiles) {
      const seed = hash(row * 7919 + col * 104729);
      const x = (col + 0.2 + seed * 0.6) * dx,
        y = (row + 0.2 + hash(seed * 999) * 0.6) * dy;
      const cell = faunaCell(x, y);
      if (cell === null || blockKey(cell) !== range.key) continue;
      const present = presentAt(
        range.block,
        cell,
        habitatStep(Math.round(year)),
      );
      const names = notableAnimals(range.species, present);
      const candidates = present.filter((id) =>
        names.includes(range.species[id]?.common.toLowerCase()),
      );
      if (!candidates.length) continue;
      const speciesId = candidates[Math.floor(seed * candidates.length)];
      const s = range.species[speciesId];
      if (!s) continue;
      for (let k = 0; k < (s.role === 'predator' ? 1 : 3); k++) {
        const ax =
          x + ((hash(seed * 999 + k) - 0.5) * 35) / longitudeMetresAt(y);
        const ay = y + ((hash(seed * 307 + k) - 0.5) * 35) / 111320;
        // A herd can straddle a cell boundary: recheck its species there, too.
        const own = faunaCell(ax, ay);
        if (
          own === null ||
          blockKey(own) !== range.key ||
          !presentAt(range.block, own, habitatStep(Math.round(year))).includes(
            speciesId,
          )
        )
          continue;
        add(
          s.common,
          'wild',
          ax,
          ay,
          hash(seed * 99 + k),
          Math.min(2.2, Math.max(0.65, Math.cbrt(s.kg / 250))),
          `w:${row}:${col}:${k}`,
        );
      }
    }
  // One small illustrative herd per occupied ~330 m patch, only farming/herding groups.
  const patches = new Set<string>();
  if (food)
    for (const p of near) {
      if (p.groupKind !== UnitKind.Camp && p.groupKind !== UnitKind.Village)
        continue;
      const homeLonM = longitudeMetresAt(p.position[1]);
      const key = `${Math.floor((p.position[0] * homeLonM) / 330)},${Math.floor((p.position[1] * 111320) / 330)}`;
      if (patches.has(key) || patches.size >= 12) continue;
      patches.add(key);
      const names = domesticAt(food, ...p.position, year);
      for (let n = 0; n < names.length; n++)
        for (let k = 0; k < 3; k++) {
          const seed = hash(p.gait * 999 + n * 17 + k);
          const x =
            p.position[0] +
            ((130 + seed * 80) * Math.cos(seed * 6.283)) / homeLonM;
          const y =
            p.position[1] +
            ((130 + seed * 80) * Math.sin(seed * 6.283)) / 111320;
          if (!domesticAt(food, x, y, year).includes(names[n])) continue;
          add(
            names[n],
            'domestic',
            x,
            y,
            seed,
            /dog|sheep|goat/i.test(names[n]) ? 0.65 : 1,
            `d:${key}:${n}:${k}`,
          );
        }
    }
  return out;
}
