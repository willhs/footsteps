// Close-up 3D (on by default, ?close3d=0 turns it off): zoomed in, the map tilts and the ground becomes a
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

/** Plant marks (cones and blobs per biome) are off: they read as toys, not trees. `?plants=1` draws them again. */
export function plantsParam(search: string): boolean {
  return new URLSearchParams(search).get('plants') === '1';
}

/** Biome surface detail in the ground shader (grass, closed canopy, sand ripples, cracked ice, reeds, rock):
 * off until Will has looked at it on prod. `?ground=1` turns it on. */
export function groundParam(search: string): boolean {
  return new URLSearchParams(search).get('ground') === '1';
}

const RELIEF = "Relief is measured elevation, drawn 1.6 times taller; water sits at the year's sea level.";

/** The close-up's evidence note (its label and hover text), by which imagined layers are drawn. */
export function close3dNote(plants: boolean, ground: boolean): { label: string; title: string } {
  const imagined: string[] = [];
  const how: string[] = [];
  if (ground) {
    imagined.push('surface');
    how.push(
      "The biome under each patch of ground is modelled (Krapp biomes, Beyer climate). The surface drawn on it, grass tufts, tree crowns, sand ripples, ice cracks, reeds and rock bands, is imagined: a formula picks it from the biome, and its details are not found anywhere.",
    );
  } else how.push("Ground colour comes from the year's biome.");
  if (plants) {
    imagined.push('plants');
    how.push("Each plant mark stands for many plants of the year's biome, placed and sized by hand.");
  }
  return {
    label: imagined.length ? `3D: ground measured, ${imagined.join(' and ')} imagined` : '3D: ground measured',
    title: `${RELIEF} ${how.join(' ')}`,
  };
}

/** On unless the URL says ?close3d=0. */
export function close3dParam(search: string): boolean {
  return new URLSearchParams(search).get('close3d') !== '0';
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

import type { LakePlane } from './pastWater';

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
 * year's Earth colour with sand on a low shore, rock on steep slopes and snow above the snow line.
 * `water`: the point is open water (default: below sea level). `shore`: open water is close by, so
 * low ground there is beach (default true); inland low ground stays its own colour. */
export function groundColour(
  h: number,
  slope: number,
  sea: number,
  lon: number,
  lat: number,
  ground: Ground,
  base = 0,
  water = h < sea,
  shore = true,
): Rgb {
  if (water) return mix(SHALLOW, DEEP, clamp01((sea - h) / 80));
  let c = ground.colourAt(lon, lat);
  const biome = ground.biomeAt(lon, lat);
  if (biome === 28) return mix(c, SNOW, 0.8);
  if (shore) c = mix(c, SAND, clamp01(1 - (h - sea) / 6) * 0.85);
  c = mix(c, ROCK, clamp01((slope - 0.35) / 0.5) * 0.6);
  c = mix(c, SNOW, snowMix(h, lon, lat, ground, base));
  return c;
}

/** 0..1 share of snow at height `h` (m): fully snowy 250 m above the snow line. */
function snowMix(h: number, lon: number, lat: number, ground: Ground, base: number): number {
  return clamp01((h - snowLine(ground.tempAt(lon, lat), lat, base)) / 250);
}

/** What the fragment shader paints on a point of ground (`?ground=1`), as the two numbers a vertex
 * carries (they are interpolated across a triangle, so each is a smooth axis, never a class id):
 * - `dryCold`: 0 desert sand, 1 grass, 2 ice or snow. Grass sits between, so a blend across a
 *   biome edge passes through a natural neighbour (steppe between desert and tundra).
 * - `layer`: below -0.75 open water (no detail); -0.5 wet low ground (reeds, pools), fading to 0
 *   (bare of trees) and up to 1 (closed tree canopy: the share of the ground under crowns). */
export type Cover = { dryCold: number; layer: number };

/** `layer` of open water. */
export const COVER_WATER = -1;
/** `layer` of wet low ground. */
export const COVER_WET = -0.5;

/** The cover of land, from its Krapp biome (lib/habitat.ts BIOMES; 0 unknown) and the ground it stands on.
 * Forest, woodland and savanna get their tree share from VEGETATION (the same table the ?plants=1 marks used),
 * ice sheets and ground above the snow line are ice, desert and barren are sand, the rest is grass.
 * `snow` is 0..1 (snowMix), `wet`: low, flat ground by water (see buildTerrainMesh). Nothing grows on ice,
 * snow or sand; wet ground keeps no trees. */
export function coverFor(biome: number, snow: number, wet: boolean): Cover {
  if (biome === 28 || snow >= 0.5) return { dryCold: 2, layer: 0 };
  const desert = biome === 21 || biome === 27;
  const dryCold = desert ? 0 : 1;
  if (wet && biome !== 27) return { dryCold, layer: COVER_WET };
  const trees = biome >= 1 && biome <= 20 ? (VEGETATION[biome]?.density ?? 0) * (biome === 13 || biome === 14 ? 0.7 : 1) : 0;
  return { dryCold, layer: trees * (1 - snow) };
}

/** Below-sea vertices that count as open water: a connected patch that reaches the tile edge or
 * covers at least `minArea` vertices. Small inland dips (DEM noise, valley floors, polders) stay land. */
export function openWater(below: Uint8Array, n: number, minArea = 60): Uint8Array {
  const water = new Uint8Array(n * n);
  const seen = new Uint8Array(n * n);
  const stack: number[] = [];
  const patch: number[] = [];
  for (let start = 0; start < n * n; start++) {
    if (!below[start] || seen[start]) continue;
    patch.length = 0;
    let edge = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      patch.push(v);
      const i = v % n;
      const j = (v - i) / n;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) edge = true;
      for (const w of [i > 0 ? v - 1 : -1, i < n - 1 ? v + 1 : -1, j > 0 ? v - n : -1, j < n - 1 ? v + n : -1]) {
        if (w >= 0 && below[w] && !seen[w]) {
          seen[w] = 1;
          stack.push(w);
        }
      }
    }
    if (edge || patch.length >= minArea) for (const v of patch) water[v] = 1;
  }
  return water;
}

