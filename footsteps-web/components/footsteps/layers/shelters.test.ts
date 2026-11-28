// Generation only; the layer class needs WebGL and is not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { NO_SOCIETY, parseDwellings, type DwellingFile } from '@/lib/dwellings';
import { HOUSEHOLD_RADIUS_M, householdsOf, HOUSEHOLD_SPACING_M, offsetByMetres } from './households';
import { groupSeed, peopleForGroups } from './people';
import { shelterMeshes, sheltersForGroups, sheltersForTown, townRadius, townRoofs, SHAPE_SIZE } from './shelters';
import { UnitKind } from './units';

const file: DwellingFile = {
  version: 1,
  caveat: '',
  codes: { plan: { '2': 'Circular' }, walls: { '11': 'Walls not diff. from roof' }, roof: { '8': 'Grass, leaves or thatch' } },
  columns: ['id', 'name', 'year', 'plan', 'walls', 'roof'],
  societies: [['xd1', '!Kung', 1950, 2, 11, 8]],
};
const table = parseDwellings(file);
function firstHouseholds(seed: number, spacing: number, n: number) {
  const out = [];
  for (const h of householdsOf(seed, spacing)) {
    out.push(h);
    if (out.length === n) break;
  }
  return out;
}
const metres = (a: [number, number], b: [number, number]) => {
  const k = 111_320;
  return Math.hypot((a[0] - b[0]) * k * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * k);
};
const band = { lon: 20.5, lat: -20.2, kind: UnitKind.Band, people: 30, society: 0 };

describe('dwellings of a band, camp or village', () => {
  it('draws one dwelling per household, enough for every person drawn', () => {
    const dwellings = sheltersForGroups([band], 1900, table);
    const sizes = firstHouseholds(groupSeed(band.lon, band.lat), HOUSEHOLD_SPACING_M.camp, dwellings.length).map((h) => h.size);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(30);
    // one household fewer would not seat everyone
    expect(sizes.slice(0, -1).reduce((a, b) => a + b, 0)).toBeLessThan(30);
    expect(dwellings.every((d) => d.homes === 1)).toBe(true);
  });

  it('stands each dwelling where its household does, so the people of a household stand at their own roof', () => {
    const dwellings = sheltersForGroups([band], 1900, table);
    const people = peopleForGroups([{ lon: band.lon, lat: band.lat, kind: band.kind, people: band.people }], 1900, 'households');
    expect(people.length).toBe(30);
    for (const person of people) expect(metres(person.position, dwellings[person.household!].position)).toBeLessThanOrEqual(HOUSEHOLD_RADIUS_M + 0.5);
    const [first] = firstHouseholds(groupSeed(band.lon, band.lat), HOUSEHOLD_SPACING_M.camp, 1);
    expect(dwellings[0].position).toEqual(offsetByMetres(band.lon, band.lat, first.x, first.y));
  });

  it('uses the analog society’s type for the whole group, and says which society', () => {
    const dwellings = sheltersForGroups([band], 1900, table);
    expect(new Set(dwellings.map((d) => d.shape))).toEqual(new Set(['dome']));
    expect(dwellings.every((d) => d.society === 0 && d.spec.how === 'analog')).toBe(true);
  });

  it('draws nothing where the model puts no group: no people, and glows (towns have their own roofs)', () => {
    expect(sheltersForGroups([{ ...band, people: 0 }, { ...band, kind: UnitKind.Glow, people: 5000 }], 1900, table)).toEqual([]);
  });

  it('draws a thin cell’s whole group as a typical band, roofs and members alike', () => {
    const sparse = sheltersForGroups([{ ...band, people: 3 }], 1900, table);
    expect(sparse).toEqual(sheltersForGroups([band], 1900, table).map((d) => ({ ...d, group: { ...d.group, people: 30 } })));
    expect(peopleForGroups([{ lon: band.lon, lat: band.lat, kind: band.kind, people: 3 }])).toHaveLength(30);
  });

  it('falls back to the kind of group when no analog was drawn', () => {
    const dwellings = sheltersForGroups([{ ...band, kind: UnitKind.Camp, society: NO_SOCIETY }], 1900, table);
    expect(dwellings.length).toBeGreaterThan(0);
    expect(dwellings.every((d) => d.spec.how === 'kind' && d.shape === 'dome')).toBe(true); // a Kalahari camp: a mat hut
  });

  it('is deterministic: the same place draws the same roofs', () => {
    expect(sheltersForGroups([band], 1900, table)).toEqual(sheltersForGroups([band], 1900, table));
  });

  it('keeps a group’s first dwellings when it grows', () => {
    const small = sheltersForGroups([band], 1900, table);
    const large = sheltersForGroups([{ ...band, people: 60 }], 1900, table);
    expect(large.length).toBeGreaterThan(small.length);
    expect(large.slice(0, small.length).map((d) => d.position)).toEqual(small.map((d) => d.position));
  });

  it('draws mammoth-bone domes for the Mezhyrich band of 15,000 BCE', () => {
    const dwellings = sheltersForGroups([{ lon: 31.41, lat: 49.63, kind: UnitKind.Band, people: 30, society: NO_SOCIETY }], -15000, table);
    expect(dwellings.length).toBeGreaterThan(3);
    expect(dwellings.every((d) => d.spec.how === 'archaeology' && d.shape === 'dome')).toBe(true);
  });

  it('draws at most as many dwellings as people are drawn', () => {
    const dwellings = sheltersForGroups([{ ...band, kind: UnitKind.Village, people: 5000 }], 1000, table);
    expect(dwellings.length).toBeLessThanOrEqual(80);
  });
});

