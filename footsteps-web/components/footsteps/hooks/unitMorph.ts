import { UnitKind, type Units } from '../layers/units';
import { BAND_ALPHA, VILLAGE_ALPHA, type PointBuffers } from './gridData';

export type MorphPoints = PointBuffers & {
  attributes: PointBuffers['attributes'] & {
    getTargetRadius: { value: Float32Array; size: 1 };
    getTargetFillColor: { value: Uint8ClampedArray; size: 4 };
  };
};
export function isMorphPoints(
  points: PointBuffers | MorphPoints,
): points is MorphPoints {
  return 'getTargetRadius' in points.attributes;
}

function radius(kind: number, people: number) {
  return kind === UnitKind.Band
    ? 600
    : kind === UnitKind.Village
      ? 1500
      : Math.min(Math.sqrt(people) * 45, 30_000);
}

function color(
  colors: Uint8ClampedArray,
  index: number,
  kind: number,
  people: number,
  present: boolean,
  zoomBucket: number,
) {
  const offset = index * 4;
  colors[offset] = kind === UnitKind.Glow ? 60 : 255;
  colors[offset + 1] =
    kind === UnitKind.Band ? 190 : kind === UnitKind.Village ? 225 : 230;
  colors[offset + 2] =
    kind === UnitKind.Band ? 110 : kind === UnitKind.Village ? 160 : 255;
  colors[offset + 3] = !present
    ? 0
    : kind === UnitKind.Band
      ? BAND_ALPHA[zoomBucket]
      : kind === UnitKind.Village
        ? VILLAGE_ALPHA[zoomBucket]
        : Math.round(
            140 + 115 * Math.min(Math.log1p(people) / Math.log1p(1_000_000), 1),
          );
}

/** Merge sorted stable unit IDs. Persistent marks occupy one vertex instance;
 * missing endpoints use alpha zero, with radii and colours interpolated on GPU.
 */
export function buildUnitMorph(
  from: Units,
  to: Units,
  zoomBucket: number,
): MorphPoints {
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
    radii[i] = radius(kind, oldPeople);
    targetRadii[i] = radius(kind, newPeople);
    color(colors, i, kind, oldPeople, hasOld, zoomBucket);
    color(targetColors, i, kind, newPeople, hasNew, zoomBucket);
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
    },
  };
}