/** Open water on a tile's vertex grid (`step` pixels apart): returns the grid size and the mask. */
export function tileWater(heights: Float32Array, sea: number, step = 4): { n: number; water: Uint8Array } {
  const size = 256;
  const n = size / step + 1;
  const below = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      below[j * n + i] = heights[Math.min(size - 1, j * step) * size + Math.min(size - 1, i * step)] < sea ? 1 : 0;
  return { n, water: openWater(below, n) };
}

/** Vertices of a tile's grid (`step` pixels apart, as tileWater) that are the modelled lake (`?pastwater=1`): inside the shared lake mask AND
 * below the lake's plane. The mask says where the basin-connected lake is, the DEM says where the water stands: a vertex above the plane
 * in the mask is an island or the shore, one below it outside the mask is a dry basin the lake never reached. The plane is `lake.level` on
 * the DEM's own datum, not the year's ocean. */
export function lakeVertices(heights: Float32Array, bbox: Bbox, lake: LakePlane, step = 4): Uint8Array {
  const size = 256;
  const n = size / step + 1;
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const lat = bbox.north - ((bbox.north - bbox.south) * j) / (n - 1);
    for (let i = 0; i < n; i++) {
      const h = heights[Math.min(size - 1, j * step) * size + Math.min(size - 1, i * step)];
      if (h < lake.level && lake.wetAt(bbox.west + ((bbox.east - bbox.west) * i) / (n - 1), lat)) out[j * n + i] = 1;
    }
  }
  return out;
}

/** Wet low ground (reeds, pools): land less than this many metres above the year's sea level... */
const WET_MAX_HEIGHT = 5;
/** ...and flatter than this (m/m). */
const WET_MAX_SLOPE = 0.006;
/** Desert counts as wet only this low (m above the year's sea): a salt marsh or sabkha, not an inland plain. A rule on the
 * vertex alone, so it cannot change at tile edges. */
const WET_DESERT_MAX_HEIGHT = 3;

/** Vertices within `reach` grid steps of open water. */
function nearWater(water: Uint8Array, n: number, reach = 2): Uint8Array {
  const near = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!water[j * n + i]) continue;
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && b >= 0 && a < n && b < n) near[b * n + a] = 1;
        }
    }
  return near;
}

export type TerrainMesh = {
  /** Offsets from the tile's south-west corner: [dlon, dlat, metres up] per vertex. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array; // 0..1
  indices: Uint32Array;
  /** Per vertex [Cover.dryCold, Cover.layer], only when built with `cover` (`?ground=1`). */
  texCoords?: Float32Array;
};

/** Ground mesh for one 256 × 256 Terrarium tile, `step` pixels between vertices. Open water
 * (openWater) is flat at the sea level; heights are exaggerated by EXAGGERATION. With `cover`, each vertex
 * also carries its Cover for the ground shader, and the coarse per-vertex mottling (the shader does it finer) is left out. With `lake`, the
 * modelled lake's vertices (lakeVertices) are open water flat at the lake's own level, and low ground by it is shore relative to that level, not the sea's. */
