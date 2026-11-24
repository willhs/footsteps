// `?sky=1`: how high to lift the close-up camera so it stands above the ground it looks at (lib/sky.ts cameraLift). Reads one coarse
// (zoom 10, ~150 m pixels) Terrarium tile for the view centre and the point under the camera; a few small cached fetches, nothing per frame.
import { useEffect, useState } from 'react';
import { DEM_TILE_URLS, EXAGGERATION, terrariumHeights } from '@/lib/close3d';
import { cameraDistanceM, cameraLift } from '@/lib/sky';

const LIFT_TILE_ZOOM = 10;
const tiles = new Map<string, Promise<Float32Array | null>>();

function tileHeights(x: number, y: number): Promise<Float32Array | null> {
  const key = `${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    const url = DEM_TILE_URLS[0].replace('{z}', String(LIFT_TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`DEM ${r.status}`))))
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
      .then((bitmap) => {
        const canvas = new OffscreenCanvas(256, 256);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return terrariumHeights(ctx.getImageData(0, 0, 256, 256).data);
      })
      .catch(() => null);
    tiles.set(key, p);
  }
  return p;
}

/** Highest ground (m) within ~2 pixels (~300 m) of a point, 0 when unknown or under the sea. */
async function groundAt(lon: number, lat: number): Promise<number> {
  const n = 2 ** LIFT_TILE_ZOOM;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const [x, y] = [Math.floor(fx), Math.floor(fy)];
  const h = await tileHeights(((x % n) + n) % n, Math.min(n - 1, Math.max(0, y)));
  if (!h) return 0;
  const [px, py] = [Math.floor((fx - x) * 256), Math.floor((fy - y) * 256)];
  let best = 0;
  for (let j = Math.max(0, py - 2); j <= Math.min(255, py + 2); j++)
    for (let i = Math.max(0, px - 2); i <= Math.min(255, px + 2); i++) best = Math.max(best, h[j * 256 + i]);
  return best;
}

/** Drawn metres to lift the camera, 0 when `on` is false: `full` puts the view centre on the ground as well (a view's starting lift), `min`
 * only keeps the camera clear of the ground under it (all a view the map has moved needs; FootstepsViz keeps its lift otherwise, so the
 * camera does not jump). Inputs are rounded so panning refetches only when it moves ~1 km. */
export type Lift = { full: number; min: number };
const NO_LIFT: Lift = { full: 0, min: 0 };
export default function useGroundLift(on: boolean, lon: number, lat: number, zoom: number, pitch: number, heightPx: number): Lift {
  const [lift, setLift] = useState<Lift>(NO_LIFT);
  const rLon = Math.round(lon * 100) / 100;
  const rLat = Math.round(lat * 100) / 100;
  const rZoom = Math.round(zoom * 4) / 4;
  const rPitch = Math.round(pitch);
  useEffect(() => {
    if (!on) {
      setLift(NO_LIFT);
      return;
    }
    let live = true;
    const dist = cameraDistanceM(rZoom, rLat, heightPx);
    // The camera stands south of the centre (bearing 0), its ground distance d · sin(pitch) away.
    const camLat = rLat - (dist * Math.sin((rPitch * Math.PI) / 180)) / 110_540;
    Promise.all([groundAt(rLon, rLat), groundAt(rLon, camLat)]).then(([hCentre, hCamera]) => {
      if (live) setLift({ full: cameraLift(hCentre, hCamera, dist, rPitch, EXAGGERATION), min: cameraLift(0, hCamera, dist, rPitch, EXAGGERATION) });
    });
    return () => {
      live = false;
    };
  }, [on, rLon, rLat, rZoom, rPitch, heightPx]);
  return lift;
}
