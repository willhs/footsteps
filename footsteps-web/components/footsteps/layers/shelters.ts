// Shelters (`?shelters=1`): one dwelling per household of a group in view, and dense roof clusters for towns.
// What is drawn is lib/dwellings.ts's `ShelterSpec` (type MODELLED from analogs or digs); where it stands is IMAGINED:
// a camp's or village's dwellings sit where its households do (households.ts, the same places people stand), a town's
// roofs on a jittered sunflower round the town's spot. Everything is a pure function of the groups, so the same
// place always draws the same roofs.
import { MATERIALS, NO_SOCIETY, shelterSpec, townMix, type DwellingTable, type ShapeId, type ShelterSpec } from '@/lib/dwellings';
import { HOUSEHOLD_SPACING_M, householdsOf, offsetByMetres } from './households';
import { groupSeed, nominalPeople, peopleDrawn } from './people';

export { nominalPeople };
import { BAND_SIZE, CAMP_SIZE, MIN_GROUP_PEOPLE, UnitKind, VILLAGE_SIZE } from './units';

/** One drawn dwelling. `homes` is how many households it stands for: 1 in a camp or village, more in a town. */
export type Shelter = {
  position: [number, number];
  shape: ShapeId;
  rgb: [number, number, number];
  /** Metres: width, depth, height. */
  size: [number, number, number];
  /** Degrees about the vertical. */
  yaw: number;
  spec: ShelterSpec;
  /** Index into the dwelling table, or NO_SOCIETY. */
  society: number;
  homes: number;
  /** The group it belongs to: its kind of unit and head count (a town's people for a town roof). */
  group: { kind: number; people: number };
};

/** A group in view, as the unit morph has it at one endpoint. */
export type ShelterGroup = { lon: number; lat: number; kind: number; people: number; society: number };

/** Typical size in metres (width, depth, height) per shape; a household's size and a hash vary it a little. */
export const SHAPE_SIZE: Record<ShapeId, [number, number, number]> = {
  lean: [3.2, 2.4, 1.5],
  dome: [4.5, 4.5, 2.4],
  cone: [4.2, 4.2, 4.6],
  drum: [6, 6, 3.4],
  gable: [7, 5, 4],
  block: [7.5, 6.5, 3],
};

/** Hash of integers to [0, 1). */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const ROUND: ReadonlySet<ShapeId> = new Set(['dome', 'cone', 'drum']);

function shelter(
  position: [number, number],
  spec: ShelterSpec,
  seed: number,
  index: number,
  yawBase: number,
  scale: number,
  society: number,
  homes: number,
  group: Shelter['group'],
): Shelter {
  const shade = 0.9 + 0.2 * hash(seed, index * 5 + 1);
  const [r, g, b] = MATERIALS[spec.material].rgb;
  const [w, d, h] = SHAPE_SIZE[spec.shape];
  const s = scale * (0.9 + 0.2 * hash(seed, index * 5 + 2));
  return {
    position,
    shape: spec.shape,
    rgb: [Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade)],
    size: [w * s, d * s, h * s],
    yaw: ROUND.has(spec.shape) ? 0 : yawBase + (hash(seed, index * 5 + 3) - 0.5) * 24,
    spec,
    society,
    homes,
    group,
  };
}

/** Dwellings for the bands, camps and villages in view, one per household in the order `people.ts` fills them (so each
 * stands where its household's people do). `year` is the data year the groups are read at. */
