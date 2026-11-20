jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import {
  animalsForView,
  describeAnimal,
  domesticAt,
  type RangeData,
} from './animals';
import type { FoodData } from './food';
import { blockKey, faunaCell } from './fauna';
import { peopleForGroups } from '@/components/footsteps/layers/people';
import { UnitKind } from '@/components/footsteps/layers/units';

const food: FoodData = {
  version: 1,
  eras: [-10000, 0, 1000],
  taxa: [
    { id: 'w', name: 'wheat', kind: 'crop' },
    { id: 's', name: 'sheep', kind: 'animal' },
    { id: 'h', name: 'horses', kind: 'animal' },
    { id: 'c', name: 'cattle', kind: 'animal' },
  ],
  cells: {
    '45,100': {
      w: [0, 'high', true],
      s: [1, 'medium', false],
      h: [2, 'medium', false],
      c: [1, 'medium', false],
    },
  },
  biomes: {},
};
const position = { lon: 102.2, lat: 47.2 };
const cell = faunaCell(position.lon, position.lat)!;
const range: RangeData = {
  key: blockKey(cell),
  species: [
    { common: 'mammoth', kg: 4000, role: 'herd', extinct: true },
    { common: 'wolf', kg: 40, role: 'predator', extinct: false },
  ],
  block: { c: { [cell]: [0, 15, 1, 0] }, i: {} },
};
const input = {
  ...position,
  year: -15000,
  range,
  food: null,
  people: [],
  land: () => true,
};

test('own range cell and extinction step decide species, not the centre point alone', () => {
  const ancient = animalsForView(input);
  expect([...new Set(ancient.map((a) => a.name))].sort()).toEqual([
    'mammoth',
    'wolf',
  ]);
  expect([
    ...new Set(animalsForView({ ...input, year: 1000 }).map((a) => a.name)),
  ]).toEqual(['wolf']);
  expect(ancient.every((a) => faunaCell(...a.position) === cell)).toBe(true);
  expect(
    animalsForView({
      ...input,
      range: { ...range, block: { ...range.block, i: { [cell]: [17] } } },
    }),
  ).toEqual([]);
});

test('no missing-data, sea or ice animals; deterministic imagined herds are bounded', () => {
  const animals = animalsForView(input);
  expect(animals.length).toBeGreaterThan(1);
  expect(animals.length).toBeLessThanOrEqual(120);
  expect(new Set(animals.map((a) => a.id)).size).toBe(animals.length);
  expect(animalsForView(input)).toEqual(animals);
  expect(animalsForView({ ...input, land: () => false })).toEqual([]);
  expect(animalsForView({ ...input, range: null })).toEqual([]);
});

test('full domestic roster respects era, deep past and cell', () => {
  expect(domesticAt(food, 102.2, 47.2, 1000)).toEqual([
    'sheep',
    'horses',
    'cattle',
  ]);
  expect(domesticAt(food, 102.2, 47.2, 999)).toEqual(['sheep', 'cattle']);
  expect(domesticAt(food, 102.2, 47.2, -15000)).toEqual([]);
  expect(domesticAt(food, 20, 47.2, 1000)).toEqual([]);
});

test('domestic animals require local farmer/herder people and remain clear of them', () => {
  const people = peopleForGroups(
    [{ ...position, kind: UnitKind.Camp, people: 20 }],
    1000,
  );
  const animals = animalsForView({
    ...input,
    year: 1000,
    range: null,
    food,
    people,
  });
  expect([...new Set(animals.map((a) => a.name))].sort()).toEqual([
    'cattle',
    'horses',
    'sheep',
  ]);
  const lonM = 111320 * Math.cos((position.lat * Math.PI) / 180);
  expect(
    animals.every((a) =>
      people.every(
        (p) =>
          Math.hypot(
            (a.position[0] - p.position[0]) * lonM,
            (a.position[1] - p.position[1]) * 111320,
          ) >= 85,
      ),
    ),
  ).toBe(true);
  expect(
    animalsForView({
      ...input,
      year: 1000,
      range: null,
      food,
      people: people.map((p) => ({ ...p, groupKind: UnitKind.Band })),
    }),
  ).toEqual([]);
  expect(describeAnimal(animals[0])).toEqual({
    title: animals[0].name,
    detail:
      'availability modelled (food spread model), this domestic animal imagined',
  });
  expect(describeAnimal(animalsForView(input)[0]).detail).toBe(
    'range modelled (PHYLACINE), this animal imagined',
  );
});

test('panning a little keeps existing wild animals at the same geographic positions', () => {
  const before = animalsForView(input);
  const after = animalsForView({ ...input, lat: input.lat + 0.001 });
  const retained = after.filter((a) => before.some((b) => b.id === a.id));
  expect(retained.map((a) => a.name)).toContain('mammoth');
  for (const a of retained)
    expect(a.position).toEqual(before.find((b) => b.id === a.id)!.position);
});

test('panning also keeps livestock ids and positions anchored to their home, not the camera', () => {
  const people = peopleForGroups(
    [{ ...position, kind: UnitKind.Camp, people: 20 }],
    1000,
  );
  const params = { ...input, year: 1000, range: null, food, people };
  const before = animalsForView(params);
  const after = animalsForView({ ...params, lat: params.lat + 0.001 });
  expect(after.map((a) => a.name)).toContain('sheep');
  expect(after.map((a) => ({ id: a.id, position: a.position }))).toEqual(
    before.map((a) => ({ id: a.id, position: a.position })),
  );
});
