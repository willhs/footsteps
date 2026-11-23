// What the 3D person (`?avatar=3d`, docs/ops/avatar.md) holds and does: a tool by role, era-gated, and a work loop that
// alternates with the idle. With `?routine=1` the person's current state (lib/routine.ts) chooses instead where it maps
// cleanly. IMAGINED: a typical task for the role, not a record of what anyone was doing.
//
// The pack's clips have no knapping, grinding or spinning, so each work loop is a pack clip (the base) plus keyframed bone
// turns (`workPose`), applied after the clip as the stoop and glances are. Plain data and pure functions: testable
// without WebGL.
import type { State, TripKind } from './routine';
import type { Region } from './wardrobe';

export const TOOLS = ['none', 'spear', 'harpoon', 'digging-stick', 'basket', 'hammerstone', 'quern', 'spindle', 'pot', 'crook', 'sickle', 'torch', 'staff', 'scraper'] as const;
export type Tool = (typeof TOOLS)[number];

/** Clips in anims.glb (footstep-generator/avatar/build.mjs `CLIPS`). */
export type Clip = 'idle' | 'talk' | 'walk' | 'sit' | 'crouch' | 'work' | 'hold' | 'dance' | 'push';

export type Loop = 'idle' | 'knap' | 'grind' | 'spin' | 'herd' | 'carry' | 'dig' | 'reap' | 'shape' | 'scrape' | 'hold' | 'walk' | 'doze' | 'play' | 'talk';

/** Each loop's base clip, what the caption says, and whether it alternates with a rest (no keyframes, the clip only). */
export const LOOPS: Record<Loop, { clip: Clip; doing: string; rests: boolean }> = {
  idle: { clip: 'idle', doing: '', rests: false },
  knap: { clip: 'crouch', doing: 'knapping a stone tool', rests: true },
  grind: { clip: 'work', doing: 'grinding grain on a quern', rests: true },
  spin: { clip: 'idle', doing: 'spinning thread', rests: true },
  herd: { clip: 'idle', doing: 'herding', rests: true },
  carry: { clip: 'idle', doing: 'carrying a load', rests: false },
  dig: { clip: 'idle', doing: 'digging', rests: true },
  reap: { clip: 'idle', doing: 'reaping', rests: true },
  shape: { clip: 'crouch', doing: 'shaping a pot', rests: true },
  scrape: { clip: 'work', doing: 'scraping a hide', rests: true },
  hold: { clip: 'idle', doing: '', rests: false },
  walk: { clip: 'walk', doing: 'walking', rests: false },
  doze: { clip: 'sit', doing: 'asleep', rests: false },
  play: { clip: 'dance', doing: 'playing', rests: false },
  talk: { clip: 'talk', doing: 'talking', rests: false },
};

export type Work = { tool: Tool; loop: Loop };

/** Pottery from ~16,000 BCE in East Asia (Jomon, Xianrendong), ~9500 BCE in the Sahara, ~7000 BCE in the Near East. */
export function potteryFrom(region: Region): number {
  return region === 'east-asia' ? -16_000 : region === 'africa' || region === 'nile' ? -9500 : -7000;
}
/** Spindle whorls from the early Neolithic, ~7000 BCE (a rounded modelling choice). */
export const SPINDLE_FROM = -7000;

export type WorkQuery = { role: string; year: number; region: Region; female: boolean; roll: number };

/** The usual work for a role (at the hearth, or with no routine). */
export function workFor({ role, year, region, roll }: WorkQuery): Work {
  const pots = year >= potteryFrom(region);
  switch (role) {
    case 'forager':
    case 'gatherer':
      return roll < 0.5 ? { tool: 'digging-stick', loop: 'dig' } : { tool: 'basket', loop: 'carry' };
    case 'hunter':
      return { tool: 'spear', loop: 'hold' };
    case 'fisher':
      return { tool: 'harpoon', loop: 'hold' };
    case 'toolmaker':
      return { tool: 'hammerstone', loop: 'knap' };
    case 'fire-keeper':
      return { tool: 'torch', loop: 'hold' };
    case 'herder':
    case 'shepherd':
      return { tool: 'crook', loop: 'herd' };
    case 'milker':
      return pots ? { tool: 'pot', loop: 'carry' } : { tool: 'basket', loop: 'carry' };
    case 'weaver':
      return year >= SPINDLE_FROM ? { tool: 'spindle', loop: 'spin' } : { tool: 'basket', loop: 'carry' };
    case 'tanner':
      return { tool: 'scraper', loop: 'scrape' };
    case 'potter':
      return pots ? { tool: 'pot', loop: 'shape' } : { tool: 'basket', loop: 'carry' };
    case 'farmer':
      return roll < 0.34 ? { tool: 'sickle', loop: 'reap' } : roll < 0.67 ? { tool: 'quern', loop: 'grind' } : { tool: 'digging-stick', loop: 'dig' };
    case 'builder':
      return { tool: 'basket', loop: 'carry' };
    case 'elder':
      return roll < 0.5 ? { tool: 'staff', loop: 'hold' } : { tool: 'hammerstone', loop: 'knap' };
    case 'child':
      return roll < 0.5 ? { tool: 'basket', loop: 'carry' } : { tool: 'none', loop: 'idle' };
    default:
      return { tool: 'none', loop: 'idle' };
  }
}