export function sheltersForGroups(groups: readonly ShelterGroup[], year: number, table: DwellingTable | null): Shelter[] {
  const out: Shelter[] = [];
  for (const g of groups) {
    if (g.kind === UnitKind.Glow) continue;
    if (g.people <= 0) continue;
    const members = nominalPeople(g.kind, g.people);
    const drawn = peopleDrawn(g.kind, members);
    if (!drawn) continue;
    const society = g.society === NO_SOCIETY ? null : (table?.societies[g.society] ?? null);
    const spec = shelterSpec(society, { lon: g.lon, lat: g.lat, year, kind: g.kind });
    const seed = groupSeed(g.lon, g.lat);
    const yawBase = hash(seed, 99) * 180;
    const spacing = g.kind === UnitKind.Village ? HOUSEHOLD_SPACING_M.village : HOUSEHOLD_SPACING_M.camp;
    let covered = 0;
    for (const home of householdsOf(seed, spacing)) {
      if (covered >= drawn) break;
      covered += home.size;
      out.push(
        shelter(
          offsetByMetres(g.lon, g.lat, home.x, home.y), spec, seed, home.index, yawBase,
          0.8 + 0.07 * home.size, g.society, 1, { kind: g.kind, people: members },
        ),
      );
    }
  }
  return out;
}

/** Roofs drawn for a town of `people`: one per roughly this many households, thinned so a city stays a few hundred. */
export function townRoofs(people: number): number {
  return Math.max(8, Math.min(900, Math.round(Math.sqrt(Math.max(0, people)) * 2.2)));
}

/** How far a town's roofs spread from its spot, metres. */
export function townRadius(people: number): number {
  return Math.min(3000, Math.max(60, Math.sqrt(Math.max(0, people)) * 12));
}

const GOLDEN_ANGLE = 2.399963229728653;

export type TownInView = {
  lon: number;
  lat: number;
  people: number;
  /** A named historical city has no analog: its roofs follow the region's mix (lib/dwellings.ts `townMix`). A glow cell
   * of the settlement model has the society it was drawn from. */
  society?: number;
};

/** A dense cluster of roofs round a town's spot: a sunflower of `townRoofs(people)` roofs inside `townRadius(people)`, jittered
 * by about a third of the spacing, each standing for an equal share of the town's households. */
export function sheltersForTown(town: TownInView, year: number, table: DwellingTable | null): Shelter[] {
  const n = townRoofs(town.people);
  const radius = townRadius(town.people);
  const seed = groupSeed(town.lon, town.lat);
  const homes = Math.max(1, town.people / 4.5 / n);
  const society = town.society === undefined || town.society === NO_SOCIETY ? null : (table?.societies[town.society] ?? null);
  const mix = society ? null : townMix(town.lon, town.lat, year);
  const analog = society ? shelterSpec(society, { lon: town.lon, lat: town.lat, year, kind: UnitKind.Glow }) : null;
  const yawBase = hash(seed, 99) * 180;
  const out: Shelter[] = [];
  const spacing = (radius * Math.sqrt(Math.PI)) / Math.sqrt(n);
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN_ANGLE + hash(seed, 7) * Math.PI * 2;
    const x = Math.cos(a) * r + (hash(seed, i * 5 + 11) - 0.5) * spacing * 0.35;
    const y = Math.sin(a) * r + (hash(seed, i * 5 + 12) - 0.5) * spacing * 0.35;
    let spec: ShelterSpec;
    if (analog) spec = analog;
    else {
      let pick = hash(seed, i * 5 + 13);
      const row = mix!.find(([, , share]) => (pick -= share) <= 0) ?? mix![mix!.length - 1];
      spec = { how: 'town', shape: row[0], material: row[1] };
    }
    out.push(
      shelter(
        offsetByMetres(town.lon, town.lat, x, y), spec, seed, i, yawBase, 1.1,
        town.society ?? NO_SOCIETY, homes, { kind: UnitKind.Glow, people: town.people },
      ),
    );
  }
  return out;
}

// --- Meshes --------------------------------------------------------------------------------------------------------

type Vec = [number, number, number];

/** Flat-shaded triangle soup with outward normals (a normal that points at the mesh centre is flipped). */
function soup(triangles: Vec[][], centre: Vec) {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [a, b, c] of triangles) {
    const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const mid: Vec = [(a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push(...n);
    }
  }
  return {
    attributes: {
      positions: { value: new Float32Array(positions), size: 3 },
      normals: { value: new Float32Array(normals), size: 3 },
    },
  };
}

