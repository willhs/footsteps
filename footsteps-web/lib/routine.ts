// A daily routine for each person at street zoom: asleep, at the hearth, playing, or away on a trip
// (gathering, hunting, fishing, fields, herding, a chore, a visit). Behind ?routine=1.
//
// WHAT IS MEASURED, WHAT IS IMAGINED. The *pattern* is modelled from studies of living and recorded
// small-scale societies; *this person's day* is imagined: which trip, how far, when, are drawn from
// a seed that is the person's spot (as the gait is: ids shift as the view changes, a spot does not).
// The screen and the person card say so. Nothing here is a finding about the past (the studies are
// 19th-21st century people, and the slider's year has no date: the routine runs on today's sun clock).
//
// SOURCES (the numbers live in footstep-generator/anthropology/time_use.yaml, exported to
// deploy/budgie/api/time_use.json by time_use.py; routine.test.ts reads that file and fails if the
// ranges below drift from it). `check` is the yaml's own status for the figure.
//  - Hours of food getting a day, walking to the patch included: !Kung 2.2-6.0 (Lee 1979; Hawkes,
//    O'Connell & Blurton Jones 1997 Curr Anthropol 38), Agta farmers 3.0-5.5 (Dyble et al. 2019 Nat Hum
//    Behav 3:792, doi:10.1038/s41562-019-0614-6). `secondary`: read via summaries, not the papers.
//  - Share of days spent on a trip: Lee has ~2.5 working days in 7 (!Kung), the Hadza go out most days;
//    ADULT_GO below sits between the two. A hedge, not a finding.
//  - Awake 14-17 h a day (time_use.yaml human_baseline, `recalled`; Yetish et al. 2015 Curr Biol
//    25:2862 reports 5.7-7.1 h asleep for Hadza, San, Tsimane: not opened). Waking about half an hour
//    before sunrise is also recalled from that paper. Children sleep longer: assumed.
//  - Who goes where: hunting mostly male, gathering and water and fuel mostly female, herding mostly
//    male is the cross-cultural tendency in Murdock & Provost 1973 (Ethnology 12:203) and the SCCS
//    (D-PLACE). `recalled`, not opened; used as odds that tilt a role, never as a rule (roles are drawn
//    without sex in people.ts, so a "hunter" can be a woman). time_use.yaml splits no figure by sex.
//  - Herding has no figure in time_use.yaml (its `gap`): herd trips of 6-9 h are an assumption.
//  - Trip distances (one way, km), chore lengths, and the 1.2 m/s walking pace are assumed.
//
// THE SHAPE. A person's day is a `DayPlan` (a sleep window and at most one `away` spell). `stateAt`
// reads it at a local sun hour and gives a `State`. The footprint shader runs the same maths
// (GLSL `gait` in components/footsteps/layers/people.ts) from the plan's numbers as attributes and the
// sun hour as a uniform. KEEP IN SYNC: change one, change the other; lib/routine.test.ts and
// lib/gait.test.ts pin values.
import { UnitKind } from '@/components/footsteps/layers/units';
import { dayLengthHours, sunPosition } from './sunTime';

/** Walking pace on a trip, metres a second (assumed; the shader has the same number). */
export const WALK_MS = 1.2;

export const routineParam = (search: string) => new URLSearchParams(search).get('routine') === '1';

export type TripKind =
  | 'gathering'
  | 'hunting'
  | 'fishing'
  | 'fetching water and wood'
  | 'working the fields'
  | 'herding'
  | 'visiting another camp';

export type WayKind = 'forager' | 'farmer' | 'herder';

/** What the routine needs to know about a person (a `Person` from layers/people.ts has all of it). */
export type RoutineSubject = {
  /** Hash of their spot (lib/gait.ts `gaitSeed`): the seed. */
  gait: number;
  age: number;
  female: boolean;
  role: string;
  groupKind: number;
  position: readonly [number, number];
};

/** Time away from the hearth. Trips and play both fill the plan's `from`..`to` window. */
export type Away =
  | { kind: 'play' }
  | { kind: 'trip'; trip: TripKind; /** metres, one way */ dist: number; /** radians anticlockwise from east */ bearing: number };

/** A person's day. Hours are local sun hours. `wake` is in [0, 24); `bed` is in (wake, wake + 24) and may
 * pass 24; `from` and `to` are in the same frame (wake to wake + 24). */
export type DayPlan = {
  wake: number;
  bed: number;
  from: number;
  to: number;
  away: Away | null;
  /** Longitude / 15: hours the local sun clock runs ahead of UTC. */
  lonHours: number;
};

export type Leg = 'out' | 'there' | 'back';

