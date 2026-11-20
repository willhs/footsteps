import { regularity } from './siteRegularity';

const CELLS = 4320;
const DEG = 5 / 60;
const BOX = { west: 10, east: 12, south: 40, north: 42 };

/** A group in the cell (row, col) at offsets (fx, fy) across it (cell widths from the centre, -0.5..0.5; fy > 0 is north). */
function group(row: number, col: number, fx: number, fy: number) {
  return { lon: -180 + (col + 0.5 + fx) * DEG, lat: 90 - (row + 0.5 - fy) * DEG, id: (row * CELLS + col) * 32 };
}
function measure(groups: ReturnType<typeof group>[]) {
  return regularity(groups.flatMap((g) => [g.lon, g.lat]), groups.map((g) => g.id), BOX, DEG, CELLS);
}
/** Cells (row, col) filling BOX. */
function cellsInBox() {
  const out: [number, number][] = [];
  for (let row = Math.ceil((90 - BOX.north) / DEG); row < Math.floor((90 - BOX.south) / DEG); row++) {
    for (let col = Math.ceil((BOX.west + 180) / DEG); col < Math.floor((BOX.east + 180) / DEG); col++) out.push([row, col]);
  }
  return out;
}
function rng(seed: number) {
  let a = seed;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}

test('one group at the same place in every cell is a lattice: aligned, even spacing', () => {
  const r = measure(cellsInBox().map(([row, col]) => group(row, col, -0.4, -0.4)));
  expect(r.alignX).toBeGreaterThan(0.95);
  expect(r.alignY).toBeGreaterThan(0.95);
  expect(r.cv).toBeLessThan(0.05);
  expect(r.square).toBeGreaterThan(0.9);
  expect(r.clarkEvans).toBeGreaterThan(1.5);
});

test('one group at a random place in every cell is not aligned with the cell grid', () => {
  const rand = rng(7);
  const r = measure(cellsInBox().map(([row, col]) => group(row, col, rand() - 0.5, rand() - 0.5)));
  expect(r.alignX).toBeLessThan(0.1);
  expect(r.alignY).toBeLessThan(0.1);
  expect(r.cv).toBeGreaterThan(0.3);
  expect(r.square).toBeLessThan(0.4);
  expect(r.clarkEvans).toBeLessThan(1.6);
});

test('a scatter over the box with no cell structure has cv near 0.52 and Clark-Evans near 1', () => {
  const rand = rng(11);
  const cells = cellsInBox();
  const groups = Array.from({ length: cells.length }, () => {
    const [row, col] = cells[Math.floor(rand() * cells.length)];
    return group(row, col, rand() - 0.5, rand() - 0.5);
  });
  // unlike the one-per-cell case, some cells hold several groups and some none
  const r = measure(groups);
  expect(r.cv).toBeGreaterThan(0.4);
  expect(r.cv).toBeLessThan(0.7);
  expect(r.clarkEvans).toBeGreaterThan(0.8);
  expect(r.clarkEvans).toBeLessThan(1.4);
});
