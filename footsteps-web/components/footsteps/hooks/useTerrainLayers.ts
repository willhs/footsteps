'use client';

import { useEffect, useMemo, useState } from 'react';
import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import { BitmapLayer, PathLayer } from '@deck.gl/layers';
import { TERRAIN_YEARS } from '@/lib/constants';
import { clampTime, terrainBracket } from '@/lib/time';
import { seaLevelAt } from '@/lib/climate';
import TerrainReliefLayer, { TERRAIN_DESATURATE, TERRAIN_TINT } from '../layers/TerrainReliefLayer';
import Close3DLayer from '../layers/Close3DLayer';
import { cellOffset, decodeTemp, habitatStep, habitatUrl } from '@/lib/habitat';
import { loadLookup } from '@/lib/habitatImages';
import { groundParam, plantsParam, type Ground } from '@/lib/close3d';
import { lakePlaneFor, loadPastWater, pastWaterEpoch, pastWaterParam, pastWaterTerrainYear, type PastWaterLayers } from '@/lib/pastWater';
import TerrainDetailLayer from '../layers/TerrainDetailLayer';
import {
  DETAIL_REF_URL,
  loadDetailManifest,
  loadDetailRefPixels,
  photoWeight,
  recolour,
  sampleDetail,
  WEIGHT_TAP_PX,
  terrainTilesParam,
  type DetailManifest,
  type DetailPixels,
} from '@/lib/terrainDetail';

// One natural-colour Earth per terrain year (footstep-generator/terrain_image.py).
// The two images either side of `time` are drawn as an opaque lower image and the
// upper one at opacity f: an exact cross-fade, no shader needed.
// Bump when the images are regenerated: Cloudflare caches /terrain for a day.
// v3: farmland calibrated to the Blue Marble photo (2026-11-11).
const TERRAIN_VERSION = 3;
// `?pastwater=1`: the years the dated Mega-Chad lake repaints come from /terrain/pastwater/ (terrain_image.py --pastwater); the flag is fixed for the page load.
const pastWaterOn = () => typeof window !== 'undefined' && pastWaterParam(window.location.search);
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

type Rgb = [number, number, number];

/** Bilinear colour (0..1) of an equirectangular w x h RGBA image at a point. */
function sampleEra(img: Uint8ClampedArray, w: number, h: number, lon: number, lat: number): Rgb {
  const fx = ((lon + 180) / 360) * w - 0.5;
  const fy = ((90 - lat) / 180) * h - 0.5;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));
  const at = (x: number, y: number, c: number) => img[(y * w + x) * 4 + c];
  const out: Rgb = [0, 0, 0];
  for (let c = 0; c < 3; c++)
    out[c] = ((at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) + (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty) / 255;
  return out;
}

/** The flat map's look (desaturate, then tint) on a 0..1 colour, as 0..255. */
function baseLook(c: Rgb): Rgb {
  const grey = (c[0] + c[1] + c[2]) / 3;
  return c.map((v, i) => (v + (grey - v) * DESATURATE) * TINT[i]) as Rgb;
}

/** What the close-up 3D ground needs to know about the year: its Earth colour (the two era images
 * blended, with the flat map's tint), Krapp biome and temperature per 0.5° cell. With the reference photo
 * (`ref`, lib/terrainDetail.ts) it can also take a pyramid tile's detail, as the flat map's tiles do. */
