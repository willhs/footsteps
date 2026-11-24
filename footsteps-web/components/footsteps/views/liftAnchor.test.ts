import { WebMercatorViewport } from '@deck.gl/core';
import { reanchor, type LiftedView } from './liftAnchor';

const view: LiftedView = { longitude: 8, latitude: 46.5, zoom: 12.5, pitch: 74, bearing: 20, width: 1400, height: 900 };
const points = [[7.99, 46.53, 2000], [8.02, 46.56, 0], [8.05, 46.6, 3500], [7.97, 46.52, 900]];
const screen = (v: LiftedView, lift: number) => {
  const vp = new WebMercatorViewport({ ...v, position: [0, 0, lift] });
  return points.map((p) => vp.project(p).slice(0, 2));
};

describe('reanchor', () => {
  it('keeps the camera where it was: nothing moves on screen', () => {
    for (const [lift, ground] of [[4800, (lon: number) => 3000 + (lon - 8) * 20_000], [0, () => 600], [2000, () => 200]] as const) {
      const r = reanchor(view, lift, ground)!;
      expect(r).not.toBeNull();
      const before = screen(view, lift);
      const after = screen({ ...view, longitude: r.longitude, latitude: r.latitude, zoom: r.zoom }, r.lift);
      before.forEach(([x, y], i) => expect(Math.hypot(after[i][0] - x, after[i][1] - y)).toBeLessThan(1));
      // The new target is on the ground the centre looks at.
      expect(Math.abs(r.lift - ground(r.longitude))).toBeLessThan(15);
    }
  });
  it('treats unknown ground as sea level, and gives up looking along the horizon', () => {
    expect(reanchor(view, 1000, () => null)).not.toBeNull();
    expect(reanchor({ ...view, pitch: 89.5 }, 1000, () => 0)).toBeNull();
  });
  it('stops at minZoom on the same line of sight, the camera still unmoved', () => {
    const lift = 4800;
    const ground = () => 1500;
    const full = reanchor(view, lift, ground)!;
    expect(full.zoom).toBeLessThan(12);
    const r = reanchor(view, lift, ground, 12)!;
    expect(r.zoom).toBeCloseTo(12, 2);
    expect(r.lift).toBeGreaterThan(1500);
    const before = screen(view, lift);
    const after = screen({ ...view, longitude: r.longitude, latitude: r.latitude, zoom: r.zoom }, r.lift);
    before.forEach(([x, y], i) => expect(Math.hypot(after[i][0] - x, after[i][1] - y)).toBeLessThan(1));
    expect(reanchor({ ...view, zoom: 11.8 }, lift, ground, 12)).toBeNull();
  });
});
