// Individual people, imagined from head counts. At street-level zoom each band
// or village in view becomes its people: how many comes from HYDE; age, sex
// and role are drawn from a modelled age structure for the group's way of life
// (lib/demography.ts, research 0006); where they stand in camp is illustrative. Generation is deterministic per group, so the same
// people appear every time you look at the same place.
import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import { MIN_GROUP_PEOPLE, UnitKind, WAY_OF_KIND } from './units';
import { LOOKS } from '@/lib/waysOfLife';
import { AGE_LABEL, AGE_STRUCTURE_NAME, ageDraws, ageStructureFor, sampleLivingAge, type AgeStructureId } from '@/lib/demography';
import { FOOTWEAR, footwearFor } from '@/lib/footwear';
import { animClock, gaitSeed } from '@/lib/gait';
import { WALK_MS, planAttributes, planOf, routineLine } from '@/lib/routine';
import { solarNowMs } from '@/lib/solarClock';
import { HOUSEHOLD_RADIUS_M, HOUSEHOLD_SPACING_M, householdsOf, type Household } from './households';
import { OTHER_HUMANS, type OtherHuman } from '@/lib/otherHumans';

export type Person = {
  id: number;
  position: [number, number];
  age: number;
  /** Which modelled age structure the age was drawn from (lib/demography.ts). The age itself is speculative. */
  ageStructure: AgeStructureId;
  female: boolean;
  role: string;
  groupKind: number; // UnitKind.Band | Village | Camp
  groupPeople: number;
  color: [number, number, number, number];
  radius: number; // footprint half-length, pixels
  footwear: number; // index into FOOTWEAR (imagined, lib/footwear.ts)
  gait: number; // hash in [0, 1) of their spot: sets how they walk (lib/gait.ts), shared with the shader
  /** Index of their household within the group; set only with `households` (`?settlements=1`). Imagined layout. */
  household?: number;
  /** Another kind of human (lib/otherHumans.ts); unset for Homo sapiens. Their band is a guess. */
  kindOfHuman?: OtherHuman['id'];
};

/** How people stand in camp. `hearths` is the default: a few random clusters. `households` (`?settlements=1`):
 * packed into households of about 4-5 round the group's spot (households.ts). */
export type CampLayout = 'hearths' | 'households';

export type GroupInView = {
  lon: number;
  lat: number;
  kind: number;
  people: number;
  /** Override the age structure the group's people are drawn from; by default it follows the group's kind, place and year. */
  ageStructure?: AgeStructureId;
};

/** Per-group cap: a large village shows its first N people. */
export const MAX_PER_GROUP = 160;
/** Total cap across the view, to keep the draw cheap. */
export const MAX_PEOPLE = 40_000;

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

const BAND_ROLES = [
  'forager',
  'hunter',
  'gatherer',
  'toolmaker',
  'fire-keeper',
  'fisher',
];
const CAMP_ROLES = ['herder', 'herder', 'herder', 'shepherd', 'milker', 'weaver', 'tanner'];
const VILLAGE_ROLES = [
  'farmer',
  'farmer',
  'farmer',
  'herder',
  'potter',
  'weaver',
  'builder',
];

/** `roll` is a uniform draw, always taken so the stream does not depend on age. */
function role(age: number, kind: number, roll: number) {
  if (age < 5) return 'young child';
  if (age < 13) return 'child';
  if (age >= 55) return 'elder';
  const roles =
    kind === UnitKind.Band ? BAND_ROLES : kind === UnitKind.Camp ? CAMP_ROLES : VILLAGE_ROLES;
  return roles[Math.floor(roll * roles.length)];
}

export const groupSeed = (lon: number, lat: number) =>
  (Math.round(lon * 1e4) * 73856093) ^ (Math.round(lat * 1e4) * 19349663);

/** A group as it stands at the two data years either side of the time: `from` people
 * at the earlier year, `to` at the later (zero where the group is absent). */
