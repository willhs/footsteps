'use client';

import { useEffect, useState } from 'react';
import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import { BitmapLayer, PathLayer } from '@deck.gl/layers';
import { TERRAIN_YEARS } from '@/lib/constants';
import { clampTime, terrainBracket } from '@/lib/time';

// One natural-colour Earth per terrain year (footstep-generator/terrain_image.py).
// The two images either side of `time` are drawn as an opaque lower image and the
// upper one at opacity f: an exact cross-fade, no shader needed.
// Bump when the images are regenerated: Cloudflare caches /terrain for a day.
// v2: stronger farmland (2026-11-11).
const TERRAIN_VERSION = 2;
const terrainUrl = (year: number) => `/terrain/earth_${year}.webp?v=${TERRAIN_VERSION}`;

// Dimmed day colours, so people (night lights) stay the brightest thing.
const TINT: [number, number, number] = [230, 230, 235];
const DESATURATE = 0.1;
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

/** Background layers for terrain mode at continuous `time`. */
export default function useTerrainLayers(time: number, enabled: boolean): Layer[] {
  const { y0, y1 } = terrainBracket(time);
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
      parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
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
