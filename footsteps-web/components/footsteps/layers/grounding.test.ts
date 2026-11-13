import { groundingFacts } from './grounding';
import type { GridData } from '../hooks/useGridLayer';

function grid(entries: [number, number][]): GridData {
  entries.sort((a, b) => a[0] - b[0]);
  return {
    length: entries.length, cellDeg: 1, total: entries.reduce((s, e) => s + e[1], 0),
    cellIds: Uint32Array.from(entries.map(e => e[0])),
    people: Float32Array.from(entries.map(e => e[1])), positions: new Float32Array(entries.length * 2),
  };
}

test('reads head counts, not unit sizes, and includes all nine cells', () => {
  const entries: [number, number][] = [];
  for (let r = 89; r <= 91; r++) for (let c = 179; c <= 181; c++) entries.push([r * 360 + c, 123]);
  const data = grid(entries);
  expect(groundingFacts(data, -1000, 0.1, -0.1)).toMatchObject({ people: 123, neighbourhoodPeople: data.total, densityClass: 'band', year: -1000 });
});

test.each([[599, 'band'], [600, 'village'], [39999, 'village'], [40000, 'glow']])('classifies %s at the units thresholds', (people, densityClass) => {
  expect(groundingFacts(grid([[90 * 360 + 180, Number(people)]]), 1900, 0, 0)?.densityClass).toBe(densityClass);
});

test('wraps at the dateline, clips poles, and accepts empty cells', () => {
  const data = grid([[0, 10], [359, 20], [360, 30], [719, 40]]);
  expect(groundingFacts(data, 1, 180, 90)).toMatchObject({ cellId: 0, people: 10, neighbourhoodPeople: 100 });
  expect(groundingFacts(data, 1, -180, 90)).toEqual(groundingFacts(data, 1, 540, 90));
  expect(groundingFacts(data, 1, 0, -90)).toMatchObject({ people: 0, neighbourhoodPeople: 0 });
  expect(groundingFacts(data, 1, NaN, 0)).toBeNull();
  expect(groundingFacts(data, 1, 0, 91)).toBeNull();
});

test('confidence notes distinguish eras', () => {
  const data = grid([]);
  expect(groundingFacts(data, -1, 0, 0)?.confidence).toContain('sparse');
  expect(groundingFacts(data, 1, 0, 0)?.confidence).toContain('Historical');
  expect(groundingFacts(data, 1800, 0, 0)?.confidence).toContain('recent');
});

test('before HYDE, counts are read per 0.5° block and labelled modelled', () => {
  // 5′ cells (cellDeg 0.5/6) as the decoder makes them: width 4320. Put 2 people in each of the 36 cells of one block.
  const cellDeg = 360 / 4320;
  const entries: [number, number][] = [];
  const blockRow = 120; // 0.5° block row => lat 90 - 120*0.5 .. : 30°N-29.5°N
  const blockCol = 400; // lon -180 + 400*0.5 = 20°E
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) entries.push([(blockRow * 6 + i) * 4320 + blockCol * 6 + j, 2]);
  const data = { ...grid(entries), cellDeg };
  const facts = groundingFacts(data, -50000, 20.1, 29.9);
  expect(facts).toMatchObject({ evidence: 'modelled', cellDeg: 0.5, people: 72, neighbourhoodPeople: 72, densityClass: 'band' });
  expect(facts?.confidence).toContain('Modelled');
  expect(groundingFacts(data, -50000, 20.1, 29.9)?.latitude).toBeCloseTo(29.75);
  expect(groundingFacts(data, -9000, 20.1, 29.9)?.evidence).toBe('measured');
});
