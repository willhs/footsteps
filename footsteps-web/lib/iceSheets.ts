// Ice sheets at their dated extent (`?ice=1`, off by default until Will has reviewed it on prod). PaleoMIST 1.0 margins (Gowan et al. 2021,
// CC BY 4.0) baked by footstep-generator/ice_sheets.py into one mask patch per (epoch, region) on the 2.5′ world grid. Every consumer reads the
// same patches, so the flat overlay, the close-up ice surface, the groups' exclusion and the hover card cannot disagree.
// The RULE: a year shows the nearest native epoch (2.5 ka apart), never an interpolation; before 80 ka there is no reconstruction.
// See docs/ops/ice-sheets.md.
import manifestJson from '../public/ice/ice_sheets.json';
import type { LakeMask, Patch, PeopleMode, Unresolved } from './pastWater';

export type IceRegion = 'Eurasia' | 'North_America' | 'Patagonia';
/** One (epoch, region) mask patch. `id` is unique across ice patches and past-water epochs (past water < 100), so one id names one exclusion. */
export type IcePatch = Patch & { id: number; region: IceRegion; file: string; bytes: number; sha256: string; pixels: number; area_km2: number };
/** A native epoch: its age (years BP), the calendar years nearest it (both ends inclusive) and its patches. Windows tile with no gaps. */
export type IceEpoch = { bp: number; ka: string; from_year: number; to_year: number; patches: IcePatch[] };
export type IceManifest = {
  label: string; source: { name: string; citation: string; dataset: string; licence: string }; evidence: string; rule: string; outside: string;
  regions: Record<IceRegion, string>; uncertainty: string[]; epochs: IceEpoch[]; bytes: number; digest: string;
};
export const ICE: IceManifest = manifestJson as unknown as IceManifest;

/** `?ice=1` turns the ice layer on. Read once per page load by the page and the grid worker. */
export function iceParam(search: string): boolean {
  return new URLSearchParams(search).get('ice') !== '0';
}

/** The epoch a calendar year shows, or null before the oldest window (no reconstruction). The 0 ka window runs past the present. */
export function iceEpochAt(year: number): IceEpoch | null {
  return ICE.epochs.find((e) => year >= e.from_year && year <= e.to_year) ?? null;
}

/** The patch ids in force at a year: what the site ranker takes with the past-water epochs. */
export function iceIds(year: number): number[] {
  return iceEpochAt(year)?.patches.map((p) => p.id) ?? [];
}

/** A patch's ice on the 2.5′ world grid (1 = ice), in the same shape as a past-water mask. */
export type IceMask = LakeMask & { id: number; region: IceRegion };
/** Every patch's place (from the manifest, known before any pixel loads) and the masks decoded so far, by id. The ranker reads both. */
export type IceLayers = { patches: readonly IcePatch[]; masks: Map<number, IceMask> };

/** A patch's mask from its decoded image (RGBA; red > 127 = ice), checked against the manifest. */
export function iceMaskFrom(p: IcePatch, img: { width: number; height: number; data: ArrayLike<number> }): IceMask {
  if (img.width !== p.width || img.height !== p.height) throw new Error(`Ice ${p.file}: ${img.width} x ${img.height}, manifest says ${p.width} x ${p.height}`);
  const wet = new Uint8Array(p.width * p.height);
  for (let i = 0; i < wet.length; i++) wet[i] = img.data[i * 4] > 127 ? 1 : 0;
  return { id: p.id, region: p.region, x0: p.x0, y0: p.y0, width: p.width, height: p.height, wet };
}

async function readImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Ice ${url}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const { width, height } = bmp;
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bmp.close();
    throw new Error('Ice needs a 2D canvas');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** One store per page and thread: patches load an epoch at a time, when a year first needs it. */
export const iceLayers: IceLayers = { patches: ICE.epochs.flatMap((e) => e.patches), masks: new Map() };
const pending = new Map<number, Promise<IceMask[]>>();
/** The masks of the epoch a year shows (fetched once; a failed fetch is retried by the next caller). Empty before 80 ka. */
export function loadIceAt(year: number, store: IceLayers = iceLayers): Promise<IceMask[]> {
  const epoch = iceEpochAt(year);
  if (!epoch) return Promise.resolve([]);
  let p = pending.get(epoch.bp);
  if (!p) {
    p = Promise.all(epoch.patches.map(async (patch) => {
      const have = store.masks.get(patch.id);
      if (have) return have;
      const mask = iceMaskFrom(patch, await readImage(`/ice/${patch.file}`));
      store.masks.set(patch.id, mask);
      return mask;
    })).catch((error) => { pending.delete(epoch.bp); throw error; });
    pending.set(epoch.bp, p);
  }
  return p;
}

const PIXELS_ACROSS = 8640;
const PIXELS_DOWN = 4320;
/** Ice share (0..1) around a point: the bilinear mix of the four 2.5′ pixel centres, the highest over the masks given. */
export function iceShareAt(masks: readonly IceMask[], lon: number, lat: number): number {
  const px = ((lon + 180) / 360) * PIXELS_ACROSS - 0.5;
  const py = ((90 - lat) / 180) * PIXELS_DOWN - 0.5;
  const fx0 = Math.floor(px);
  const fy0 = Math.floor(py);
  const fx = px - fx0;
  const fy = py - fy0;
  let best = 0;
  for (const m of masks) {
    if (fx0 + 1 < m.x0 || fy0 + 1 < m.y0 || fx0 >= m.x0 + m.width || fy0 >= m.y0 + m.height) continue;
    const at = (x: number, y: number) => {
      const c = x - m.x0;
      const r = y - m.y0;
      return c >= 0 && r >= 0 && c < m.width && r < m.height ? m.wet[r * m.width + c] : 0;
    };
    const s = at(fx0, fy0) * (1 - fx) * (1 - fy) + at(fx0 + 1, fy0) * fx * (1 - fy) + at(fx0, fy0 + 1) * (1 - fx) * fy + at(fx0 + 1, fy0 + 1) * fx * fy;
    if (s > best) best = s;
  }
  return best;
}