/** What a trip has them doing once there. */
function tripWork(trip: TripKind, q: WorkQuery): Work {
  switch (trip) {
    case 'gathering':
      return { tool: 'digging-stick', loop: 'dig' };
    case 'hunting':
      return { tool: 'spear', loop: 'hold' };
    case 'fishing':
      return { tool: 'harpoon', loop: 'hold' };
    case 'fetching water and wood':
      return { tool: q.year >= potteryFrom(q.region) ? 'pot' : 'basket', loop: 'carry' };
    case 'working the fields':
      return q.roll < 0.5 ? { tool: 'sickle', loop: 'reap' } : { tool: 'digging-stick', loop: 'dig' };
    case 'herding':
      return { tool: 'crook', loop: 'herd' };
    case 'visiting another camp':
      return { tool: 'none', loop: 'talk' };
  }
}

/** With `?routine=1`: the state now, where it maps cleanly; the hearth is the role's own work. */
export function routineWork(state: State, q: WorkQuery): Work {
  switch (state.activity) {
    case 'asleep':
      return { tool: 'none', loop: 'doze' };
    case 'playing':
      return { tool: 'none', loop: 'play' };
    case 'hearth':
      return workFor(q);
    case 'trip': {
      const there = tripWork(state.trip, q);
      if (state.leg === 'there') return there;
      // Walking out or back, carrying what they took (a quern or a pot stays at home).
      const carried: Tool = there.tool === 'quern' ? 'none' : there.tool;
      return { tool: carried, loop: 'walk' };
    }
  }
}

// ---- keyframes -----------------------------------------------------------------------------------------------------
/**
 * One bone turn: radians about a figure axis (the figure stands upright facing +z). `x` tips an upright bone forward and
 * a hanging arm back; `y` turns it; `z` tips an upright bone to the figure's right.
 */
export type Turn = { bone: string; axis: 'x' | 'y' | 'z'; angle: number };

const wave = (t: number, period: number, phase = 0) => Math.sin(((t / period + phase) % 1) * Math.PI * 2);
/** 0..1, a quick rise and slow fall: a strike. */
const strike = (t: number, period: number) => {
  const u = (t / period) % 1;
  return u < 0.25 ? Math.sin((u / 0.25) * (Math.PI / 2)) : Math.cos(((u - 0.25) / 0.75) * (Math.PI / 2)) ** 2;
};

/** Arm poses that hold a tool in the right hand with the forearm forward (the grip axis then points up). */
const HOLD_R: Turn[] = [
  { bone: 'upperarm_r', axis: 'x', angle: -0.15 },
  { bone: 'lowerarm_r', axis: 'x', angle: -1.25 },
];

