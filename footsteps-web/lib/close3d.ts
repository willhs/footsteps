// Close-up 3D (prototype, ?close3d=1): zoomed in, the map tilts and the ground becomes a
// landscape. Relief is measured (AWS Terrarium elevation tiles), the coast is the year's sea
// level (lib/climate.ts), colour is the year's Earth image (terrain_image.py) and the
// vegetation type follows the year's Krapp biome per 0.5° cell (habitat lookups). Where each
// tree stands, and how big it is drawn, is invented: one mark stands for many trees.
// Pure helpers here; drawing lives in components/footsteps/layers/Close3DLayer.ts.

/** Zoom at which the landscape replaces the flat map. */
export const CLOSE3D_ZOOM = 8;
/** Tilt reached by CLOSE3D_FULL_ZOOM. */
export const CLOSE3D_PITCH = 55;
const CLOSE3D_FULL_ZOOM = 10;
/** Relief is drawn this many times taller than it is, so hills read from above. */
export const EXAGGERATION = 1.6;

export function close3dParam(search: string): boolean {
  return new URLSearchParams(search).get('close3d') === '1';
}

/** Camera tilt for a zoom: flat until CLOSE3D_ZOOM, CLOSE3D_PITCH by CLOSE3D_FULL_ZOOM. */
export function pitchForZoom(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - CLOSE3D_ZOOM) / (CLOSE3D_FULL_ZOOM - CLOSE3D_ZOOM)));
  return CLOSE3D_PITCH * t * t * (3 - 2 * t);
}

