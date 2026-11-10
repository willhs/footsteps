import { buildWalks, degPerPx, WALK_PERIOD } from './footsteps';
import type { FireMarks } from './FireLayer';

function marks(points: [number, number, number][]): FireMarks {
  return {
    year: -1000,
    length: points.length,
    positions: new Float32Array(points.flatMap(([x, y]) => [x, y])),
    size: new Float32Array(points.length).fill(0.5),
    rank: new Float32Array(points.length).fill(0),
    cellPeople: new Float32Array(points.map(([, , p]) => p)),
  };
}
const view = { west: -10, south: -10, east: 10, north: 10 };

describe('buildWalks', () => {
  it('keeps farmers near home and lets foragers roam', () => {
    const zoom = 5;
    const farmers = buildWalks(marks([[0, 0, 5000]]), view, zoom, 1, 5);
    const foragers = buildWalks(marks([[0, 0, 100], [0.3, 0, 100], [0, 0.3, 100]]), view, zoom, 1, 5);
    const far = (ws: ReturnType<typeof buildWalks>) =>
      Math.max(...ws.flatMap((w) => w.path.map(([x, y]) => Math.hypot(x - w.path[0][0], y - w.path[0][1]))));
    expect(farmers.every((w) => w.farmer)).toBe(true);
    expect(foragers.every((w) => !w.farmer)).toBe(true);
    expect(far(farmers)).toBeLessThan(10 * degPerPx(zoom));
    expect(far(foragers)).toBeGreaterThan(0.2);
  });

  it('covers the whole loop with increasing timestamps', () => {
    const [w] = buildWalks(marks([[0, 0, 100], [0.2, 0.1, 100]]), view, 5, 1, 1);
    expect(w.timestamps[w.timestamps.length - 1]).toBeGreaterThanOrEqual(WALK_PERIOD);
    for (let i = 1; i < w.timestamps.length; i++) expect(w.timestamps[i]).toBeGreaterThanOrEqual(w.timestamps[i - 1]);
  });

  it('ignores marks out of view or hidden at this zoom', () => {
    const m = marks([[50, 50, 100]]);
    expect(buildWalks(m, view, 5, 1)).toEqual([]);
    const hidden = marks([[0, 0, 100]]);
    hidden.rank[0] = 0.9;
    expect(buildWalks(hidden, view, 5, 0.5)).toEqual([]);
  });
});
