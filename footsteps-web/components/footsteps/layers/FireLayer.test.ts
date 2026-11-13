jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class { static defaultProps: Record<string, unknown> = {}; } }));
import { buildFireMarks } from './FireLayer';
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
