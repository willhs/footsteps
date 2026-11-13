// Generation only; the layer class needs WebGL and is not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { describePerson, peopleForGroups, MAX_PER_GROUP } from './people';
import { UnitKind } from './units';

describe('people from head counts', () => {
  it('rejects tiny groups and includes an adult in every generated group', () => {
    expect(
      peopleForGroups([{ lon: 0, lat: 0, kind: UnitKind.Band, people: 0.1 }]),
    ).toEqual([]);
    for (let i = 0; i < 200; i++) {
      const group = peopleForGroups([
        { lon: i / 100, lat: 20, kind: UnitKind.Band, people: 15 },
      ]);
      expect(group).toHaveLength(15);
      expect(group.some((p) => p.age >= 18)).toBe(true);
    }
  });
  const band = { lon: 35.5, lat: 32.1, kind: UnitKind.Band, people: 31 };
  const village = {
    lon: 31.2,
    lat: 30.0,
    kind: UnitKind.Village,
    people: 2400,
  };

  it('makes one person per head, capped per group, skipping city glows', () => {
    const people = peopleForGroups([
      band,
      village,
      { lon: 0, lat: 0, kind: UnitKind.Glow, people: 50000 },
    ]);
    expect(people.filter((p) => p.groupKind === UnitKind.Band)).toHaveLength(
      31,
    );
    expect(people.filter((p) => p.groupKind === UnitKind.Village)).toHaveLength(
      MAX_PER_GROUP,
    );
    expect(people.every((p) => p.groupKind !== UnitKind.Glow)).toBe(true);
  });

  it('is deterministic for the same group', () => {
    const a = peopleForGroups([band]).map((p) => [
      p.age,
      p.role,
      ...p.position,
    ]);
    const b = peopleForGroups([band]).map((p) => [
      p.age,
      p.role,
      ...p.position,
    ]);
    expect(a).toEqual(b);
  });

  it('stays near its camp and has a plausible age mix', () => {
    const people = peopleForGroups([{ ...band, people: 150 }]);
    for (const p of people) {
      expect(Math.abs(p.position[0] - band.lon)).toBeLessThan(0.01);
      expect(Math.abs(p.position[1] - band.lat)).toBeLessThan(0.01);
    }
    const kids = people.filter((p) => p.age < 15).length / people.length;
    expect(kids).toBeGreaterThan(0.25);
    expect(kids).toBeLessThan(0.6);
  });

  it('describes a person plainly', () => {
    const d = describePerson(peopleForGroups([band])[0]);
    expect(d.title).toMatch(/^(A girl|A boy|A woman|A man), about \d+$/);
    expect(d.detail).toMatch(/in a band of about 31 people\.$/);
  });
});