export type MorphGroupInView = {
  lon: number;
  lat: number;
  kind: number;
  from: number;
  to: number;
};

/** How many individuals a group of `people` is drawn as (none for a glow or a sparse cell). */
export function peopleDrawn(kind: number, people: number) {
  if (kind === UnitKind.Glow || people < MIN_GROUP_PEOPLE) return 0;
  return Math.min(MAX_PER_GROUP, Math.round(people));
}

/** People for the stretch between two data years, split by what the year fraction does
 * to each: `steady` are there at both ends (drawn at full strength), `leaving` only at
 * the earlier year (fade out as the fraction rises), `entering` only at the later one
 * (fade in). A person's look and place depend on the group and their index alone, so a
 * group that grows or shrinks keeps the people it had and only the difference fades, and
 * a way-of-life change (a different kind of group at the same spot) is a cross-fade. */
export function peopleForMorph(groups: MorphGroupInView[], year = 1900, layout: CampLayout = 'hearths') {
  const steady: Person[] = [];
  const leaving: Person[] = [];
  const entering: Person[] = [];
  let id = 0;
  let drawn = 0;
  for (const g of groups) {
    const nFrom = peopleDrawn(g.kind, g.from);
    const nTo = peopleDrawn(g.kind, g.to);
    const n = Math.max(nFrom, nTo);
    if (!n) continue;
    const bucket = (i: number) => (i < nFrom && i < nTo ? steady : i < nFrom ? leaving : entering);
    const group: GroupInView = { lon: g.lon, lat: g.lat, kind: g.kind, people: g.to > 0 ? g.to : g.from };
    for (const person of generate(group, n, id, year, layout)) {
      if (drawn >= MAX_PEOPLE) return { steady, leaving, entering };
      bucket(person.id - id).push(person);
      drawn++;
    }
    id += n;
  }
  return { steady, leaving, entering };
}

export function peopleForGroups(groups: GroupInView[], year = 1900, layout: CampLayout = 'hearths'): Person[] {
  const out: Person[] = [];
  let id = 0;
  for (const g of groups) {
    const n = peopleDrawn(g.kind, g.people);
    if (!n) continue;
    for (const person of generate(g, n, id, year, layout)) {
      if (out.length >= MAX_PEOPLE) return out;
      out.push(person);
    }
    id += n;
  }
  return out;
}

