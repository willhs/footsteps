// Where inside a cell a group sits (`?settlements=1` only). Every cell has a fixed list of candidate spots; the list is
// ranked by flat ground x nearness to fresh water x nearness to the year's coast, and sea (and lakes) are left out.
// Group k takes spot k, so the groups of a cell never swap places, whatever the group count is, and a spot only changes
// when the cell's coast does. The rule is modelled; the exact spot is imagined (docs/ops/site-terrain.md).
//
// The worker asks for every populated cell of a year (1.3 million in 1900 CE), so a cell's list lives in packed typed arrays
// (about 25 bytes a cell), not in objects, and `spotsFor` hands back one reused scratch object.
import terrainMeta from '../../../public/sites/site_terrain.json';
import { NO_EPOCH, NO_EPOCHS, type Epochs, type LakeMask, type PastWaterLayers, type WaterPatch } from '@/lib/pastWater';
import type { IceLayers } from '@/lib/iceSheets';

/** Candidate spots per cell: a jittered 4 × 4 grid, so spots are spread and no two touch. A cell with more groups than dry spots stacks them. */
export const CANDIDATES = 16;
const SIDE = 4;
const MARGIN = 0.5; // the strata cover the whole cell (offsets are cell widths from the centre)
const STRATUM_JITTER = 0.8; // a spot lies within the middle 80 % of its stratum, so two spots of a cell are never closer than 0.05
/** The score is multiplied by 1 ± this, a stable random factor per (cell, spot). The baked water and slope layers are coarser than a cell, so on
 * flat inland ground scores tie or differ only by an interpolation slope; without the factor the best spot is the corner that slope points to,
 * the same relative place in every cell, and a map of one group a cell reads as rows. */
export const SCORE_NOISE = 0.35;
/** A point is sea (or lake) when at least this share of the area around it is. */
const WET_EDGE = 0.5;
/** A spot is surely dry when less than this share of the area around it is sea or lake. Between the two it may be on the shore: the
 * coast is only known to a 2.5′ pixel (about 4.6 km), so a spot a third wet is wet about a third of the time. Spots that are
 * surely dry rank first; only a cell with none uses the doubtful ones, driest first. */
const SURE_DRY = 0.05;
const SLOPE_SCALE_DEG = 3; // flat score = 1 / (1 + (slope / this)²): half as good at 3°
const WATER_DECAY_M = 3000; // water score = 1 / (1 + distance / this). Invented; the layer is good to about half a cell (4.6 km)
const COAST_BONUS = 0.6; // coast score = 1 + this / (1 + distance to sea / COAST_DECAY_M): up to 1.6 × at the shore
const COAST_DECAY_M = 5000;
const PIXEL_M = 4631; // metres in a 2.5′ pixel north-south
const WATER_MAX_M = 2_000_000;
const SEA_LEVELS: number = terrainMeta.sea_levels; // sea share is stored in 4 bits

/** The baked terrain (footstep-generator/site_terrain.py). `depth`: metres below today's sea level of a pixel's sea (0 = all land).
 * `packed`: sea share today (bits 4-7, 0..15) | lake (bit 3) | slope class (bits 0-2). */
export type SiteTerrain = { width: number; height: number; depth: Uint8Array; packed: Uint8Array };
/** The baked distance to fresh water (footstep-generator/water_distance.py): code → metres = 2,000 km × (code / 255)². */
export type SiteWater = { width: number; height: number; code: Uint8Array };
/** `ice`, when given (`?ice=1`): the ice patches (lib/iceSheets.ts), ids in the same `epochs` list; ice is never usable ground, like a modelled
 * lake, and adds no fresh water. An ice patch and a past-water epoch can share a cell (proglacial lakes), so every matching one is live at once.
 * `pastWater`, when given (`?pastwater=1`): every past-water epoch (lib/pastWater.ts). A call that names the year's active epochs then sees, in a cell
 * inside an active epoch's region (its patches plus a small reach), that epoch's water as wet and its freshwater distances instead of the static
 * image's; everywhere else the ranker is exactly what it was without it. */
export type SiteLayers = { terrain: SiteTerrain; water: SiteWater; pastWater?: PastWaterLayers | null; ice?: IceLayers | null };