function makeGround(
  lower: Uint8ClampedArray, upper: Uint8ClampedArray, w: number, h: number, f: number, habitat: Uint8ClampedArray,
  ref: { rgba: Uint8ClampedArray; width: number; height: number } | null, seaLevel: number,
): Ground {
  // photoWeight averaged over the shader's five taps (TerrainDetailLayer), per endpoint. It changes on the era image's
  // ~20 km grid, so it is computed once per quarter era pixel (`weights`, one cache per ground tile), not per vertex.
  const dx = (WEIGHT_TAP_PX * 360) / w;
  const dy = (WEIGHT_TAP_PX * 180) / h;
  const weightsAt = (lon: number, lat: number, weights: Map<number, [number, number]>): [number, number] => {
    const qx = Math.round(((lon + 180) / 360) * w * 4);
    const qy = Math.round(((90 - lat) / 180) * h * 4);
    const key = qy * w * 4 + qx;
    let hit = weights.get(key);
    if (!hit) {
      const [cl, ct] = [(qx / (w * 4)) * 360 - 180, 90 - (qy / (h * 4)) * 180];
      let w0 = 0;
      let w1 = 0;
      for (const [ox, oy] of [[0, 0], [dx, 0], [-dx, 0], [0, dy], [0, -dy]]) {
        const rr = sampleEra(ref!.rgba, ref!.width, ref!.height, cl + ox, ct + oy);
        w0 += photoWeight(sampleEra(lower, w, h, cl + ox, ct + oy), rr);
        w1 += photoWeight(sampleEra(upper, w, h, cl + ox, ct + oy), rr);
      }
      hit = [w0 / 5, w1 / 5];
      weights.set(key, hit);
    }
    return hit;
  };
  const colourAt = (lon: number, lat: number, tile?: DetailPixels, weights?: Map<number, [number, number]>): Rgb => {
    let lo = sampleEra(lower, w, h, lon, lat);
    let hi = sampleEra(upper, w, h, lon, lat);
    if (tile && ref && weights) {
      const r = sampleEra(ref.rgba, ref.width, ref.height, lon, lat);
      const d = sampleDetail(tile, lon, lat);
      const [w0, w1] = weightsAt(lon, lat, weights);
      lo = recolour(lo, r, d, seaLevel, w0);
      hi = recolour(hi, r, d, seaLevel, w1);
    }
    return baseLook([0, 1, 2].map((c) => lo[c] * (1 - f) + hi[c] * f) as Rgb);
  };
  const ground: Ground = {
    colourAt: (lon, lat) => colourAt(lon, lat),
    biomeAt: (lon, lat) => habitat[cellOffset(lon, lat)],
    tempAt: (lon, lat) => {
      const b = habitat[cellOffset(lon, lat) + 1];
      return b ? decodeTemp(b) : null;
    },
  };
  if (ref)
    ground.withDetail = (tile) => {
      const weights = new Map<number, [number, number]>();
      return { ...ground, colourAt: (lon, lat) => colourAt(lon, lat, tile, weights) };
    };
  return ground;
}

/** The pyramid's manifest and reference photo, loaded once (null until both are in, or when tiles are off). */
type DetailSource = { manifest: DetailManifest; ref: ImageBitmap; refPixels: { rgba: Uint8ClampedArray; width: number; height: number } };
let detailPromise: Promise<DetailSource> | null = null;
function loadDetailSource(): Promise<DetailSource> {
  detailPromise ??= Promise.all([
    loadDetailManifest(),
    fetch(DETAIL_REF_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`detail ref: HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b)),
    loadDetailRefPixels(),
  ])
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
  // The modelled lake (small patches, ~9 KB) is fetched only with the flag and the close-up on; the plane exists only in the scenario's epoch.
  const [lakeLayers, setLakeLayers] = useState<PastWaterLayers | null>(null);
  useEffect(() => {
    if (!enabled || !close3d || !pastWaterOn()) return;
    let live = true;
    loadPastWater().then((layers) => live && setLakeLayers(layers)).catch((error) => console.warn('[terrain] no past water', error));
    return () => {
      live = false;
    };
  }, [enabled, close3d]);
  const epoch = pastWaterEpoch(clampTime(time));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the plane depends on the epoch, not on every tick of `time`
  const lake = useMemo(() => lakePlaneFor(lakeLayers, clampTime(time)), [lakeLayers, epoch]);
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
  if (detail) {
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
    if (ground) layers.push(new Close3DLayer({ id: 'close3d', ground: ground.ground, groundKey: ground.key, colourTiles: detail?.manifest ?? null, seaLevel: seaLevelAt(clampTime(time)), lake, plants: typeof window !== 'undefined' && plantsParam(window.location.search), detail: typeof window !== 'undefined' && groundParam(window.location.search) }));
    return layers;
  }
  layers.push(new TerrainReliefLayer({ id: 'terrain-relief', lower, upper, progress: f, seaLevel: seaLevelAt(clampTime(time)) }));
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
