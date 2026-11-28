// Hearth smoke and firelight (`?smoke=1`): a thin plume of smoke rises from each household's hearth, drifts with the place's wind,
// and at night (the local sun clock) each hearth casts a warm flickering pool of light on the ground.
//
// The data shape is `Hearth`: one per household (or per roof of a town), standing where the household's dwelling does
// (layers/shelters.ts, which takes them from layers/households.ts `householdsOf`, the order people.ts fills them in). Everything
// here is pure and a function of the hearth's place, so the same place always smokes the same way. IMAGINED: where a hearth is,
// how it burns and which way the wind blows. Nothing is measured; the note says so.
//
// The motion is not computed here. A plume is a few `Puff`s whose only per-instance data is a seed (phase in the cycle,
// wobble, size, strength) and the place's wind; the vertex shader (layers/SmokeLayer.ts) turns a time uniform into a
// position, size and fade, so a frame costs no CPU work.
import { UnitKind } from '@/components/footsteps/layers/units';
import { HOUSEHOLD_SPACING_M } from '@/components/footsteps/layers/households';
import { snowHousesAt } from './dwellings';
import { sheltersForGroups, sheltersForTown, type ShelterGroup, type TownInView } from '@/components/footsteps/layers/shelters';

/** Off by default until reviewed on prod: `?smoke=1` draws smoke and, at night, firelight in the close-up. */
export function smokeParam(search: string): boolean {
  return new URLSearchParams(search).get('smoke') !== '0';
}

/** `lamp`: a household of the treeless Inuit Arctic, which burned seal or whale oil in a soapstone lamp (the qulliq) for heat, light and
 * cooking rather than a wood fire: a glow at night, no plume of smoke (Hough 1898, The Lamp of the Eskimo, Report of the US National
 * Museum for 1896). */
export type HearthKind = 'camp' | 'village' | 'town' | 'lamp';

/** One household's hearth (one roof, for a town). */
export type Hearth = {
  lon: number;
  lat: number;
  /** Hash of the place, uint32: the seed for everything below, and the order the cap thins by. */
  seed: number;
  kind: HearthKind;
  /** Households it stands for: 1 in a camp or village, more for a town roof. */
  homes: number;
};

/** A hearth with the height it stands at, metres: 0, where the people are drawn (the close-up ground is raised above that; see `Close3DLayer`'s `hearthsStandingOn`). */
export type StandingHearth = Hearth & { z: number };

/** Seconds a puff takes to rise, widen and fade. */
export const PUFF_LIFE_S = 40;
/** Puffs per hearth: a few, staggered through the cycle so the plume is always there. */
export const PUFFS_PER_HEARTH = 4;
/** Most hearths drawn at once (so at most `MAX_HEARTHS * PUFFS_PER_HEARTH` puffs and `MAX_HEARTHS` pools): a city's roofs are thinned to this. */
export const MAX_HEARTHS = 1200;
/** The smoke's strength is capped here (a town's hearth is thicker than a camp's, not unboundedly). */
export const MAX_STRENGTH = 2.5;
/** How far the plume climbs, metres; and how far the wind carries its tip. */
export const PLUME_RISE_M = 90;
export const PLUME_DRIFT_M = 140;
/** The wind: a direction per 0.5° square, drifting by up to this many radians either way over a few minutes. */
export const WIND_SWING_RAD = 0.7;
export const WIND_CELL_DEG = 0.5;

/** Smoke and light fade in over this zoom range: closer than the people (zoom 11.5-12.5), where a plume is a few pixels tall. */
export const SMOKE_ZOOM = { from: 11.5, full: 13 } as const;

/** 0 to 1, smoothly, from `SMOKE_ZOOM.from` to `SMOKE_ZOOM.full`. */
export function smokeOpacity(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - SMOKE_ZOOM.from) / (SMOKE_ZOOM.full - SMOKE_ZOOM.from)));
  return t * t * (3 - 2 * t);
}

/** Close in, a plume is drawn thinner: one family's cooking fire gives a thin wisp, and the puffs (16 m wide at full size) hid the camp under
 * them from zoom ~17. Over this zoom range the smoke fades to SMOKE_CLOSE_SHARE of its strength; the firelight does not. */
export const SMOKE_CLOSE_ZOOM = { from: 15, full: 17 } as const;
export const SMOKE_CLOSE_SHARE = 0.25;
export function smokeCloseFade(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - SMOKE_CLOSE_ZOOM.from) / (SMOKE_CLOSE_ZOOM.full - SMOKE_CLOSE_ZOOM.from)));
  return 1 - (1 - SMOKE_CLOSE_SHARE) * t * t * (3 - 2 * t);
}