/** One cell's candidate spots, best first, as offsets from the cell centre in cell widths (east, north). The first `dry` are the
 * ones groups may use: surely dry land at the year's sea level, or, when none is, the doubtful shore spots (under half sea or
 * lake) driest first. The rest are sea or lake and are never used. When nothing is usable, `dry` is 0 and spot 0 is the least
 * wet one (a data conflict the caller can count). `unresolved`: the call named a scenario epoch that put lake over the cell and nothing
 * in it is usable; the caller must not draw a group there (spot 0 is still the least wet one). The arrays are reused by the next call. */
export type CellSpots = { x: Float64Array; y: Float64Array; dry: number; unresolved?: boolean; cause?: number };
/** `CellSpots.cause` bits: the kinds of exclusion in force over the cell (an unresolved cell is blamed on each one). */
export const CAUSE_WATER = 1;
export const CAUSE_ICE = 2;

export type SiteRanker = {
  /** The cell's first `count` spots at a sea level (metres relative to today, ≤ 0) and the year's active past-water `epochs` (lib/pastWater.ts
   * `pastWaterEpochs`; empty = none). Cached by cell id; the cached list is reused until the coast around the cell, or the epoch in force in it, changes. */
  spotsFor(cellId: number, seaLevelM: number, count?: number, epochs?: Epochs): CellSpots;
  /** Whether a point in the cell (offsets as in CellSpots) is sea or lake at that sea level and those epochs. */
  isWet(cellId: number, x: number, y: number, seaLevelM: number, epochs?: Epochs): boolean;
  /** Whether some past-water epoch or ice patch can change this cell: it lies inside (or just beside) its patches. False for every cell without them. */
  inScenario(cellId: number): boolean;
  /** How many cells have a cached list. */
  readonly size: number;
};

const slopeDegrees = (() => {
  const upper: number[] = terrainMeta.slope_upper_deg;
  return [...upper, upper[upper.length - 1] * 1.5].map((hi, c) => (hi + (c ? upper[c - 1] : 0)) / 2);
})();
const waterMetres = Float32Array.from({ length: 256 }, (_, c) => WATER_MAX_M * (c / 255) ** 2);

/** Candidate k's offset (cell widths from the centre) into ox[k], oy[k]: its stratum of a 4 × 4 grid, jittered by one mix of the cell
 * id and k. Returns the candidate's score factor in [1 - SCORE_NOISE, 1 + SCORE_NOISE) from the same mix. A pure function of the cell and k,
 * so any candidate can be had without the others. */
