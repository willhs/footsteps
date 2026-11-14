// "Units of life": turn per-cell head counts into the groups people lived in.
// A cell's way of life (lib/waysOfLife.ts, read from HYDE land use) picks the
// kind of group: foragers live in bands, farmers in villages, herders in
// camps, and the densest cells stay one glowing cell (towns and cities). Head
// count only sets how many. Positions inside a cell are invented but stable:
// they are seeded by the cell alone, so a band stays put as you scrub through time.
import { WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';

export const BAND_SIZE = 30; // people in a band
// Residential forager groups are roughly 15–50 people (Pearce 2014, Table 1):
// https://pmc.ncbi.nlm.nih.gov/articles/PMC4157217/
export const MIN_GROUP_PEOPLE = 15;
export const VILLAGE_SIZE = 300; // people in a village
export const CAMP_SIZE = 60; // people in a herding camp: a handful of households
const MAX_BANDS_PER_CELL = 20; // id slots 0–19
const MAX_VILLAGES_PER_CELL = 4; // id slots 20–23
const GLOW_SLOT = 24;
const MAX_CAMPS_PER_CELL = 4; // id slots 25–28

export const UnitKind = { Band: 0, Village: 1, Glow: 2, Camp: 3 } as const;
export type UnitKindValue = (typeof UnitKind)[keyof typeof UnitKind];

/** Which group a way of life lives in. */
export const KIND_OF_WAY: Record<WayOfLifeValue, UnitKindValue> = {
  [WayOfLife.Forager]: UnitKind.Band,
  [WayOfLife.Farmer]: UnitKind.Village,
  [WayOfLife.Herder]: UnitKind.Camp,
  [WayOfLife.Urban]: UnitKind.Glow,
};
/** The way of life a kind of group stands for (the inverse of KIND_OF_WAY). */
export const WAY_OF_KIND: Record<UnitKindValue, WayOfLifeValue> = {
  [UnitKind.Band]: WayOfLife.Forager,
  [UnitKind.Village]: WayOfLife.Farmer,
  [UnitKind.Camp]: WayOfLife.Herder,
  [UnitKind.Glow]: WayOfLife.Urban,
};

const SLOT_BASE: Record<UnitKindValue, number> = {
  [UnitKind.Band]: 0,
  [UnitKind.Village]: 20,
  [UnitKind.Glow]: GLOW_SLOT,
  [UnitKind.Camp]: 25,
};

export type Units = {
  length: number;
  positions: Float32Array; // lon, lat
  people: Float32Array; // people this unit stands for
  kind: Uint8Array; // UnitKind
  ids: Uint32Array; // cell * 32 + kind slot + ordinal; sorted for decoded grids
  counts: [bands: number, villages: number, glows: number, camps: number];
  /** Experiment only: relative residential movement; zero is semi-settled. */
  mobility?: Float32Array;
};

// Small deterministic PRNG (mulberry32) so placement is stable per cell.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groupSize(kind: UnitKindValue) {
  return kind === UnitKind.Village ? VILLAGE_SIZE : kind === UnitKind.Camp ? CAMP_SIZE : BAND_SIZE;
}

/** How many groups a cell of `people` holds, given the kind of group. */
function groupCount(kind: UnitKindValue, people: number, r: number) {
  if (kind === UnitKind.Glow) return 1;
  // Too few for a group of its own: one band's range covers many cells, so a sparse
  // cell holds a whole group with probability people / group size (expected people
  // stay right, and the seed is per cell, so it stays put while scrubbing).
  if (people < MIN_GROUP_PEOPLE) return r < people / groupSize(kind) ? 1 : 0;
  if (kind === UnitKind.Band) {
    const x = people / BAND_SIZE; // stochastic rounding: expected count is exact
    return Math.min(
      MAX_BANDS_PER_CELL,
      Math.floor(people / MIN_GROUP_PEOPLE),
      Math.max(1, Math.floor(x) + (r < x - Math.floor(x) ? 1 : 0)),
    );
  }
  const size = kind === UnitKind.Village ? VILLAGE_SIZE : CAMP_SIZE;
  const most = kind === UnitKind.Village ? MAX_VILLAGES_PER_CELL : MAX_CAMPS_PER_CELL;
  return Math.min(most, Math.max(1, Math.round(people / size)));
}

/** `ways[i]` is the WayOfLife of cell i (gridData.ts classes it from land use). */
export function buildUnits(
  cellIds: Uint32Array,
  positions: Float32Array,
  people: Float32Array,
  cellDeg: number,
  ways: Uint8Array,
): Units {
  // Pass 1: decide how many units each cell gets.
  const n = people.length;
  const per = new Uint16Array(n);
  const kinds = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const kind = KIND_OF_WAY[ways[i] as WayOfLifeValue];
    const count = groupCount(kind, people[i], rng(cellIds[i] * 2654435761)());
    per[i] = count;
    kinds[i] = kind;
    total += count;
  }

  // Pass 2: place them.
  const out: Units = {
    length: total,
    positions: new Float32Array(total * 2),
    people: new Float32Array(total),
    kind: new Uint8Array(total),
    ids: new Uint32Array(total),
    counts: [0, 0, 0, 0],
  };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const count = per[i];
    if (!count) continue;
    const lon = positions[i * 2];
    const lat = positions[i * 2 + 1];
    const k = kinds[i] as UnitKindValue;
    const rand = rng(cellIds[i] * 2246822519 + 7);
    // A sparse cell's one group is a whole group, not the cell's few people.
    const share = people[i] < MIN_GROUP_PEOPLE ? groupSize(k) : people[i] / count;
    for (let c = 0; c < count; c++) {
      const jitter = k === UnitKind.Glow ? 0 : 0.9;
      out.positions[j * 2] = lon + (rand() - 0.5) * cellDeg * jitter;
      out.positions[j * 2 + 1] = lat + (rand() - 0.5) * cellDeg * jitter;
      out.people[j] = share;
      out.kind[j] = k;
      out.ids[j] = cellIds[i] * 32 + SLOT_BASE[k] + c;
      out.counts[k]++;
      j++;
    }
  }
  return out;
}
