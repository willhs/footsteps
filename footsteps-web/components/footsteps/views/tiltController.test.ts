import { WebMercatorViewport } from '@deck.gl/core';
import { pitchForZoom } from '@/lib/close3d';
import { retilt } from './tiltController';

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
});
