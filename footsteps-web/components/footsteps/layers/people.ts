// Individual people, imagined from head counts. At street-level zoom each band
// or village in view becomes its people: how many comes from HYDE; age, sex
// and role are drawn from a modelled age structure for the group's way of life
// (lib/demography.ts, research 0006); where they stand in camp is illustrative. Generation is deterministic per group, so the same
// people appear every time you look at the same place.
import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import { BAND_SIZE, CAMP_SIZE, MIN_GROUP_PEOPLE, UnitKind, VILLAGE_SIZE, WAY_OF_KIND } from './units';
import { LOOKS } from '@/lib/waysOfLife';
import { AGE_LABEL, AGE_STRUCTURE_NAME, ageDraws, ageStructureFor, sampleLivingAge, type AgeStructureId } from '@/lib/demography';
import { FOOTWEAR, footwearFor } from '@/lib/footwear';
import { animClock, gaitSeed } from '@/lib/gait';
import { ROUTINE_NOTE, WALK_MS, planAttributes, planOf, routineLine, routineNow } from '@/lib/routine';
import { solarNowMs } from '@/lib/solarClock';
import { sunShadowNow } from '@/lib/sunShadow';
import { HOUSEHOLD_RADIUS_M, HOUSEHOLD_SPACING_M, ROUND_THE_HEARTH_M, hearthOf, householdsOf, type Household } from './households';
import { OTHER_HUMANS, type OtherHuman } from '@/lib/otherHumans';
import type { IconName } from '@/lib/icons';

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
  if (kind === UnitKind.Glow || people <= 0) return 0;
  return Math.min(MAX_PER_GROUP, Math.round(nominalPeople(kind, people)));
}

/** A unit's head count can be under MIN_GROUP_PEOPLE: a thin cell holds one whole group with probability people ÷ group
 * size (units.ts), so the expected head count stays right while the group itself is whole. Close in it is drawn as a
 * typical group of its kind (band 30, camp 60, village 300), its members and its dwellings alike, so a deep-time band
 * does not vanish when its fire hands over to its people. */
export function nominalPeople(kind: number, people: number): number {
  if (people >= MIN_GROUP_PEOPLE) return people;
  return kind === UnitKind.Village ? VILLAGE_SIZE : kind === UnitKind.Camp ? CAMP_SIZE : BAND_SIZE;
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
      // In a camp a family is round its hearth in front of its shelter (households.ts `hearthOf`); in a village, round its house.
      const camp = g.kind !== UnitKind.Village;
      const d = Math.sqrt(r()) * (camp ? ROUND_THE_HEARTH_M : HOUSEHOLD_RADIUS_M);
      const [cx, cy] = camp ? hearthOf(home!, groupSeed(g.lon, g.lat)) : [home!.x, home!.y];
      x = cx + Math.cos(a) * d;
      y = cy + Math.sin(a) * d;
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
    p.age < 2
      ? p.female
        ? 'A baby girl'
        : 'A baby boy'
      : p.age < 13
        ? p.female
          ? 'A girl'
          : 'A boy'
        : p.female
          ? 'A woman'
          : 'A man';
  // "about 0" reads oddly: a baby's age is said in words.
  const ageWords = p.age < 1 ? 'under a year old' : p.age < 2 ? 'about a year old' : `about ${p.age}`;
  const group = LOOKS[WAY_OF_KIND[p.groupKind as keyof typeof WAY_OF_KIND]].mark;
  const ageNote = ` Age drawn from the ${AGE_STRUCTURE_NAME[p.ageStructure]}. ${AGE_LABEL}.`;
  if (p.kindOfHuman) {
    const kind = OTHER_HUMANS.find((h) => h.id === p.kindOfHuman)!;
    const noun = who.replace(/^A (baby )?/, '').toLowerCase();
    const title = kind.adjective ? `A ${kind.adjective} ${noun}` : `A ${noun} of ${kind.name}`;
    return {
      title: `${title}, ${ageWords}`,
      detail: `${p.role[0].toUpperCase()}${p.role.slice(1)} in a band of about ${Math.round(p.groupPeople)} ${kind.name}: another kind of human, not Homo sapiens. The band, its size and its place are guesses. Footprints: ${FOOTWEAR[p.footwear] ?? 'barefoot'} (imagined from era and climate).${ageNote}${now}`,
    };
  }
  return {
    title: `${who}, ${ageWords}`,
    detail: `${p.role[0].toUpperCase()}${p.role.slice(1)} in a ${group} of about ${Math.round(p.groupPeople).toLocaleString()} people. Footprints: ${FOOTWEAR[p.footwear] ?? 'barefoot'} (imagined from era and climate).${ageNote}${now}`,
  };
}