const quad = (a: Vec, b: Vec, c: Vec, d: Vec): Vec[][] => [[a, b, c], [a, c, d]];

/** A prism over a polygon in the (y, z) plane, extruded along x from -0.5 to 0.5. */
function prism(profile: [number, number][]): Vec[][] {
  const tris: Vec[][] = [];
  const front = profile.map(([y, z]): Vec => [-0.5, y, z]);
  const back = profile.map(([y, z]): Vec => [0.5, y, z]);
  for (let i = 1; i < profile.length - 1; i++) {
    tris.push([front[0], front[i], front[i + 1]], [back[0], back[i], back[i + 1]]);
  }
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    tris.push(...quad(front[i], front[j], back[j], back[i]));
  }
  return tris;
}

const SEGMENTS = 8;
const ring = (radius: number, z: number, i: number): Vec => {
  const a = (i / SEGMENTS) * Math.PI * 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius, z];
};

/** Unit meshes, base at z 0 and top at z 1, footprint 1 × 1 (round shapes: diameter 1): scaled per dwelling. */
export function shelterMeshes(): Record<ShapeId, ReturnType<typeof soup>> {
  const centre: Vec = [0, 0, 0.5];
  const cone: Vec[][] = [];
  const drum: Vec[][] = [];
  const dome: Vec[][] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    cone.push([ring(0.5, 0, i), ring(0.5, 0, i + 1), [0, 0, 1]], [ring(0.5, 0, i), [0, 0, 0], ring(0.5, 0, i + 1)]);
    drum.push(...quad(ring(0.5, 0, i), ring(0.5, 0, i + 1), ring(0.5, 0.55, i + 1), ring(0.5, 0.55, i)));
    drum.push([ring(0.5, 0.55, i), ring(0.5, 0.55, i + 1), [0, 0, 1]]);
    // Dome: three rings of a hemisphere, flattened to unit height.
    const rings: [number, number][] = [[0.5, 0], [0.43, 0.5], [0.25, 0.87], [0, 1]];
    for (let k = 0; k < rings.length - 1; k++) {
      const [r0, z0] = rings[k];
      const [r1, z1] = rings[k + 1];
      if (r1 === 0) dome.push([ring(r0, z0, i), ring(r0, z0, i + 1), [0, 0, z1]]);
      else dome.push(...quad(ring(r0, z0, i), ring(r0, z0, i + 1), ring(r1, z1, i + 1), ring(r1, z1, i)));
    }
  }
  return {
    // A lean-to: tall at the back (-y), low at the front, closed at the sides.
    lean: soup(prism([[-0.5, 0], [0.5, 0], [0.5, 0.2], [-0.5, 1]]), [0, 0, 0.35]),
    dome: soup(dome, [0, 0, 0.3]),
    cone: soup(cone, [0, 0, 0.3]),
    drum: soup(drum, centre),
    // Gabled box: walls to 0.55, ridge at 1 along x.
    gable: soup(prism([[-0.5, 0], [0.5, 0], [0.5, 0.55], [0, 1], [-0.5, 0.55]]), centre),
    block: soup(prism([[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]), centre),
  };
}

/** The dwelling under the cursor and the pointer's screen position. deck.gl calls a composite layer's own `onHover` for what its
 * sublayers pick (info.object is the picked dwelling), so the handler goes on this layer, not on the meshes. */
export type ShelterHover = { shelter: Shelter; x: number; y: number };

export function shelterHoverOf(info: { object?: unknown; x: number; y: number }): ShelterHover | null {
  const picked = info.object as { shelter?: Shelter } | null | undefined;
  return picked?.shelter ? { shelter: picked.shelter, x: info.x, y: info.y } : null;
}