export type State =
  | { activity: 'asleep' }
  | { activity: 'hearth' }
  | { activity: 'playing' }
  | {
      activity: 'trip';
      trip: TripKind;
      leg: Leg;
      /** Metres from camp now. */
      distance: number;
      /** Seconds walked on this leg (0 when `there`). */
      legSeconds: number;
      dist: number;
      bearing: number;
    };

/** The gait style the shader draws for a state (0 as before, 1 asleep, 2 play, 3 working away). */
export function styleOf(s: State): 0 | 1 | 2 | 3 {
  return s.activity === 'asleep' ? 1 : s.activity === 'playing' ? 2 : s.activity === 'trip' && s.leg === 'there' ? 3 : 0;
}

export const hearthWay = (groupKind: number): WayKind =>
  groupKind === UnitKind.Village ? 'farmer' : groupKind === UnitKind.Camp ? 'herder' : 'forager';

// --- the table of trips ---------------------------------------------------------------------------

type TripSpec = {
  /** One way, kilometres (uniform). */
  km: [number, number];
  /** Time away from camp, walking included (uniform). The food-getting kinds take time_use.yaml's range. */
  hours: [number, number];
  /** Hours after waking that the trip starts (uniform). */
  leave: [number, number];
  /** What the person is doing there, and on the way. */
  doing: string;
  going: string;
};

/** time_use.yaml food_getting `range`, hours a day: foraging, and farming (the Agta who farm). */
export const FOOD_GETTING_HOURS = { foraging: [2.2, 6.0], farming: [3.0, 5.5] } as const;

export const TRIPS: Record<TripKind, TripSpec> = {
  gathering: { km: [1, 4], hours: [...FOOD_GETTING_HOURS.foraging], leave: [1, 2.5], doing: 'gathering', going: 'walking out to gather' },
  hunting: { km: [2, 8], hours: [...FOOD_GETTING_HOURS.foraging], leave: [1, 2.5], doing: 'hunting', going: 'setting out to hunt' },
  fishing: { km: [0.3, 2], hours: [...FOOD_GETTING_HOURS.foraging], leave: [1, 3], doing: 'fishing', going: 'walking out to fish' },
  'fetching water and wood': { km: [0.2, 1.5], hours: [0.5, 1.5], leave: [1.5, 9], doing: 'fetching water and wood', going: 'going for water and wood' },
  'working the fields': { km: [0.3, 2], hours: [...FOOD_GETTING_HOURS.farming], leave: [0.75, 1.75], doing: 'working the fields', going: 'walking out to the fields' },
  herding: { km: [1, 5], hours: [6, 9], leave: [0.5, 1.5], doing: 'herding', going: 'driving the herd out' },
  'visiting another camp': { km: [3, 15], hours: [3, 7], leave: [1.5, 3], doing: 'visiting another camp', going: 'travelling to another camp' },
};

/** Share of days an adult in this role spends on each trip kind (the rest of their days are at the hearth).
 * Sums stay under 1. Women, men and elders are tilted by `tilt`. */
const ADULT_GO = 0.6; // between Lee's ~0.35 (2.5 working days in 7) and the Hadza's near-daily

type Odds = [TripKind, number][];

function oddsFor(way: WayKind, role: string, female: boolean, age: number): Odds {
  if (age < 13) return [];
  if (age >= 55 || role === 'elder') return [['fetching water and wood', 0.25]];
  const visit: [TripKind, number] = ['visiting another camp', 0.04];
  const chores = (women: number, men: number): [TripKind, number] => ['fetching water and wood', female ? women : men];
  const g = ADULT_GO;
  if (way === 'forager') {
    switch (role) {
      case 'hunter':
        return female ? [['hunting', 0.1], ['gathering', g * 0.75], visit, chores(0.12, 0.05)] : [['hunting', g], ['gathering', 0.05], visit, chores(0.05, 0.05)];
      case 'fisher':
        return [['fishing', g], visit, chores(0.12, 0.08)];
      case 'toolmaker':
      case 'fire-keeper':
        return [visit, chores(0.2, 0.15)];
      default: // gatherer, forager
        return female ? [['gathering', g], ['hunting', 0.03], visit, chores(0.15, 0.1)] : [['hunting', g * 0.5], ['gathering', g * 0.4], visit, chores(0.1, 0.1)];
    }
  }
  if (way === 'farmer') {
    switch (role) {
      case 'farmer':
        return [['working the fields', female ? 0.7 : 0.8], visit, chores(0.2, 0.1)];
      case 'herder':
        return [['herding', 0.75], visit, chores(0.1, 0.05)];
      default: // potter, weaver, builder: work at home, help in the fields now and then
        return [['working the fields', 0.2], visit, chores(0.3, 0.1)];
    }
  }
  switch (role) {
    case 'herder':
    case 'shepherd':
      return [['herding', 0.85], visit, chores(0.05, 0.02)];
    default: // milker, weaver, tanner
      return [visit, chores(0.3, 0.1)];
  }
}