/** The first `n` people of a group; person i never depends on n. */
function* generate(g: GroupInView, n: number, firstId: number, year: number, layout: CampLayout): Generator<Person> {
  const r = rng(groupSeed(g.lon, g.lat));
  const ageStructure = g.ageStructure ?? ageStructureFor(g.kind, g.lon, g.lat, year);
  // camp/village spread in metres → degrees (longitude scaled by latitude)
  const spread = g.kind === UnitKind.Village ? 520 : 260; // camps are as tight as bands
  const mPerDegLat = 111_320;
  const mPerDegLon = mPerDegLat * Math.max(0.2, Math.cos((g.lat * Math.PI) / 180));
  // Households: people fill them in order, so person i's household never depends on n.
  const households =
    layout === 'households'
      ? householdsOf(groupSeed(g.lon, g.lat), g.kind === UnitKind.Village ? HOUSEHOLD_SPACING_M.village : HOUSEHOLD_SPACING_M.camp)
      : null;
  let home: Household | null = null;
  let room = 0;
  for (let i = 0; i < n; i++) {
    let x: number;
    let y: number;
    if (households) {
      if (room === 0) {
        home = households.next().value as Household;
        room = home.size;
      }
      room--;
      // The same three draws as the hearth layout takes, so age, sex and role come out as they do without households.
      r();
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * HOUSEHOLD_RADIUS_M;
      x = home!.x + Math.cos(a) * d;
      y = home!.y + Math.sin(a) * d;
    } else {
      // clustered around a few hearths/houses
      const hearth = Math.floor(r() * (g.kind === UnitKind.Village ? 10 : 4));
      const hr = rng(groupSeed(g.lon, g.lat) + hearth * 7919);
      const hx = (hr() - 0.5) * spread * 1.2;
      const hy = (hr() - 0.5) * spread * 1.2;
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * spread * 0.35;
      x = hx + Math.cos(a) * d;
      y = hy + Math.sin(a) * d;
    }
    // Age has its own stream (person i's draws never depend on n, the profile or anyone else), so a different age
    // structure changes ages and roles only: never positions, sex or ids.
    const [uBand, uPlace, uAnchor] = ageDraws(groupSeed(g.lon, g.lat), i);
    const sampledAge = sampleLivingAge(ageStructure, uBand, uPlace);
    // Put an adult first, including when the view's total cap truncates a group (a display bias, not the structure).
    const age = i === 0 && sampledAge < 18 ? 18 + Math.floor(uAnchor * 37) : sampledAge;
    const female = r() < 0.5;
    const roleRoll = r();
    const child = age < 13;
    const elder = age >= 55;
    const position: [number, number] = [g.lon + x / mPerDegLon, g.lat + y / mPerDegLat];
    yield {
      id: firstId + i,
      position,
      gait: gaitSeed(position[0], position[1]),
      age,
      ageStructure,
      female,
      role: role(age, g.kind, roleRoll),
      groupKind: g.kind,
      groupPeople: g.people,
      color: child ? [255, 244, 222, 235] : elder ? [222, 214, 200, 235] : [255, 226, 170, 245],
      radius: child ? 5 : 7.5,
      ...(home && { household: home.index }),
      // Its own stream, so adding it left everyone's place, age and role as they were.
      footwear: footwearFor({ year, lat: g.lat, lon: g.lon, kind: g.kind, age, roll: rng(groupSeed(g.lon, g.lat) + i * 104729 + 1)() }),
    };
  }
}

/** The person card's words. With `routineMs` (the sun clock, ms; `?routine=1`) it adds what they are doing now. */
export function describePerson(p: Person, routineMs?: number) {
  const now = routineMs === undefined ? '' : ` ${routineLine(p, routineMs)}`;
  const who =
    p.age < 13
      ? p.female
        ? 'A girl'
        : 'A boy'
      : p.female
        ? 'A woman'
        : 'A man';
  const group = LOOKS[WAY_OF_KIND[p.groupKind as keyof typeof WAY_OF_KIND]].mark;
  const ageNote = ` Age drawn from the ${AGE_STRUCTURE_NAME[p.ageStructure]}. ${AGE_LABEL}.`;
  if (p.kindOfHuman) {
    const kind = OTHER_HUMANS.find((h) => h.id === p.kindOfHuman)!;
    const noun = who.slice(2).toLowerCase();
    const title = kind.adjective ? `A ${kind.adjective} ${noun}` : `A ${noun} of ${kind.name}`;
    return {
      title: `${title}, about ${p.age}`,
      detail: `${p.role[0].toUpperCase()}${p.role.slice(1)} in a band of about ${Math.round(p.groupPeople)} ${kind.name}: another kind of human, not Homo sapiens. The band, its size and its place are guesses. Footprints: ${FOOTWEAR[p.footwear] ?? 'barefoot'} (imagined from era and climate).${ageNote}${now}`,
    };
  }
  return {
    title: `${who}, about ${p.age}`,
    detail: `${p.role[0].toUpperCase()}${p.role.slice(1)} in a ${group} of about ${Math.round(p.groupPeople).toLocaleString()} people. Footprints: ${FOOTWEAR[p.footwear] ?? 'barefoot'} (imagined from era and climate).${ageNote}${now}`,
  };
}

// --- layer: people as footprints that walk and stop in real time (GPU) ---
// Like the Marauder's Map: each person is a pair of footprints. Walking, a new print lands at
// every step and the older ones fade as the next foot comes down; standing, the two feet rest
// side by side. Speeds, pauses and paths are invented per person (stable for a place) and run
// on the real clock; prints are drawn at a readable pixel size, so far out a walker steps
// almost on the spot and the stride only shows once zoomed right in.

