jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class { static defaultProps: Record<string, unknown> = {}; } }));
import { buildFireMarks, fireBudget, FIRE_BUDGET } from './FireLayer';
import { LOOKS, WayOfLife } from '@/lib/waysOfLife';
import type { GridData } from '../hooks/gridData';

test('each fire takes the colour of its cell\'s way of life', () => {
  const ways = [WayOfLife.Forager, WayOfLife.Farmer, WayOfLife.Herder, WayOfLife.Urban];
  const grid: GridData = {
    length: 4,
    positions: new Float32Array(8),
    people: new Float32Array([100, 100, 100, 100]),
    cellIds: new Uint32Array([1, 2, 3, 4]),
    ways: Uint8Array.from(ways),
    cellDeg: 0.1,
    total: 400,
  };
  const marks = buildFireMarks(1000, grid, 400); // one fire per person: every cell is lit
  expect(marks.length).toBeGreaterThan(0);
  expect(marks.color.length).toBe(marks.length * 4);
  const seen = new Set<string>();
  for (let i = 0; i < marks.length; i++) seen.add(Array.from(marks.color.slice(i * 4, i * 4 + 3)).join());
  expect(seen).toEqual(new Set(ways.map((w) => LOOKS[w].rgb.join())));
  for (let i = 0; i < marks.length; i++) expect(marks.color[i * 4 + 3]).toBe(255);
});

test('fewer people make fewer fires, square-root scaled', () => {
  expect(fireBudget(1.6e9)).toBe(FIRE_BUDGET);
  expect(fireBudget(5e9)).toBe(FIRE_BUDGET);
  // 1,600 times fewer people: 40 times fewer fires, each standing for 40 times fewer people
  expect(fireBudget(1e6)).toBe(Math.round(FIRE_BUDGET / 40));
  expect(fireBudget(0)).toBe(1);
});

test('no fire on past water: a drowned cell burns on the nearest shore, a shore cell on its dry part, and no one is lost', () => {
  // A lake west of lon 1.0; cells at lon 0.5 (in the lake), 0.95 (straddling the shore) and 2 (dry).
  const grid: GridData = {
    length: 3,
    positions: new Float32Array([0.5, 10, 0.95, 10, 2, 10]),
    people: new Float32Array([100, 100, 100]),
    cellIds: new Uint32Array([1, 2, 3]),
    ways: Uint8Array.from([WayOfLife.Forager, WayOfLife.Forager, WayOfLife.Forager]),
    cellDeg: 0.1,
    total: 300,
  };
  const wet = (lon: number) => lon < 1.0;
  const dry = buildFireMarks(-5000, grid, 300);
  const marks = buildFireMarks(-5000, grid, 300, wet);
  expect(marks.length).toBe(dry.length);
  for (let i = 0; i < marks.length; i++) expect(wet(marks.positions[i * 2])).toBe(false);
  expect(Math.min(...Array.from({ length: marks.length }, (_, i) => marks.positions[i * 2]))).toBeLessThan(1.2); // the drowned cell's on the shore
});
