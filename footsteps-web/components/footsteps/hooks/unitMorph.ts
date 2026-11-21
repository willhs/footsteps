import { UnitKind, WAY_OF_KIND, type Units } from '../layers/units';
import { LOOKS } from '@/lib/waysOfLife';
import type { PointBuffers } from './gridData';
import { NO_SOCIETY } from '@/lib/dwellings';

// Alpha at full brightness. Zoom dims bands and villages with a uniform
// (`brightness`), so changing zoom never rebuilds or re-uploads marks.
export const BAND_ALPHA = 200;
export const VILLAGE_ALPHA = 150;
export const CAMP_ALPHA = 180;

export type MorphPoints = PointBuffers & {
  attributes: PointBuffers['attributes'] & {
    getTargetRadius: { value: Float32Array; size: 1 };
    getTargetFillColor: { value: Uint8ClampedArray; size: 4 };
    getMobility: { value: Float32Array; size: 2 };
  };
  /** CPU-only endpoint populations; zero means absent at that endpoint. */
  info: { kind: Uint8Array; people: Float32Array; fromPeople: Float32Array; society: Uint16Array };
};
export function isMorphPoints(
  points: PointBuffers | MorphPoints,
): points is MorphPoints {
  return 'getTargetRadius' in points.attributes;
}

/** A group's footprint radius in metres at its typical size, about where its people stand at street zoom
 * (people.ts: a village's houses spread ~520 m, a band's or camp's hearths ~260 m). The mark's radius is this
 * times sqrt(people / typical), so the shader reads a group's head count back from its radius
 * (unitMorphVertex.ts, `GROUP_GLSL`). */
export const FOOTPRINT_M = { band: 250, village: 500, camp: 250 } as const;
export const TYPICAL_PEOPLE = { band: 30, village: 300, camp: 60 } as const;
/** Towns and cities: the built-up area at about 15,000 people per km² (a pre-industrial city; Rome within the Aurelian
 * walls was denser, a market town sparser). The shader draws a glow well beyond it so a town still reads from afar. */
export const CITY_PEOPLE_PER_M2 = 0.015;
export const cityRadiusM = (people: number) => Math.sqrt(Math.max(0, people) / (Math.PI * CITY_PEOPLE_PER_M2));

function radius(kind: number, people: number, settlements: boolean) {
  if (kind === UnitKind.Glow) return cityRadiusM(people);
  const key = kind === UnitKind.Band ? 'band' : kind === UnitKind.Camp ? 'camp' : 'village';
  const base = FOOTPRINT_M[key];
  if (!settlements) return base;
  return base * Math.max(0.05, Math.min(4, Math.sqrt(people / TYPICAL_PEOPLE[key])));
}

/** A mark's colour is its way of life's (lib/waysOfLife.ts); alpha sets its weight. */
function color(
  colors: Uint8ClampedArray,
  index: number,
  kind: number,
  people: number,
  present: boolean,
) {
  const offset = index * 4;
  colors.set(LOOKS[WAY_OF_KIND[kind as keyof typeof WAY_OF_KIND]].rgb, offset);
  colors[offset + 3] = !present || people <= 0
    ? 0
    : kind === UnitKind.Band
      ? BAND_ALPHA
      : kind === UnitKind.Village
        ? VILLAGE_ALPHA
        : kind === UnitKind.Camp
          ? CAMP_ALPHA
          : Math.round(
              140 + 115 * Math.min(Math.log1p(people) / Math.log1p(1_000_000), 1),
            );
}

/** Merge sorted stable unit IDs. Persistent marks occupy one vertex instance;
 * missing endpoints use alpha zero, with radii and colours interpolated on GPU.
 */
export function buildUnitMorph(from: Units, to: Units, settlements = false): MorphPoints {
  let a = 0;
  let b = 0;
  let length = 0;
  while (a < from.length || b < to.length) {
    const oldId = a < from.length ? from.ids[a] : Infinity;
    const newId = b < to.length ? to.ids[b] : Infinity;
    if (oldId <= newId) a++;
    if (newId <= oldId) b++;
    length++;
  }
  const positions = new Float32Array(length * 2);
  const radii = new Float32Array(length);
  const targetRadii = new Float32Array(length);
  const colors = new Uint8ClampedArray(length * 4);
  const targetColors = new Uint8ClampedArray(length * 4);
  const mobility = new Float32Array(length * 2);
  const kinds = new Uint8Array(length);
  const people = new Float32Array(length);
  const fromPeople = new Float32Array(length);
  const society = new Uint16Array(length).fill(NO_SOCIETY);
  a = 0;
  b = 0;
  for (let i = 0; i < length; i++) {
    const oldId = a < from.length ? from.ids[a] : Infinity;
    const newId = b < to.length ? to.ids[b] : Infinity;
    const hasOld = oldId <= newId;
    const hasNew = newId <= oldId;
    const source = hasOld ? from : to;
    const index = hasOld ? a : b;
    const kind = source.kind[index];
    const oldPeople = hasOld ? from.people[a] : to.people[b];
    const newPeople = hasNew ? to.people[b] : from.people[a];
    positions[i * 2] = source.positions[index * 2];
    positions[i * 2 + 1] = source.positions[index * 2 + 1];
    radii[i] = radius(kind, oldPeople, settlements);
    targetRadii[i] = radius(kind, newPeople, settlements);
    color(colors, i, kind, oldPeople, hasOld);
    color(targetColors, i, kind, newPeople, hasNew);
    kinds[i] = hasNew ? to.kind[b] : kind;
    people[i] = hasNew ? newPeople : 0;
    fromPeople[i] = hasOld ? oldPeople : 0;
    society[i] = (hasNew ? to.society?.[b] : from.society?.[a]) ?? NO_SOCIETY;
    mobility[i * 2] = hasOld ? (from.mobility?.[a] ?? 1) : (to.mobility?.[b] ?? 1);
    mobility[i * 2 + 1] = hasNew ? (to.mobility?.[b] ?? 1) : (from.mobility?.[a] ?? 1);
    if (hasOld) a++;
    if (hasNew) b++;
  }
  return {
    length,
    attributes: {
      getPosition: { value: positions, size: 2 },
      getRadius: { value: radii, size: 1 },
      getFillColor: { value: colors, size: 4 },
      getTargetRadius: { value: targetRadii, size: 1 },
      getTargetFillColor: { value: targetColors, size: 4 },
      getMobility: { value: mobility, size: 2 },
    },
    info: { kind: kinds, people, fromPeople, society },
  };
}
