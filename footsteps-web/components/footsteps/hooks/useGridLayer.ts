// Grid mode: draw HYDE cells straight from a small per-year PNG
// (footstep-generator/grid_image.py) instead of pre-built dot tiles.
// One dot per populated ~10 km cell, sized by people; ~3 MB per year.
import { useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';

const MAX_PEOPLE = 5_000_000; // must match grid_image.py
const LOG_MAX = Math.log1p(MAX_PEOPLE);

export type GridData = {
  length: number;
  positions: Float32Array; // lon, lat pairs
  people: Float32Array;
  total: number;
};

const cache = new Map<number, Promise<GridData>>();

export function gridUrl(year: number) {
  return `/grid/humans_${year}.png`;
}

async function decodeGrid(year: number): Promise<GridData> {
  const blob = await (await fetch(gridUrl(year))).blob();
  const bmp = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const w = bmp.width;
  const h = bmp.height;
  const cell = 360 / w;

  let n = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 4] | px[i * 4 + 1]) n++;
  const positions = new Float32Array(n * 2);
  const people = new Float32Array(n);
  let k = 0;
  let total = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const o = (row * w + col) * 4;
      const v = (px[o] << 8) | px[o + 1];
      if (!v) continue;
      const p = Math.expm1((v / 65535) * LOG_MAX);
      positions[k * 2] = -180 + (col + 0.5) * cell;
      positions[k * 2 + 1] = 90 - (row + 0.5) * cell;
      people[k] = p;
      total += p;
      k++;
    }
  }
  return { length: n, positions, people, total };
}

export function loadGrid(year: number) {
  let p = cache.get(year);
  if (!p) {
    p = decodeGrid(year);
    p.catch(() => cache.delete(year));
    cache.set(year, p);
  }
  return p;
}

export default function useGridLayer({
  year,
  enabled,
  setFeatureCount,
  setTotalPopulation,
  setMetricsLoading,
}: {
  year: number;
  enabled: boolean;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setMetricsLoading: (v: boolean) => void;
}): LayersList {
  const [grid, setGrid] = useState<{ year: number; data: GridData } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadGrid(year)
      .then((data) => {
        if (!live) return;
        setGrid({ year, data });
        setFeatureCount(data.length);
        setTotalPopulation(data.total);
        setMetricsLoading(false);
      })
      .catch((e) => console.warn('[grid] failed to load', year, e));
    return () => {
      live = false;
    };
  }, [year, enabled, setFeatureCount, setTotalPopulation, setMetricsLoading]);

  return useMemo(() => {
    if (!enabled || !grid) return [];
    const { data } = grid;
    return [
      new ScatterplotLayer({
        id: `grid-${grid.year}`,
        data: {
          length: data.length,
          attributes: {
            getPosition: { value: data.positions, size: 2 },
          },
        },
        // Area grows with people: ~300 m for 100 people, ~10 km for 100k.
        getRadius: (_: unknown, { index }: { index: number }) =>
          Math.min(Math.sqrt(data.people[index]) * 30, 25_000),
        getFillColor: (_: unknown, { index }: { index: number }) => {
          // Sparse cells (a few foragers) stay faint; dense ones glow.
          const t = Math.min(Math.log1p(data.people[index]) / Math.log1p(1_000_000), 1);
          return [0, 220, 255, Math.round(12 + 243 * t * t * t)];
        },
        radiusUnits: 'meters',
        radiusMinPixels: 0.5,
        stroked: false,
        pickable: false,
        parameters: { depthTest: false },
      }),
    ] as LayersList;
  }, [enabled, grid]);
}
