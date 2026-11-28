import { MISSING_ISLANDS, islandCells, islandPeopleAt } from './missingIslands';
import { gridDataFrom } from '@/components/footsteps/hooks/gridData';

const tahiti = MISSING_ISLANDS[0];

describe('missingIslands', () => {
  it('has no one before settlement and a count after', () => {
    expect(islandPeopleAt(tahiti, 1000)).toBe(0);
    expect(islandPeopleAt(tahiti, 1500)).toBeCloseTo(27500);
    expect(islandPeopleAt(tahiti, 1950)).toBe(10000);
  });

  it('picks a handful of 5′ cells round each centre', () => {
    for (const island of MISSING_ISLANDS) {
      const cells = islandCells(island, 4320);
      expect(cells.length).toBeGreaterThan(island.centres.length);
      expect(cells.length).toBeLessThan(island.centres.length * 40);
    }
  });

  it('adds the people to an empty HYDE image, sorted by cell, and keeps the total', () => {
    const w = 4320;
    const h = 2160;
    const pixels = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    const grid = gridDataFrom(1500, pixels, null);
    const ids = Array.from(grid.cellIds);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const expected = MISSING_ISLANDS.reduce((s, i) => s + islandPeopleAt(i, 1500), 0);
    expect(grid.total / expected).toBeGreaterThan(0.95);
    expect(grid.total / expected).toBeLessThan(1.05);
    expect(gridDataFrom(1000, pixels, null).length).toBe(0);
  });
});
