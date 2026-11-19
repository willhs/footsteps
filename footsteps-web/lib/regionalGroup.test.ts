import type { GridData } from '@/components/footsteps/hooks/gridData';
import { REGION_MAX_PEOPLE, REGION_MIN_PEOPLE, aboutPeople, blockOf, regionalGroupAt } from './regionalGroup';

const W = 4320;
const CELL = 1 / 12;
const lonLat = (row: number, col: number): [number, number] => [-180 + (col + 0.5) * CELL, 90 - (row + 0.5) * CELL];

/** A sparse grid from `[row, col, people]`. */
function grid(cells: [number, number, number][]): GridData {
  const sorted = [...cells].sort((a, b) => a[0] * W + a[1] - (b[0] * W + b[1]));
  return {
    length: sorted.length,
    positions: new Float32Array(sorted.length * 2),
    people: Float32Array.from(sorted.map((c) => c[2])),
    cellIds: Uint32Array.from(sorted.map((c) => c[0] * W + c[1])),
    ways: new Uint8Array(sorted.length),
    cellDeg: CELL,
    total: sorted.reduce((s, c) => s + c[2], 0),
  };
}

describe('blocks', () => {
  it('nest: the level-k block of a cell lies inside its level-(k+1) block, whatever the year', () => {
    for (const [r, c] of [[0, 0], [713, 2901], [2159, 4319], [1000, 1]]) {
      for (let k = 0; k < 6; k++) {
        const a = blockOf(r, c, k, CELL);
        const b = blockOf(r, c, k + 1, CELL);
        expect(a.west).toBeGreaterThanOrEqual(b.west - 1e-9);
        expect(a.east).toBeLessThanOrEqual(b.east + 1e-9);
        expect(a.south).toBeGreaterThanOrEqual(b.south - 1e-9);
        expect(a.north).toBeLessThanOrEqual(b.north + 1e-9);
      }
    }
  });

  it('cuts blocks at the edge of the world', () => {
    const b = blockOf(2159, 4319, 6, CELL);
    expect(b.east).toBe(180);
    expect(b.south).toBe(-90);
  });
});

describe('regionalGroupAt', () => {
  it('grows the block until it holds about 840 people', () => {
    // 4 cells of 300 in one 2x2 block, one cell of 300 beyond it
    const g = grid([[100, 100, 300], [100, 101, 300], [101, 100, 300], [101, 101, 300], [100, 103, 300]]);
    const r = regionalGroupAt(g, ...lonLat(100, 100))!;
    expect(r.level).toBe(1);
    expect(r.people).toBe(1200);
  });

  it('is the same block for every cell in it, and for the same cell in another year with other people', () => {
    const early = grid([[100, 100, 300], [100, 101, 300], [101, 100, 300], [101, 101, 300]]);
    const late = grid([[100, 100, 500], [100, 101, 500], [101, 100, 500], [101, 101, 500], [60, 60, 40]]);
    const a = regionalGroupAt(early, ...lonLat(100, 100))!;
    const b = regionalGroupAt(early, ...lonLat(101, 101))!;
    const c = regionalGroupAt(late, ...lonLat(100, 101))!;
    expect([a.row, a.col, a.level]).toEqual([b.row, b.col, b.level]);
    expect([a.west, a.south, a.east, a.north]).toEqual([c.west, c.south, c.east, c.north]);
    expect(a.people).toBe(1200);
    expect(c.people).toBe(2000);
  });

  it('falls back a level when the next one jumps past a regional group', () => {
    const g = grid([[100, 100, 400], [100, 101, 200], [101, 100, 5000]]);
    const r = regionalGroupAt(g, ...lonLat(100, 100))!;
    expect(r.level).toBe(0);
    expect(r.people).toBe(400);
  });

  it('models none for an empty cell, a town past a regional group, or a few lone people', () => {
    expect(regionalGroupAt(grid([[10, 10, 50]]), ...lonLat(20, 20))).toBeNull();
    expect(regionalGroupAt(grid([[100, 100, REGION_MAX_PEOPLE + 1]]), ...lonLat(100, 100))).toBeNull();
    expect(regionalGroupAt(grid([[100, 100, REGION_MIN_PEOPLE - 1]]), ...lonLat(100, 100))).toBeNull();
  });

  it('takes a thin landscape as far as the biggest block, and no further', () => {
    const g = grid([[100, 100, 60], [110, 110, 60], [400, 400, 9000]]);
    const r = regionalGroupAt(g, ...lonLat(100, 100))!;
    expect(r.level).toBe(6);
    expect(r.people).toBe(120);
  });

  it('rejects out-of-range points', () => {
    expect(regionalGroupAt(grid([[1, 1, 500]]), 10, 95)).toBeNull();
    expect(regionalGroupAt(grid([[1, 1, 500]]), NaN, 0)).toBeNull();
  });
});

it('says "about" with two figures', () => {
  expect(aboutPeople(1234)).toBe('1,200');
  expect(aboutPeople(838.7)).toBe('840');
});