// --- seeded randomness -----------------------------------------------------------------------------

const hashSeed = (h: number, a: number, b: number) =>
  (Math.imul(Math.floor(h * 16_777_216) + 1, 2_654_435_761) ^ Math.imul(a + 7, 40_503) ^ Math.imul(b + 1, 69_069)) >>> 0;

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const inRange = (r: readonly [number, number], u: number) => lerp(r[0], r[1], u);

// --- the plan ---------------------------------------------------------------------------------------

/** Hours since the epoch (UTC): what the plan's day and season are keyed on. */
export const epochHour = (ms: number) => Math.floor(ms / 3_600_000);

// The sun's declination at noon on a day (days since the epoch): the season, one value for the whole local day.
let declinationMemo = { day: Number.NaN, value: 0 };
function declinationOn(day: number) {
  if (declinationMemo.day !== day) declinationMemo = { day, value: sunPosition(new Date((day * 24 + 12) * 3_600_000)).declination };
  return declinationMemo.value;
}

/** Local sun hour (0 to 24) at a longitude, from the clock's ms. */
export function localHourAt(ms: number, lon: number): number {
  return ((((ms / 3_600_000) % 24) + lon / 15) % 24 + 24) % 24;
}

/** The person's day on the local day containing `epoch` (hours since the epoch, UTC). Pure: the same person
 * and hour give the same plan. */
export function planDay(p: RoutineSubject, epoch: number): DayPlan {
  const [lon, lat] = p.position;
  const lonHours = lon / 15;
  const dayIndex = Math.floor((epoch + lonHours) / 24);
  // Day length sets when the sun is up; very long and very short days are held to 8-16 h, because people
  // in the polar zones keep a clock the sun does not give them.
  const length = clamp(dayLengthHours(lat, declinationOn(dayIndex)), 8, 16);
  const sunrise = 12 - length / 2;
  const sunset = 12 + length / 2;
  const self = rng(hashSeed(p.gait, 0, 1)); // what stays the same from day to day
  const today = rng(hashSeed(p.gait, dayIndex, 2));

  const infant = p.age < 5;
  const child = p.age < 13;
  const wake = sunrise - 0.5 + (self() * 1.5 - 0.75) + (today() - 0.5) * 0.5;
  const awake = lerp(15, 17, self()); // time_use.yaml human_baseline 14-17 h awake
  const sleep = 24 - awake + (infant ? 3 : child ? 1.5 : p.age >= 55 ? -0.5 : 0) + (today() - 0.5) * 0.5;
  const bed = wake + 24 - sleep;
  const base = { wake, bed, lonHours };

  if (infant) return { ...base, from: wake, to: wake, away: null };
  if (child) {
    // Children play nearby through the day, in the hours between waking and the evening meal.
    return { ...base, from: wake + 0.75, to: bed - 1.5, away: { kind: 'play' } };
  }

  // One roll picks the day's trip (or none).
  const roll = today();
  let acc = 0;
  let trip: TripKind | null = null;
  for (const [kind, odds] of oddsFor(hearthWay(p.groupKind), p.role, p.female, p.age)) {
    acc += odds;
    if (roll < acc) {
      trip = kind;
      break;
    }
  }
  if (!trip) return { ...base, from: wake, to: wake, away: null };

  const spec = TRIPS[trip];
  const dist = inRange(spec.km, today()) * 1000;
  const bearing = today() * Math.PI * 2;
  const walk = dist / WALK_MS / 3600; // hours each way
  const from = wake + inRange(spec.leave, today());
  const away = inRange(spec.hours, today());
  // Back by dusk or a little after, and early enough for the evening; at least a quarter hour there.
  const latest = Math.min(bed - 0.75, sunset + 0.75);
  const to = Math.min(from + Math.max(away, 2 * walk + 0.25), latest);
  if (to - from < 2 * walk + 0.25) return { ...base, from: wake, to: wake, away: null };
  return { ...base, from, to, away: { kind: 'trip', trip, dist, bearing } };
}

// One plan per person per epoch, kept on the person object (no allocation per frame).
const planCache = new WeakMap<object, { epoch: number; plan: DayPlan }>();
export function planOf(p: RoutineSubject, epoch: number): DayPlan {
  const hit = planCache.get(p);
  if (hit && hit.epoch === epoch) return hit.plan;
  const plan = planDay(p, epoch);
  planCache.set(p, { epoch, plan });
  return plan;
}