/** One short fact on the person card: an icon and a word or two. */
export type CardFact = { icon: IconName; text: string; label: string };

/** The card's picture-first summary: a title, a few icon facts, and the caveats that sit behind its ⓘ. */
export type PersonCard = { title: string; detail: string; facts: CardFact[]; notes: string[] };

/** An icon per role (roles are drawn in `role()` above). */
const ROLE_ICON: Record<string, IconName> = {
  forager: 'gatherer',
  gatherer: 'gatherer',
  hunter: 'hunter',
  toolmaker: 'toolmaker',
  'fire-keeper': 'fire-keeper',
  fisher: 'fisher',
  herder: 'herder',
  shepherd: 'shepherd',
  milker: 'milker',
  weaver: 'weaver',
  tanner: 'tanner',
  farmer: 'farmer',
  potter: 'potter',
  builder: 'builder',
  'young child': 'young-child',
  child: 'child',
  elder: 'elder',
};
const DEFAULT_ROLE_ICON: IconName = 'person';

/** An icon per kind of group, by its mark's name (lib/waysOfLife.ts `LOOKS`). */
const GROUP_ICON: Record<string, IconName> = { band: 'band', camp: 'tent', village: 'village', glow: 'town' };
const GROUP_WORD: Record<string, string> = { band: 'Band', camp: 'Camp', village: 'Village', glow: 'Town' };

/** An icon per footwear, in lib/footwear.ts `FOOTWEAR` order. */
const FOOTWEAR_ICON: IconName[] = ['barefoot', 'wraps', 'sandals', 'shoes'];

