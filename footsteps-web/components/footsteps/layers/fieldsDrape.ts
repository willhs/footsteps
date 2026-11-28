// Drapes the land patches (fields.ts) on one close-up ground tile: each patch whose middle lies in the tile is cut into pieces about a ground
// vertex apart, each piece's corners sit at the highest corner of the ground cell under them (lib/close3d.ts buildTerrainMesh: vertex every
// MESH_STEP pixels), so no piece dips under the ground, and are lifted a little, and any piece touching water, past water or ice is left out. Steep farmland turns into
// terraces along the contour; too steep is not farmed. Wash patches (grazed grass) are not laid as shapes but painted into the ground's
// own vertex colours (`paint`), so they are soft and follow every fold. Built once per tile and land set (Close3DLayer caches it), never per frame.
import { EXAGGERATION, ICE_EDGE_SHARE, MESH_STEP, metersPerPixel, type Bbox, type IceCover } from '@/lib/close3d';
import type { LakePlane } from '@/lib/pastWater';
import { offsetByMetres } from './households';
import type { AreaPatch, Corner, LandPatch } from './fields';

/** Farmland steeper than this (degrees) is terraced along the contour (imagined). */
export const TERRACE_FROM_DEG = 8;
/** Farmland steeper than this is not farmed. */
export const NOT_FARMED_FROM_DEG = 25;
/** A track is at least this wide (metres), and at least this many screen pixels at the zoom the tile is drawn at. */
const PATH_MIN_M = 5;
const PATH_MIN_PX = 1.3;
/** Lift above the ground surface, as a share of the ground's vertex spacing. */
const LIFT_SHARE = 0.08;
/** How strongly a wash recolours the ground under it (0..1). */
export const PAINT_WEIGHT = 0.4;
/** Pieces are at most this many ground cells across (one is enough: a piece's corners sit on the highest corner of their cell, and two
 * neighbouring cells share the corners on their common edge, so no piece edge dips under the ground), at most MAX_CUTS each way. */
const PIECE_CELLS = 1;
const MAX_CUTS = 8;
const SUN = [-0.5, 0.5, Math.SQRT1_2];

/** `texCoords`: metres along the patch's first side and across it (u, v); `normals`: metres to the far sides (Lu − u, Lv − v), and
 * the patch's kind code + a seed in [0, 1) (FIELD_KIND). The shapes are lit flat (no diffuse light), so the normal is free to carry
 * them; the field shader (groundDetail.ts FieldDetail) draws rows, strips, verges and tracks from them. */
export type DrapedMesh = { positions: Float32Array; normals: Float32Array; colors: Float32Array; texCoords: Float32Array; indices: Uint32Array };

/** Kind code per patch kind, read by the field shader (groundDetail.ts FIELD_FS). Terraces are farmed beds: 'field'. */
export const FIELD_KIND: Record<string, number> = { field: 0, fallow: 1, pasture: 2, garden: 3, corral: 4, clearing: 5, grazed: 5, path: 6 };
/** Per ground vertex (the tile mesh's n × n grid, row by row from the north-west): how much a wash recolours it and to what (0..1, lit). */
export type GroundPaint = { weight: Float32Array; rgb: Float32Array };
export type DrapedLand = { solid: DrapedMesh | null; paint: GroundPaint | null; pieces: number };

const FARMLAND = new Set(['field', 'fallow', 'pasture']);

/** Each patch's corner box [west, south, east, north] per patch set, worked out once a set, so many tiles can test it cheaply. */
const boxesOf = new WeakMap<readonly LandPatch[], Float64Array>();
function patchBoxes(patches: readonly LandPatch[]): Float64Array {
  let boxes = boxesOf.get(patches);
  if (boxes) return boxes;
  boxes = new Float64Array(patches.length * 4);
  patches.forEach((p, i) => {
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of p.kind === 'path' ? p.line : p.corners) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    boxes!.set([w, s, e, n], i * 4);
  });
  boxesOf.set(patches, boxes);
  return boxes;
}

/** A content key for the patches that can touch a tile (corner box overlapping it). The set in view is rebuilt as the camera moves, but a
 * place always gets the same patches (fields.ts), so a tile whose own land is unchanged keeps its drape instead of draping again. */