/** Footprints drawn per person: the newest and the two fading behind it. */
export const PRINTS = 3;

/** One entry per footprint, person-major: entry i is print `i % PRINTS` of person `i / PRINTS`.
 * Entries are the Person itself, so picking any print picks its person. */
export function footprintData(people: Person[]): Person[] {
  const out = new Array<Person>(people.length * PRINTS);
  for (let i = 0; i < people.length; i++) for (let k = 0; k < PRINTS; k++) out[i * PRINTS + k] = people[i];
  return out;
}

const peopleAnim = {
  name: 'peopleAnim',
  vs: /* glsl */ `uniform peopleAnimUniforms {
  float time;
  float sunUtc;
  float routine;
  float figures;
} peopleAnim;
`,
  uniformTypes: { time: 'f32', sunUtc: 'f32', routine: 'f32', figures: 'f32' },
} as const;

// Where print k of this person is, which way it points, and how strongly it shows.
// KEEP IN SYNC with gaitAt() / routineGaitAt() in lib/gait.ts and stateAt() in lib/routine.ts: name tags
// follow the walker with that port, and lib/gait.test.ts pins its values. The hash h arrives as an
// attribute (gaitSeed in gait.ts).
//
// With the daily routine on (?routine=1) the person's day arrives as two vec4 attributes (planAttributes in
// lib/routine.ts) and the sun hour as a uniform. The day picks a style: 0 as before, 1 asleep (still), 2 playing
// (a wide loop), 3 working at the end of a trip (a small, slow loop, offset to the destination); on the out
// and back legs of a trip the person walks a straight road at WALK_MS (`transit`).
const gait = /* glsl */ `
  float h = instanceGait;
  float style = 0.0;
  bool transit = false;
  bool outward = true;
  float legSec = 0.0;
  float tripDist = instanceTrip.x;
  vec2 heading = vec2(cos(instanceTrip.y), sin(instanceTrip.y));
  vec2 base = vec2(0.0);
  if (peopleAnim.routine > 0.5) {
    float lh = mod(peopleAnim.sunUtc + instanceTrip.w, 24.0);
    float u = lh < instanceDay.x ? lh + 24.0 : lh;
    float tt = tripDist / (${WALK_MS.toFixed(1)} * 3600.0);
    bool asleep = u >= instanceDay.y;
    bool away = !asleep && u >= instanceDay.z && u < instanceDay.w;
    if (asleep) {
      style = 1.0;
    } else if (away && tripDist > 0.0) {
      if (u < instanceDay.z + tt) {
        transit = true;
        legSec = (u - instanceDay.z) * 3600.0;
      } else if (u >= instanceDay.w - tt) {
        transit = true;
        outward = false;
        legSec = (u - (instanceDay.w - tt)) * 3600.0;
      } else {
        style = 3.0;
        base = heading * tripDist;
      }
    } else if (away && instanceTrip.z > 0.5) {
      style = 2.0;
    }
  }
  // About three in ten are on the move a lot (a loop of up to ~25 m at 0.8-1.4 m/s); the rest
  // stand or sit at their spot and now and then take a few steps within a couple of metres.
  float walker = (style > 1.5 || (h >= 0.7 && style < 0.5)) ? 1.0 : 0.0;
  float reach = mix(1.0 + 1.5 * fract(h * 7.0), 8.0 + 16.0 * fract(h * 7.0), walker);
  float speed = mix(0.6, 0.8 + 0.6 * fract(h * 13.0), walker);
  if (style > 2.5) {
    reach = 4.0 + 8.0 * fract(h * 7.0);
    speed = 0.5 + 0.4 * fract(h * 13.0);
  }
  float w = speed / reach;
  float period = 25.0 + 70.0 * fract(h * 17.0);
  float walkFrac = (style > 0.5 && style < 1.5) ? 0.0 : mix(0.1, 0.5 + 0.35 * fract(h * 19.0), walker);
  // Walked time: the clock runs only while walking, so the path is continuous through stops.
  float t = peopleAnim.time + h * 977.0;
  float cyc = floor(t / period);
  float within = t - cyc * period;
  float walkT = walkFrac * period;
  float s = cyc * walkT + min(within, walkT);
  bool moving = within < walkT;
  if (transit) {
    speed = ${WALK_MS.toFixed(1)};
    s = legSec;
    moving = true;
  }
  float stepT = 0.7 / speed; // a ~0.7 m step
  float n = floor(s / stepT);
  float phase = fract(s / stepT);
  float k = instancePrint;
  float sk = moving ? (n - k + 0.5) * stepT : s;
  float a1 = sk * w + h * 6.2832;
  float a2 = sk * w * 0.8 + h * 3.7;
  vec2 m = base + reach * vec2(sin(a1), cos(a2));
  vec2 dir = normalize(vec2(cos(a1), -0.8 * sin(a2)) + 1e-4);
  if (transit) {
    float along = (n - k + 0.5) * 0.7;
    along = clamp(outward ? along : tripDist - along, 0.0, tripDist);
    m = heading * along;
    dir = outward ? heading : -heading;
  }
  float side = mod(n - k, 2.0) < 0.5 ? 1.0 : -1.0;
  vFoot = side;
  vShoe = instanceShoe;
  vFigure = peopleAnim.figures > 0.5 && k < 0.5 ? 1.0 : 0.0;
  vPose = style > 0.5 && style < 1.5 ? 2.0 : (!moving && !transit ? 1.0 : 0.0);
  vSwing = moving ? sin(phase * 3.14159) * side : 0.0;
  vEquipment = (transit || style > 2.5) ? instanceEquipment : 0.0;
  vPrintAlpha = moving
    ? (k < 0.5 ? smoothstep(0.0, 0.2, phase) : k < 1.5 ? mix(1.0, 0.55, phase) : mix(0.55, 0.0, phase))
    : (k < 1.5 ? 1.0 : 0.0);
`;