export function buildTerrainMesh(heights: Float32Array, bbox: Bbox, sea: number, ground: Ground, step = 4, cover = false, lake: LakePlane | null = null): TerrainMesh {
  const size = 256;
  const n = size / step + 1;
  const { west, south, east, north } = bbox;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const texCoords = cover ? new Float32Array(n * n * 2) : undefined;
  const latMid = ((south + north) / 2) * (Math.PI / 180);
  const mPerLon = 111_320 * Math.cos(latMid);
  const dxM = ((east - west) / (n - 1)) * mPerLon;
  const dyM = ((north - south) / (n - 1)) * 110_540;
  const at = (px: number, py: number) => heights[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))];
  const base = meanHeight(heights);
  // Heights per vertex, then which below-sea vertices are open water and which land is on its shore.
  const hv = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hv[j * n + i] = at(i * step, j * step);
  const ocean = tileWater(heights, sea, step).water;
  const lakeWater = lake ? lakeVertices(heights, bbox, lake, step) : null;
  const water = lakeWater ? ocean.map((w, v) => (w || lakeWater[v] ? 1 : 0)) : ocean;
  const shore = nearWater(water, n);
  const nearLake = lakeWater ? nearWater(lakeWater, n) : null;
  const surfaceAt = (i: number, j: number) => {
    const v = Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i));
    return lakeWater?.[v] ? lake!.level : water[v] ? sea : hv[v];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const h = hv[v];
      const wet = water[v] === 1;
      const surface = surfaceAt(i, j);
      // The level water stands at here: the lake's plane at and beside the lake, else the year's sea.
      const level = nearLake?.[v] ? lake!.level : sea;
      // Slope from neighbours, in metres per metre, on the drawn surface.
      const hx = (surfaceAt(i + 1, j) - surfaceAt(i - 1, j)) / (2 * dxM);
      const hy = (surfaceAt(i, j - 1) - surfaceAt(i, j + 1)) / (2 * dyM); // +y is north
      const lon = west + ((east - west) * i) / (n - 1);
      const lat = north - ((north - south) * j) / (n - 1);
      positions[v * 3] = lon - west;
      positions[v * 3 + 1] = lat - south;
      positions[v * 3 + 2] = surface * EXAGGERATION;
      const nx = -hx * EXAGGERATION;
      const ny = -hy * EXAGGERATION;
      const len = Math.hypot(nx, ny, 1);
      normals[v * 3] = nx / len;
      normals[v * 3 + 1] = ny / len;
      normals[v * 3 + 2] = 1 / len;
      const slope = Math.hypot(hx, hy);
      let c = groundColour(h, slope, level, lon, lat, ground, base, wet, shore[v] === 1);
      if (texCoords) {
        const biome = ground.biomeAt(lon, lat);
        const lowFlat = !wet && h - level < (biome === 21 ? WET_DESERT_MAX_HEIGHT : WET_MAX_HEIGHT) && slope < WET_MAX_SLOPE;
        const cv = wet
          ? { dryCold: 1, layer: COVER_WATER }
          : coverFor(biome, snowMix(h, lon, lat, ground, base), lowFlat);
        texCoords[v * 2] = cv.dryCold;
        texCoords[v * 2 + 1] = cv.layer;
      }
      // Baked hillshade (sun from the north-west, 45° up); water stays flat-lit.
      const lit = (nx * SUN[0] + ny * SUN[1] + SUN[2]) / len;
      const shade = wet ? 1 : Math.min(1.25, Math.max(0.35, 0.2 + 1.1 * lit));
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      // Small stable mottling so flat ground does not read as one blurred colour.
      if (!wet && !cover) {
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
  return { positions, normals, colors, indices, texCoords };
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
  const { n, water } = tileWater(heights, sea);
  const wetAt = (px: number, py: number) => water[Math.round(py / 4) * n + Math.round(px / 4)] === 1;
  const [tx, ty, tz] = tile;
  const seed = Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ Math.imul(tz, 83492791);
  for (let i = 0; i < candidates; i++) {
    const u = hash2(seed, i * 3);
    const w = hash2(seed, i * 3 + 1);
    const keep = hash2(seed, i * 3 + 2);
    const px = Math.min(size - 1, Math.floor(u * size));
    const py = Math.min(size - 1, Math.floor(w * size));
    const h = heights[py * size + px];
    if (wetAt(px, py)) continue;
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
