// Individual people, imagined from head counts. At street-level zoom each band
// or village in view becomes its people: how many comes from HYDE; age, sex
// and role are drawn from a typical pre-modern population; where they stand in
// camp is illustrative. Generation is deterministic per group, so the same
// people appear every time you look at the same place.
import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import { MIN_GROUP_PEOPLE, UnitKind, WAY_OF_KIND } from './units';
import { LOOKS } from '@/lib/waysOfLife';

export type Person = {
  id: number;
  position: [number, number];
  age: number;
  female: boolean;
  role: string;
  groupKind: number; // UnitKind.Band | Village | Camp
  groupPeople: number;
  color: [number, number, number, number];
  radius: number; // metres
};

export type GroupInView = {
  lon: number;
  lat: number;
  kind: number;
  people: number;
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

// Rough pre-modern age structure (high birth and death rates).
const AGE_BANDS: [number, number, number][] = [
  [0, 5, 0.15],
  [5, 15, 0.25],
  [15, 30, 0.27],
  [30, 45, 0.18],
  [45, 60, 0.1],
  [60, 80, 0.05],
];
function sampleAge(r: () => number) {
  let u = r();
  for (const [lo, hi, p] of AGE_BANDS) {
    if (u < p) return Math.floor(lo + r() * (hi - lo));
    u -= p;
  }
  return 30;
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

function role(age: number, kind: number, r: () => number) {
  if (age < 5) return 'young child';
  if (age < 13) return 'child';
  if (age >= 55) return 'elder';
  const roles =
    kind === UnitKind.Band ? BAND_ROLES : kind === UnitKind.Camp ? CAMP_ROLES : VILLAGE_ROLES;
  return roles[Math.floor(r() * roles.length)];
}

const groupSeed = (lon: number, lat: number) =>
  (Math.round(lon * 1e4) * 73856093) ^ (Math.round(lat * 1e4) * 19349663);

export function peopleForGroups(groups: GroupInView[]): Person[] {
  const out: Person[] = [];
  let id = 0;
  for (const g of groups) {
    if (g.kind === UnitKind.Glow) continue;
    if (g.people < MIN_GROUP_PEOPLE) continue;
    const r = rng(groupSeed(g.lon, g.lat));
    const n = Math.min(MAX_PER_GROUP, Math.round(g.people));
    // camp/village spread in metres → degrees (longitude scaled by latitude)
    const spread = g.kind === UnitKind.Village ? 520 : 260; // camps are as tight as bands
    const mPerDegLat = 111_320;
    const mPerDegLon = mPerDegLat * Math.max(0.2, Math.cos((g.lat * Math.PI) / 180));
    for (let i = 0; i < n; i++) {
      if (out.length >= MAX_PEOPLE) return out;
      // clustered around a few hearths/houses
      const hearth = Math.floor(r() * (g.kind === UnitKind.Village ? 10 : 4));
      const hr = rng(groupSeed(g.lon, g.lat) + hearth * 7919);
      const hx = (hr() - 0.5) * spread * 1.2;
      const hy = (hr() - 0.5) * spread * 1.2;
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * spread * 0.35;
      const x = hx + Math.cos(a) * d;
      const y = hy + Math.sin(a) * d;
      const sampledAge = sampleAge(r);
      // Put an adult first, including when the view's total cap truncates a group.
      const age =
        i === 0 && sampledAge < 18 ? 18 + Math.floor(r() * 37) : sampledAge;
      const female = r() < 0.5;
      const child = age < 13;
      const elder = age >= 55;
      out.push({
        id: id++,
        position: [g.lon + x / mPerDegLon, g.lat + y / mPerDegLat],
        age,
        female,
        role: role(age, g.kind, r),
        groupKind: g.kind,
        groupPeople: g.people,
        color: child ? [255, 244, 222, 235] : elder ? [222, 214, 200, 235] : [255, 226, 170, 245],
        radius: child ? 4.5 : 6.5,
      });
    }
  }
  return out;
}

export function describePerson(p: Person) {
  const who =
    p.age < 13
      ? p.female
        ? 'A girl'
        : 'A boy'
      : p.female
        ? 'A woman'
        : 'A man';
  const group = LOOKS[WAY_OF_KIND[p.groupKind as keyof typeof WAY_OF_KIND]].mark;
  return {
    title: `${who}, about ${p.age}`,
    detail: `${p.role[0].toUpperCase()}${p.role.slice(1)} in a ${group} of about ${Math.round(p.groupPeople).toLocaleString()} people.`,
  };
}

// --- layer: people wander a little around where they stand (GPU) ---

const peopleAnim = {
  name: 'peopleAnim',
  vs: /* glsl */ `uniform peopleAnimUniforms {
  float time;
} peopleAnim;
`,
  uniformTypes: { time: 'f32' },
} as const;

const wander = /* glsl */ `
  float h = fract(sin(dot(geometry.worldPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = peopleAnim.time;
  // metres: a slow stroll around their spot, a few people further out
  float reach = 6.0 + 20.0 * step(0.85, h);
  vec2 m = reach * vec2(
    sin(t * (0.25 + 0.3 * h) + h * 6.2832) + 0.3 * sin(t * 1.7 + h * 21.0),
    cos(t * (0.2 + 0.25 * h) + h * 3.7) + 0.3 * cos(t * 1.3 + h * 13.0)
  );
  vec2 px = vec2(
    project_size_to_pixel(m.x, scatterplot.radiusUnits),
    project_size_to_pixel(m.y, scatterplot.radiusUnits)
  );
  position.xy += project_pixel_size_to_clipspace(px) * position.w;
`;

type Props = ScatterplotLayerProps<unknown>;
const as = (p: unknown) => p as Person;

export class PeopleLayer extends ScatterplotLayer<unknown> {
  static layerName = 'PeopleLayer';
  static defaultProps: DefaultProps<Props> = {
    ...ScatterplotLayer.defaultProps,
    radiusUnits: 'meters',
    radiusMinPixels: 4,
    radiusMaxPixels: 9,
    stroked: true,
    lineWidthMinPixels: 1,
    getLineColor: [20, 14, 8, 200],
    getPosition: (p: unknown) => as(p).position,
    getRadius: (p: unknown) => as(p).radius,
    getFillColor: (p: unknown) => as(p).color,
    pickable: true,
  } as DefaultProps<Props>;

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, peopleAnim],
      inject: { ...shaders.inject, 'vs:DECKGL_FILTER_GL_POSITION': wander },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      peopleAnim: { time: (performance.now() / 1000) % 1000 },
    });
    super.draw(params);
  }
}
