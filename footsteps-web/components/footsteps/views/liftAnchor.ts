// `?sky=1` lifts the close-up camera (deck.gl viewState `position[2]`, hooks/useGroundLift.ts). A view can be described with many lifts:
// raise the target along the centre's line of sight and shorten the camera distance (a higher zoom) and the camera has not moved, so
// nothing on screen moves. `reanchor` picks the description whose target is the ground the centre looks at, so the lift follows the
// ground as you pan without the view jumping (a new lift for the same centre and zoom moved the camera and slid the whole view).
import { WebMercatorViewport } from '@deck.gl/core';
import { cameraDistanceM } from '@/lib/sky';
import { groundSpot, type GroundZ } from './tiltController';

export type LiftedView = { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number; width: number; height: number };

/** The same camera as `view` lifted by `lift`, described with its target where the screen centre meets the ground, or null when the
 * change would be extreme. Not below `minZoom` (where the tilt starts to follow the zoom): then the target stops on the same line of sight,
 * above the ground. */
export function reanchor(view: LiftedView, lift: number, ground: GroundZ, minZoom = -Infinity): { longitude: number; latitude: number; zoom: number; lift: number } | null {
  const viewport = new WebMercatorViewport({ ...view, position: [0, 0, lift] });
  const hit = groundSpot(viewport as never, [view.width / 2, view.height / 2], ground);
  if (!hit || hit.length < 3) return null;
  const z = hit[2] ?? 0;
  const cos = Math.cos((view.pitch * Math.PI) / 180);
  if (cos < 0.05) return null;
  // Distance from the camera to the old target, then to the ground point on the same line of sight.
  const before = cameraDistanceM(view.zoom, view.latitude, view.height);
  const after = before + (lift - z) / cos;
  if (!(after > before / 4 && after < before * 4)) return null;
  const zoom = view.zoom + Math.log2(cameraDistanceM(view.zoom, hit[1], view.height) / after);
  if (zoom >= minZoom) return { longitude: hit[0], latitude: hit[1], zoom, lift: z };
  if (view.zoom <= minZoom) return null;
  // As far along the line of sight as minZoom allows.
  const far = before * 2 ** (view.zoom - minZoom);
  const height = lift - (far - before) * cos;
  const [longitude, latitude] = viewport.unproject([view.width / 2, view.height / 2], { targetZ: height });
  return { longitude, latitude, zoom: view.zoom + Math.log2(cameraDistanceM(view.zoom, latitude, view.height) / far), lift: height };
}