/** Metres per screen pixel at a zoom and latitude (deck.gl's 512 px world). */
export function metersPerPixel(zoom: number, lat: number): number {
  return (40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export type TreeKind = 'broadleaf' | 'conifer' | 'acacia' | 'shrub';
type Veg = { kind: TreeKind | 'mixed'; density: number; rgb: [number, number, number] };

/** Plant cover per Krapp biome code (lib/habitat.ts BIOMES): what kind of plant, how many of the
 * candidate spots get one (0..1), and its colour. A drawing table, not data. */
export const VEGETATION: Record<number, Veg> = {
  1: { kind: 'broadleaf', density: 0.95, rgb: [30, 78, 34] }, // tropical evergreen forest
  2: { kind: 'broadleaf', density: 0.85, rgb: [46, 88, 38] },
  3: { kind: 'broadleaf', density: 0.55, rgb: [86, 100, 44] },
  4: { kind: 'broadleaf', density: 0.85, rgb: [58, 102, 44] }, // temperate deciduous forest
  5: { kind: 'conifer', density: 0.85, rgb: [32, 68, 44] },
  6: { kind: 'mixed', density: 0.8, rgb: [48, 92, 44] },
  7: { kind: 'mixed', density: 0.8, rgb: [44, 84, 46] },
  8: { kind: 'conifer', density: 0.8, rgb: [30, 64, 44] },
  9: { kind: 'mixed', density: 0.7, rgb: [44, 78, 48] },
  10: { kind: 'conifer', density: 0.7, rgb: [28, 58, 44] }, // evergreen taiga
  11: { kind: 'conifer', density: 0.6, rgb: [72, 90, 50] }, // larch taiga
  12: { kind: 'acacia', density: 0.16, rgb: [92, 108, 48] }, // tropical savanna
  13: { kind: 'shrub', density: 0.3, rgb: [118, 112, 68] },
  14: { kind: 'shrub', density: 0.3, rgb: [108, 108, 74] },
  15: { kind: 'broadleaf', density: 0.4, rgb: [78, 94, 54] }, // sclerophyll woodland
  16: { kind: 'broadleaf', density: 0.2, rgb: [84, 104, 50] },
  17: { kind: 'conifer', density: 0.3, rgb: [52, 76, 50] },
  18: { kind: 'conifer', density: 0.25, rgb: [56, 80, 52] }, // boreal parkland
  19: { kind: 'acacia', density: 0.04, rgb: [100, 110, 52] },
  20: { kind: 'broadleaf', density: 0.03, rgb: [80, 100, 52] },
  21: { kind: 'shrub', density: 0.015, rgb: [130, 118, 82] }, // desert
  22: { kind: 'shrub', density: 0.05, rgb: [118, 118, 84] }, // steppe tundra
  23: { kind: 'shrub', density: 0.15, rgb: [96, 104, 74] },
  24: { kind: 'shrub', density: 0.08, rgb: [104, 104, 80] },
  25: { kind: 'shrub', density: 0.04, rgb: [110, 106, 84] },
};

/** Drawn size of one plant mark, in screen pixels: [width, height]. */
export const TREE_PX: Record<TreeKind, [number, number]> = {
  conifer: [5, 13],
  broadleaf: [9, 9],
  acacia: [12, 5],
  shrub: [5, 4],
};

/** Stable 0..1 hash of two integers. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Terrarium PNG pixels to metres. */
export function terrariumHeights(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return out;
}

export type Bbox = { west: number; south: number; east: number; north: number };
type Rgb = [number, number, number];

export type Ground = {
  /** The year's Earth colour at a point, 0..255. */
  colourAt: (lon: number, lat: number) => Rgb;
  /** Krapp biome code at a point (0 sea, 28 ice), or 0 when unknown. */
  biomeAt: (lon: number, lat: number) => number;
  /** Annual mean temperature (°C) of the 0.5° cell, or null. */
  tempAt: (lon: number, lat: number) => number | null;
};

/** Sun direction for the baked hillshade: from the north-west, 45° up (unit vector). */
const SUN = [-0.5, 0.5, Math.SQRT1_2];
const SAND: Rgb = [196, 182, 140];
const ROCK: Rgb = [120, 112, 102];
const SNOW: Rgb = [236, 238, 242];
const SHALLOW: Rgb = [70, 132, 146];
const DEEP: Rgb = [28, 62, 104];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Snow line (m): where a 6.5 °C/km lapse from the cell's annual mean temperature, taken at
 * `base` m (the surrounding ground's mean height), reaches -6 °C. */
export function snowLine(tempC: number | null, lat: number, base = 0): number {
  if (tempC === null) return 5200 - 60 * Math.max(0, Math.abs(lat) - 15);
  return Math.max(base + 200, base + ((tempC + 6) / 6.5) * 1000);
}

/** Mean height (m, sea floor counted as 0) of a tile: stands in for the 0.5° cell's mean height. */
export function meanHeight(heights: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < heights.length; i += 37) sum += Math.max(0, heights[i]);
  return sum / Math.ceil(heights.length / 37);
}

/** Colour of the ground at a point, 0..255: water below the year's sea level, else the
 * year's Earth colour with sand on the shore, rock on steep slopes and snow above the snow line. */
export function groundColour(h: number, slope: number, sea: number, lon: number, lat: number, ground: Ground, base = 0): Rgb {
  if (h < sea) return mix(SHALLOW, DEEP, clamp01((sea - h) / 80));
  let c = ground.colourAt(lon, lat);
  const biome = ground.biomeAt(lon, lat);
  if (biome === 28) return mix(c, SNOW, 0.8);
  const above = h - sea;
  c = mix(c, SAND, clamp01(1 - above / 6) * 0.85);
  c = mix(c, ROCK, clamp01((slope - 0.35) / 0.5) * 0.6);
  const snow = snowLine(ground.tempAt(lon, lat), lat, base);
  c = mix(c, SNOW, clamp01((h - snow) / 250));
  return c;
}

export type TerrainMesh = {
  /** Offsets from the tile's south-west corner: [dlon, dlat, metres up] per vertex. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array; // 0..1
  indices: Uint32Array;
};

/** Ground mesh for one 256 × 256 Terrarium tile, `step` pixels between vertices. Water is flat at
 * the sea level; heights are exaggerated by EXAGGERATION. */
export function buildTerrainMesh(heights: Float32Array, bbox: Bbox, sea: number, ground: Ground, step = 4): TerrainMesh {
  const size = 256;
  const n = size / step + 1;
  const { west, south, east, north } = bbox;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const latMid = ((south + north) / 2) * (Math.PI / 180);
  const mPerLon = 111_320 * Math.cos(latMid);
  const dxM = ((east - west) / (n - 1)) * mPerLon;
  const dyM = ((north - south) / (n - 1)) * 110_540;
  const at = (px: number, py: number) => heights[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))];
  const base = meanHeight(heights);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const px = i * step;
      const py = j * step;
      const h = at(px, py);
      const surface = Math.max(h, sea);
      // Slope from neighbours, in metres per metre, on the drawn surface.
      const hx = (Math.max(at(px + step, py), sea) - Math.max(at(px - step, py), sea)) / (2 * dxM);
      const hy = (Math.max(at(px, py - step), sea) - Math.max(at(px, py + step), sea)) / (2 * dyM); // +y is north
      const lon = west + ((east - west) * i) / (n - 1);
      const lat = north - ((north - south) * j) / (n - 1);
      const v = j * n + i;
      positions[v * 3] = lon - west;
      positions[v * 3 + 1] = lat - south;
      positions[v * 3 + 2] = surface * EXAGGERATION;
      const nx = -hx * EXAGGERATION;
      const ny = -hy * EXAGGERATION;
      const len = Math.hypot(nx, ny, 1);
      normals[v * 3] = nx / len;
      normals[v * 3 + 1] = ny / len;
      normals[v * 3 + 2] = 1 / len;
      let c = groundColour(h, Math.hypot(hx, hy), sea, lon, lat, ground, base);
      // Baked hillshade (sun from the north-west, 45° up); water stays flat-lit.
      const lit = (nx * SUN[0] + ny * SUN[1] + SUN[2]) / len;
      const shade = h < sea ? 1 : Math.min(1.25, Math.max(0.35, 0.2 + 1.1 * lit));
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      // Small stable mottling so flat ground does not read as one blurred colour.
      if (h >= sea) {
        const m = 0.92 + 0.16 * hash2(Math.round(lon * 2000), Math.round(lat * 2000));
        c = [c[0] * m, c[1] * m, c[2] * m];
      }
      colors[v * 3] = c[0] / 255;
      colors[v * 3 + 1] = c[1] / 255;
      colors[v * 3 + 2] = c[2] / 255;
    }
  }
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { positions, normals, colors, indices };
}

