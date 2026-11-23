'use client';

import { useEffect, useMemo, useState } from 'react';
import { lazy, useLazy } from '@/lib/lazyModule';
import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import { BitmapLayer, PathLayer } from '@deck.gl/layers';
import { TERRAIN_VERSION, TERRAIN_YEARS } from '@/lib/constants';
import { clampTime, terrainBracket } from '@/lib/time';
import { seaLevelAt } from '@/lib/climate';
import TerrainReliefLayer, { TERRAIN_DESATURATE, TERRAIN_TINT } from '../layers/TerrainReliefLayer';
import { makeGround } from '@/lib/eraGround';
import { habitatStep, habitatUrl } from '@/lib/habitat';
import { loadLookup } from '@/lib/habitatImages';
import { groundParam, plantsParam } from '@/lib/close3d';
import { weatherParam } from '@/lib/weather';
import { lakePlaneFor, loadPastWater, pastWaterEpochs, pastWaterParam, pastWaterTerrainYear, type PastWaterLayers } from '@/lib/pastWater';
import { iceBounds, iceEpochAt, iceOverlayPixels, iceParam, iceShareAt, loadIceAt, type IceMask } from '@/lib/iceSheets';
import {
  DETAIL_REF_URL,
  loadDetailManifest,
  blobPixels,
  photoWeight,
  recolour,
  sampleDetail,
  WEIGHT_TAP_PX,
  terrainTilesParam,
  type DetailManifest,
  type DetailPixels,
} from '@/lib/terrainDetail';

// The close-up 3D ground (mesh layers, glTF loaders) and the colour pyramid's layer load on first use (lib/lazyModule.ts,
// docs/ops/first-load.md). FootstepsViz prefetches the close-up after the first people are on screen.
export const CLOSE3D_MODULE = lazy(() => import('../layers/Close3DLayer'));
const DETAIL_MODULE = lazy(() => import('../layers/TerrainDetailLayer'));

// One natural-colour Earth per terrain year (footstep-generator/terrain_image.py).
// The two images either side of `time` are drawn as an opaque lower image and the
// upper one at opacity f: an exact cross-fade, no shader needed.
// TERRAIN_VERSION (lib/constants.ts) busts Cloudflare's day-long cache when the images are regenerated.
// `?pastwater=1`: the years the past-water scenarios repaint come from /terrain/pastwater/ (terrain_image.py --pastwater); the flag is fixed for the page load.
const pastWaterOn = () => typeof window !== 'undefined' && pastWaterParam(window.location.search);
// `?ice=1`: the dated ice sheets (lib/iceSheets.ts) as their own layer over the flat terrain and as ice in the close-up ground.
const iceOn = () => typeof window !== 'undefined' && iceParam(window.location.search);
/** The overlay picture of each ice patch, made once per patch (id) from its mask. */
const iceBitmaps = new Map<number, Promise<ImageBitmap>>();
function iceBitmap(m: IceMask): Promise<ImageBitmap> {
  let p = iceBitmaps.get(m.id);
  if (!p) {
    p = createImageBitmap(new ImageData(iceOverlayPixels(m), m.width, m.height));
    iceBitmaps.set(m.id, p);
  }
  return p;
}
const terrainUrl = (year: number) => (pastWaterOn() && pastWaterTerrainYear(year) ? `/terrain/pastwater/earth_${year}.webp?v=${TERRAIN_VERSION}` : `/terrain/earth_${year}.webp?v=${TERRAIN_VERSION}`);

// Dimmed day colours, so people (night lights) stay the brightest thing.
const TINT = TERRAIN_TINT;
const DESATURATE = TERRAIN_DESATURATE;
const COAST_COLOUR: [number, number, number, number] = [255, 255, 255, 46];

const bitmaps = new Map<number, ImageBitmap>();
const loading = new Map<number, Promise<ImageBitmap>>();

