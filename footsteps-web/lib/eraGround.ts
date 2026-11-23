// The year's ground for the close-up 3D (lib/close3d.ts `Ground`), from the two era images either side of the year,
// the habitat lookup and, with `?terrain_tiles=1`, the colour pyramid's reference photo (lib/terrainDetail.ts).
// Called for every vertex of every ground tile (~17,000 per tile), so the samplers below avoid allocating.
import { cellOffset, decodePrecip, decodeTemp } from './habitat';
import type { Ground } from './close3d';
import { photoWeight, recolour, sampleDetail, WEIGHT_TAP_PX, type DetailPixels } from './terrainDetail';

type Rgb = [number, number, number];

/** The flat map's dimmed day colours (layers/TerrainReliefLayer.ts draws with the same), so people stay the brightest thing. */
export const TERRAIN_TINT: [number, number, number] = [230, 230, 235];
export const TERRAIN_DESATURATE = 0.1;

/** Bilinear colour (0..1) of an equirectangular w x h RGBA image at a point, written into `out`. */
export function sampleEraInto(out: Rgb, img: Uint8ClampedArray, w: number, h: number, lon: number, lat: number): Rgb {
  const fx = ((lon + 180) / 360) * w - 0.5;
  const fy = ((90 - lat) / 180) * h - 0.5;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));
  const a = (y0 * w + x0) * 4;
  const b = (y0 * w + x1) * 4;
  const c = (y1 * w + x0) * 4;
  const d = (y1 * w + x1) * 4;
  for (let k = 0; k < 3; k++) out[k] = ((img[a + k] * (1 - tx) + img[b + k] * tx) * (1 - ty) + (img[c + k] * (1 - tx) + img[d + k] * tx) * ty) / 255;
  return out;
}

/** Bilinear colour (0..1) of an equirectangular w x h RGBA image at a point. */
export function sampleEra(img: Uint8ClampedArray, w: number, h: number, lon: number, lat: number): Rgb {
  return sampleEraInto([0, 0, 0], img, w, h, lon, lat);
}

/** The flat map's look (desaturate, then tint) on a 0..1 colour, as 0..255. */
export function baseLook(c: Rgb): Rgb {
  const grey = (c[0] + c[1] + c[2]) / 3;
  return [
    (c[0] + (grey - c[0]) * TERRAIN_DESATURATE) * TERRAIN_TINT[0],
    (c[1] + (grey - c[1]) * TERRAIN_DESATURATE) * TERRAIN_TINT[1],
    (c[2] + (grey - c[2]) * TERRAIN_DESATURATE) * TERRAIN_TINT[2],
  ];
}

/** What the close-up 3D ground needs to know about the year: its Earth colour (the two era images
 * blended, with the flat map's tint), Krapp biome and temperature per 0.5° cell. With the reference photo
 * (`ref`, lib/terrainDetail.ts) it can also take a pyramid tile's detail, as the flat map's tiles do. */
export function makeGround(
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
  // Scratch colours: colourAt runs once per vertex, and its result is copied out before the next call.
  const lo: Rgb = [0, 0, 0];
  const hi: Rgb = [0, 0, 0];
  const colourAt = (lon: number, lat: number, tile?: DetailPixels, weights?: Map<number, [number, number]>): Rgb => {
    sampleEraInto(lo, lower, w, h, lon, lat);
    sampleEraInto(hi, upper, w, h, lon, lat);
    let a: Rgb = lo;
    let b: Rgb = hi;
    if (tile && ref && weights) {
      const r = sampleEra(ref.rgba, ref.width, ref.height, lon, lat);
      const d = sampleDetail(tile, lon, lat);
      const [w0, w1] = weightsAt(lon, lat, weights);
      a = recolour(lo, r, d, seaLevel, w0);
      b = recolour(hi, r, d, seaLevel, w1);
    }
    return baseLook([a[0] * (1 - f) + b[0] * f, a[1] * (1 - f) + b[1] * f, a[2] * (1 - f) + b[2] * f]);
  };
  const ground: Ground = {
    colourAt: (lon, lat) => colourAt(lon, lat),
    biomeAt: (lon, lat) => habitat[cellOffset(lon, lat)],
    tempAt: (lon, lat) => {
      const b = habitat[cellOffset(lon, lat) + 1];
      return b ? decodeTemp(b) : null;
    },
    precipAt: (lon, lat) => {
      const b = habitat[cellOffset(lon, lat) + 2];
      return b ? decodePrecip(b) : null;
    },
  };
  if (ref)
    ground.withDetail = (tile) => {
      const weights = new Map<number, [number, number]>();
      return { ...ground, colourAt: (lon, lat) => colourAt(lon, lat, tile, weights) };
    };
  return ground;
}