export type Plant = { position: [number, number, number]; kind: TreeKind; rgb: Rgb; scale: number };

/** Plants for one tile: `candidates` jittered spots, kept by their biome's density, never in
 * water, on ice or on very steep or snowy ground. Stable per tile index. */
export function plantsForTile(
  heights: Float32Array,
  bbox: Bbox,
  tile: [number, number, number],
  sea: number,
  ground: Ground,
  candidates = 900,
): Plant[] {
  const size = 256;
  const out: Plant[] = [];
  const base = meanHeight(heights);
  const [tx, ty, tz] = tile;
  const seed = Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ Math.imul(tz, 83492791);
  for (let i = 0; i < candidates; i++) {
    const u = hash2(seed, i * 3);
    const w = hash2(seed, i * 3 + 1);
    const keep = hash2(seed, i * 3 + 2);
    const px = Math.min(size - 1, Math.floor(u * size));
    const py = Math.min(size - 1, Math.floor(w * size));
    const h = heights[py * size + px];
    if (h < sea + 2) continue;
    const lon = bbox.west + (bbox.east - bbox.west) * u;
    const lat = bbox.north - (bbox.north - bbox.south) * w;
    const veg = VEGETATION[ground.biomeAt(lon, lat)];
    if (!veg || keep > veg.density) continue;
    if (h > snowLine(ground.tempAt(lon, lat), lat, base) - 300) continue;
    const kind: TreeKind = veg.kind === 'mixed' ? (hash2(seed, i + 7919) < 0.5 ? 'conifer' : 'broadleaf') : veg.kind;
    const shade = 0.85 + 0.3 * hash2(i, seed);
    out.push({
      position: [lon, lat, h * EXAGGERATION],
      kind,
      rgb: [veg.rgb[0] * shade, veg.rgb[1] * shade, veg.rgb[2] * shade],
      scale: 0.7 + 0.6 * hash2(seed + 1, i),
    });
  }
  return out;
}

/** A unit cone (base radius 0.5 at z 0, apex at z 1) and a unit blob (sphere of radius 0.5
 * centred at z 0.5): plant marks scaled per kind. */
export function plantMeshes() {
  const seg = 8;
  // Cone: side triangles with outward normals.
  const cp: number[] = [];
  const cn: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nz = 0.45;
    cp.push(Math.cos(a0) * 0.5, Math.sin(a0) * 0.5, 0, Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, 0, 0, 0, 1);
    for (let k = 0; k < 3; k++) cn.push(Math.cos(am) * 0.9, Math.sin(am) * 0.9, nz);
  }
  // Blob: a low-poly UV sphere.
  const bp: number[] = [];
  const bn: number[] = [];
  const rings = 5;
  const pt = (r: number, s: number): [number, number, number] => {
    const th = (r / rings) * Math.PI;
    const ph = (s / seg) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  };
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const q = [pt(r, s), pt(r + 1, s), pt(r + 1, s + 1), pt(r, s), pt(r + 1, s + 1), pt(r, s + 1)];
      for (const [x, y, z] of q) {
        bp.push(x * 0.5, y * 0.5, z * 0.5 + 0.5);
        bn.push(x, y, z);
      }
    }
  }
  const mesh = (p: number[], n: number[]) => ({
    attributes: {
      positions: { value: new Float32Array(p), size: 3 },
      normals: { value: new Float32Array(n), size: 3 },
    },
  });
  return { cone: mesh(cp, cn), blob: mesh(bp, bn) };
}
