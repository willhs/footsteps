// The map's controller when the close-up tilts with zoom (lib/close3d.ts pitchForZoom). deck.gl's zoom keeps the spot under
// the cursor fixed at the old tilt; the app then set the new tilt, which swung the view about its centre, so a group you
// zoomed towards slid off towards the top of the screen. Here the zoom itself sets the tilt and keeps that spot under the
// cursor (wheel, double click, pinch). The app still sets the tilt from the zoom, so both agree.
import { MapController } from '@deck.gl/core';

type Tilt = (zoom: number) => number | null;
type Pos = [number, number];
type LngLat = [number, number];
type Props = Record<string, unknown> & { pitch: number; zoom: number };
type Viewport = { panByPosition: (lngLat: LngLat, pos: Pos) => Record<string, number> };
/** The parts of deck.gl's MapState used here (some are internal in its typings). */
interface State {
  zoom(a: { pos: Pos; startPos?: Pos; scale: number }): State;
  getViewportProps(): Props;
  getState(): { startZoomLngLat?: LngLat | null };
  makeViewport(props: Props): Viewport;
  _unproject(pos?: Pos): LngLat | undefined;
  _getUpdatedState(props: Record<string, unknown>): State;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a mixin base needs an any[] constructor
type StateClass = new (...args: any[]) => State;

/** The zoom's new view, re-tilted for its zoom with `anchor` kept at `pos`. Pure apart from deck's viewport maths. */
export function retilt(next: State, anchor: LngLat | undefined, pos: Pos, tilt: Tilt): State {
  if (!anchor) return next;
  const props = next.getViewportProps();
  const pitch = tilt(props.zoom);
  if (pitch == null || pitch === props.pitch) return next;
  const viewport = next.makeViewport({ ...props, pitch });
  return next._getUpdatedState({ pitch, ...viewport.panByPosition(anchor, pos) });
}

export class TiltMapController extends MapController {
  constructor(...args: ConstructorParameters<typeof MapController>) {
    super(...args);
    // deck.gl does not export MapState, so extend the class its MapController uses.
    const self = this as unknown as { ControllerState: StateClass; props: { tilt?: Tilt } };
    const Base = self.ControllerState;
    self.ControllerState = class extends Base {
      zoom(a: { pos: Pos; startPos?: Pos; scale: number }): State {
        const next = super.zoom(a);
        const tilt = self.props.tilt;
        if (!tilt || next === (this as unknown)) return next;
        const anchor = this.getState().startZoomLngLat || this._unproject(a.startPos) || this._unproject(a.pos);
        return retilt(next, anchor ?? undefined, a.pos, tilt);
      }
    } as unknown as StateClass;
  }
}
