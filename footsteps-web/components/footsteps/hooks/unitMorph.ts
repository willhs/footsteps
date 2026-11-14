import { UnitKind, WAY_OF_KIND, type Units } from '../layers/units';
import { LOOKS } from '@/lib/waysOfLife';
import type { PointBuffers } from './gridData';

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
  info: { kind: Uint8Array; people: Float32Array; fromPeople: Float32Array };
};
export function isMorphPoints(
  points: PointBuffers | MorphPoints,
): points is MorphPoints {
  return 'getTargetRadius' in points.attributes;
}

function radius(kind: number, people: number, settlements: boolean) {
  const base = kind === UnitKind.Band
    ? 600
    : kind === UnitKind.Village
      ? 1500
      : kind === UnitKind.Camp
        ? 900
        : Math.min(Math.sqrt(people) * 45, 30_000);
  if (!settlements || kind === UnitKind.Glow) return base;
  const typical = kind === UnitKind.Band ? 30 : kind === UnitKind.Camp ? 60 : 300;
  return base * Math.max(0.05, Math.min(4, Math.sqrt(people / typical)));
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
  colors[offset + 3] = !present
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
    info: { kind: kinds, people, fromPeople },
  };
}
