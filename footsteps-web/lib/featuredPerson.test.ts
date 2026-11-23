import { personKey, pickFeatured } from './featuredPerson';

const p = (lon: number, lat: number) => ({ position: [lon, lat] as [number, number] });
const box = { west: 0, south: 0, east: 1, north: 1 };

describe('featured person', () => {
  it('picks the person nearest the middle of the frame', () => {
    const people = [p(0.2, 0.2), p(0.52, 0.48), p(0.8, 0.7)];
    expect(pickFeatured(people, box, [0.5, 0.5], null)).toBe(people[1]);
  });

  it('keeps the previous pick while they stay in frame, even off-centre', () => {
    const people = [p(0.1, 0.1), p(0.5, 0.5)];
    expect(pickFeatured(people, box, [0.5, 0.5], personKey(people[0]))).toBe(people[0]);
    // slid to the very edge (under a panel): a new pick
    const edge = [p(0.03, 0.5), p(0.5, 0.5)];
    expect(pickFeatured(edge, box, [0.5, 0.5], personKey(edge[0]))).toBe(edge[1]);
  });

  it('chooses again once the previous pick leaves the frame (zooming in narrows the choice)', () => {
    const people = [p(0.2, 0.2), p(0.5, 0.5)];
    const narrower = { west: 0.4, south: 0.4, east: 0.6, north: 0.6 };
    expect(pickFeatured(people, narrower, [0.5, 0.5], personKey(people[0]))).toBe(people[1]);
  });

  it('never picks someone at the edge, under the panels, and is null with nobody in frame', () => {
    expect(pickFeatured([p(0.02, 0.5)], box, [0.5, 0.5], null)).toBeNull();
    expect(pickFeatured([p(2, 2)], box, [0.5, 0.5], null)).toBeNull();
  });

  it('handles a frame across the date line', () => {
    const wrap = { west: 179, south: -1, east: -179, north: 1 };
    const people = [p(179.9, 0), p(0, 0)];
    expect(pickFeatured(people, wrap, [180, 0], null)).toBe(people[0]);
  });
});