function place(cellId: number, k: number, ox: Float64Array, oy: Float64Array): number {
  let z = (Math.imul(cellId ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(k + 1, 0x27d4eb2f)) | 0;
  z = Math.imul(z ^ (z >>> 15), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  const lo = (1 - STRATUM_JITTER) / 2;
  ox[k] = (((k & 3) + lo + STRATUM_JITTER * ((z & 0xff) / 256)) / SIDE - 0.5) * 2 * MARGIN;
  oy[k] = (((k >> 2) + lo + STRATUM_JITTER * (((z >>> 8) & 0xff) / 256)) / SIDE - 0.5) * 2 * MARGIN;
  return 1 + SCORE_NOISE * ((((z >>> 16) & 0xff) / 128) - 1);
}

/** The fixed offsets of a cell's candidates, by cell id alone. */
export function candidateOffsets(cellId: number) {
  const x = new Float64Array(CANDIDATES);
  const y = new Float64Array(CANDIDATES);
  for (let k = 0; k < CANDIDATES; k++) place(cellId, k, x, y);
  return { x, y };
}

const INLAND = 128; // flag in a cache entry's high signature byte
const WINDOW = 6; // terrain pixels around a cell: its own 2 × 2 and a ring of 2 (a spot's bilinear reach is one pixel)

export function createSiteRanker({ terrain, water, pastWater, ice }: SiteLayers, cellsAcross: number): SiteRanker {
  const { width: tw, height: th, depth, packed } = terrain;
  const tScale = tw / cellsAcross; // terrain pixels across one cell (2)
  const wScale = water.width / cellsAcross; // water pixels across one cell (1)

  // Past water: per epoch, the 5′ cells it can change (its patches, plus the reach of a cell's spots and window), and the epoch in force for the current call.
  const reach = 3; // cells: a spot's offset, its bilinear pixel and the ranking window are all within 2
  // An exclusion: a past-water epoch or an ice patch. `mask` is read when it goes live (an ice patch's pixels load when its epoch is first needed).
  type Exclusion = { id: number; kind: number; mask: () => LakeMask | undefined; water: WaterPatch | null; col0: number; row0: number; col1: number; row1: number };
  const regionOf = (id: number, boxes: number[][], mask: Exclusion['mask'], waterPatch: WaterPatch | null, kind = CAUSE_WATER): Exclusion => ({
    id, kind, mask, water: waterPatch,
    col0: Math.min(...boxes.map((b) => b[0])) - reach, row0: Math.min(...boxes.map((b) => b[1])) - reach,
    col1: Math.max(...boxes.map((b) => b[2])) + reach, row1: Math.max(...boxes.map((b) => b[3])) + reach,
  });
  const pixelBox = (p: { x0: number; y0: number; width: number; height: number }) => [Math.floor(p.x0 / tScale), Math.floor(p.y0 / tScale), Math.ceil((p.x0 + p.width) / tScale), Math.ceil((p.y0 + p.height) / tScale)];
  const regions: Exclusion[] = [
    ...(pastWater?.epochs ?? []).map((e) => {
      const boxes = [pixelBox(e.lake)];
      if (e.water) boxes.push([Math.floor(e.water.x0 / wScale), Math.floor(e.water.y0 / wScale), Math.ceil((e.water.x0 + e.water.width) / wScale), Math.ceil((e.water.y0 + e.water.height) / wScale)]);
      return regionOf(e.id, boxes, () => e.lake, e.water);
    }),
    ...(ice?.patches ?? []).map((p) => regionOf(p.id, [pixelBox(p)], () => ice!.masks.get(p.id), null, CAUSE_ICE)),
  ];
  const inRegion = (r: Exclusion, row: number, col: number) => row >= r.row0 && row < r.row1 && col >= r.col0 && col < r.col1;
  /** The exclusions in force for the current call (none outside every active one's region, so a cell there is ranked, and cached, exactly as
   * without the flags) and `live`, their ids packed a byte each (ids < 256, at most 4 at once): the cache key. Past-water epochs active together
   * never share a cell (lib/pastWater.test.ts); an ice patch can share one with a past-water epoch, and wet is then either. */
  const MAX_LIVE = 4;
  let live = NO_EPOCH;
  const liveMasks: LakeMask[] = [];
  let liveWater: WaterPatch | null = null;
  let liveKinds = 0;
  // The units builder asks about one cell many times in a row (its spots, then each hamlet house): the last answer is kept.
  let lastRow = -1;
  let lastCol = -1;
  let lastEpochs: Epochs | null = null;
  // The exclusions a call's `epochs` name, in `regions` order: filtered once per epochs list, not once per cell.
  let activeFor: Epochs | null = null;
  let active: Exclusion[] = [];
  const setLive = (row: number, col: number, epochs: Epochs) => {
    if (row === lastRow && col === lastCol && epochs === lastEpochs) return;
    lastRow = row;
    lastCol = col;
    lastEpochs = epochs;
    live = NO_EPOCH;
    liveKinds = 0;
    liveMasks.length = 0;
    liveWater = null;
    if (!epochs.length) return;
    if (epochs !== activeFor) {
      activeFor = epochs;
      active = regions.filter((r) => epochs.includes(r.id));
    }
    let n = 0;
    for (const r of active) {
      if (n < MAX_LIVE && inRegion(r, row, col)) {
        live = live * 256 + r.id;
        liveKinds |= r.kind;
        n++;
        const m = r.mask();
        if (m) liveMasks.push(m);
        if (!liveWater && r.water) liveWater = r.water;
      }
    }
  };

  // Cache: slot[cellId] = entry + 1. An entry is a ranked order of CANDIDATES bytes, the sea state it was ranked for (36 bits), the epoch it
  // was ranked for (a cell's list depends on it only inside the region) and `dry`.
  const slot = new Int32Array((cellsAcross * cellsAcross) / 2);
  let capacity = 1024;
  let entries = 0;
  let orders = new Uint8Array(capacity * CANDIDATES);
  let sigLo = new Uint32Array(capacity);
  let sigHi = new Uint8Array(capacity);
  let dries = new Uint8Array(capacity);
  let cachedEpoch = new Uint32Array(capacity);
  const grow = () => {
    capacity *= 2;
    const o = new Uint8Array(capacity * CANDIDATES); o.set(orders); orders = o;
    const lo = new Uint32Array(capacity); lo.set(sigLo); sigLo = lo;
    const hi = new Uint8Array(capacity); hi.set(sigHi); sigHi = hi;
    const d = new Uint8Array(capacity); d.set(dries); dries = d;
    const ep = new Uint32Array(capacity); ep.set(cachedEpoch); cachedEpoch = ep;
  };

  const spots: CellSpots = { x: new Float64Array(CANDIDATES), y: new Float64Array(CANDIDATES), dry: 0, unresolved: false };
  const seaPixels = new Float32Array(WINDOW * WINDOW * 2);
  const ox = new Float64Array(CANDIDATES);
  const oy = new Float64Array(CANDIDATES);
  const score = new Float64Array(CANDIDATES);
  const factor = new Float64Array(CANDIDATES);
  const wetness = new Float64Array(CANDIDATES);
  const ranked = new Uint8Array(CANDIDATES);
  let sigA = 0;
  let sigB = 0;
  let anySea = false; // any pixel of the window has sea (at any sea level)
  let seaCount = 0;

  const shareOf = Float64Array.from({ length: 16 }, (_, n) => n / SEA_LEVELS);
  /** Wet share of one terrain pixel at `drop` metres below today's sea: its sea share if its sea is still under water, else 0. */
  const wetShare = (i: number, drop: number) => (depth[i] > drop ? shareOf[packed[i] >> 4] : 0);
  const wrapX = (x: number, n: number) => (x < 0 ? x + n : x >= n ? x - n : x);
  const clampY = (y: number, n: number) => (y < 0 ? 0 : y >= n ? n - 1 : y);

  /** 1 when a terrain pixel is in the modelled water or ice of an exclusion in force, else 0. */
  const scenarioAt = (x: number, y: number) => {
    for (let i = 0; i < liveMasks.length; i++) {
      const lake = liveMasks[i];
      const c = x - lake.x0;
      const r = y - lake.y0;
      if (c >= 0 && r >= 0 && c < lake.width && r < lake.height && lake.wet[r * lake.width + c]) return 1;
    }
    return 0;
  };

  /** Bilinear wet share (sea, lake) and slope in degrees around a point; results land in `at`. */
  const at = { sea: 0, lake: 0, scenario: 0, slope: 0 };
  function sample(row: number, col: number, u: number, v: number, drop: number) {
    const px = (col + 0.5 + u) * tScale - 0.5;
    const py = (row + 0.5 - v) * tScale - 0.5;
    const fx0 = Math.floor(px);
    const fy0 = Math.floor(py);
    const fx = px - fx0;
    const fy = py - fy0;
    const xa = wrapX(fx0 | 0, tw);
    const xb = wrapX(xa + 1, tw);
    const rowA = clampY(fy0 | 0, th);
    const rowB = clampY((fy0 | 0) + 1, th);
    const ya = rowA * tw;
    const yb = rowB * tw;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    const i00 = ya + xa;
    const i10 = ya + xb;
    const i01 = yb + xa;
    const i11 = yb + xb;
    const p00 = packed[i00];
    const p10 = packed[i10];
    const p01 = packed[i01];
    const p11 = packed[i11];
    at.sea = w00 * wetShare(i00, drop) + w10 * wetShare(i10, drop) + w01 * wetShare(i01, drop) + w11 * wetShare(i11, drop);
    // `scenario`: the share of the modelled lake alone (0 unless an epoch is in force); `lake` adds today's lakes to it.
    const s00 = scenarioAt(xa, rowA);
    const s10 = scenarioAt(xb, rowA);
    const s01 = scenarioAt(xa, rowB);
    const s11 = scenarioAt(xb, rowB);
    at.scenario = w00 * s00 + w10 * s10 + w01 * s01 + w11 * s11;
    at.lake = (p00 & 8 || s00 ? w00 : 0) + (p10 & 8 || s10 ? w10 : 0) + (p01 & 8 || s01 ? w01 : 0) + (p11 & 8 || s11 ? w11 : 0);
    at.slope = w00 * slopeDegrees[p00 & 7] + w10 * slopeDegrees[p10 & 7] + w01 * slopeDegrees[p01 & 7] + w11 * slopeDegrees[p11 & 7];
  }

  /** The distance code of one 5′ cell: the epoch's patch where it covers the cell, else the static image (the two agree at the patch's edge). */
  const codeAt = (x: number, y: number) => {
    const patch = liveWater;
    if (patch) {
      const c = x - patch.x0;
      const r = y - patch.y0;
      if (c >= 0 && r >= 0 && c < patch.width && r < patch.height) return patch.code[r * patch.width + c];
    }
    return water.code[y * water.width + x];
  };

  /** Metres to fresh water at a point, between the four 5′ cell centres around it. */
  function waterAt(row: number, col: number, u: number, v: number) {
    const px = (col + 0.5 + u) * wScale - 0.5;
    const py = (row + 0.5 - v) * wScale - 0.5;
    const fx0 = Math.floor(px);
    const fy0 = Math.floor(py);
    const fx = px - fx0;
    const fy = py - fy0;
    const ww = water.width;
    const xa = wrapX(fx0 | 0, ww);
    const xb = wrapX(xa + 1, ww);
    const ya = clampY(fy0 | 0, water.height);
    const yb = clampY((fy0 | 0) + 1, water.height);
    return (1 - fx) * (1 - fy) * waterMetres[codeAt(xa, ya)] + fx * (1 - fy) * waterMetres[codeAt(xb, ya)]
      + (1 - fx) * fy * waterMetres[codeAt(xa, yb)] + fx * fy * waterMetres[codeAt(xb, yb)];
  }

  /** Which of the WINDOW × WINDOW terrain pixels around the cell have their sea under water at `drop`: 36 bits, in sigA (32) and sigB (4). */
  function readWindow(row: number, col: number, drop: number) {
    const x0 = ((col * tScale) | 0) - 2;
    const y0 = ((row * tScale) | 0) - 2;
    let lo = 0;
    let hi = 0;
    let n = 0;
    let any = 0;
    for (let j = 0; j < WINDOW; j++) {
      const iy = clampY(y0 + j, th);
      for (let i = 0; i < WINDOW; i++) {
        const d = depth[iy * tw + wrapX(x0 + i, tw)];
        any |= d;
        const bit = d > drop ? 1 : 0;
        if (n < 32) lo |= bit << n; else hi |= bit << (n - 32);
        n++;
      }
    }
    sigA = lo >>> 0;
    sigB = hi;
    anySea = any > 0;
    return { x0, y0 };
  }

  /** Rank the cell's candidates into `into[base ..]`; returns how many are dry. */
  function rank(cellId: number, row: number, col: number, drop: number, x0: number, y0: number, into: Uint8Array, base: number): number {
    // sea pixel centres in the window (pixels at least half sea), for the nearness-to-coast term
    seaCount = 0;
    for (let j = 0; j < WINDOW; j++) {
      const iy = clampY(y0 + j, th);
      for (let i = 0; i < WINDOW; i++) {
        if (wetShare(iy * tw + wrapX(x0 + i, tw), drop) >= WET_EDGE) {
          seaPixels[seaCount * 2] = x0 + i;
          seaPixels[seaCount * 2 + 1] = y0 + j;
          seaCount++;
        }
      }
    }
    const cos = Math.cos((90 - (row + 0.5) * (360 / cellsAcross)) * Math.PI / 180);
    for (let k = 0; k < CANDIDATES; k++) factor[k] = place(cellId, k, ox, oy);
    let dry = 0;
    let doubtful = 0;
    for (let k = 0; k < CANDIDATES; k++) {
      const u = ox[k];
      const v = oy[k];
      sample(row, col, u, v, drop);
      const wet = at.sea > at.lake ? at.sea : at.lake;
      if (wet >= SURE_DRY) {
        score[k] = -1;
        // A spot the modelled lake touches at all is never a doubtful shore spot (the coast's 4.6 km doubt does not apply to a lake drawn on the
        // same grid): it ranks after every doubtful one and is not counted, so a group is never placed in the pixel of a lake.
        const touched = at.scenario > 0;
        wetness[k] = touched ? 1 + wet : wet;
        if (wet < WET_EDGE && !touched) doubtful++;
        continue;
      }
      dry++;
      const flat = 1 / (1 + (at.slope / SLOPE_SCALE_DEG) ** 2);
      const near = 1 / (1 + waterAt(row, col, u, v) / WATER_DECAY_M);
      let coast = 1;
      if (seaCount) {
        const px = (col + 0.5 + u) * tScale - 0.5;
        const py = (row + 0.5 - v) * tScale - 0.5;
        let best = Infinity;
        for (let s = 0; s < seaCount; s++) {
          const dx = (seaPixels[s * 2] - px) * cos;
          const dy = seaPixels[s * 2 + 1] - py;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
        coast = 1 + COAST_BONUS / (1 + (Math.sqrt(best) * PIXEL_M) / COAST_DECAY_M);
      }
      score[k] = flat * near * coast * factor[k];
    }
    // insertion sort of the candidate indices: dry by score (best first), then wet by wetness (driest first); ties keep index order
    for (let k = 0; k < CANDIDATES; k++) {
      let p = k;
      while (p > 0) {
        const a = ranked[p - 1];
        const better = score[k] > 0 ? score[a] < 0 || score[k] > score[a] : score[a] < 0 && wetness[k] < wetness[a];
        if (!better) break;
        ranked[p] = a;
        p--;
      }
      ranked[p] = k;
    }
    for (let s = 0; s < CANDIDATES; s++) into[base + s] = ranked[s];
    return dry || doubtful;
  }

  return {
    spotsFor(cellId, seaLevelM, count = CANDIDATES, epochs = NO_EPOCHS) {
      const drop = Math.max(0, -seaLevelM);
      const row = Math.floor(cellId / cellsAcross);
      const col = cellId - row * cellsAcross;
      setLive(row, col, epochs);
      let e = slot[cellId] - 1;
      // A cell with no sea anywhere around it (bit 7 of sigHi) has one list at every sea level: nothing to re-read, unless its epoch changed.
      if (e < 0 || cachedEpoch[e] !== live || !(sigHi[e] & INLAND)) {
        const { x0, y0 } = readWindow(row, col, drop);
        if (e < 0 || cachedEpoch[e] !== live || sigLo[e] !== sigA || (sigHi[e] & ~INLAND) !== sigB) {
          if (e < 0) {
            if (entries === capacity) grow();
            e = entries++;
            slot[cellId] = e + 1;
          }
          dries[e] = rank(cellId, row, col, drop, x0, y0, orders, e * CANDIDATES);
          cachedEpoch[e] = live;
          sigLo[e] = sigA;
          sigHi[e] = sigB | (anySea ? 0 : INLAND);
        }
      }
      const n = Math.min(count, CANDIDATES);
      for (let s = 0; s < n; s++) {
        const k = orders[e * CANDIDATES + s];
        place(cellId, k, ox, oy);
        spots.x[s] = ox[k];
        spots.y[s] = oy[k];
      }
      spots.dry = dries[e];
      spots.unresolved = live !== NO_EPOCH && dries[e] === 0;
      spots.cause = liveKinds;
      return spots;
    },
    isWet(cellId, x, y, seaLevelM, epochs = NO_EPOCHS) {
      const row = Math.floor(cellId / cellsAcross);
      const col = cellId - row * cellsAcross;
      setLive(row, col, epochs);
      sample(row, col, x, y, Math.max(0, -seaLevelM));
      return Math.max(at.sea, at.lake) >= WET_EDGE;
    },
    inScenario(cellId) {
      const row = Math.floor(cellId / cellsAcross);
      const col = cellId - row * cellsAcross;
      return regions.some((r) => inRegion(r, row, col));
    },
    get size() {
      return entries;
    },
  };
}