/** The turns for a loop at time t seconds, at full strength (the viewer scales them by `workWeight`). */
export function workPose(loop: Loop, t: number): Turn[] {
  switch (loop) {
    case 'knap': {
      const s = strike(t, 0.9);
      return [
        { bone: 'spine_02', axis: 'x', angle: 0.25 },
        { bone: 'upperarm_r', axis: 'x', angle: -0.5 - 0.5 * s },
        { bone: 'lowerarm_r', axis: 'x', angle: -1.0 - 0.6 * s },
        { bone: 'upperarm_l', axis: 'x', angle: -0.55 },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.9 },
        { bone: 'Head', axis: 'x', angle: 0.35 },
      ];
    }
    case 'grind': {
      const w = wave(t, 1.6);
      return [
        { bone: 'spine_01', axis: 'x', angle: 0.05 + 0.15 * w },
        { bone: 'spine_02', axis: 'x', angle: -0.1 + 0.08 * w },
        { bone: 'upperarm_r', axis: 'x', angle: -0.9 - 0.35 * w },
        { bone: 'upperarm_l', axis: 'x', angle: -0.9 - 0.35 * w },
        { bone: 'lowerarm_r', axis: 'x', angle: -0.3 + 0.2 * w },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.3 + 0.2 * w },
        { bone: 'Head', axis: 'x', angle: -0.25 },
      ];
    }
    case 'spin': {
      const w = wave(t, 0.5);
      return [
        // the distaff in the crook of the left arm, the right hand twirling the spindle at the hip
        { bone: 'upperarm_l', axis: 'x', angle: -0.35 },
        { bone: 'lowerarm_l', axis: 'x', angle: -1.5 },
        { bone: 'upperarm_r', axis: 'x', angle: -0.3 },
        { bone: 'lowerarm_r', axis: 'x', angle: -0.9 },
        { bone: 'hand_r', axis: 'y', angle: 0.5 * w },
        { bone: 'Head', axis: 'x', angle: 0.25 },
      ];
    }
    case 'herd': {
      const g = Math.max(0, wave(t, 4)) ** 2;
      return [
        ...HOLD_R,
        { bone: 'upperarm_l', axis: 'z', angle: -1.1 * g },
        { bone: 'upperarm_l', axis: 'x', angle: -0.6 * g },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.3 * g },
        { bone: 'Head', axis: 'y', angle: 0.4 * g },
      ];
    }
    case 'carry':
      // a basket or pot balanced on the head, hands free: the idle as it is
      return [];
    case 'dig': {
      const s = strike(t, 1.3);
      return [
        { bone: 'spine_02', axis: 'x', angle: 0.25 + 0.2 * s },
        { bone: 'upperarm_r', axis: 'x', angle: -0.7 + 0.4 * s },
        { bone: 'lowerarm_r', axis: 'x', angle: -1.1 + 0.5 * s },
        { bone: 'upperarm_l', axis: 'x', angle: -0.7 + 0.4 * s },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.9 + 0.5 * s },
      ];
    }
    case 'reap': {
      const w = wave(t, 1.4);
      return [
        { bone: 'spine_01', axis: 'x', angle: 0.45 },
        { bone: 'spine_02', axis: 'y', angle: 0.25 * w },
        { bone: 'upperarm_r', axis: 'x', angle: -0.9 },
        { bone: 'upperarm_r', axis: 'y', angle: 0.6 * w },
        { bone: 'lowerarm_r', axis: 'x', angle: -0.6 },
        { bone: 'upperarm_l', axis: 'x', angle: -1.0 },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.4 },
      ];
    }
    case 'shape': {
      const w = wave(t, 2.2);
      return [
        { bone: 'spine_02', axis: 'x', angle: 0.3 },
        { bone: 'upperarm_r', axis: 'x', angle: -0.6 },
        { bone: 'upperarm_l', axis: 'x', angle: -0.6 },
        { bone: 'lowerarm_r', axis: 'x', angle: -0.8 + 0.15 * w },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.8 - 0.15 * w },
        { bone: 'Head', axis: 'x', angle: 0.3 },
      ];
    }
    case 'scrape': {
      const w = wave(t, 1.2);
      return [
        { bone: 'spine_01', axis: 'x', angle: 0.3 + 0.12 * w },
        { bone: 'upperarm_r', axis: 'x', angle: -0.8 - 0.3 * w },
        { bone: 'upperarm_l', axis: 'x', angle: -0.8 - 0.3 * w },
        { bone: 'lowerarm_r', axis: 'x', angle: -0.5 },
        { bone: 'lowerarm_l', axis: 'x', angle: -0.5 },
      ];
    }
    case 'hold':
      return HOLD_R;
    case 'doze':
      return [{ bone: 'neck_01', axis: 'x', angle: 0.5 }, { bone: 'Head', axis: 'x', angle: 0.3 }];
    default:
      return [];
  }
}

/** A seeded generator (mulberry32), as lib/avatar.ts. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const RAMP = 0.5;
/**
 * How much of the work loop shows at time t (0 resting, 1 working): work 6-12 s, rest 3-6 s, half-second ramps, per
 * person. Loops that do not rest (holding, carrying, walking) are always 1. Pure, so `?still=1` asks for one instant.
 */
export function workWeight(loop: Loop, seed: number, t: number): number {
  if (!LOOPS[loop].rests) return 1;
  const r = seeded(seed);
  let start = -r() * 4; // somewhere into the first spell of work
  while (start < t + 30) {
    const work = 6 + r() * 6;
    const rest = 3 + r() * 3;
    const end = start + work;
    if (t < end) {
      const k = Math.min(1, (t - start) / RAMP, (end - t) / RAMP);
      const s = Math.max(0, k);
      return s * s * (3 - 2 * s);
    }
    if (t < end + rest) return 0;
    start = end + rest;
  }
  return 1;
}
