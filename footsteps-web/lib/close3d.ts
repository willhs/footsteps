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
/** Terrarium pixels between the ground mesh's vertices. Close3DLayer fetches tiles one zoom coarser than the screen
 * would pick (zoomOffset -1) and meshes them at this step, which is the same ~300 m (at 46°N, zoom 10) vertex spacing as
 * the finer tiles at step 4 with a quarter of the requests. */
export const MESH_STEP = 2;
/** Skirt depth (m, before exaggeration) as a share of the tile's width: a curtain hung under every tile edge, so a
 * neighbour at another zoom (far tiles are coarser, Close3DLayer's DemTileset) leaves no crack to see through. */
const SKIRT_SHARE = 0.01;

/** Shaded tree impostors: on unless `?trees=0`. */
export function treesParam(search: string): boolean {
  return new URLSearchParams(search).get('trees') !== '0';
}

/** Biome surface detail in the ground shader (grass, closed canopy, sand ripples, cracked ice, reeds, rock): on unless `?ground=0`. */
export function groundParam(search: string): boolean {
  return new URLSearchParams(search).get('ground') !== '0';
}

const RELIEF = "Relief is measured elevation, drawn 1.6 times taller; water sits at the year's sea level.";

/** The close-up's evidence note (its label and hover text), by which imagined layers are drawn. */
export function close3dNote(plants: boolean, ground: boolean, weather = false, trees = false, sky = false, fields = false): { label: string; title: string } {
  const imagined: string[] = [];
  const how: string[] = [];
  if (trees) {
    imagined.push('trees');
    how.push('Tree types follow modelled biomes; individual trees, heights, density and household clearings are imagined.');
  }
  if (sky) {
    imagined.push('light');
    how.push(
      "The sun stands where the local sun clock puts it, but the light's colour, the haze, the sky and the moving water are imagined presentation, not data.",
    );
  }
  if (ground) {
    imagined.push('surface');
    how.push(
      "The biome under each patch of ground is modelled (Krapp biomes, Beyer climate). The surface drawn on it, grass tufts, tree crowns, sand ripples, ice cracks, reeds and rock bands, is imagined: a formula picks it from the biome, and its details are not found anywhere.",
    );
  } else how.push("Ground colour comes from the year's biome.");
  if (weather) {
    imagined.push('weather');
    how.push(
      "Cloud shadows and wind are imagined: how cloudy a place is follows its modelled rainfall (Beyer climate) and the wind direction its latitude, but the clouds, their speed (sped up to be seen) and the gusts in the grass are drawn by a formula, not recorded for that year.",
    );
  }
  if (plants) {
    imagined.push('plants');
    how.push("Each plant mark stands for many plants of the year's biome, placed and sized by hand.");
  }
  if (fields) {
    imagined.push('fields and paths');
    how.push(
      "Fields, gardens, corrals, grazed grass and worn paths round each group are imagined: their layout is invented, how much land is farmed follows HYDE's cropland in the cell shared among its groups by head count (modelled), with at least half a hectare per villager, out to at most 2 km from a village (site-catchment studies), crops from the food table, tracks towards the nearest fresh water and the nearest neighbours.",
    );
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

/** Tilt reached with `?sky=1` (lib/sky.ts) by SKY_FULL_ZOOM: steep enough that the horizon, and the sky above it, are in frame
 * (at CLOSE3D_PITCH the top of the screen looks 16.6° below the horizon). */
export const SKY_PITCH = 74;
const SKY_FROM_ZOOM = 10;
export const SKY_FULL_ZOOM = 12;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Camera tilt for a zoom: flat until CLOSE3D_ZOOM, CLOSE3D_PITCH by CLOSE3D_FULL_ZOOM; with `sky`, on from SKY_FROM_ZOOM to SKY_PITCH by SKY_FULL_ZOOM. */
export function pitchForZoom(zoom: number, sky = false): number {
  const t = Math.min(1, Math.max(0, (zoom - CLOSE3D_ZOOM) / (CLOSE3D_FULL_ZOOM - CLOSE3D_ZOOM)));
  const pitch = CLOSE3D_PITCH * smooth(t);
  if (!sky) return pitch;
  const s = Math.min(1, Math.max(0, (zoom - SKY_FROM_ZOOM) / (SKY_FULL_ZOOM - SKY_FROM_ZOOM)));
  return pitch + (SKY_PITCH - CLOSE3D_PITCH) * smooth(s);
}

/** Metres per screen pixel at a zoom and latitude (deck.gl's 512 px world). */
/** deck.gl's default field of view (altitude 1.5) and far-plane multiplier for a MapView. */
const FOVY_DEG = 36.87;
const DECK_FAR_MULTIPLIER = 1.01;
/** How far the sky view draws, in camera distances (deck.gl stops at 10 once the horizon is in frame). Past this the haze
 * (layers/skyLight.ts, ramped to the far plane) has turned the ground the sky's colour anyway. Measured 2026-11-24 at
 * 1728 x 1080 @2x on prod with `?sky=1`: 14 fps panning at zoom 12 with deck.gl's 10. */
export const SKY_FAR_DISTANCES = 5;

/**
 * deck.gl's `farZMultiplier` that puts the far plane at most `distances` camera distances away at this pitch
 * (math.gl's getProjectionParameters: far = min(furthest × multiplier, 10 camera distances)). Never above deck.gl's default,
 * so a view that does not reach that far is unchanged. The far plane also culls tiles, so fewer are fetched and drawn.
 */
export function farMultiplier(pitch: number, distances = SKY_FAR_DISTANCES): number {
  const rad = Math.PI / 180;
  const above = (FOVY_DEG / 2) * rad;
  const angle = Math.min(Math.PI - 0.01, Math.max(0.01, Math.PI / 2 - pitch * rad - above));
  const furthest = (Math.sin(pitch * rad) * Math.sin(above)) / Math.sin(angle) + 1;
  return Math.min(DECK_FAR_MULTIPLIER, distances / furthest);
}

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

/** Stable 0..1 hash of two integers. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** AWS Terrarium elevation tiles. The bucket answers on two hostnames with the same bytes; both serve HTTP/1.1 only, so the
 * browser opens six connections to each. deck.gl's TileLayer spreads tiles over the templates by tile id (stable per tile,
 * so the HTTP cache still hits), which doubles how many tiles are in flight from a far-away (NZ to us-east-1) bucket. */
export const DEM_TILE_URLS = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
];
/** Requests in flight per elevation TileLayer: six per hostname. */
export const DEM_MAX_REQUESTS = 6 * DEM_TILE_URLS.length;

/** Terrarium PNG pixels to metres. */
export function terrariumHeights(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return out;
}

import type { LakePlane } from './pastWater';
import type { DetailPixels } from './terrainDetail';

export type Bbox = { west: number; south: number; east: number; north: number };
type Rgb = [number, number, number];

export type Ground = {
  /** The year's Earth colour at a point, 0..255. */
  colourAt: (lon: number, lat: number) => Rgb;
  /** Krapp biome code at a point (0 sea, 28 ice), or 0 when unknown. */
  biomeAt: (lon: number, lat: number) => number;
  /** Annual mean temperature (°C) of the 0.5° cell, or null. */
  tempAt: (lon: number, lat: number) => number | null;
  /** Annual precipitation (mm) of the 0.5° cell, or null (the weather's cloud cover, lib/weather.ts). */
  precipAt: (lon: number, lat: number) => number | null;
  /** The same ground coloured with a colour-pyramid tile's detail (lib/terrainDetail.ts); absent when tiles are off. */
  withDetail?: (tile: DetailPixels) => Ground;
  /** Snow line (m) at a point, smooth across tiles and cells (lib/snowLine.ts). Absent: the cell's temperature over the tile's mean height. */
  snowLineAt?: (lon: number, lat: number) => number;
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
  // Runs once per vertex: one copy of the year's colour, then mixed in place (mixIn is mix's arithmetic).
  const src = ground.colourAt(lon, lat);
  const c: Rgb = [src[0], src[1], src[2]];
  const biome = ground.biomeAt(lon, lat);
  if (biome === 28) return mixIn(c, SNOW, 0.8);
  if (shore) mixIn(c, SAND, clamp01(1 - (h - sea) / 6) * 0.85);
  mixIn(c, ROCK, clamp01((slope - 0.35) / 0.5) * 0.6);
  return mixIn(c, SNOW, snowMix(h, lon, lat, ground, base));
}

/** `mix(c, b, t)` written into `c`. */
function mixIn(c: Rgb, b: Rgb, t: number): Rgb {
  c[0] += (b[0] - c[0]) * t;
  c[1] += (b[1] - c[1]) * t;
  c[2] += (b[2] - c[2]) * t;
  return c;
}

/** 0..1 share of snow at height `h` (m): fully snowy 250 m above the snow line. */
function snowMix(h: number, lon: number, lat: number, ground: Ground, base: number): number {
  return clamp01((h - snowLineOf(lon, lat, ground, base)) / 250);
}

/** The snow line at a point: the ground's smooth one when it has it, else the cell's temperature over `base`. */
function snowLineOf(lon: number, lat: number, ground: Ground, base: number): number {
  return ground.snowLineAt ? ground.snowLineAt(lon, lat) : snowLine(ground.tempAt(lon, lat), lat, base);
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
/** Cover of land in a mesh built `lit` without `cover`: only the water/land split is read (layers/skyLight.ts). */
const LIT_LAND: Cover = { dryCold: 1, layer: 0 };
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

/** Sea levels (m) within which a pixel of exactly 0 m counts as sea when `zeroIsSea`: around today's level, where it is the DEM's fill. */
const ZERO_SEA_BAND = 2;

/** Open water on a tile's vertex grid (`step` pixels apart): returns the grid size and the mask. `zeroIsSea` (`?sky=1` meshes): a pixel of
 * exactly 0 m is below the sea too while the sea is within ZERO_SEA_BAND of today's. Terrarium has no bathymetry in some coastal tiles
 * (the Bay of Naples at zoom 12 is all 0.0: SRTM's sea fill), which otherwise draws the sea as land at 0 m; openWater still keeps only
 * patches that reach the tile edge or are large. Off by default so the default close-up is unchanged until it is reviewed. */
export function tileWater(heights: Float32Array, sea: number, step = 4, zeroIsSea = false): { n: number; water: Uint8Array } {
  const size = 256;
  const n = size / step + 1;
  const below = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const h = heights[Math.min(size - 1, j * step) * size + Math.min(size - 1, i * step)];
      below[j * n + i] = h < sea || (zeroIsSea && h === 0 && Math.abs(sea) <= ZERO_SEA_BAND) ? 1 : 0;
    }
  return { n, water: openWater(below, n) };
}

/** Per vertex of a tile's grid (`step` pixels apart, as tileWater), the level of past water standing there (`?pastwater=1`), NaN where there is none.
 * The epoch's rule decides (lib/pastWater.ts `LakePlane.levelAt`): Mega-Chad is water inside its mask AND below its 329 m plane (a vertex above
 * the plane in the mask is an island or the shore, one below it outside the mask a dry basin the lake never reached); a lake traced from
 * published outlines is water wherever its outline says, at its own level; a marine stage at the year's sea level. Levels are on the DEM's datum. */
export function lakeVertices(heights: Float32Array, bbox: Bbox, lake: LakePlane, step = 4): Float32Array {
  const size = 256;
  const n = size / step + 1;
  const out = new Float32Array(n * n).fill(NaN);
  for (let j = 0; j < n; j++) {
    const lat = bbox.north - ((bbox.north - bbox.south) * j) / (n - 1);
    for (let i = 0; i < n; i++) {
      const h = heights[Math.min(size - 1, j * step) * size + Math.min(size - 1, i * step)];
      const level = lake.levelAt(bbox.west + ((bbox.east - bbox.west) * i) / (n - 1), lat, h);
      if (level !== null) out[j * n + i] = level;
    }
  }
  return out;
}

/** Per vertex, the level of past water within `reach` grid steps (the nearest such vertex's), NaN where there is none: the level its shore is
 * measured from. */
function nearLevel(levels: Float32Array, n: number, reach = 2): Float32Array {
  const out = new Float32Array(n * n).fill(NaN);
  const best = new Float32Array(n * n).fill(Infinity);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const level = levels[j * n + i];
      if (Number.isNaN(level)) continue;
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const a = i + di;
          const b = j + dj;
          const d = di * di + dj * dj;
          if (a >= 0 && b >= 0 && a < n && b < n && d < best[b * n + a]) {
            best[b * n + a] = d;
            out[b * n + a] = level;
          }
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

/** `?ice=1`: the dated ice sheet over the ground (lib/iceSheets.ts). `shareAt`: ice share 0..1 around a point; `key` changes with the epoch. */
export type IceCover = { key: string; shareAt: (lon: number, lat: number) => number };
/** Ground is ice where at least this share of the area around a vertex is (the mask's own edge, to a 2.5′ pixel). */
export const ICE_EDGE_SHARE = 0.5;

/** The ground with the ice sheet on it: under the ice the biome is ice (Krapp's 28), so the colour is snow white, the shader's cover is ice
 * and nothing grows; elsewhere the ground as it was. */
export function withIce(ground: Ground, ice: IceCover): Ground {
  const out: Ground = {
    ...ground,
    biomeAt: (lon, lat) => (ice.shareAt(lon, lat) >= ICE_EDGE_SHARE ? 28 : ground.biomeAt(lon, lat)),
  };
  if (ground.withDetail) out.withDetail = (tile) => withIce(ground.withDetail!(tile), ice);
  return out;
}

export type TerrainMesh = {
  /** Offsets from the tile's south-west corner: [dlon, dlat, metres up] per vertex. The n × n grid comes first (row by row from
   * the north-west), then the skirt: the edge vertices again, lowered, once round the tile from the north-west corner. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array; // 0..1
  indices: Uint32Array;
  /** Per vertex [Cover.dryCold, Cover.layer], when built with `cover` (`?ground=1`) or `lit` (`?sky=1`: then only the layer's open-water
   * value is meaningful unless `cover` is also set; land is `{ 1, 0 }`). */
  texCoords?: Float32Array;
};

/** Least-squares slope (height per grid step) through the vertices within `reach` of index `c` that lie in 0..n-1. */
export function fitSlope(c: number, n: number, reach: number, at: (k: number) => number): number {
  const lo = Math.max(0, c - reach);
  const hi = Math.min(n - 1, c + reach);
  const mid = (lo + hi) / 2;
  let num = 0;
  let den = 0;
  for (let k = lo; k <= hi; k++) {
    num += (k - mid) * at(k);
    den += (k - mid) * (k - mid);
  }
  return den > 0 ? num / den : 0;
}

/** Ground mesh for one 256 × 256 Terrarium tile, `step` pixels between vertices. Open water
 * (openWater) is flat at the sea level; heights are exaggerated by EXAGGERATION. With `cover`, each vertex
 * also carries its Cover for the ground shader, and the coarse per-vertex mottling is left out when `paints` (default: with `cover`) says the shader
 * does it finer (`?ground=1`; with `?weather=1` alone the shader only needs the Cover, so the mottling stays and the ground looks as it did). With `lake`, the
 * past water's vertices (lakeVertices) are open water flat at its own level, and low ground by it is shore relative to that level, not the sea's. */
export function buildTerrainMesh(
  heights: Float32Array, bbox: Bbox, sea: number, ground: Ground, step = 4, cover = false, lake: LakePlane | null = null, ice: IceCover | null = null,
  lit = false, paints = cover,
): TerrainMesh {
  const size = 256;
  const n = size / step + 1;
  const { west, south, east, north } = bbox;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const texCoords = cover || lit ? new Float32Array(n * n * 2) : undefined;
  const latMid = ((south + north) / 2) * (Math.PI / 180);
  const mPerLon = 111_320 * Math.cos(latMid);
  const dxM = ((east - west) / (n - 1)) * mPerLon;
  const dyM = ((north - south) / (n - 1)) * 110_540;
  const at = (px: number, py: number) => heights[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))];
  const base = meanHeight(heights);
  // Heights per vertex, then which below-sea vertices are open water and which land is on its shore.
  const hv = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hv[j * n + i] = at(i * step, j * step);
  const ocean = tileWater(heights, sea, step, lit).water;
  const lakeLevel = lake ? lakeVertices(heights, bbox, lake, step) : null;
  // `?ice=1`: vertices under the ice sheet are ground (ice), never sea or past water, even where the ice is grounded below the year's sea.
  const iced = ice ? new Uint8Array(n * n) : null;
  if (ice && iced) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) iced[j * n + i] = ice.shareAt(west + ((east - west) * i) / (n - 1), north - ((north - south) * j) / (n - 1)) >= ICE_EDGE_SHARE ? 1 : 0;
  if (lakeLevel && iced) for (let v = 0; v < n * n; v++) if (iced[v]) lakeLevel[v] = NaN;
  const water = lakeLevel || iced ? ocean.map((w, v) => (iced?.[v] ? 0 : w || (lakeLevel && !Number.isNaN(lakeLevel[v])) ? 1 : 0)) : ocean;
  const shore = nearWater(water, n);
  const nearLake = lakeLevel ? nearLevel(lakeLevel, n) : null;
  // The drawn surface per vertex (water flat at its level), read 4 times more per vertex for the slope.
  const drawn = new Float32Array(n * n);
  for (let v = 0; v < n * n; v++) drawn[v] = lakeLevel && !Number.isNaN(lakeLevel[v]) ? lakeLevel[v] : water[v] ? sea : iced?.[v] ? Math.max(hv[v], sea) : hv[v];
  const surfaceAt = (i: number, j: number) => drawn[(j < 0 ? 0 : j >= n ? n - 1 : j) * n + (i < 0 ? 0 : i >= n ? n - 1 : i)];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const h = hv[v];
      const wet = water[v] === 1;
      const surface = surfaceAt(i, j);
      // The level water stands at here: past water's own level at and beside it, else the year's sea.
      const level = nearLake && !Number.isNaN(nearLake[v]) ? nearLake[v] : sea;
      // Slope from neighbours, in metres per metre, on the drawn surface.
      // A least-squares line through five vertices, not two: the elevation tiles are upsampled from coarser data in steps, and a
      // two-vertex slope flips from row to row on them, which the ground shader's rock (steep ground) drew as fine hatching.
      // On ground that is under today's sea (an exposed Ice Age shelf), the heights are bathymetry, streaked by ship tracks a vertex or
      // two wide; a nine-vertex fit there shades the shelf, not the survey lines.
      // Near a tile edge the fit uses only the vertices inside the tile (one-sided). Clamping to the edge vertex instead read the ground
      // past the edge as flat, so edge rows were shaded flatter than their neighbours across the edge: a lit line along every tile edge.
      const reach = h < 0 && !wet ? 4 : 2;
      const hx = fitSlope(i, n, reach, (x) => surfaceAt(x, j)) / dxM;
      const hy = -fitSlope(j, n, reach, (y) => surfaceAt(i, y)) / dyM; // +y is north; rows run south
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
      const c = groundColour(h, slope, level, lon, lat, ground, base, wet, shore[v] === 1);
      if (texCoords) {
        let cv: Cover;
        if (wet) cv = { dryCold: 1, layer: COVER_WATER };
        else if (!cover) cv = LIT_LAND;
        else {
          const biome = ground.biomeAt(lon, lat);
          const lowFlat = h - level < (biome === 21 ? WET_DESERT_MAX_HEIGHT : WET_MAX_HEIGHT) && slope < WET_MAX_SLOPE;
          cv = coverFor(biome, snowMix(h, lon, lat, ground, base), lowFlat);
        }
        texCoords[v * 2] = cv.dryCold;
        texCoords[v * 2 + 1] = cv.layer;
      }
      // Baked hillshade (sun from the north-west, 45° up); water stays flat-lit. `lit` (`?sky=1`): none, the shader lights it.
      const shade = (nx * SUN[0] + ny * SUN[1] + SUN[2]) / len;
      let k = wet || lit ? 1 : Math.min(1.25, Math.max(0.35, 0.2 + 1.1 * shade));
      // Small stable mottling so flat ground does not read as one blurred colour.
      if (!wet && !paints) k *= 0.92 + 0.16 * hash2(Math.round(lon * 2000), Math.round(lat * 2000));
      colors[v * 3] = (c[0] * k) / 255;
      colors[v * 3 + 1] = (c[1] * k) / 255;
      colors[v * 3 + 2] = (c[2] * k) / 255;
    }
  }
  // Skirts: each edge vertex again, dropped by the skirt depth, after the grid's n * n vertices (same colour and normal).
  const edge: number[] = [];
  for (let i = 0; i < n; i++) edge.push(i); // north, west to east
  for (let j = 1; j < n; j++) edge.push(j * n + n - 1); // east, north to south
  for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i); // south, east to west
  for (let j = n - 2; j >= 0; j--) edge.push(j * n); // west, south to north (ends back at vertex 0)
  const skirts = edge.length - 1;
  const drop = Math.max(20, SKIRT_SHARE * dxM * (n - 1)) * EXAGGERATION;
  const total = n * n + edge.length;
  const grow = <T extends Float32Array>(a: T, size: number): T => {
    const out = new Float32Array(total * size) as T;
    out.set(a);
    edge.forEach((v, e) => {
      for (let c = 0; c < size; c++) out[(n * n + e) * size + c] = a[v * size + c];
    });
    return out;
  };
  const allPositions = grow(positions, 3);
  for (let e = 0; e < edge.length; e++) allPositions[(n * n + e) * 3 + 2] -= drop;
  const indices = new Uint32Array(((n - 1) * (n - 1) + skirts) * 6);
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
  for (let e = 0; e < skirts; e++) {
    const [a, b, a2, b2] = [edge[e], edge[e + 1], n * n + e, n * n + e + 1];
    indices.set([a, a2, b, b, a2, b2], k);
    k += 6;
  }
  return { positions: allPositions, normals: grow(normals, 3), colors: grow(colors, 3), indices, texCoords: texCoords && grow(texCoords, 2) };
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
    if (h > snowLineOf(lon, lat, ground, base) - 300) continue;
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
