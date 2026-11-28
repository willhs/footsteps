'use client';

// The land round the groups in view (`?fields=1`; layers/fields.ts): reads what each group's place says (HYDE cropland and grazing shares of
// its 0.5° cell, the crops around its 5° cell, distance and way to fresh water) and builds the patches once per view box (useGridLayer's
// `inView`), never per frame. Nothing is fetched while the flag is off.
import { useEffect, useMemo, useState } from 'react';
import { cropsAround, herdsAround } from '@/lib/food';
import { landUseUrl, type GridData } from './gridData';
import { HYDE_MIN } from '@/lib/time';
import type { LandSet } from '../layers/Close3DLayer';
import { landPatches, WATER_CELL_DEG, waterHere, type Season } from '../layers/fields';
import { UnitKind } from '../layers/units';
import type { GroupsInView } from './useGridLayer';
import useFood from './useFood';

type GridImage = { width: number; height: number; ctx: OffscreenCanvasRenderingContext2D };
const images = new Map<string, Promise<GridImage>>();
/** A 5′ grid image (4320 × 2160, row 0 at 90°N, column 0 at 180°W), drawn once into a canvas; windows are read from it per view box (a few
 * dozen cells, not 9 million). The water image is kept for the page; land-use images only for the latest year. */
function loadGridImage(url: string, keep = false): Promise<GridImage> {
  let p = images.get(url);
  if (!p) {
    p = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const bmp = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('grid images need a 2D canvas');
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return { width: canvas.width, height: canvas.height, ctx };
    })();
    p.catch(() => images.delete(url));
    if (!keep) for (const key of [...images.keys()]) if (key.startsWith('/grid/landuse_')) images.delete(key);
    images.set(url, p);
  }
  return p;
}

type GridWindow = { col0: number; row0: number; width: number; height: number; r: Uint8Array; g: Uint8Array };
/** The cells of a grid image under a lon/lat box, with a margin of two cells. */
function gridWindow(img: GridImage, west: number, south: number, east: number, north: number): GridWindow {
  const cell = 360 / img.width;
  const col0 = Math.max(0, Math.floor((west + 180) / cell) - 2);
  const row0 = Math.max(0, Math.floor((90 - north) / cell) - 2);
  const col1 = Math.min(img.width, Math.ceil((east + 180) / cell) + 2);
  const row1 = Math.min(img.height, Math.ceil((90 - south) / cell) + 2);
  const [width, height] = [Math.max(1, col1 - col0), Math.max(1, row1 - row0)];
  const rgba = img.ctx.getImageData(col0, row0, width, height).data;
  const r = new Uint8Array(width * height);
  const g = new Uint8Array(width * height);
  for (let p = 0; p < r.length; p++) {
    r[p] = rgba[p * 4];
    g[p] = rgba[p * 4 + 1];
  }
  return { col0, row0, width, height, r, g };
}

/** HYDE cropland and grazing shares of the 5′ cell at a point (0..1), or zero outside the window. */
function landUseAt(w: GridWindow, lon: number, lat: number): { crop: number; grazing: number } {
  const c = Math.floor((lon + 180) / WATER_CELL_DEG) - w.col0;
  const r = Math.floor((90 - lat) / WATER_CELL_DEG) - w.row0;
  if (c < 0 || r < 0 || c >= w.width || r >= w.height) return { crop: 0, grazing: 0 };
  return { crop: w.r[r * w.width + c] / 255, grazing: w.g[r * w.width + c] / 255 };
}

let landVersion = 0;

/** People of the 5′ cell at a point, from the year's decoded grid (cellIds are row * 4320 + col, ascending), or null when it is not there. */
function cellPeople(grid: GridData, lon: number, lat: number): number | null {
  const id = Math.floor((90 - lat) / WATER_CELL_DEG) * 4320 + Math.floor((lon + 180) / WATER_CELL_DEG);
  const ids = grid.cellIds;
  let [lo, hi] = [0, grid.length - 1];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ids[mid] === id) return grid.people[mid];
    if (ids[mid] < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** `grid`: the year's cells (useGridLayer), for each group's share of its cell's people; null shares the whole cell's cropland with each. */
export default function useLand({ enabled, inView, season, grid }: { enabled: boolean; inView: GroupsInView | null; season: Season; grid: GridData | null }): LandSet | null {
  const food = useFood(enabled, enabled);
  const [water, setWater] = useState<GridImage | null>(null);
  useEffect(() => {
    if (enabled) loadGridImage('/water/water_distance.webp', true).then(setWater).catch((error) => console.warn('[fields] no water distance; no paths to water', error));
  }, [enabled]);
  // HYDE land use of the year at 5′ (the image the grid worker classes ways of life by; the browser has it cached), not the hover card's 0.5°
  // average, which blurs a river valley's fields into the desert beside it.
  const useYear = enabled && inView && inView.year >= HYDE_MIN ? inView.year : null;
  const [landUse, setLandUse] = useState<{ year: number; img: GridImage } | null>(null);
  useEffect(() => {
    if (useYear === null) return;
    let live = true;
    loadGridImage(landUseUrl(useYear))
      .then((img) => live && setLandUse({ year: useYear, img }))
      .catch((error) => console.warn('[fields] no land use', useYear, error));
    return () => {
      live = false;
    };
  }, [useYear]);
  const use = landUse && landUse.year === useYear ? landUse.img : null;
  return useMemo(() => {
    if (!enabled || !inView || !use) return null;
    const { groups, towns, year } = inView;
    const all = [...groups, ...towns];
    if (!all.length) return null;
    const box = [Math.min(...all.map((g) => g.lon)), Math.min(...all.map((g) => g.lat)), Math.max(...all.map((g) => g.lon)), Math.max(...all.map((g) => g.lat))] as const;
    const wet = water ? gridWindow(water, ...box) : null;
    const w = wet && { col0: wet.col0, row0: wet.row0, width: wet.width, height: wet.height, code: wet.r };
    const shares = gridWindow(use, ...box);
    const cellShare = (lon: number, lat: number, people: number) => {
      const cell = grid ? cellPeople(grid, lon, lat) : null;
      return cell && cell > 0 ? Math.min(1, people / cell) : 1;
    };
    const patches = landPatches(
      groups.map((g) => {
        const u = landUseAt(shares, g.lon, g.lat);
        return {
          lon: g.lon, lat: g.lat, kind: g.kind, people: g.people, crop: g.kind === UnitKind.Village ? u.crop : 0, grazing: u.grazing,
          cellShare: cellShare(g.lon, g.lat, g.people), water: w && waterHere(w, g.lon, g.lat),
        };
      }),
      towns.map((t) => ({ ...t, crop: landUseAt(shares, t.lon, t.lat).crop, cellShare: cellShare(t.lon, t.lat, t.people), water: w && waterHere(w, t.lon, t.lat) })),
      { season, crops: (lon, lat) => (food ? cropsAround(food, lon, lat, year) : []), herds: food ? (lon, lat) => herdsAround(food, lon, lat, year) : undefined },
    );
    // A new key for every new set of patches: the close-up drapes a tile again only when its key changes.
    return { key: `land${++landVersion}`, patches };
  }, [enabled, inView, use, water, food, season, grid]);
}
