// The map's controller when the close-up tilts with zoom (lib/close3d.ts pitchForZoom). Three things on top of deck.gl's zoom:
// - The zoom itself sets the tilt and keeps the zoomed spot in place (wheel, double click, pinch). Before, deck kept the spot
//   under the cursor at the old tilt and the app then set the new tilt, which swung the view and slid the spot away.
// - The spot is where the cursor meets the 3D ground (`ground`), not sea level. Looking across raised, exaggerated ground at a
//   steep tilt, the sea-level point under the cursor lies well beyond the group you point at, so that group slid away.
// - Zooming in on a tilted map glides the spot towards the middle of the screen (halfway per zoom level, `GLIDE`), as a globe
//   app does. Kept under the cursor, a group you aimed at stayed up near the horizon, seen edge-on, however far you zoomed.
//   One scroll is many wheel events (and deck animates each, so the view is still moving when the next arrives): they share
//   the spot first aimed at while the cursor stays put, so the glide ends on that group, not on ground passing under the
//   cursor. A drag, rotate or pinch starts afresh. Zooming out keeps the cursor's spot.
// The app still sets the tilt from the zoom, so both agree.
import { MapController } from '@deck.gl/core';

type Tilt = (zoom: number) => number | null;
/** Height (metres, as drawn) of the ground under a point, or null where unknown. */
export type GroundZ = (lon: number, lat: number) => number | null;
type Pos = [number, number];
type LngLat = [number, number];
/** A point on the ground: longitude, latitude and its drawn height in metres (0 when missing). */
type Spot = [number, number] | [number, number, number];
type Props = Record<string, unknown> & { pitch: number; zoom: number; width: number; height: number };
type Viewport = {
  unproject: (xy: number[], opts?: { targetZ?: number }) => number[];
  projectFlat: (lngLat: number[]) => number[];
  unprojectFlat: (xy: number[]) => number[];
  center: number[];
  cameraPosition: number[];
  distanceScales: { unitsPerMeter: number[] };
};
/** The parts of deck.gl's MapState used here (some are internal in its typings). */
interface State {
  zoom(a: { pos: Pos; startPos?: Pos; scale: number }): State;
  panStart(a: unknown): State;
  rotateStart(a: unknown): State;
  zoomStart(a: { pos: Pos }): State;
  getViewportProps(): Props;
  getState(): { startZoomLngLat?: LngLat | null; startZoom?: number | null };
  makeViewport(props: Props): Viewport;
  _getUpdatedState(props: Record<string, unknown>): State;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a mixin base needs an any[] constructor
type StateClass = new (...args: any[]) => State;

/** Share of the way to the screen's middle the zoomed spot travels per zoom level in, on a fully tilted map. */
export const GLIDE = 0.5;
/** Tilt (degrees) from which the glide is full; flatter maps glide less, a flat one not at all (plain zoom to cursor). */
const GLIDE_FULL_PITCH = 45;
/** A wheel event within this many pixels of the last one's cursor, and this soon after it, continues the same zoom. */
const SAME_CURSOR_PX = 3;
const SAME_SCROLL_MS = 800;
/** Steps down the cursor's ray when looking for the ground, then halvings of the step that crossed it. */
const RAY_STEPS = 48;
const RAY_HALVINGS = 8;

/** Where on screen the zoomed spot goes: the cursor moved towards the middle by the glide for `zoomedIn` levels at `pitch`. */
export function glideTarget(pos: Pos, zoomedIn: number, pitch: number, width: number, height: number): Pos {
  if (zoomedIn <= 0 || pitch <= 0) return pos;
  const share = (1 - (1 - GLIDE) ** zoomedIn) * Math.min(1, pitch / GLIDE_FULL_PITCH);
  return [pos[0] + (width / 2 - pos[0]) * share, pos[1] + (height / 2 - pos[1]) * share];
}

/** The first point where the ray through screen `pos` meets the ground (searched from the camera down), or its sea-level point
 * when it meets none. */
export function groundSpot(viewport: Viewport, pos: Pos, ground?: GroundZ): Spot | undefined {
  const flat = viewport.unproject(pos, { targetZ: 0 });
  if (!flat || !Number.isFinite(flat[0])) return undefined;
  const sea: Spot = [flat[0], flat[1]];
  if (!ground) return sea;
  // The ray meets the plane at height z here; it is under the ground there when the ground is at least z.
  const at = (z: number) => viewport.unproject(pos, { targetZ: z });
  const under = (z: number) => {
    const p = at(z);
    return (ground(p[0], p[1]) ?? 0) >= z;
  };
  const top = (viewport.cameraPosition[2] / viewport.distanceScales.unitsPerMeter[2]) * 0.98;
  if (!(top > 0)) return sea;
  let above = top;
  for (let i = 1; i <= RAY_STEPS; i++) {
    const z = top * (1 - i / RAY_STEPS);
    if (!under(z)) {
      above = z;
      continue;
    }
    let below = z;
    for (let k = 0; k < RAY_HALVINGS; k++) {
      const mid = (above + below) / 2;
      if (under(mid)) below = mid;
      else above = mid;
    }
    const p = at(below);
    return [p[0], p[1], below];
  }
  return sea;
}

/** The view moved sideways so `spot` (at its height) shows at screen `pos`. Moving the camera sideways moves every height alike. */
export function panToSpot(viewport: Viewport, spot: Spot, pos: Pos): { longitude: number; latitude: number } {
  const from = viewport.unproject(pos, { targetZ: spot[2] ?? 0 });
  const [ax, ay] = viewport.projectFlat(spot);
  const [fx, fy] = viewport.projectFlat(from);
  const [longitude, latitude] = viewport.unprojectFlat([viewport.center[0] + ax - fx, viewport.center[1] + ay - fy]);
  return { longitude, latitude };
}

/** The zoom's new view, tilted for its zoom with `spot` at `pos`, or glided towards the middle when zoomed in `zoomedIn` levels. */
export function retilt(next: State, spot: Spot | undefined, pos: Pos, tilt: Tilt, zoomedIn = 0): State {
  if (!spot) return next;
  const props = next.getViewportProps();
  const pitch = tilt(props.zoom) ?? props.pitch;
  const target = glideTarget(pos, zoomedIn, pitch, props.width, props.height);
  if (pitch === props.pitch && target === pos && !spot[2]) return next;
  const viewport = next.makeViewport({ ...props, pitch });
  return next._getUpdatedState({ pitch, ...panToSpot(viewport, spot, target) });
}

/** The spot one scroll is zooming on: kept across its wheel events while the cursor stays put. */
type Scroll = { cursor: Pos; spot: Spot; zoom: number; time: number };

export class TiltMapController extends MapController {
  constructor(...args: ConstructorParameters<typeof MapController>) {
    super(...args);
    // deck.gl does not export MapState, so extend the class its MapController uses.
    const self = this as unknown as {
      ControllerState: StateClass;
      props: { tilt?: Tilt; ground?: GroundZ };
      scroll: Scroll | null;
      pinch: Spot | undefined;
    };
    self.scroll = null;
    const Base = self.ControllerState;
    self.ControllerState = class extends Base {
      zoom(a: { pos: Pos; startPos?: Pos; scale: number }): State {
        const next = super.zoom(a);
        const tilt = self.props.tilt;
        if (!tilt || next === (this as unknown)) return next;
        const { startZoomLngLat, startZoom } = this.getState();
        if (startZoomLngLat && startZoom != null) {
          // A pinch: measured from where it started.
          return retilt(next, self.pinch ?? startZoomLngLat, a.pos, tilt, next.getViewportProps().zoom - startZoom);
        }
        // A wheel step or double click: continue this scroll's spot while the cursor stays put.
        const now = performance.now();
        let s = self.scroll;
        if (s && (now - s.time > SAME_SCROLL_MS || Math.hypot(a.pos[0] - s.cursor[0], a.pos[1] - s.cursor[1]) > SAME_CURSOR_PX)) s = null;
        if (!s) {
          const before = this.getViewportProps();
          const spot = groundSpot(this.makeViewport(before), a.startPos ?? a.pos, self.props.ground);
          if (!spot) return next;
          s = { cursor: a.pos, spot, zoom: before.zoom, time: now };
        }
        self.scroll = { ...s, time: now };
        return retilt(next, s.spot, a.pos, tilt, next.getViewportProps().zoom - s.zoom);
      }
      // Anything else that moves the view ends the scroll's spot.
      panStart(a: unknown) {
        self.scroll = null;
        return super.panStart(a);
      }
      rotateStart(a: unknown) {
        self.scroll = null;
        return super.rotateStart(a);
      }
      zoomStart(a: { pos: Pos }) {
        self.scroll = null;
        self.pinch = self.props.tilt ? groundSpot(this.makeViewport(this.getViewportProps()), a.pos, self.props.ground) : undefined;
        return super.zoomStart(a);
      }
    } as unknown as StateClass;
  }
}
