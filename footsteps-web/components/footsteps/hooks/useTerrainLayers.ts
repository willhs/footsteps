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
import type { Ground } from '@/lib/close3d';

// One natural-colour Earth per terrain year (footstep-generator/terrain_image.py).
// The two images either side of `time` are drawn as an opaque lower image and the
// upper one at opacity f: an exact cross-fade, no shader needed.
// Bump when the images are regenerated: Cloudflare caches /terrain for a day.
// v3: farmland calibrated to the Blue Marble photo (2026-11-11).
const TERRAIN_VERSION = 3;
const terrainUrl = (year: number) => `/terrain/earth_${year}.webp?v=${TERRAIN_VERSION}`;

// Dimmed day colours, so people (night lights) stay the brightest thing.
const TINT = TERRAIN_TINT;
const DESATURATE = TERRAIN_DESATURATE;
const COAST_COLOUR: [number, number, number, number] = [255, 255, 255, 46];

const bitmaps = new Map<number, ImageBitmap>();
const loading = new Map<number, Promise<ImageBitmap>>();

function loadTerrain(year: number): Promise<ImageBitmap> {
  let p = loading.get(year);
  if (!p) {
    p = fetch(terrainUrl(year))
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

/** What the close-up 3D ground needs to know about the year: its Earth colour (the two era images
 * blended, with the flat map's tint), Krapp biome and temperature per 0.5° cell. */
function makeGround(lower: Uint8ClampedArray, upper: Uint8ClampedArray, w: number, h: number, f: number, habitat: Uint8ClampedArray): Ground {
  const sample = (img: Uint8ClampedArray, x: number, y: number, c: number) => img[(y * w + x) * 4 + c];
  return {
    colourAt: (lon, lat) => {
      const fx = ((lon + 180) / 360) * w - 0.5;
      const fy = ((90 - lat) / 180) * h - 0.5;
      const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const ty = Math.min(1, Math.max(0, fy - y0));
      const out: [number, number, number] = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const at = (img: Uint8ClampedArray) =>
          (sample(img, x0, y0, c) * (1 - tx) + sample(img, x1, y0, c) * tx) * (1 - ty) +
          (sample(img, x0, y1, c) * (1 - tx) + sample(img, x1, y1, c) * tx) * ty;
        out[c] = at(lower) * (1 - f) + at(upper) * f;
      }
      const grey = (out[0] + out[1] + out[2]) / 3;
      return out.map((v, c) => (v + (grey - v) * DESATURATE) * (TINT[c] / 255)) as [number, number, number];
    },
    biomeAt: (lon, lat) => habitat[cellOffset(lon, lat)],
    tempAt: (lon, lat) => {
      const b = habitat[cellOffset(lon, lat) + 1];
      return b ? decodeTemp(b) : null;
    },
  };
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
  // The pair on screen: the wanted one once both images are decoded, until then
  // the last complete pair (never a blank frame while scrubbing).
  const [shown, setShown] = useState<Pair | null>(null);
  const [coast, setCoast] = useState<[number, number][][]>([]);

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
    if (enabled) loadCoastline().then(setCoast);
  }, [enabled]);

  // Blend weight quantised so the 3D ground is rebuilt at most ~20 times across a terrain step.
  const fq = shown ? Math.round(Math.min(1, Math.max(0, (clampTime(time) - shown.y0) / Math.max(1, shown.y1 - shown.y0))) * 20) / 20 : 0;
  const ground = useMemo(() => {
    if (!close3d || !shown || !habitat) return null;
    const lo = eraPixels(shown.y0);
    const hi = eraPixels(shown.y1);
    const bmp = bitmaps.get(shown.y0);
    if (!lo || !hi || !bmp) return null;
    return { key: `${shown.y0}-${shown.y1}-${fq}-${habitat.ka}`, ground: makeGround(lo, hi, bmp.width, bmp.height, fq, habitat.rgba) };
  }, [close3d, shown, habitat, fq]);

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
  if (close3d) {
    if (ground) layers.push(new Close3DLayer({ id: 'close3d', ground: ground.ground, groundKey: ground.key, seaLevel: seaLevelAt(clampTime(time)) }));
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
