import { foodEnabled, foodHere, type FoodData } from './food';
import { hoverCardRows } from './hoverCard';
import type { HabitatCell } from './habitat';

const habitat: HabitatCell = { surface: 'land', biome: 'Steppe', tempC: -5, precipMm: 200 };
const data: FoodData = {
  version: 1, eras: [-10000, -8000, -3000],
  taxa: [
    { id: 'wheat', name: 'wheat', kind: 'crop' }, { id: 'barley', name: 'barley', kind: 'crop' },
    { id: 'maize', name: 'maize', kind: 'crop' }, { id: 'goat', name: 'goats', kind: 'animal' },
  ],
  cells: {
    '30,35': { wheat: [1, 'high', true], barley: [1, 'medium', false], goat: [1, 'low', false] },
    '15,-100': { maize: [2, 'medium', false] },
  },
  biomes: { Steppe: { plants: ['grass seeds', 'roots'], animals: ['horse', 'bison', 'reindeer'], plant_weight: 'low' } },
};
const input = { time: -8000, habitat, today: null, people: null, landUse: null };

test('only food=1 opts in', () => {
  for (const query of ['', '?food=0', '?food=true']) expect(foodEnabled(query)).toBe(false);
  expect(foodEnabled('?mode=grid&food=1')).toBe(true);
});

test('Levant: names, per-item confidence, recalled dates and modelled label', () => {
  const food = foodHere(data, 36, 33, -8000, habitat);
  expect(food.map((f) => f.name)).toEqual(['wheat', 'barley', 'goats']);
  expect(hoverCardRows({ ...input, food }).find((r) => r.id === 'food')).toEqual({
    id: 'food', text: 'Food here: wheat (high, checked); barley (medium, not verified); goats (low, not verified)',
    detail: 'possible foods · 5° model, not a measured diet', evidence: 'modelled',
  });
});

test('Mexico: maize appears at the snapshot, never before it', () => {
  expect(foodHere(data, -99, 18, -3000, habitat)[0].name).toBe('maize');
  expect(foodHere(data, -99, 18, -3001, habitat).some((f) => f.name === 'maize')).toBe(false);
});

test('deep Europe uses current biome only, with four low-confidence forager staples', () => {
  const food = foodHere(data, 36, 33, -20000, habitat);
  expect(food.map((f) => f.name)).toEqual(['horse', 'bison', 'grass seeds', 'roots']);
  expect(food.every((f) => f.confidence === 'low' && !f.checked)).toBe(true);
});

test('default, loading, missing biome, sea and ice omit the row', () => {
  expect(hoverCardRows(input).some((r) => r.id === 'food')).toBe(false);
  expect(foodHere(data, 0, 0, -20000, { ...habitat, biome: null })).toEqual([]);
  for (const surface of ['sea', 'ice'] as const) {
    expect(foodHere(data, 36, 33, -8000, { ...habitat, surface })).toEqual([]);
    expect(hoverCardRows({ ...input, habitat: { ...habitat, surface }, food: [{ name: 'wheat', confidence: 'low', checked: false }] }).some((r) => r.id === 'food')).toBe(false);
  }
});

describe('forager food from the animals modelled here', () => {
  it('uses the game present, not the biome default', () => {
    const data = { version: 1, eras: [-10000], taxa: [], cells: {}, biomes: { Taiga: { plants: ['berries'], animals: ['moose', 'caribou'], plant_weight: 'low' } } } as never;
    const habitat = { surface: 'land', biome: 'Taiga' } as never;
    const names = (game?: string[]) => foodHere(data, 138, 36, -30000, habitat, game).map((f) => f.name);
    expect(names()).toContain('moose');
    expect(names(["naumann's elephant", 'giant deer'])).toEqual(["naumann's elephant", 'giant deer', 'berries']);
  });
});

test('domesticates are listed longest-established first, and foragers get wild staples', () => {
  const mexico: FoodData = {
    ...data,
    cells: { '15,-100': { wheat: [2, 'high', true], goat: [2, 'low', false], maize: [0, 'medium', false] } },
  };
  // Central Mexico after the Spanish: maize (here since the first era) before wheat and goats.
  expect(foodHere(mexico, -99, 18, -3000, habitat).map((f) => f.name)).toEqual(['maize', 'wheat', 'goats']);
  // Foragers beside the first farmers: the biome's staples, not the crops.
  const foraging = foodHere(data, 36, 33, -8000, habitat, null, true).map((f) => f.name);
  expect(foraging).not.toContain('wheat');
  expect(foraging).toContain('horse');
});
