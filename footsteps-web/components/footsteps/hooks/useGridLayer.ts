// Grid mode: draw HYDE cells straight from a small per-year PNG
// (footstep-generator/grid_image.py) instead of pre-built dot tiles.
// One dot per populated ~10 km cell, sized by people; ~3 MB per year.
import { useEffect, useMemo, useState } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import { buildUnits, UnitKind, type Units } from '@/components/footsteps/layers/units';

const MAX_PEOPLE = 5_000_000; // must match grid_image.py
const LOG_MAX = Math.log1p(MAX_PEOPLE);

export type GridData = {
  length: number;
  positions: Float32Array; // lon, lat pairs
  people: Float32Array;
  cellIds: Uint32Array; // row * width + col, stable across years
  cellDeg: number;
  total: number;
};

export type GridStyle = 'grid' | 'units';

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
  const cellIds = new Uint32Array(n);
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
      cellIds[k] = row * w + col;
      total += p;
      k++;
    }
  }
  return { length: n, positions, people, cellIds, cellDeg: cell, total };
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
  style = 'grid',
  zoom = 1,
  setFeatureCount,
  setTotalPopulation,
  setMetricsLoading,
}: {
  year: number;
  enabled: boolean;
  style?: GridStyle;
  zoom?: number;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setMetricsLoading: (v: boolean) => void;
}) {
  const [grid, setGrid] = useState<{ year: number; data: GridData } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadGrid(year)
      .then((data) => {
        if (!live) return;
        setGrid({ year, data });
        setTotalPopulation(data.total);
        setMetricsLoading(false);
      })
      .catch((e) => console.warn('[grid] failed to load', year, e));
    return () => {
      live = false;
    };
  }, [year, enabled, setFeatureCount, setTotalPopulation, setMetricsLoading]);

  const units = useMemo<Units | null>(
    () =>
      enabled && grid && style === 'units'
        ? buildUnits(grid.data.cellIds, grid.data.positions, grid.data.people, grid.data.cellDeg)
        : null,
    [enabled, grid, style],
  );

  useEffect(() => {
    if (!enabled || !grid) return;
    setFeatureCount(units ? units.length : grid.data.length);
    if (units && process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true') {
      console.log('[units]', grid.year, { bands: units.counts[0], villages: units.counts[1], glows: units.counts[2] });
    }
  }, [enabled, grid, units, setFeatureCount]);

  // Far out, units are faint specks so density shows through overlap;
  // closer in, each band or village is a visible mark.
  // A ~10 km cell is ~0.06 * 2^zoom px wide, so marks only get a real size
  // once cells are a few pixels apart (zoom ~5+).
  const zoomBucket = zoom < 3 ? 0 : zoom < 5 ? 1 : 2;

  const layers = useMemo(() => {
    if (!enabled || !grid) return [];
    const { data } = grid;
    if (units) return unitLayers(grid.year, units, zoomBucket);
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
  }, [enabled, grid, units, zoomBucket]);
  return { layers, grid: enabled && grid?.year === year ? grid.data : null };
}

// Bands and villages are fixed-size marks (a group is a group, however many
// there are); only the glow cells scale with people. Warm colour for the
// invented placements, cyan for the measured density glow.
const UNIT_MIN_PX = [0.35, 0.6, 1.4];
const BAND_ALPHA = [60, 110, 200];
const VILLAGE_ALPHA = [35, 60, 150];

function unitLayers(year: number, u: Units, zb: number): LayersList {
  return [
    new ScatterplotLayer({
      id: `units-${year}`,
      data: {
        length: u.length,
        attributes: { getPosition: { value: u.positions, size: 2 } },
      },
      getRadius: (_: unknown, { index }: { index: number }) => {
        const k = u.kind[index];
        if (k === UnitKind.Band) return 600;
        if (k === UnitKind.Village) return 1500;
        return Math.min(Math.sqrt(u.people[index]) * 45, 30_000);
      },
      getFillColor: (_: unknown, { index }: { index: number }) => {
        const k = u.kind[index];
        if (k === UnitKind.Band) return [255, 190, 110, BAND_ALPHA[zb]];
        if (k === UnitKind.Village) return [255, 225, 160, VILLAGE_ALPHA[zb]];
        const t = Math.min(Math.log1p(u.people[index]) / Math.log1p(1_000_000), 1);
        return [60, 230, 255, Math.round(140 + 115 * t)];
      },
      radiusUnits: 'meters',
      radiusMinPixels: UNIT_MIN_PX[zb],
      updateTriggers: { getFillColor: zb },
      stroked: false,
      pickable: true,
      // Additive: overlapping marks brighten like night lights instead of
      // stacking into a flat fill.
      parameters: {
        depthTest: false,
        blend: true,
        blendColorSrcFactor: 'src-alpha',
        blendColorDstFactor: 'one',
        blendAlphaSrcFactor: 'one',
        blendAlphaDstFactor: 'one',
      },
    }),
  ] as LayersList;
}