const OTHER_HUMAN_ICON: IconName = 'other-human';
const NOW_ICON: IconName = 'now';
const FOOTWEAR_NOTE = 'Footwear: imagined from era and climate.';
export const FIGURE_NOTE = 'The figure is an imagined illustration, not a likeness.';

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The person card as icons and short labels; every caveat goes in `notes`, shown only behind the ⓘ. */
export function personCard(p: Person, routineMs?: number): PersonCard {
  const { title, detail } = describePerson(p, routineMs);
  const mark = LOOKS[WAY_OF_KIND[p.groupKind as keyof typeof WAY_OF_KIND]].mark;
  const shoes = FOOTWEAR[p.footwear] ?? 'barefoot';
  const people = Math.round(p.groupPeople).toLocaleString();
  const kind = p.kindOfHuman ? OTHER_HUMANS.find((h) => h.id === p.kindOfHuman) : undefined;
  const facts: CardFact[] = [
    { icon: ROLE_ICON[p.role] ?? DEFAULT_ROLE_ICON, text: capitalise(p.role), label: 'Role' },
    ...(kind ? [{ icon: OTHER_HUMAN_ICON, text: kind.name, label: 'Kind of human' }] : []),
    { icon: GROUP_ICON[mark] ?? GROUP_ICON.band, text: `${kind ? 'Band' : (GROUP_WORD[mark] ?? 'Group')} of ${people}`, label: 'Group' },
    { icon: FOOTWEAR_ICON[p.footwear] ?? FOOTWEAR_ICON[0], text: capitalise(shoes), label: 'Footwear' },
  ];
  if (routineMs !== undefined) facts.push({ icon: NOW_ICON, text: capitalise(routineNow(p, routineMs)), label: 'Now' });
  const notes = [
    ...(kind ? [`${kind.name}: another kind of human, not Homo sapiens. The band, its size and its place are guesses.`] : []),
    `Age drawn from the ${AGE_STRUCTURE_NAME[p.ageStructure]}. ${AGE_LABEL}.`,
    FOOTWEAR_NOTE,
    ...(routineMs !== undefined ? [ROUTINE_NOTE] : []),
  ];
  return { title, detail, facts, notes };
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

const PEOPLE_ANIM_BLOCK = /* glsl */ `uniform peopleAnimUniforms {
  float time;
  float sunUtc;
  float routine;
  float figures;
  float topdown;
  vec2 shadowDir;
  float shadow;
} peopleAnim;
`;
const peopleAnim = {
  name: 'peopleAnim',
  vs: PEOPLE_ANIM_BLOCK,
  fs: PEOPLE_ANIM_BLOCK,
  uniformTypes: { time: 'f32', sunUtc: 'f32', routine: 'f32', figures: 'f32', topdown: 'f32', shadowDir: 'vec2<f32>', shadow: 'f32' },
} as const;

// --- Close in: each person seen from above (`topdown`, from FIGURE_ZOOM) -----------------------------------------------------------
// From about zoom 17 a person's newest footprint becomes the person, seen from straight above as the camera sees them: head and hair,
// shoulders in their clothes, arms swinging and feet stepping as they walk, knees up when they sit, lying down asleep, and their shadow
// on the ground from the sun clock (lib/sunShadow.ts). Real size (shoulders about half a metre across) once that is a few pixels wide;
// enlarged to FIGURE_MIN_PX until then. The two older prints fade out. All imagined: the look is a drawing, not a record of anyone.

/** Zoom over which the footprints hand over to the people seen from above. */
export const FIGURE_ZOOM = { from: 16.8, full: 17.8 } as const;
/** 0 below FIGURE_ZOOM, 1 above, smoothly. */
export function figureBlend(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - FIGURE_ZOOM.from) / (FIGURE_ZOOM.full - FIGURE_ZOOM.from)));
  return t * t * (3 - 2 * t);
}
/** An adult's shoulders are never drawn narrower than this many pixels. */
const FIGURE_MIN_PX = 7;
/** An adult's shoulder width and standing height, metres. */
const SHOULDERS_M = 0.48;
const STANDING_M = 1.65;
/** Clothes seen from above: hides and leather, undyed plant fibre and wool, ochre-dyed (imagined palette). */
const CLOTHES_GLSL = `
vec3 topClothes(float h) {
  float i = floor(fract(h * 5.3) * 5.0);
  return i < 0.5 ? vec3(0.42, 0.29, 0.19) : i < 1.5 ? vec3(0.55, 0.41, 0.27) : i < 2.5 ? vec3(0.33, 0.25, 0.18)
    : i < 3.5 ? vec3(0.64, 0.58, 0.46) : vec3(0.58, 0.33, 0.2);
}`;

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
  if (vTop > 0.5) {
    // Seen from above (see FIGURE_ZOOM): x across the body, y the way they face, in an adult's metres.
    vec2 p = vTopPos;
    vec3 cloth = topClothes(vTopSeed);
    vec3 hair = mix(vec3(0.06, 0.045, 0.035), vec3(0.24, 0.16, 0.1), fract(vTopSeed * 7.7));
    vec3 skin = vec3(0.56, 0.39, 0.28) * (0.75 + 0.4 * fract(vTopSeed * 13.1));
    vec3 c = vec3(0.02, 0.03, 0.02);
    // The shadow: a soft capsule from the feet along the sun's shadow vector.
    vec2 e = vTopCast;
    float st = dot(e, e) > 1e-6 ? clamp(dot(p, e) / dot(e, e), 0.0, 1.0) : 0.0;
    float a = (1.0 - smoothstep(0.12, 0.24, length(p - e * st))) * 0.42 * peopleAnim.shadow;
    float sw = vSwing;
    // Painted back to front: limbs, body, head. el(): inside an ellipse at o with half-axes r.
    #define EL(o, r) (length((p - (o)) / (r)) < 1.0)
    if (vPose > 1.5) {
      // Asleep: lying along the way they faced, under a hide.
      if (EL(vec2(0.0, -0.12), vec2(0.22, 0.62))) { c = cloth * 0.9; a = 1.0; }
      if (EL(vec2(0.0, 0.56), vec2(0.1, 0.11))) { c = hair; a = 1.0; }
    } else if (vPose > 0.5) {
      // Sitting: knees up in front, shoulders, head bent forward a little.
      if (EL(vec2(-0.09, 0.22), vec2(0.065, 0.17)) || EL(vec2(0.09, 0.22), vec2(0.065, 0.17))) { c = cloth * 0.8; a = 1.0; }
      if (EL(vec2(-0.25, 0.08), vec2(0.055, 0.1)) || EL(vec2(0.25, 0.08), vec2(0.055, 0.1))) { c = skin; a = 1.0; }
      if (EL(vec2(0.0, -0.04), vec2(0.23, 0.14))) { c = cloth; a = 1.0; }
      if (EL(vec2(0.0, 0.02), vec2(0.1, 0.11))) { c = hair; a = 1.0; }
    } else {
      // Standing or walking: a foot steps out front and back, the arms swing the other way.
      if (abs(sw) > 0.01 && (EL(vec2(-0.09, 0.26 * sw), vec2(0.045, 0.085)) || EL(vec2(0.09, -0.26 * sw), vec2(0.045, 0.085)))) { c = vec3(0.2, 0.15, 0.11); a = 1.0; }
      if (EL(vec2(-0.26, -0.12 * sw), vec2(0.055, 0.09)) || EL(vec2(0.26, 0.12 * sw), vec2(0.055, 0.09))) { c = skin; a = 1.0; }
      if (EL(vec2(0.0, 0.0), vec2(0.23, 0.12))) { c = cloth; a = 1.0; }
      if (EL(vec2(0.0, 0.015), vec2(0.1, 0.11))) { c = hair; a = 1.0; }
    }
    #undef EL
    // Light from the upper left, the way the trees are lit.
    if (a > 0.99) c *= 1.0 + 0.25 * clamp(dot(p, vec2(-0.6, 0.6)) * 3.0, -1.0, 1.0);
    if (a < 0.01) discard;
    color = vec4(c, a * color.a * peopleAnim.topdown);
  } else if (vFigure > 0.5) {
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
  /** 0 to 1: how far the people seen from above have taken over from the footprints (`figureBlend`). */
  topdown?: number;
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
    topdown: 0,
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
        'vs:#decl': 'out float vTop;\nout vec2 vTopPos;\nout vec2 vTopCast;\nout float vTopSeed;\nin float instanceHeight;\nin float instanceEquipment;\nout float vFigure;\nout float vPose;\nout float vSwing;\nout float vEquipment;\nin float instancePrint;\nin float instanceShoe;\nin float instanceGait;\nin vec4 instanceDay;\nin vec4 instanceTrip;\nout float vFoot;\nout float vPrintAlpha;\nout float vShoe;',
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
  vTop = 0.0;
  if (peopleAnim.topdown > 0.0) {
    if (k < 0.5) {
      // The person from above, in a quad on the ground that also holds their shadow (both just inside scatterplot's unit circle).
      vTop = 1.0;
      float mC = project_size(1.0);
      float grow = max(1.0, ${FIGURE_MIN_PX.toFixed(1)} * project_pixel_size(1.0) / (${SHOULDERS_M.toFixed(2)} * mC));
      vec2 castM = peopleAnim.shadowDir * ${STANDING_M.toFixed(2)} * instanceHeight * (vPose > 1.5 ? 0.15 : vPose > 0.5 ? 0.55 : 1.0);
      float reachM = 0.95 * instanceHeight + 0.5 * length(castM);
      vec2 local = geometry.uv * reachM + 0.5 * castM;
      size.xy = local * grow * mC;
      size.z = 0.0;
      vec2 side_ = vec2(dir.y, -dir.x);
      vTopPos = vec2(dot(local, side_), dot(local, dir)) / instanceHeight;
      vTopCast = vec2(dot(castM, side_), dot(castM, dir)) / instanceHeight;
      vTopSeed = h;
    } else {
      vPrintAlpha *= 1.0 - peopleAnim.topdown;
    }
  }
  size.xy += project_size(m);
`,
        'fs:#decl': 'in float vTop;\nin vec2 vTopPos;\nin vec2 vTopCast;\nin float vTopSeed;\n' + CLOTHES_GLSL + 'in float vFigure;\nin float vPose;\nin float vSwing;\nin float vEquipment;\nin float vFoot;\nin float vPrintAlpha;\nin float vShoe;\n' + figureShape,
        'fs:DECKGL_FILTER_COLOR': shapeFootprint,
      },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    const topdown = this.props.topdown ?? 0;
    const { longitude, latitude } = this.context.viewport as unknown as { longitude: number; latitude: number };
    const sun = topdown > 0 ? sunShadowNow(longitude, latitude) : null;
    this.state.model?.shaderInputs.setProps({
      peopleAnim: {
        time: animClock(), sunUtc: (solarNowMs() / 3_600_000) % 24, routine: this.props.routine ? 1 : 0, figures: this.props.figures ? 1 : 0,
        topdown, shadowDir: sun ? [sun.east, sun.north] : [0, 0], shadow: sun?.strength ?? 0,
      },
    });
    super.draw(params);
  }
}