describe('town roofs', () => {
  const town = { lon: 12.5, lat: 41.9, people: 450_000 };

  it('scales the roof count with the town and caps a city at a few hundred', () => {
    expect(townRoofs(0)).toBe(8);
    expect(townRoofs(5000)).toBeGreaterThan(townRoofs(500));
    expect(townRoofs(450_000)).toBe(900);
    expect(townRadius(450_000)).toBe(3000);
  });

  it('packs the roofs inside the town’s radius, each standing for an equal share of the households', () => {
    const roofs = sheltersForTown(town, 100, table);
    expect(roofs.length).toBe(900);
    const radius = townRadius(town.people);
    for (const r of roofs) expect(metres(r.position, [town.lon, town.lat])).toBeLessThan(radius * 1.2);
    const homes = town.people / 4.5 / 900;
    expect(roofs.every((r) => Math.abs(r.homes - homes) < 1e-9)).toBe(true);
  });

  it('roofs Rome in 100 CE with tile and stone, as no analog society was recorded for it', () => {
    const roofs = sheltersForTown(town, 100, table);
    expect(new Set(roofs.map((r) => `${r.spec.how}/${r.spec.material}`))).toEqual(new Set(['town/tile', 'town/stone']));
    const tiled = roofs.filter((r) => r.spec.material === 'tile').length / roofs.length;
    expect(tiled).toBeGreaterThan(0.55);
    expect(tiled).toBeLessThan(0.75);
  });

  it('follows the society of a glow cell of the settlement model when it has one', () => {
    const roofs = sheltersForTown({ ...town, society: 0 }, 100, table);
    expect(new Set(roofs.map((r) => r.spec.how))).toEqual(new Set(['analog']));
  });
});

describe('meshes', () => {
  const meshes = shelterMeshes();
  it.each(Object.keys(SHAPE_SIZE))('%s: closed unit solid with unit outward normals standing on z = 0', (shape) => {
    const { positions, normals } = meshes[shape as keyof typeof meshes].attributes;
    expect(positions.value.length).toBe(normals.value.length);
    expect(positions.value.length % 9).toBe(0);
    let top = 0;
    for (let i = 0; i < positions.value.length; i += 3) {
      expect(Math.abs(positions.value[i])).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(Math.abs(positions.value[i + 1])).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(positions.value[i + 2]).toBeGreaterThanOrEqual(-1e-6);
      top = Math.max(top, positions.value[i + 2]);
      expect(Math.hypot(normals.value[i], normals.value[i + 1], normals.value[i + 2])).toBeCloseTo(1, 4);
    }
    expect(top).toBeCloseTo(1, 4);
  });
});
