// The terrain detail pyramid (footstep-generator/terrain_tiles.py, docs/ops/terrain-images.md "Detail tiles").
//
// One year-independent pyramid of the 500 m Blue Marble photo (z3-8, 256 px Web Mercator tiles) plus the photo at
// the era image's 2048 x 1024 grid (`ref`). terrain_image.py paints land as `photo x smooth era ratio`, so
// `era / ref` is that ratio and `detail x era / ref` is the era picture with the finer photo's detail. Where the
// era image is not photo-derived (ice sheets on today's land, exposed shelves, era sea) the ratio leaves the
// script's clip range (0.25..2.5) and the era colour stays. The fine texture on past eras is today's ground:
// imagined, and the legend says so. Only the photo is sharp: Krapp biomes (0.5°), HYDE land use (5′) and the
// era coast (ETOPO 4′) stay at their own resolution inside the ratio.
//
// `recolour` is the rule both the flat map's shader (layers/TerrainDetailLayer.ts, `RECOLOUR_GLSL`) and the
// close-up 3D ground (lib/close3d.ts via useTerrainLayers) apply: change one, change the other.

export const DETAIL_MIN_ZOOM = 3;
export const DETAIL_MAX_ZOOM = 8;
/** Bump when the pyramid is regenerated: Cloudflare caches /terrain for a day. */
export const DETAIL_VERSION = 2;
export const detailTileUrl = (z: number, x: number, y: number) => `/terrain/detail/${z}/${x}/${y}.webp?v=${DETAIL_VERSION}`;
export const DETAIL_REF_URL = `/terrain/detail/ref.webp?v=${DETAIL_VERSION}`;
export const DETAIL_MANIFEST_URL = `/terrain/detail/manifest.png?v=${DETAIL_VERSION}`;

/** Detail tiles are off until reviewed: `?terrain_tiles=1` turns them on. The benchmark (docs/ops/terrain-bench.md,
 * 2026-11-21) showed zoom-4 time to detail +0.4-0.7 s and tilted pan fps down by up to ~15 in two scenes, and the
 * task allows a flag-free rollout only with no regression. */
export function terrainTilesParam(search: string): boolean {
  return new URLSearchParams(search).get('terrain_tiles') === '1';
}

/** Which tiles exist: the generator skips tiles that are all open ocean. `levels[z]` is a 2^z x 2^z mask. */
export type DetailManifest = { levels: Uint8Array[] };

/** Build the per-zoom masks from the z8 mask (row-major, nonzero = tile exists). */
export function manifestFrom(z8: ArrayLike<number>, maxZoom = DETAIL_MAX_ZOOM): DetailManifest {
  const levels: Uint8Array[] = [];
  let n = 2 ** maxZoom;
  let cur = new Uint8Array(n * n);
  for (let i = 0; i < cur.length; i++) cur[i] = z8[i] ? 1 : 0;
  levels[maxZoom] = cur;
  for (let z = maxZoom - 1; z >= 0; z--) {
    const m = n / 2;
    const next = new Uint8Array(m * m);
    for (let y = 0; y < m; y++)
      for (let x = 0; x < m; x++)
        next[y * m + x] = cur[2 * y * n + 2 * x] | cur[2 * y * n + 2 * x + 1] | cur[(2 * y + 1) * n + 2 * x] | cur[(2 * y + 1) * n + 2 * x + 1];
    levels[z] = next;
    cur = next;
    n = m;
  }
  return { levels };
}

export function hasDetailTile(m: DetailManifest, z: number, x: number, y: number): boolean {
  const level = m.levels[z];
  const n = 2 ** z;
  if (!level || x < 0 || y < 0 || x >= n || y >= n) return false;
  return level[y * n + x] === 1;
}

/** The pyramid tile that covers a tile at zoom z (the same one below the max zoom, its ancestor above). */
export function detailTileFor(z: number, x: number, y: number): [number, number, number] {
  const zd = Math.min(z, DETAIL_MAX_ZOOM);
  const s = z - zd;
  return [zd, x >> s, y >> s];
}

