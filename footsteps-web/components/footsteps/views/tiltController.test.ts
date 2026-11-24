import { WebMercatorViewport } from '@deck.gl/core';
import { pitchForZoom } from '@/lib/close3d';
import { glideTarget, groundSpot, retilt } from './tiltController';

type Props = { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number; width: number; height: number };
const make = (props: Props) => new WebMercatorViewport(props);
const state = (props: Props) => ({
  zoom: () => state(props),
  getViewportProps: () => props,
  getState: () => ({}),
  makeViewport: make,
  _unproject: () => undefined,
  _getUpdatedState: (p: Record<string, unknown>) => state({ ...props, ...p } as Props),
});

describe('retilt', () => {
  it('keeps the spot under the cursor put when a zoom also tilts the map', () => {
    const start: Props = { longitude: 12.6, latitude: 41.85, zoom: 9, pitch: pitchForZoom(9), bearing: 0, width: 1400, height: 900 };
    const pos: [number, number] = [1000, 300];
    const anchor = make(start).unproject(pos) as [number, number];
    // deck.gl's own zoom: the new zoom at the old tilt, the anchor kept under the cursor.
    const zoomed = { ...start, zoom: 10 };
    const next = { ...zoomed, ...make(zoomed).panByPosition(anchor, pos) };
    const out = retilt(state(next) as never, anchor, pos, (z) => pitchForZoom(z)).getViewportProps() as Props;
    expect(out.pitch).toBeCloseTo(pitchForZoom(10));
    const [x, y] = make(out).project(anchor);
    expect(Math.hypot(x - pos[0], y - pos[1])).toBeLessThan(0.5);
    // Without it the new tilt moves the spot a long way.
    const [x0, y0] = make({ ...next, pitch: pitchForZoom(10) }).project(anchor);
    expect(Math.hypot(x0 - pos[0], y0 - pos[1])).toBeGreaterThan(20);
  });

  it('leaves a flat zoom alone', () => {
    const s = state({ longitude: 0, latitude: 0, zoom: 4, pitch: 0, bearing: 0, width: 800, height: 600 });
    expect(retilt(s as never, [0, 0], [10, 10], () => 0)).toBe(s);
  });

  it('glides the spot towards the middle when zooming in on a tilted map', () => {
    const start: Props = { longitude: 12.6, latitude: 41.85, zoom: 11, pitch: pitchForZoom(11), bearing: 0, width: 1400, height: 900 };
    const pos: [number, number] = [1000, 250];
    const anchor = make(start).unproject(pos) as [number, number];
    const zoomed = { ...start, zoom: 12 };
    const next = { ...zoomed, ...make(zoomed).panByPosition(anchor, pos) };
    const out = retilt(state(next) as never, anchor, pos, (z) => pitchForZoom(z), 1).getViewportProps() as Props;
    const [x, y] = make(out).project(anchor);
    // Halfway from the cursor to the middle after one level in.
    expect(x).toBeCloseTo(850, 0);
    expect(y).toBeCloseTo(350, 0);
  });
});

describe('glideTarget', () => {
  it('moves further the more levels in, and not at all zooming out or on a flat map', () => {
    const pos: [number, number] = [100, 100];
    expect(glideTarget(pos, 1, 55, 800, 600)).toEqual([250, 200]);
    expect(glideTarget(pos, 2, 55, 800, 600)).toEqual([325, 250]);
    expect(glideTarget(pos, -1, 55, 800, 600)).toBe(pos);
    expect(glideTarget(pos, 1, 0, 800, 600)).toBe(pos);
    // Half tilted, half the glide.
    expect(glideTarget(pos, 1, 22.5, 800, 600)).toEqual([175, 150]);
  });
});

describe('groundSpot', () => {
  const view: Props = { longitude: 12.6, latitude: 41.85, zoom: 12, pitch: 74, bearing: 0, width: 1400, height: 900 };
  it('finds where the cursor meets raised ground, nearer than its sea-level point', () => {
    const vp = make(view);
    const pos: [number, number] = [900, 300];
    const spot = groundSpot(vp as never, pos, () => 800)!;
    expect(spot[2]).toBeGreaterThan(790);
    expect(spot[2]).toBeLessThanOrEqual(800);
    const [x, y] = vp.project(spot);
    expect(Math.hypot(x - pos[0], y - pos[1])).toBeLessThan(1);
    // The sea-level point is further away (further north, the camera looking north).
    const sea = vp.unproject(pos) as number[];
    expect(sea[1]).toBeGreaterThan(spot[1]);
  });
  it('is the sea-level point without ground heights', () => {
    const vp = make(view);
    const spot = groundSpot(vp as never, [700, 400])!;
    expect(spot.length).toBe(2);
  });
  it('a tilted zoom keeps a raised spot at its target', () => {
    const start: Props = { ...view, zoom: 11, pitch: pitchForZoom(11, true) };
    const pos: [number, number] = [900, 300];
    const spot = groundSpot(make(start) as never, pos, () => 600)!;
    const zoomed = { ...start, zoom: 11.5 };
    const out = retilt(state(zoomed) as never, spot, pos, (z) => pitchForZoom(z, true)).getViewportProps() as Props;
    const [x, y] = make(out).project(spot);
    expect(Math.hypot(x - pos[0], y - pos[1])).toBeLessThan(0.5);
  });
});