/** The mask under a point by its nearest pixel (the hover's test), or null. */
export function iceMaskAt(masks: readonly IceMask[], lon: number, lat: number): IceMask | null {
  const x = Math.floor(((lon + 180) / 360) * PIXELS_ACROSS);
  const y = Math.floor(((90 - lat) / 180) * PIXELS_DOWN);
  return masks.find((m) => x >= m.x0 && y >= m.y0 && x < m.x0 + m.width && y < m.y0 + m.height && m.wet[(y - m.y0) * m.width + (x - m.x0)] === 1) ?? null;
}

/** The overlay's look: ice white and a little translucent, its edge (ice pixels within EDGE_PX of open ground) a solid blue-grey line. */
export const ICE_FILL = [244, 248, 252, 225] as const;
export const ICE_EDGE = [120, 150, 182, 255] as const;
const EDGE_PX = 2;
/** RGBA pixels of a patch's overlay (transparent off the ice). The edge is drawn inside the ice, so the white never spills past the margin. */
export function iceOverlayPixels(m: IceMask): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h, wet } = m;
  // distance (in pixels, chessboard) from each ice pixel to the nearest non-ice one, capped at EDGE_PX + 1
  const near = new Uint8Array(w * h).fill(EDGE_PX + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (wet[y * w + x]) continue;
      for (let dy = -EDGE_PX; dy <= EDGE_PX; dy++)
        for (let dx = -EDGE_PX; dx <= EDGE_PX; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < near[yy * w + xx]) near[yy * w + xx] = d;
        }
    }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (!wet[i]) continue;
    out.set(near[i] <= EDGE_PX ? ICE_EDGE : ICE_FILL, i * 4);
  }
  return out;
}

/** A patch's bounds in degrees [west, south, east, north]. */
export function iceBounds(p: Patch): [number, number, number, number] {
  const deg = 360 / PIXELS_ACROSS;
  return [-180 + p.x0 * deg, 90 - (p.y0 + p.height) * deg, -180 + (p.x0 + p.width) * deg, 90 - p.y0 * deg];
}

const REGION_NAME: Record<IceRegion, string> = { Eurasia: 'Eurasia', North_America: 'North America', Patagonia: 'Patagonia' };
const BASIS_SHORT: Record<IceRegion, string> = {
  Eurasia: 'after DATED-1, most credible',
  North_America: 'PaleoMIST margin compilation',
  Patagonia: 'after Ehlers et al. 2011 and GLIMS',
};
/** The hover line for a point on ice: "Ice sheet (PaleoMIST 1.0, 22.5 ka)" and where its line comes from. */
export function iceHoverRow(epoch: IceEpoch, region: IceRegion): { text: string; detail: string } {
  const half = epoch.bp === 0 ? 'present' : `nearest 2.5 ka epoch`;
  return {
    text: `Ice sheet (${ICE.source.name}, ${epoch.ka} ka)`,
    detail: `${REGION_NAME[region]}: ${BASIS_SHORT[region]} · ${half}, edges step, not interpolated`,
  };
}

/** The note shown with the flag on: the epoch drawn, and what the groups did. */
/** The status line, or null before 80 ka (no reconstruction) and when no ice is drawn in the mapped regions (on by default, so it says nothing when idle). */
export function iceNote(year: number, mode: PeopleMode, unresolved: Unresolved | undefined): { label: string; title: string } | null {
  const epoch = iceEpochAt(year);
  if (!epoch || !epoch.patches.length) return null;
  const basis = `Dated margins (on unless ?ice=0). ${ICE.source.name} (${ICE.source.citation}; ${ICE.source.licence}). Rule: ${ICE.rule} ${ICE.uncertainty.join(' ')}`;
  const area = epoch.patches.reduce((s, p) => s + p.area_km2, 0);
  const head = `Ice sheets: ${ICE.source.name}, ${epoch.ka} ka`;
  const drawn = `Drawn: ${epoch.patches.map((p) => `${REGION_NAME[p.region]} ${(p.area_km2 / 1e6).toFixed(2)} million km²`).join(', ') || 'no ice in these regions'} (${(area / 1e6).toFixed(1)} million km²).`;
  if (mode === 'dots') return { label: `${head} · not applied to Dots`, title: `Dots is a static archive: its positions do not follow the ice. ${drawn} ${basis}` };
  if (mode === 'grid') return { label: head, title: `Grid shows people per cell and places nobody, so cells under the ice keep their people on the map. ${drawn} ${basis}` };
  if (!unresolved) return { label: head, title: `Groups are not being kept off the ice yet: still loading, or the settlement model or ranked sites are off. ${drawn} ${basis}` };
  const tail = unresolved.groups
    ? ` · ${unresolved.groups.toLocaleString()} groups unplaced (cells all ice or water)`
    : ' · groups kept off the ice';
  const placed = unresolved.groups
    ? `${unresolved.groups.toLocaleString()} group${unresolved.groups === 1 ? '' : 's'} (${Math.round(unresolved.people).toLocaleString()} people) sit in cells that are all ice (or modelled water, with ?pastwater=1): not drawn, still counted in the totals.`
    : 'Every group is placed off the ice.';
  return { label: `${head}${tail}`, title: `${placed} ${drawn} ${basis}` };
}
