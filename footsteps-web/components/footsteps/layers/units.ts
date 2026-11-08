// "Units of life": turn per-cell head counts into the groups people lived in,
// chosen per cell by density, not by year. Sparse cells become forager-scale
// bands, middling cells become villages, dense cells stay one glowing cell
// (towns and cities). Positions inside a cell are invented but stable: they
// are seeded by the cell alone, so a band stays put as you scrub through time.

export const BAND_SIZE = 30; // people in a band
export const VILLAGE_SIZE = 300; // people in a village
export const BAND_MAX_CELL = 600; // cells below this many people hold bands
export const GLOW_MIN_CELL = 40_000; // cells above this are drawn as one glow
const MAX_VILLAGES_PER_CELL = 4;

export const UnitKind = { Band: 0, Village: 1, Glow: 2 } as const;
type UnitKindValue = (typeof UnitKind)[keyof typeof UnitKind];

export type Units = {
  length: number;
  positions: Float32Array; // lon, lat
  people: Float32Array; // people this unit stands for
  kind: Uint8Array;
  ids: Uint32Array; // cell * 32 + kind slot + ordinal; sorted for decoded grids
  counts: [bands: number, villages: number, glows: number];
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

export function buildUnits(
  cellIds: Uint32Array,
  positions: Float32Array,
  people: Float32Array,
  cellDeg: number,
): Units {
  // Pass 1: decide how many units each cell gets.
  const n = people.length;
  const per = new Uint16Array(n);
  const kinds = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = people[i];
    const r = rng(cellIds[i] * 2654435761)();
    let k: UnitKindValue;
    let count: number;
    if (p >= GLOW_MIN_CELL) {
      k = UnitKind.Glow;
      count = 1;
    } else if (p < BAND_MAX_CELL) {
      k = UnitKind.Band;
      const x = p / BAND_SIZE; // stochastic rounding: expected count is exact
      count = Math.floor(x) + (r < x - Math.floor(x) ? 1 : 0);
    } else {
      k = UnitKind.Village;
      count = Math.min(
        MAX_VILLAGES_PER_CELL,
        Math.max(1, Math.round(p / VILLAGE_SIZE)),
      );
    }
    per[i] = count;
    kinds[i] = k;
    total += count;
  }

  // Pass 2: place them.
  const out: Units = {
    length: total,
    positions: new Float32Array(total * 2),
    people: new Float32Array(total),
    kind: new Uint8Array(total),
    ids: new Uint32Array(total),
    counts: [0, 0, 0],
  };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const count = per[i];
    if (!count) continue;
    const lon = positions[i * 2];
    const lat = positions[i * 2 + 1];
    const k = kinds[i];
    const rand = rng(cellIds[i] * 2246822519 + 7);
    const share = people[i] / count;
    for (let c = 0; c < count; c++) {
      const jitter = k === UnitKind.Glow ? 0 : 0.9;
      out.positions[j * 2] = lon + (rand() - 0.5) * cellDeg * jitter;
      out.positions[j * 2 + 1] = lat + (rand() - 0.5) * cellDeg * jitter;
      out.people[j] = share;
      out.kind[j] = k;
      out.ids[j] =
        cellIds[i] * 32 +
        (k === UnitKind.Band ? 0 : k === UnitKind.Village ? 20 : 24) +
        c;
      out.counts[k]++;
      j++;
    }
  }
  return out;
}
