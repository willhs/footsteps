// Generation only; the layer class needs WebGL and is not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { describePerson, peopleForGroups, peopleForMorph, MAX_PER_GROUP } from './people';
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

describe('people between two data years', () => {
  const at = { lon: 35.5, lat: 32.1 };
  const count = (m: ReturnType<typeof peopleForMorph>) => [m.steady, m.leaving, m.entering].map((p) => p.length);
  const key = (p: { position: [number, number]; age: number }) => `${p.position}|${p.age}`;

  it('keeps the people a group already has when it grows or shrinks; only the difference fades', () => {
    const grow = peopleForMorph([{ ...at, kind: UnitKind.Band, from: 40, to: 100 }]);
    expect(count(grow)).toEqual([40, 0, 60]);
    const shrink = peopleForMorph([{ ...at, kind: UnitKind.Band, from: 100, to: 40 }]);
    expect(count(shrink)).toEqual([40, 60, 0]);
    // the same 40 stand in the same places whichever way the years run
    expect(grow.steady.map(key)).toEqual(shrink.steady.map(key));
    // ...and are the first 40 of the larger group
    expect(peopleForGroups([{ ...at, kind: UnitKind.Band, people: 100 }]).slice(0, 40).map(key)).toEqual(
      grow.steady.map(key),
    );
  });

  it('cross-fades a way-of-life change: the old kind leaves, the new kind enters', () => {
    const change = peopleForMorph([
      { ...at, kind: UnitKind.Band, from: 30, to: 0 },
      { ...at, kind: UnitKind.Village, from: 0, to: 300 },
    ]);
    expect(count(change)).toEqual([0, 30, 160]);
    expect(change.leaving.every((p) => p.groupKind === UnitKind.Band)).toBe(true);
    expect(change.entering.every((p) => p.groupKind === UnitKind.Village)).toBe(true);
  });

  it('draws a group dropping below the sparse threshold as leaving, never as a pop', () => {
    expect(count(peopleForMorph([{ ...at, kind: UnitKind.Band, from: 30, to: 5 }]))).toEqual([0, 30, 0]);
  });

  it('at either end of the year fraction shows exactly the people of that year', () => {
    const groups = [
      { ...at, kind: UnitKind.Band, from: 40, to: 100 },
      { lon: 31.2, lat: 30, kind: UnitKind.Village, from: 0, to: 600 },
      { lon: 10, lat: 50, kind: UnitKind.Camp, from: 90, to: 0 },
    ];
    const m = peopleForMorph(groups);
    const early = peopleForGroups(groups.map((g) => ({ ...g, people: g.from })));
    const late = peopleForGroups(groups.map((g) => ({ ...g, people: g.to })));
    expect(m.steady.length + m.leaving.length).toBe(early.length);
    expect(m.steady.length + m.entering.length).toBe(late.length);
  });
});