function loadTerrain(year: number): Promise<ImageBitmap> {
  let p = loading.get(year);
  if (!p) {
    // A `?pastwater=1` image that is not deployed falls back to the ordinary one: the terrain must never go blank for a flag.
    p = fetch(terrainUrl(year))
      .then((r) => (r.ok || !terrainUrl(year).includes('/pastwater/') ? r : fetch(`/terrain/earth_${year}.webp?v=${TERRAIN_VERSION}`)))
      .then((r) => {
        if (!r.ok) throw new Error(`terrain ${year}: HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        bitmaps.set(year, bitmap);
        return bitmap;
      })
      .catch((err) => {
        loading.delete(year); // allow a retry on the next request
        throw err;
      });
    loading.set(year, p);
  }
  return p;
}

type Pair = { y0: number; y1: number };

// Era images as pixels, for the close-up 3D ground's colours (decoded only when it is on).
const pixels = new Map<number, Uint8ClampedArray>();
function eraPixels(year: number): Uint8ClampedArray | null {
  const hit = pixels.get(year);
  if (hit) return hit;
  const bmp = bitmaps.get(year);
  if (!bmp) return null;
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  pixels.set(year, data);
  return data;
}

/** The pyramid's manifest and reference photo, loaded once (null until both are in, or when tiles are off). */
type DetailSource = { manifest: DetailManifest; ref: ImageBitmap; refPixels: { rgba: Uint8ClampedArray; width: number; height: number } };
let detailPromise: Promise<DetailSource> | null = null;
function loadDetailSource(): Promise<DetailSource> {
  if (detailPromise) return detailPromise;
  // The reference photo is fetched once: a bitmap for the flat map's shader and its stored bytes for the close-up 3D ground.
  const refBlob = fetch(DETAIL_REF_URL).then((r) => {
    if (!r.ok) throw new Error(`detail ref: HTTP ${r.status}`);
    return r.blob();
  });
  detailPromise = Promise.all([loadDetailManifest(), refBlob.then((b) => createImageBitmap(b)), refBlob.then(blobPixels)])
    .then(([manifest, ref, refPixels]) => ({ manifest, ref, refPixels }))
    .catch((err) => {
      detailPromise = null;
      throw err;
    });
  return detailPromise;
}

/** The modern coastline as paths: land-polygon rings, minus the artificial edges
 * Natural Earth adds along the dateline and the south pole. */
let coastPromise: Promise<[number, number][][]> | null = null;
function loadCoastline(): Promise<[number, number][][]> {
  coastPromise ??= fetch('/world-simple.geojson')
    .then((r) => r.json())
    .then((gj: { features: { geometry: { type: string; coordinates: unknown } }[] }) => {
      const paths: [number, number][][] = [];
      const addRing = (ring: [number, number][]) => {
        let run: [number, number][] = [];
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const prev = ring[i - 1];
          const edge =
            prev &&
            ((Math.abs(lon) >= 179.99 && Math.abs(prev[0]) >= 179.99) ||
              (lat <= -84.9 && prev[1] <= -84.9));
          if (edge) {
            if (run.length > 1) paths.push(run);
            run = [];
          }
          run.push([lon, lat]);
        }
        if (run.length > 1) paths.push(run);
      };
      for (const f of gj.features) {
        const g = f.geometry;
        const polys =
          g.type === 'Polygon'
            ? [g.coordinates as [number, number][][]]
            : (g.coordinates as [number, number][][][]);
        for (const poly of polys) addRing(poly[0]);
      }
      return paths;
    })
    .catch(() => {
      coastPromise = null;
      return [];
    });
  return coastPromise;
}

/** Background layers for terrain mode at continuous `time`. `close3d`: draw the tilted 3D
 * landscape (lib/close3d.ts) in place of the flat relief and coastline. */
export default function useTerrainLayers(time: number, enabled: boolean, close3d = false): Layer[] {
  const { y0, y1 } = terrainBracket(time);
  const ka = habitatStep(Math.round(clampTime(time)));
  const [habitat, setHabitat] = useState<{ ka: number; rgba: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    if (!enabled || !close3d) return;
    let live = true;
    loadLookup(habitatUrl(ka))
      .then((rgba) => live && setHabitat({ ka, rgba }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, close3d, ka]);
  // The past-water patches (~105 KB) are fetched only with the flag and the close-up on; the water exists only in its epochs.
  const [lakeLayers, setLakeLayers] = useState<PastWaterLayers | null>(null);
  useEffect(() => {
    if (!enabled || !close3d || !pastWaterOn()) return;
    let live = true;
    loadPastWater().then((layers) => live && setLakeLayers(layers)).catch((error) => console.warn('[terrain] no past water', error));
    return () => {
      live = false;
    };
  }, [enabled, close3d]);
  // The ice of the epoch the year shows: masks and overlay pictures, loaded when the epoch changes.
  const iceBp = iceEpochAt(clampTime(time))?.bp ?? null;
  const [ice, setIce] = useState<{ bp: number; masks: IceMask[]; bitmaps: ImageBitmap[] } | null>(null);
  useEffect(() => {
    if (!enabled || !iceOn() || iceBp === null) return;
    let live = true;
    loadIceAt(clampTime(time))
      .then((masks) => Promise.all(masks.map(iceBitmap)).then((bitmaps) => live && setIce({ bp: iceBp, masks, bitmaps })))
      .catch((error) => console.warn('[terrain] no ice', error));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ice depends on the epoch, not on every tick of `time`
  }, [enabled, iceBp]);
  const iceShown = ice && ice.bp === iceBp ? ice : null;
  const iceCover = useMemo(() => (iceShown ? { key: `ice${iceShown.bp}`, shareAt: (lon: number, lat: number) => iceShareAt(iceShown.masks, lon, lat) } : null), [iceShown]);
  const epochs = pastWaterEpochs(clampTime(time)).join(',');
  const lakeSea = Math.round(seaLevelAt(clampTime(time)) * 10) / 10;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the water depends on the active epochs (and the sea, for marine ones), not on every tick of `time`
  const lake = useMemo(() => lakePlaneFor(lakeLayers, clampTime(time), lakeSea), [lakeLayers, epochs, lakeSea]);
  // The pair on screen: the wanted one once both images are decoded, until then
  // the last complete pair (never a blank frame while scrubbing).
  const [shown, setShown] = useState<Pair | null>(null);
  const [coast, setCoast] = useState<[number, number][][]>([]);
  // The colour pyramid (lib/terrainDetail.ts): only with ?terrain_tiles=1 (off until reviewed). Read after mount (static export).
  const [detail, setDetail] = useState<DetailSource | null>(null);
  useEffect(() => {
    if (!enabled || !terrainTilesParam(window.location.search)) return;
    let live = true;
    loadDetailSource()
      .then((d) => live && setDetail(d))
      .catch((err) => console.warn('[terrain] detail tiles unavailable', err));
    return () => {
      live = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    Promise.all([loadTerrain(y0), loadTerrain(y1)])
      .then(() => live && setShown({ y0, y1 }))
      .catch(() => {});
    // Warm the neighbours so steady scrubbing rarely waits.
    const i = TERRAIN_YEARS.indexOf(y0);
    for (const j of [i - 1, i + 2]) {
      const y = TERRAIN_YEARS[j];
      if (y !== undefined) loadTerrain(y).catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [enabled, y0, y1]);

  useEffect(() => {
    // The modern coastline (Natural Earth 110m) is off: its long straight segments read as solid lines close in,
    // and in the Ice Age it sits inland. `?coast=1` draws it.
    if (enabled && new URLSearchParams(window.location.search).get('coast') === '1') loadCoastline().then(setCoast);
  }, [enabled]);

  // Blend weight quantised so the 3D ground is rebuilt at most ~20 times across a terrain step.
  const fq = shown ? Math.round(Math.min(1, Math.max(0, (clampTime(time) - shown.y0) / Math.max(1, shown.y1 - shown.y0))) * 20) / 20 : 0;
  // Sea level to 0.5 m: it only gates the shelf rule in `recolour`, so the ground is not rebuilt every frame of a scrub.
  const seaQ = Math.round(seaLevelAt(clampTime(time)) * 2) / 2;
  const ground = useMemo(() => {
    if (!close3d || !shown || !habitat) return null;
    const lo = eraPixels(shown.y0);
    const hi = eraPixels(shown.y1);
    const bmp = bitmaps.get(shown.y0);
    if (!lo || !hi || !bmp) return null;
    return {
      key: `${shown.y0}-${shown.y1}-${fq}-${habitat.ka}-${detail ? `d${seaQ}` : ''}`,
      ground: makeGround(lo, hi, bmp.width, bmp.height, fq, habitat.rgba, detail?.refPixels ?? null, seaQ),
    };
  }, [close3d, shown, habitat, fq, detail, seaQ]);

  const close3dModule = useLazy(CLOSE3D_MODULE, enabled && close3d);
  const detailModule = useLazy(DETAIL_MODULE, enabled && !!detail && !close3d);
  if (!enabled || !shown) return [];
  const lower = bitmaps.get(shown.y0);
  const upper = bitmaps.get(shown.y1);
  if (!lower || !upper) return [];
  const span = shown.y1 - shown.y0;
  const f = span > 0 ? Math.min(1, Math.max(0, (clampTime(time) - shown.y0) / span)) : 0;

  const common = {
    bounds: [-180, -90, 180, 90] as [number, number, number, number],
    _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false,
    desaturate: DESATURATE,
    tintColor: TINT,
  };
  // Ids by year: a year's texture is uploaded once and survives role changes.
  const layers: Layer[] = [
    new BitmapLayer({
      ...common,
      id: `terrain-${shown.y0}`,
      image: lower,
      // Under the 3D ground the flat map is only a backdrop: it must not hide water below z = 0.
      parameters: { depthWriteEnabled: !close3d, depthCompare: 'less-equal' },
    }),
  ];
  if (f > 0.002 && upper !== lower) {
    layers.push(
      new BitmapLayer({
        ...common,
        id: `terrain-${shown.y1}`,
        image: upper,
        opacity: f,
        parameters: { depthWriteEnabled: false, depthCompare: 'less-equal' },
      }),
    );
  }
  // Not under the close-up 3D: its ground takes the pyramid's colour itself, and flat tiles under it would only be fetched and hidden.
  if (detail && !close3d && detailModule) {
    const TerrainDetailLayer = detailModule.default;
    layers.push(
      new TerrainDetailLayer({
        id: 'terrain-detail',
        lower,
        upper,
        ref: detail.ref,
        manifest: detail.manifest,
        progress: f,
        seaLevel: seaLevelAt(clampTime(time)),
        parameters: { depthWriteEnabled: false, depthCompare: 'less-equal' },
      }),
    );
  }
  if (close3d) {
    // Mounted before the ground is ready, so the elevation tiles stream while the era pixels and habitat lookup decode.
    // Until its code is in (a deep link straight to the close-up), the flat era images stand in, as while the ground decodes.
    if (!close3dModule) return layers;
    const Close3DLayer = close3dModule.default;
    layers.push(new Close3DLayer({ id: 'close3d', ground: ground?.ground ?? null, groundKey: ground?.key ?? '', colourTiles: typeof window !== 'undefined' && terrainTilesParam(window.location.search), seaLevel: seaLevelAt(clampTime(time)), lake, ice: iceCover, plants: typeof window !== 'undefined' && plantsParam(window.location.search), detail: typeof window !== 'undefined' && groundParam(window.location.search), weather: typeof window !== 'undefined' && weatherParam(window.location.search) }));
    return layers;
  }
  layers.push(new TerrainReliefLayer({ id: 'terrain-relief', lower, upper, progress: f, seaLevel: seaLevelAt(clampTime(time)) }));
  // Over the relief, under people: white ice with a blue-grey edge, one picture per patch (not under the close-up: its ground is the ice).
  iceShown?.masks.forEach((m, i) => {
    layers.push(new BitmapLayer({
      id: `ice-${m.id}`,
      image: iceShown.bitmaps[i],
      bounds: iceBounds(m),
      _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      pickable: false,
      textureParameters: { minFilter: 'linear', magFilter: 'nearest' },
      parameters: { depthWriteEnabled: false, depthCompare: 'always' },
    }));
  });
  if (coast.length) {
    layers.push(
      new PathLayer<[number, number][]>({
        id: 'modern-coastline',
        data: coast,
        getPath: (d) => d,
        getColor: COAST_COLOUR,
        getWidth: 0.8,
        widthUnits: 'pixels',
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        // Over the terrain (same depth) and never hidden by it.
        parameters: { depthCompare: 'always' },
      }),
    );
  }
  return layers;
}