/** Hash of integers to uint32. */
function hash32(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
const unit = (a: number, b: number) => hash32(a, b) / 4294967296;

/** The seed of a place: its position to about a metre. */
export function hearthSeed(lon: number, lat: number): number {
  return hash32(Math.round(lon * 1e5), Math.round(lat * 1e5));
}

const KIND_OF: Record<number, HearthKind> = { [UnitKind.Village]: 'village', [UnitKind.Glow]: 'town' };

/** Where foragers' households lit oil lamps rather than fires: the Inuit range where snow houses stood (lib/dwellings.ts `SNOW_HOUSES`),
 * north of about the tree line (62°N there). South of it, in the forest, people burned wood. */
export const LAMP_MIN_LAT = 62;
export function lampsAt(lon: number, lat: number, year: number, kind: number): boolean {
  return kind === UnitKind.Band && lat >= LAMP_MIN_LAT && snowHousesAt({ lon, lat, year, kind });
}

/** The hearths of the groups and towns in view: one per household, where `sheltersForGroups` / `sheltersForTown` stand a dwelling
 * (they need no dwelling table for the places, so smoke works without `?shelters=1`). The same call as the dwellings, so a roof and its
 * smoke always agree. */
export function hearthsForView(groups: readonly ShelterGroup[], towns: readonly TownInView[], year: number): Hearth[] {
  const shelters = [...sheltersForGroups(groups, year, null), ...towns.flatMap((town) => sheltersForTown(town, year, null))];
  return capHearths(
    shelters.map((s) => ({
      // An open hearth outside the door where the camp has one (shelters.ts `hearth`), else the fire inside under the roof.
      lon: (s.hearth ?? s.position)[0],
      lat: (s.hearth ?? s.position)[1],
      seed: hearthSeed(s.position[0], s.position[1]),
      kind: lampsAt(s.position[0], s.position[1], year, s.group.kind) ? 'lamp' : KIND_OF[s.group.kind] ?? 'camp',
      homes: s.homes,
    })),
  );
}

/** At most `max` hearths, thinned by seed: the same hearths survive a pan or a zoom, and a thinned town stays spread out (the seeds are uniform). */
export function capHearths<T extends { seed: number }>(hearths: readonly T[], max = MAX_HEARTHS): T[] {
  if (hearths.length <= max) return hearths.slice();
  const keep = new Set([...hearths].sort((a, b) => a.seed - b.seed).slice(0, max));
  return hearths.filter((h) => keep.has(h));
}

/** How thick a hearth's smoke is, 1 for a camp's or village's household, more for a town roof (many hearths in one), up to `MAX_STRENGTH`. */
export function strengthOf(h: Pick<Hearth, 'kind' | 'homes'>): number {
  if (h.kind !== 'town') return 1;
  return Math.min(MAX_STRENGTH, 1 + 0.35 * Math.log2(Math.max(1, h.homes)));
}

/** Radius of a hearth's pool of light, metres: half the households' spacing, so a camp's pools just touch in a ring. A town roof is closer. */
export function poolRadiusOf(h: Pick<Hearth, 'kind'>): number {
  if (h.kind === 'lamp') return 8; // a lamp's glow through a snow-house wall
  return h.kind === 'town' ? 12 : 0.5 * HOUSEHOLD_SPACING_M[h.kind];
}

/** One place's wind: the direction it blows toward (radians, 0 = east) and the phase of its slow swing. One per `WIND_CELL_DEG` square, so
 * a camp's hearths share a wind and neighbouring regions do not. Imagined: no wind is recorded for the past. */
export function windAt(lon: number, lat: number): { angle: number; phase: number } {
  const x = Math.floor(lon / WIND_CELL_DEG);
  const y = Math.floor(lat / WIND_CELL_DEG);
  return { angle: unit(x, y) * Math.PI * 2, phase: unit(y + 7919, x - 104729) * Math.PI * 2 };
}

/** One puff of a plume, as the shader reads it. */
export type Puff = {
  position: [number, number, number];
  /** Where in the cycle it starts, 0 to 1 (the shader adds time/`PUFF_LIFE_S`). */
  phase: number;
  /** Sideways wobble phase, radians. */
  wobble: number;
  /** Size factor around 1. */
  size: number;
  strength: number;
  /** The place's wind: direction and swing phase (`windAt`). */
  wind: [number, number];
};

/** The plume of one hearth: `PUFFS_PER_HEARTH` puffs spaced evenly through the cycle, the whole set shifted by a per-hearth offset so
 * neighbouring hearths do not breathe together. A function of the hearth's seed and index alone. */
export function puffsOf(h: StandingHearth): Puff[] {
  if (h.kind === 'lamp') return [];
  const offset = unit(h.seed, 1);
  const wind = windAt(h.lon, h.lat);
  const strength = strengthOf(h);
  const puffs: Puff[] = [];
  for (let k = 0; k < PUFFS_PER_HEARTH; k++) {
    puffs.push({
      position: [h.lon, h.lat, h.z],
      phase: (offset + (k + 0.3 * (unit(h.seed, 10 + k) - 0.5)) / PUFFS_PER_HEARTH) % 1,
      wobble: unit(h.seed, 20 + k) * Math.PI * 2,
      size: 0.8 + 0.4 * unit(h.seed, 30 + k),
      strength,
      wind: [wind.angle, wind.phase],
    });
  }
  return puffs;
}

/** One pool of light: where, how wide, and a seed for its flicker. */
export type Pool = { position: [number, number, number]; radius: number; seed: number };

export function poolOf(h: StandingHearth): Pool {
  return { position: [h.lon, h.lat, h.z], radius: poolRadiusOf(h), seed: unit(h.seed, 2) };
}