// The four kinds of print (lib/footwear.ts FOOT): 0 bare foot with toes, 1 hide wrap (one soft
// oval), 2 sandal (a flat squared sole), 3 stitched shoe (sole and a separate heel block).
// A silhouette in the upright quad: head, trunk, arms, legs, and the trip's tool or load.
const figureShape = /* glsl */ `
float segment(vec2 p, vec2 a, vec2 b, float r) {
  vec2 d = b - a;
  return length(p - a - d * clamp(dot(p-a,d)/dot(d,d),0.0,1.0)) - r;
}
float figure(vec2 p) {
  if (vPose > 1.5) p = vec2(p.y, -p.x);
  float hip = vPose > 0.5 && vPose < 1.5 ? -0.25 : -0.12;
  float d = length(p - vec2(0.0,0.64)) - 0.16;
  d = min(d, segment(p,vec2(0.0,0.4),vec2(0.0,hip),0.13));
  float stride = vSwing * 0.17;
  if (vPose > 0.5 && vPose < 1.5) {
    d = min(d,segment(p,vec2(0.0,hip),vec2(0.35,-0.3),0.075));
    d = min(d,segment(p,vec2(0.35,-0.3),vec2(0.4,-0.72),0.065));
    d = min(d,segment(p,vec2(-0.06,hip),vec2(-0.38,-0.64),0.065));
  } else {
    d = min(d,segment(p,vec2(-0.06,hip),vec2(-0.19-stride,-0.8),0.065));
    d = min(d,segment(p,vec2(0.06,hip),vec2(0.19+stride,-0.8),0.065));
  }
  d = min(d,segment(p,vec2(-0.09,0.32),vec2(-0.29+stride,-0.18),0.06));
  d = min(d,segment(p,vec2(0.09,0.32),vec2(0.29-stride,-0.18),0.06));
  if (vEquipment > 1.5) d = min(d,length((p-vec2(-0.28,0.13))/vec2(0.19,0.26))-1.0);
  else if (vEquipment > 0.5) d = min(d,segment(p,vec2(0.34,-0.76),vec2(0.34,0.65),0.025));
  return d;
}
`;

