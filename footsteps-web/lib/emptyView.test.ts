import { bandsInView, emptyViewNote, peopleInView } from './emptyView';

const grid = (cells: [number, number, number][]) => ({
  length: cells.length,
  positions: new Float32Array(cells.flatMap(([lon, lat]) => [lon, lat])),
  people: new Float32Array(cells.map(([, , p]) => p)),
  cellDeg: 1,
});

describe('peopleInView', () => {
  it('counts only cells inside the box, plus half a cell', () => {
    const g = grid([[0, 0, 5], [10, 10, 7], [2.3, 0, 3]]);
    expect(peopleInView(g, { west: -1, east: 1.9, south: -1, north: 1 }, Infinity)).toBe(8);
    expect(peopleInView(g, { west: 20, east: 30, south: -1, north: 1 })).toBe(0);
  });
  it('handles a box across the dateline', () => {
    const g = grid([[179.5, 0, 4], [-179.5, 0, 6]]);
    expect(peopleInView(g, { west: 175, east: 185, south: -1, north: 1 }, Infinity)).toBe(10);
  });
});

describe('bandsInView', () => {
  it('counts bands in the box', () => {
    expect(bandsInView([{ position: [0, 0] }, { position: [50, 0] }], { west: -1, east: 1, south: -1, north: 1 })).toBe(1);
  });
});

describe('emptyViewNote', () => {
  it('says nothing when someone is there', () => {
    expect(emptyViewNote(3, 0, 'model')).toBeNull();
    // A few thin cells (0.2 people each on average) are still drawn as groups.
    expect(emptyViewNote(0.4, 0, 'model')).toBeNull();
  });
  it('names the source of the emptiness', () => {
    expect(emptyViewNote(0, 0, 'model')).toContain('the model');
    expect(emptyViewNote(0, 0, 'hyde')).toContain('HYDE');
    expect(emptyViewNote(0, 0, 'adjusted')).toContain('adjusted spread (modelled on HYDE)');
    expect(emptyViewNote(0, 2, 'model')).toContain('another kind of human');
  });
});