/** Web Mercator y in 0..1 (0 = north edge) for a latitude. */
export function mercatorY(lat: number): number {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

type Rgb = [number, number, number];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 1 for land colours, 0 for blue water (the relief shader's `landAt`), on 0..1 colours. */
export function landOf(c: Rgb): number {
  const m = Math.max(c[0], c[1]);
  return 1 - smoothstep(0.03, 0.18, (c[2] - m) / Math.max(0.02, m));
}

/** 1 for snow and ice colours (the relief shader's `iceAt`), on 0..1 colours. */
export function iceOf(c: Rgb): number {
  return smoothstep(0.5, 0.75, Math.min(c[0], c[1], c[2]));
}

/** How far `photoWeight` looks around a point, in era-image pixels: its five taps soften where the photo's detail stops
 * (an ice sheet's edge, a painted shelf) from a 20 km staircase into a ~30 km fade. */
export const WEIGHT_TAP_PX = 0.75;

/**
 * 0..1: how much one era-image colour is photo-derived (terrain_image.py paints land as `photo x ratio` and clips the
 * ratio to 0.25..2.5), so the photo's detail may be multiplied in. Outside that range the pixel was painted: era ice over
 * today's ice-free ground, an exposed shelf, era sea over today's land. All colours 0..1.
 */
export function photoWeight(era: Rgb, ref: Rgb): number {
  let w = 1;
  for (let c = 0; c < 3; c++) {
    const r = era[c] / Math.max(ref[c], 2 / 255);
    w *= smoothstep(0.18, 0.25, r) * (1 - smoothstep(2.5, 3.2, r));
  }
  // Era ice over today's ice-free ground is painted white: no fields or forest texture on an ice sheet.
  return w * (1 - iceOf(era) * (1 - iceOf(ref)));
}

/**
 * One era image's colour with the photo's detail, all 0..1: `era x detail / ref`, weighted by `weight` (`photoWeight`,
 * averaged over WEIGHT_TAP_PX taps by the callers). `era` and `ref` are sampled at the same point of the two
 * 2048 x 1024 images; `detail` is the pyramid's RGBA, alpha = today's land ramped to 0 at today's shore.
 * `seaLevel` (m, today 0): below ~-1.5 m, era land over today's sea or shore is exposed shelf, painted flat by
 * terrain_image.py, so neither today's sea nor today's coastline is drawn on it.
 */
export function recolour(era: Rgb, ref: Rgb, detail: [number, number, number, number], seaLevel: number, weight: number): Rgb {
  const below = Math.min(1, Math.max(0, (-1.5 - seaLevel) / 2.5));
  const w = weight * (1 - landOf(era) * (1 - detail[3]) * below);
  return [0, 1, 2].map((c) => {
    const ratio = era[c] / Math.max(ref[c], 2 / 255);
    return era[c] + (Math.min(1, detail[c] * ratio) - era[c]) * w;
  }) as Rgb;
}

/** GLSL twin of `photoWeight` and `recolour` (same names, same constants). */
export const RECOLOUR_GLSL = `
float detailLand(vec3 c) {
  float m = max(c.r, c.g);
  return 1.0 - smoothstep(0.03, 0.18, (c.b - m) / max(0.02, m));
}
float detailIce(vec3 c) {
  return smoothstep(0.5, 0.75, min(c.r, min(c.g, c.b)));
}
float photoWeight(vec3 era, vec3 ref) {
  vec3 ratio = era / max(ref, vec3(2.0 / 255.0));
  vec3 inside = smoothstep(vec3(0.18), vec3(0.25), ratio) * (1.0 - smoothstep(vec3(2.5), vec3(3.2), ratio));
  return inside.r * inside.g * inside.b * (1.0 - detailIce(era) * (1.0 - detailIce(ref)));
}
vec3 recolour(vec3 era, vec3 ref, vec4 detail, float seaLevel, float weight) {
  float below = clamp((-1.5 - seaLevel) / 2.5, 0.0, 1.0);
  float w = weight * (1.0 - detailLand(era) * (1.0 - detail.a) * below);
  vec3 ratio = era / max(ref, vec3(2.0 / 255.0));
  return mix(era, min(vec3(1.0), detail.rgb * ratio), w);
}
`;

// ---- pixels in the browser (close-up 3D) -------------------------------------------------------------------

export type DetailPixels = { z: number; x: number; y: number; rgba: Uint8ClampedArray };

async function imagePixels(url: string, signal?: AbortSignal): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bitmap = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const out = { rgba: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
}

let manifestPromise: Promise<DetailManifest> | null = null;
export function loadDetailManifest(): Promise<DetailManifest> {
  manifestPromise ??= imagePixels(DETAIL_MANIFEST_URL)
    .then(({ rgba, width }) => {
      const bits = new Uint8Array(width * width);
      for (let i = 0; i < bits.length; i++) bits[i] = rgba[i * 4] > 127 ? 1 : 0;
      return manifestFrom(bits, Math.log2(width));
    })
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}

let refPromise: Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> | null = null;
/** The reference photo's pixels (2048 x 1024), for the close-up 3D ground. */
export function loadDetailRefPixels() {
  refPromise ??= imagePixels(DETAIL_REF_URL).catch((err) => {
    refPromise = null;
    throw err;
  });
  return refPromise;
}

const pixelCache = new Map<string, Promise<DetailPixels | null>>();
const PIXEL_CACHE = 48;
/** The decoded pyramid tile covering tile (z, x, y), or null where the pyramid has none (open ocean). */
export function loadDetailPixels(manifest: DetailManifest, z: number, x: number, y: number): Promise<DetailPixels | null> {
  const [zd, xd, yd] = detailTileFor(z, x, y);
  if (zd < DETAIL_MIN_ZOOM || !hasDetailTile(manifest, zd, xd, yd)) return Promise.resolve(null);
  const key = `${zd}/${xd}/${yd}`;
  let p = pixelCache.get(key);
  if (p) {
    pixelCache.delete(key); // most recently used last
    pixelCache.set(key, p);
    return p;
  }
  p = imagePixels(detailTileUrl(zd, xd, yd))
    .then(({ rgba }) => ({ z: zd, x: xd, y: yd, rgba }))
    .catch(() => {
      pixelCache.delete(key);
      return null;
    });
  pixelCache.set(key, p);
  while (pixelCache.size > PIXEL_CACHE) pixelCache.delete(pixelCache.keys().next().value!);
  return p;
}

/** Bilinear photo colour and today's-land alpha (0..1) of a decoded pyramid tile at a point. */
export function sampleDetail(tile: DetailPixels, lon: number, lat: number): [number, number, number, number] {
  const n = 2 ** tile.z;
  const fx = Math.min(255, Math.max(0, (((lon + 180) / 360) * n - tile.x) * 256 - 0.5));
  const fy = Math.min(255, Math.max(0, (mercatorY(lat) * n - tile.y) * 256 - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(255, x0 + 1);
  const y1 = Math.min(255, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = tile.rgba;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = a[(y0 * 256 + x0) * 4 + c] * (1 - tx) + a[(y0 * 256 + x1) * 4 + c] * tx;
    const bot = a[(y1 * 256 + x0) * 4 + c] * (1 - tx) + a[(y1 * 256 + x1) * 4 + c] * tx;
    out[c] = (top * (1 - ty) + bot * ty) / 255;
  }
  return out;
}