const shapeFootprint = /* glsl */ `
  // The quad is turned to the walking direction: +y is toe, x is across the foot (outer side +).
  vec2 f = vec2(geometry.uv.x * vFoot, geometry.uv.y);
  float d;
  if (vShoe < 0.5) {
    float sole = length((f - vec2(-0.04, 0.12)) / vec2(0.3, 0.46));
    float heel = length((f - vec2(0.02, -0.58)) / vec2(0.24, 0.3));
    float toes = min(
      min(length((f - vec2(-0.2, 0.74)) / 0.15), length((f - vec2(0.0, 0.76)) / 0.12)),
      min(length((f - vec2(0.15, 0.7)) / 0.1), length((f - vec2(0.27, 0.6)) / 0.09))
    );
    d = min(min(sole, heel), toes);
  } else if (vShoe < 1.5) {
    d = length((f - vec2(-0.02, 0.0)) / vec2(0.4, 0.92));
  } else if (vShoe < 2.5) {
    vec2 q = abs((f - vec2(-0.02, 0.0)) / vec2(0.34, 0.88));
    d = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
    // the toe strap shows as a thin gap
    if (abs(f.y - 0.5) < 0.05) d = 1.1;
  } else {
    float sole = length((f - vec2(-0.03, 0.25)) / vec2(0.36, 0.62));
    vec2 hq = abs((f - vec2(0.0, -0.68)) / vec2(0.28, 0.2));
    float heel = max(hq.x, hq.y);
    d = min(sole, heel);
  }
  if (vFigure > 0.5) {
    if (figure(geometry.uv) > 0.0) discard;
  } else if (picking.isActive < 0.5) {
    if (d > 1.0 || vPrintAlpha <= 0.01) discard;
    color.a *= vPrintAlpha * (1.0 - smoothstep(0.82, 1.0, d) * 0.6);
  }
`;

/** Extra props: the daily routine (lib/routine.ts), off unless `routine` is set. Build them with `routineProps`. */
type RoutineProps = {
  routine?: boolean;
  figures?: boolean;
  getEquipment?: (p: unknown) => number;
  getDay?: (p: unknown) => [number, number, number, number];
  getTrip?: (p: unknown) => [number, number, number, number];
};
type Props = ScatterplotLayerProps<unknown> & RoutineProps;
const as = (p: unknown) => p as Person;

/** The props that turn the daily routine on for a PeopleLayer, for the plans of hour `epoch` (`epochHour`);
 * `null` leaves the layer as it was. Plans are cached on the person, so the three prints share one. */
export function routineProps(epoch: number | null): RoutineProps & { updateTriggers?: Record<string, unknown> } {
  if (epoch === null) return {};
  return {
    routine: true,
    getDay: (p) => planAttributes(planOf(as(p), epoch)).day,
    getTrip: (p) => planAttributes(planOf(as(p), epoch)).trip,
    getEquipment: (p: unknown) => {
      const away = planOf(as(p), epoch).away;
      if (away?.kind !== 'trip') return 0;
      return ['gathering', 'fetching water and wood'].includes(away.trip) ? 2 : away.trip === 'visiting another camp' ? 0 : 1;
    },
    updateTriggers: { getDay: epoch, getTrip: epoch, getEquipment: epoch },
  };
}