const ASLEEP: State = { activity: 'asleep' };
const HEARTH: State = { activity: 'hearth' };
const PLAYING: State = { activity: 'playing' };

/** What the plan has the person doing at a local sun hour. */
export function stateAt(plan: DayPlan, localHour: number): State {
  const u = localHour < plan.wake ? localHour + 24 : localHour;
  if (u >= plan.bed) return ASLEEP;
  const away = plan.away;
  if (!away || u < plan.from || u >= plan.to) return HEARTH;
  if (away.kind === 'play') return PLAYING;
  const { trip, dist, bearing } = away;
  const walk = dist / WALK_MS / 3600;
  if (u < plan.from + walk) {
    const legSeconds = (u - plan.from) * 3600;
    return { activity: 'trip', trip, leg: 'out', distance: Math.min(dist, legSeconds * WALK_MS), legSeconds, dist, bearing };
  }
  if (u >= plan.to - walk) {
    const legSeconds = (u - (plan.to - walk)) * 3600;
    return { activity: 'trip', trip, leg: 'back', distance: Math.max(0, dist - legSeconds * WALK_MS), legSeconds, dist, bearing };
  }
  return { activity: 'trip', trip, leg: 'there', distance: dist, legSeconds: 0, dist, bearing };
}

/** The numbers the footprint shader reads, as two vec4 attributes: [wake, bed, from, to] and
 * [dist, bearing, plays, lonHours]. */
export function planAttributes(plan: DayPlan): { day: [number, number, number, number]; trip: [number, number, number, number] } {
  const a = plan.away;
  return {
    day: [plan.wake, plan.bed, plan.from, plan.to],
    trip: [a?.kind === 'trip' ? a.dist : 0, a?.kind === 'trip' ? a.bearing : 0, a?.kind === 'play' ? 1 : 0, plan.lonHours],
  };
}

// --- words ------------------------------------------------------------------------------------------

const DOING_BY_ROLE: Record<string, string[]> = {
  toolmaker: ['making tools', 'knapping stone', 'mending a spear'],
  'fire-keeper': ['tending the fire'],
  potter: ['shaping clay', 'firing pots'],
  weaver: ['weaving'],
  tanner: ['working hides'],
  builder: ['mending a wall', 'building'],
  milker: ['milking', 'making cheese'],
};
const DOING_BY_WAY: Record<WayKind, string[]> = {
  forager: ['cooking', 'eating', 'talking', 'sharing food', 'resting'],
  farmer: ['cooking', 'grinding grain', 'eating', 'talking', 'mending tools', 'resting'],
  herder: ['cooking', 'eating', 'talking', 'mending tack', 'resting'],
};
const DOING_QUIET = ['resting', 'talking', 'minding the fire'];

function kilometres(m: number) {
  if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  const km = m / 1000;
  return `${km < 10 ? Math.round(km * 2) / 2 : Math.round(km)} km`;
}

/** The state in words, for the person card: "gathering, about 2 km from camp". Lower case, no full stop. */
export function describeState(p: RoutineSubject, state: State, localHour: number): string {
  const way = hearthWay(p.groupKind);
  const place = way === 'farmer' ? 'village' : 'camp';
  switch (state.activity) {
    case 'asleep':
      return `asleep in the ${place}`;
    case 'playing':
      return `playing near the ${place}`;
    case 'hearth': {
      const list = p.age < 5 ? ['with their family'] : p.age >= 55 ? DOING_QUIET : (DOING_BY_ROLE[p.role] ?? []).concat(DOING_BY_WAY[way]);
      const slot = Math.floor(localHour * 2); // changes every half hour
      return `${list[hashSeed(p.gait, slot, 3) % list.length]} in the ${place}`;
    }
    case 'trip': {
      const spec = TRIPS[state.trip];
      const away = `about ${kilometres(state.distance)} from ${place === 'camp' ? 'camp' : 'the village'}`;
      if (state.leg === 'out') return `${spec.going}, ${away}`;
      if (state.leg === 'back') return `walking back from ${state.trip === 'working the fields' ? 'the fields' : state.trip === 'visiting another camp' ? 'another camp' : state.trip}, ${away}`;
      return `${spec.doing}, ${away}`;
    }
  }
}

/** The one sentence the card adds: now, and what is measured and what is not. */
export function routineLine(p: RoutineSubject, ms: number): string {
  const epoch = epochHour(ms);
  const hour = localHourAt(ms, p.position[0]);
  const words = describeState(p, stateAt(planOf(p, epoch), hour), hour);
  return `Now: ${words}. Imagined: the pattern is modelled from time-use studies of small-scale societies, this person's day is not known.`;
}