export function tileLandKey(patches: readonly LandPatch[], bbox: Bbox): string {
  const boxes = patchBoxes(patches);
  let h = 0x811c9dc5;
  let count = 0;
  const mix = (v: number) => {
    h = Math.imul(h ^ v, 16777619);
  };
  patches.forEach((p, i) => {
    const o = i * 4;
    if (boxes[o + 2] < bbox.west || boxes[o] > bbox.east || boxes[o + 3] < bbox.south || boxes[o + 1] > bbox.north) return;
    count++;
    for (const [x, y] of p.kind === 'path' ? p.line : p.corners) {
      mix(Math.round(x * 1e6) | 0);
      mix(Math.round(y * 1e6) | 0);
    }
    mix(((Math.round(p.rgb[0]) << 16) | (Math.round(p.rgb[1]) << 8) | Math.round(p.rgb[2])) ^ (p.kind.charCodeAt(0) << 24) ^ p.kind.length);
  });
  return `${count}:${h >>> 0}`;
}

class Builder {
  positions: number[] = [];
  colors: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  get vertices() {
    return this.positions.length / 3;
  }
  done(): DrapedMesh | null {
    if (!this.indices.length) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      texCoords: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** The patches of one ground tile, draped on its heights (a 256 × 256 Terrarium tile at zoom `z`). `sea`: the year's sea level (m). */
export function drapeLand(
  heights: Float32Array, bbox: Bbox, z: number, patches: readonly LandPatch[], sea: number, lake: LakePlane | null = null, ice: IceCover | null = null,
): DrapedLand {
  const n = 256 / MESH_STEP + 1;
  const last = n - 1;
  const { west, south, east, north } = bbox;
  const latMid = (south + north) / 2;
  const mPerLon = 111_320 * Math.cos((latMid * Math.PI) / 180);
  const dxM = ((east - west) / last) * mPerLon;
  const dyM = ((north - south) / last) * 110_540;
  const hv = (i: number, j: number) => heights[Math.min(255, j * MESH_STEP) * 256 + Math.min(255, i * MESH_STEP)];
  const lonOf = (fx: number) => west + (fx / last) * (east - west);
  const latOf = (fy: number) => north - (fy / last) * (north - south);
  // Wet vertices, worked out on first use: sea (at or below the year's level), past water, or ice.
  const wetCache = new Int8Array(n * n).fill(-1);
  const wetVertex = (i: number, j: number) => {
    const v = j * n + i;
    if (wetCache[v] < 0) {
      const h = hv(i, j);
      const [lon, lat] = [lonOf(i), latOf(j)];
      wetCache[v] = h <= sea || (lake && lake.levelAt(lon, lat, h) !== null) || (ice && ice.shareAt(lon, lat) >= ICE_EDGE_SHARE) ? 1 : 0;
    }
    return wetCache[v] === 1;
  };
  const cell = (f: number) => Math.min(last - 1, Math.max(0, Math.floor(f)));
  /** The ground mesh's surface at (fx, fy) in vertex units, on the same triangle the mesh draws there. */
  const surf = (fx: number, fy: number) => {
    const x = Math.min(last, Math.max(0, fx));
    const y = Math.min(last, Math.max(0, fy));
    const [i, j] = [cell(x), cell(y)];
    const [tx, ty] = [x - i, y - j];
    const a = hv(i, j);
    const b = hv(i + 1, j);
    const c = hv(i, j + 1);
    const d = hv(i + 1, j + 1);
    return tx + ty <= 1 ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  };
  /** The highest corner of the ground cell under a point: a piece laid at this height never dips under the ground's triangles, whose
   * folds a piece cut on its own grid would otherwise cut through (shelters stand the same way, Close3DLayer `standingOn`). */
  const top = (fx: number, fy: number) => {
    const [i, j] = [cell(Math.min(last, Math.max(0, fx))), cell(Math.min(last, Math.max(0, fy)))];
    return Math.max(hv(i, j), hv(i + 1, j), hv(i, j + 1), hv(i + 1, j + 1));
  };
  const wetAt = (fx: number, fy: number) => {
    const [i, j] = [cell(fx), cell(fy)];
    return wetVertex(i, j) || wetVertex(i + 1, j) || wetVertex(i, j + 1) || wetVertex(i + 1, j + 1);
  };
  /** Ground gradient (metres per metre, east and north) at a point. */
  const gradient = (fx: number, fy: number): [number, number] => [
    (surf(fx + 0.5, fy) - surf(fx - 0.5, fy)) / dxM,
    (surf(fx, fy - 0.5) - surf(fx, fy + 0.5)) / dyM,
  ];
  const toF = ([lon, lat]: Corner): [number, number] => [((lon - west) / (east - west)) * last, ((north - lat) / (north - south)) * last];
  const lift = LIFT_SHARE * Math.min(dxM, dyM);
  const pathWidth = Math.max(PATH_MIN_M, PATH_MIN_PX * metersPerPixel(z + 1, latMid));

  const solid = new Builder();
  let paint: GroundPaint | null = null;
  let pieces = 0;
  /** Lit colour of a patch at a point: the ground's baked hillshade (lib/close3d.ts), so a field on a hill is lit like the hill. */
  const lit = (fx: number, fy: number) => {
    const [gx, gy] = gradient(fx, fy);
    const [nx, ny] = [-gx * EXAGGERATION, -gy * EXAGGERATION];
    const l = Math.hypot(nx, ny, 1);
    return Math.min(1.25, Math.max(0.35, 0.2 + (1.1 * (nx * SUN[0] + ny * SUN[1] + SUN[2])) / l));
  };
  /** A wash painted into the ground vertices inside it (any tile it overlaps paints its own vertices, so it is seamless). */
  const wash = (patch: AreaPatch) => {
    const q = patch.corners.map(toF);
    const [x0, x1] = [Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), Math.min(last, Math.ceil(Math.max(...q.map((p) => p[0]))))];
    const [y0, y1] = [Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])))), Math.min(last, Math.ceil(Math.max(...q.map((p) => p[1]))))];
    if (x0 > x1 || y0 > y1) return;
    const side = (a: number[], b: number[], x: number, y: number) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const inTri = (a: number[], b: number[], c: number[], x: number, y: number) => {
      const [d1, d2, d3] = [side(a, b, x, y), side(b, c, x, y), side(c, a, x, y)];
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (!inTri(q[0], q[1], q[2], i, j) && !inTri(q[0], q[2], q[3], i, j)) continue;
        if (wetVertex(i, j)) continue;
        paint ??= { weight: new Float32Array(n * n), rgb: new Float32Array(n * n * 3) };
        const v = j * n + i;
        const k = lit(i, j);
        // Strongest at the fan's middle (its first corner), fading out to the rim.
        const t = Math.min(1, Math.hypot(i - q[0][0], j - q[0][1]) / Math.max(1e-6, Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]), Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1])));
        const w = PAINT_WEIGHT * (1 - t * t);
        if (w <= paint.weight[v]) continue;
        paint.weight[v] = w;
        paint.rgb.set([(patch.rgb[0] * k) / 255, (patch.rgb[1] * k) / 255, (patch.rgb[2] * k) / 255], v * 3);
        pieces++;
      }
    }
  };

  /** One quad (corners in vertex units) cut into pieces and laid on the ground. */
  const lay = (quad: [number, number][], rgb: [number, number, number], out: Builder, up: number, kind: number) => {
    const [p0, p1, p2, p3] = quad;
    const len = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The patch's sides in metres (mean of opposite sides), and a seed from its first corner, for the field shader.
    const lenM = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * dxM, (b[1] - a[1]) * dyM);
    const lu = (lenM(p0, p1) + lenM(p3, p2)) / 2;
    const lv = (lenM(p0, p3) + lenM(p1, p2)) / 2;
    const seed = Math.abs(Math.sin(p0[0] * 12.9898 + p0[1] * 78.233 + bbox.west * 3.7) * 43758.5453) % 1;
    const code = kind + Math.min(0.99, seed);
    const nu = Math.min(MAX_CUTS, Math.max(1, Math.ceil(Math.max(len(p0, p1), len(p3, p2)) / PIECE_CELLS)));
    const nv = Math.min(MAX_CUTS, Math.max(1, Math.ceil(Math.max(len(p0, p3), len(p1, p2)) / PIECE_CELLS)));
    const base = out.vertices;
    const wet: boolean[] = [];
    // One shade for the whole patch, at its middle: a field is one colour, lit like the slope it lies on.
    const k = lit((p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4);
    const [r, g, b] = [(rgb[0] * k) / 255, (rgb[1] * k) / 255, (rgb[2] * k) / 255];
    for (let t = 0; t <= nv; t++) {
      for (let s = 0; s <= nu; s++) {
        const [su, tv] = [s / nu, t / nv];
        const fx = (1 - tv) * ((1 - su) * p0[0] + su * p1[0]) + tv * ((1 - su) * p3[0] + su * p2[0]);
        const fy = (1 - tv) * ((1 - su) * p0[1] + su * p1[1]) + tv * ((1 - su) * p3[1] + su * p2[1]);
        const h = top(fx, fy);
        wet.push(wetAt(fx, fy));
        out.positions.push(lonOf(fx) - west, latOf(fy) - south, h * EXAGGERATION + up);
        out.colors.push(r, g, b);
        out.uvs.push(su * lu, tv * lv);
        out.normals.push((1 - su) * lu, (1 - tv) * lv, code);
      }
    }
    const row = nu + 1;
    for (let t = 0; t < nv; t++) {
      for (let s = 0; s < nu; s++) {
        const a = t * row + s;
        const [b, c, d] = [a + 1, a + row, a + row + 1];
        if (wet[a] || wet[b] || wet[c] || wet[d]) continue;
        out.indices.push(base + a, base + c, base + b, base + b, base + c, base + d);
        pieces++;
      }
    }
  };

  for (const patch of patches) {
    if (patch.wash) {
      wash(patch);
      continue;
    }
    if (patch.kind === 'path') {
      const [a, b] = patch.line;
      const [mx, my] = toF([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      if (mx < 0 || mx >= last || my < 0 || my >= last) continue;
      const [ex, ey] = [(b[0] - a[0]) * mPerLon, (b[1] - a[1]) * 110_540];
      const el = Math.hypot(ex, ey) || 1;
      const [px, py] = [(-ey / el) * (pathWidth / 2), (ex / el) * (pathWidth / 2)];
      const quad = [offsetByMetres(a[0], a[1], px, py), offsetByMetres(b[0], b[1], px, py), offsetByMetres(b[0], b[1], -px, -py), offsetByMetres(a[0], a[1], -px, -py)].map(toF);
      lay(quad, patch.rgb, solid, lift, FIELD_KIND.path);
      continue;
    }
    const lon = (patch.corners[0][0] + patch.corners[1][0] + patch.corners[2][0] + patch.corners[3][0]) / 4;
    const lat = (patch.corners[0][1] + patch.corners[1][1] + patch.corners[2][1] + patch.corners[3][1]) / 4;
    const [cx, cy] = toF([lon, lat]);
    if (cx < 0 || cx >= last || cy < 0 || cy >= last) continue;
    if (FARMLAND.has(patch.kind)) {
      const [gx, gy] = gradient(cx, cy);
      const g = Math.hypot(gx, gy);
      const deg = (Math.atan(g) * 180) / Math.PI;
      if (deg >= NOT_FARMED_FROM_DEG) continue;
      if (deg >= TERRACE_FROM_DEG) {
        for (const band of terraces(patch, lon, lat, gx / g, gy / g)) lay(band.map(toF), patch.rgb, solid, lift, FIELD_KIND.field);
        continue;
      }
    }
    lay(patch.corners.map(toF), patch.rgb, solid, lift, FIELD_KIND[patch.kind] ?? 0);
  }
  return { solid: solid.done(), paint, pieces };
}

/** A farm patch on a slope as three terrace beds along the contour: same area footprint, long side across the slope, the risers between
 * them left as ground. (ux, uy): unit vector up the slope, east and north. */
export function terraces(patch: AreaPatch, lon: number, lat: number, ux: number, uy: number): Corner[][] {
  const mPerLon = 111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const side = (i: number) => {
    const [a, b] = [patch.corners[i], patch.corners[(i + 1) % 4]];
    return Math.hypot((b[0] - a[0]) * mPerLon, (b[1] - a[1]) * 111_320);
  };
  const long = Math.max(side(0), side(1));
  const short = Math.min(side(0), side(1));
  const [tx, ty] = [-uy, ux]; // along the contour
  const bed = (short / 3) * 0.7;
  return [-1, 0, 1].map((k) => {
    const [ox, oy] = [ux * (k * short) / 3, uy * (k * short) / 3];
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
      offsetByMetres(lon, lat, ox + (tx * a * long) / 2 + (ux * b * bed) / 2, oy + (ty * a * long) / 2 + (uy * b * bed) / 2),
    );
  });
}