export class PeopleLayer extends ScatterplotLayer<unknown, RoutineProps> {
  static layerName = 'PeopleLayer';
  static defaultProps: DefaultProps<Props> = {
    ...ScatterplotLayer.defaultProps,
    radiusUnits: 'pixels',
    billboard: false,
    stroked: false,
    antialiasing: false,
    getPosition: (p: unknown) => as(p).position,
    getRadius: (p: unknown) => as(p).radius,
    getFillColor: (p: unknown) => as(p).color,
    // Which of the person's prints an entry is (footprintData lays them out person-major).
    // The prints sit at sea-level height; the close-up 3D ground is raised above that, so draw
    // them over it rather than under (they can show through a hill in a tilted view).
    parameters: { depthCompare: 'always', depthWriteEnabled: false },
    getShoe: { type: 'accessor', value: (p: unknown) => as(p).footwear },
    getPrint: { type: 'accessor', value: (_: unknown, { index }: { index: number }) => index % PRINTS },
    getGait: { type: 'accessor', value: (p: unknown) => as(p).gait },
    getDay: { type: 'accessor', value: [0, 0, 0, 0] },
    getTrip: { type: 'accessor', value: [0, 0, 0, 0] },
    routine: false,
    figures: false,
    getHeight: { type: 'accessor', value: (p: unknown) => as(p).age < 13 ? 0.6 : 1 },
    getEquipment: { type: 'accessor', value: 0 },
    pickable: true,
  } as DefaultProps<Props>;

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceHeight: { size: 1, accessor: 'getHeight', defaultValue: 1 },
      instanceEquipment: { size: 1, accessor: 'getEquipment', defaultValue: 0 },
      instancePrint: {
        size: 1,
        accessor: 'getPrint',
        defaultValue: 0,
      },
      instanceShoe: { size: 1, accessor: 'getShoe', defaultValue: 0 },
      instanceGait: { size: 1, accessor: 'getGait', defaultValue: 0 },
      instanceDay: { size: 4, accessor: 'getDay', defaultValue: [0, 0, 0, 0] },
      instanceTrip: { size: 4, accessor: 'getTrip', defaultValue: [0, 0, 0, 0] },
    });
  }

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, peopleAnim],
      inject: {
        ...shaders.inject,
        'vs:#decl': 'in float instanceHeight;\nin float instanceEquipment;\nout float vFigure;\nout float vPose;\nout float vSwing;\nout float vEquipment;\nin float instancePrint;\nin float instanceShoe;\nin float instanceGait;\nin vec4 instanceDay;\nin vec4 instanceTrip;\nout float vFoot;\nout float vPrintAlpha;\nout float vShoe;',
        // Lying on the ground: turn the quad to the walking direction, set the foot a little to
        // its side of the path, and move it along the path in metres.
        'vs:DECKGL_FILTER_SIZE': `${gait}
  vec2 across = vec2(dir.y, -dir.x);
  vec2 q = size.xy;
  float r = max(abs(q.x), abs(q.y)); // corners sit at (±r, ±r)
  size.xy = across * q.x + dir * q.y + across * side * r * 0.62;
  if (peopleAnim.figures > 0.5 && vFigure < 0.5) size.xy *= 0.3;
  if (vFigure > 0.5) {
    // The projection's screen-x row gives a horizontal camera-facing axis even after rotation.
    vec2 right = normalize(vec2(project.viewProjectionMatrix[0][0], project.viewProjectionMatrix[1][0]));
    float scale = instanceHeight * (vPose > 0.5 && vPose < 1.5 ? 0.65 : 1.0);
    size.xy = right * q.x * scale;
    size.z = (q.y + r) * scale;
    if (vPose > 1.5) { size.xy = right * q.x + dir * q.y * 0.4; size.z = r * 0.12; }
  }
  size.xy += project_size(m);
`,
        'fs:#decl': 'in float vFigure;\nin float vPose;\nin float vSwing;\nin float vEquipment;\nin float vFoot;\nin float vPrintAlpha;\nin float vShoe;\n' + figureShape,
        'fs:DECKGL_FILTER_COLOR': shapeFootprint,
      },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      peopleAnim: { time: animClock(), sunUtc: (solarNowMs() / 3_600_000) % 24, routine: this.props.routine ? 1 : 0, figures: this.props.figures ? 1 : 0 },
    });
    super.draw(params);
  }
}
