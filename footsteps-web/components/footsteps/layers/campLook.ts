// How a camp looks close in (zoom ~15 and closer): dwellings with the texture of what they are made of, a door, light from the sun clock
// and a shadow on the ground; hearths of stones, ash, embers and firewood. All of it is imagined presentation over modelled facts (the
// dwelling type and material come from lib/dwellings.ts; where a hearth stands follows Yellen 1977, see shelters.ts).
import { LayerExtension, type DefaultProps, type Layer } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import type { MaterialId, ShapeId } from '@/lib/dwellings';
import { sunShadowNow } from '@/lib/sunShadow';
import { sunVector } from '@/lib/sky';
import { sunPosition } from '@/lib/sunTime';
import { solarNowMs } from '@/lib/solarClock';

// --- Dwelling surfaces ---------------------------------------------------------------------------------------------------------

/** The surface pattern a material is drawn with (the shader's `look.surface`). */
export const SURFACE = { thatch: 0, panels: 1, strips: 2, mottle: 3, blocks: 4, rows: 5 } as const;
export const SURFACE_OF: Record<MaterialId, number> = {
  thatch: SURFACE.thatch,
  mats: SURFACE.thatch,
  hides: SURFACE.panels,
  bone: SURFACE.panels,
  felt: SURFACE.panels,
  wood: SURFACE.strips,
  bark: SURFACE.strips,
  hair: SURFACE.strips,
  mud: SURFACE.mottle,
  turf: SURFACE.mottle,
  stone: SURFACE.blocks,
  slate: SURFACE.blocks,
  snow: SURFACE.blocks,
  tile: SURFACE.rows,
  greytile: SURFACE.rows,
};
/** The mesh's form for the door and smoke hole (`look.form`): round shapes have their door on the +y side of the axis. */
export const FORM_OF: Record<ShapeId, number> = { lean: 0, dome: 1, cone: 2, drum: 1, gable: 3, block: 3 };

const LOOK_BLOCK = 'uniform shelterLookUniforms { float surface; float form; vec3 sun; float daylight; } look;';
const lookModule = {
  name: 'shelterLook', vs: LOOK_BLOCK, fs: LOOK_BLOCK,
  uniformTypes: { surface: 'f32', form: 'f32', sun: 'vec3<f32>', daylight: 'f32' },
} as const;

/** How far a dwelling's material colour is greyed by weather (0 as built). */
const WEATHERED = 0.3;
/** Light on a dwelling: the sky's share, and the sun's at full day. */
const AMBIENT = 0.48;
const DIRECT = 0.58;

const LOOK_FS = /* glsl */ `
float lookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lookNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1.0, 0.0)), f.x), mix(lookHash(i + vec2(0.0, 1.0)), lookHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const LOOK_FILTER = /* glsl */ `
  {
    vec3 p = lookLocal;
    float ang = atan(p.y, p.x);
    // Coordinates over the surface: round around the axis, flat along the walls; z is up (0 floor, 1 top).
    vec2 s = look.form > 2.5 ? vec2(abs(p.y) > 0.49 ? p.x : p.y, p.z) : vec2(ang * 0.5, p.z);
    // A pattern of freq cycles per unit fades out before a cycle is under ~3 pixels, so it never shimmers.
    float fw = max(max(fwidth(s.x), fwidth(s.y)), 1e-5);
    #define LOOK_FADE(freq) (1.0 - smoothstep(0.2, 0.4, fw * (freq)))
    float fine = LOOK_FADE(180.0);
    vec3 c = color.rgb;
    float k = 1.0;
    if (look.surface < 0.5) {
      // Thatch or matting: fine straws down the slope, laid in courses.
      float straw = lookNoise(vec2(s.x * 180.0, s.y * 6.0));
      float course = smoothstep(0.0, 0.25, fract(s.y * 7.0));
      k = mix(1.0, 0.82 + 0.3 * straw, fine) * mix(1.0, mix(0.8, 1.0, course), LOOK_FADE(7.0));
    } else if (look.surface < 1.5) {
      // Hides or felt: sewn panels, each its own shade, darker along the seams.
      vec2 cell = vec2(s.x * 5.0, s.y * 3.0);
      vec2 f = fract(cell);
      float seam = smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
      k = mix(1.0, (0.86 + 0.24 * lookHash(floor(cell))) * mix(0.72, 1.0, seam), LOOK_FADE(5.0));
    } else if (look.surface < 2.5) {
      // Planks, bark sheets or woven strips: long strips with their own shade.
      float strip = floor(s.x * 14.0);
      k = mix(1.0, (0.84 + 0.26 * lookHash(vec2(strip, 3.0))) * mix(1.0, 0.85 + 0.2 * lookNoise(vec2(strip, s.y * 20.0)), LOOK_FADE(20.0)), LOOK_FADE(14.0));
    } else if (look.surface < 3.5) {
      // Mud or turf: mottled, smoothed by hand.
      k = 0.82 + 0.3 * lookNoise(s * vec2(9.0, 7.0));
    } else if (look.surface < 4.5) {
      // Stone or snow blocks in courses.
      vec2 b = vec2(s.x * 6.0 + 0.5 * floor(s.y * 5.0), s.y * 5.0);
      vec2 f = fract(b);
      k = mix(1.0, (0.88 + 0.18 * lookHash(floor(b))) * mix(0.7, 1.0, smoothstep(0.0, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)))), LOOK_FADE(6.0));
    } else {
      // Tiles in rows.
      k = mix(1.0, mix(0.78, 1.04, smoothstep(0.0, 0.5, fract(s.y * 12.0))) * (0.92 + 0.12 * lookHash(floor(vec2(s.x * 16.0, s.y * 12.0)))), LOOK_FADE(16.0));
    }
    #undef LOOK_FADE
    // Weathered: sun, rain and smoke grey every material a little.
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), ${WEATHERED.toFixed(2)}) * ${(1 - WEATHERED / 3).toFixed(2)};
    c *= k;
    // The door on the +y side (the side facing the camp's middle, shelters.ts); a lean-to's open front shows its shaded inside.
    bool door = false;
    if (look.form < 0.5) door = p.y > 0.42;
    else if (look.form < 2.5) door = abs(ang - 1.5708) < 0.26 && p.z < 0.42;
    else door = p.y > 0.45 && abs(p.x) < 0.09 && p.z < 0.5;
    if (door) c *= 0.22;
    // A tent's smoke hole.
    if (look.form > 1.5 && look.form < 2.5 && p.z > 0.9) c *= 0.3;
    // Sunlight from the sun clock's direction, the sky's light everywhere, darker at the foot.
    vec3 n = normalize(lookNormal);
    float lit = ${AMBIENT.toFixed(2)} + ${DIRECT.toFixed(2)} * look.daylight * max(dot(n, look.sun), 0.0);
    c *= lit * mix(0.72, 1.0, smoothstep(0.0, 0.22, p.z));
    color.rgb = clamp(c, 0.0, 1.0);
  }
`;

/** On a dwelling's SimpleMeshLayer (shelters.ts meshes: footprint ±0.5, z 0 to 1, the door side +y): the material's texture, the door and
 * the sun's light. Give the layer `material: { ambient: 1, diffuse: 0 }` so deck.gl's own lights leave the colour as this sets it. */
export class ShelterLook extends LayerExtension {
  static extensionName = 'ShelterLook';
  static defaultProps = { shelterSurface: 0, shelterForm: 1 };

  getShaders() {
    return {
      modules: [lookModule],
      inject: {
        'vs:#decl': 'out vec3 lookLocal; out vec3 lookNormal;',
        'vs:#main-end': 'lookLocal = positions; lookNormal = instanceModelMatrix * normals;',
        'fs:#decl': 'in vec3 lookLocal; in vec3 lookNormal;\n' + LOOK_FS,
        'fs:DECKGL_FILTER_COLOR': LOOK_FILTER,
      },
    };
  }

  draw(this: Layer<{ shelterSurface?: number; shelterForm?: number }>) {
    const { longitude, latitude } = this.context.viewport as unknown as { longitude: number; latitude: number };
    const [e, n, up] = sunNow(longitude, latitude);
    for (const model of this.getModels())
      model.shaderInputs.setProps({
        shelterLook: { surface: this.props.shelterSurface ?? 0, form: this.props.shelterForm ?? 1, sun: [e, n, Math.max(0, up)], daylight: Math.min(1, Math.max(0, up * 4)) },
      });
  }
}

let sunCache: { at: number; key: string; v: [number, number, number] } | null = null;
/** The sun's direction (east, north, up) over the view centre now, re-read once a second. */
function sunNow(lon: number, lat: number): [number, number, number] {
  const key = `${Math.round(lon * 4)},${Math.round(lat * 4)}`;
  const now = performance.now();
  if (!sunCache || sunCache.key !== key || now - sunCache.at > 1000) sunCache = { at: now, key, v: sunVector(lon, lat, sunPosition(new Date(solarNowMs()))) };
  return sunCache.v;
}

// --- Shadows on the ground -----------------------------------------------------------------------------------------------------

/** How dark a solid thing's shadow is at full sun (the sky still lights the shade). */
export const SOLID_SHADOW_ALPHA = 0.55;

const CAST_BLOCK = 'uniform groundShadowUniforms { vec2 dir; float strength; } groundShadow;';
const castModule = { name: 'groundShadow', vs: CAST_BLOCK, fs: CAST_BLOCK, uniformTypes: { dir: 'vec2<f32>', strength: 'f32' } } as const;

type CastProps = { getCast?: (d: unknown) => number };

/** Soft shadows of solid things (dwellings, hearth stones) on the ground: a capsule from the thing's foot along the sun's shadow vector
 * (lib/sunShadow.ts) for `getCast` metres of height, `getRadius` metres wide. Nothing at night. */
export class GroundShadowLayer<D = unknown> extends ScatterplotLayer<D, CastProps> {
  static layerName = 'GroundShadowLayer';
  static defaultProps: DefaultProps<ScatterplotLayerProps<unknown> & CastProps> = {
    ...ScatterplotLayer.defaultProps,
    radiusUnits: 'meters',
    stroked: false,
    antialiasing: false,
    getFillColor: [6, 9, 6, 255],
    getCast: { type: 'accessor', value: 1 },
    pickable: false,
  } as DefaultProps<ScatterplotLayerProps<unknown> & CastProps>;

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({ instanceCast: { size: 1, accessor: 'getCast', defaultValue: 1 } });
  }

  getShaders() {
    const shaders = super.getShaders();
    // Extensions' injections (the night shading) come in `shaders.inject`: keep them, after this layer's own code for each hook.
    const ext: Record<string, string> = shaders.inject ?? {};
    const own: Record<string, string> = {
        'vs:#decl': 'in float instanceCast; out vec2 castEnd; out float castRadius;',
        // The quad grows to hold the capsule, centred halfway along it; the capsule then just fits in the unit circle the fragment
        // shader keeps (scatterplot's own discard).
        'vs:DECKGL_FILTER_SIZE': `
          float rC = abs(size.x);
          vec2 castC = project_size(vec3(groundShadow.dir * instanceCast, 0.0)).xy;
          float half_ = rC + 0.5 * length(castC);
          size.xy = geometry.uv * half_ + 0.5 * castC;
          castEnd = 0.5 * castC / half_;
          castRadius = rC / half_;
        `,
        'fs:#decl': 'in vec2 castEnd; in float castRadius;',
        'fs:DECKGL_FILTER_COLOR': `
          vec2 u = geometry.uv;
          vec2 ab = 2.0 * castEnd;
          vec2 a = -castEnd;
          float t = dot(ab, ab) > 1e-8 ? clamp(dot(u - a, ab) / dot(ab, ab), 0.0, 1.0) : 0.5;
          float d = length(u - a - ab * t) / castRadius;
          // Darkest at the foot, softer and lighter towards the tip.
          color.a *= groundShadow.strength * ${SOLID_SHADOW_ALPHA.toFixed(2)} * (1.0 - smoothstep(0.55, 1.0, d)) * mix(1.0, 0.65, t);
          if (color.a < 0.005) discard;
        `,
    };
    const inject = { ...ext };
    for (const [hook, code] of Object.entries(own)) inject[hook] = hook in ext ? `${code}\n${ext[hook]}` : code;
    return { ...shaders, modules: [...shaders.modules, castModule], inject };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    const { longitude, latitude } = this.context.viewport as unknown as { longitude: number; latitude: number };
    const sun = sunShadowNow(longitude, latitude);
    this.state.model?.shaderInputs.setProps({ groundShadow: { dir: [sun.east, sun.north], strength: sun.strength } });
    super.draw(params);
  }
}

// --- Hearths ---------------------------------------------------------------------------------------------------------------------
// An open hearth outside a forager's or herder's shelter: a ring of stones round an ash bed, a few logs pushed in star-fashion and a
// small pile of firewood beside it. Real size (about 1.3 m across), so it shows from about zoom 17. Imagined: no hearth is dated or placed.

type V3 = [number, number, number];
type Rgb = [number, number, number];

/** Metres: the stone ring's radius, a stone's size, the ash bed's radius, the logs' length and thickness. */
export const HEARTH_RING_M = 0.62;
const STONE_M = 0.14;
const ASH_M = 0.56;
const LOG_LENGTH_M = 0.95;
const LOG_THICK_M = 0.09;
/** How far the firewood pile stands from the hearth's middle, metres. */
const WOODPILE_M = 1.5;
const STONES = 9;
const STONE_RGB: Rgb = [132, 127, 118];
const ASH_RGB: Rgb = [92, 88, 84];
const CHAR_RGB: Rgb = [34, 30, 28];
const LOG_RGB: Rgb = [104, 76, 50];
/** The embers (a separate, unlit mesh: they glow at night). */
export const EMBER_RGB: Rgb = [255, 128, 46];

class Soup {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  tri(a: V3, b: V3, c: V3, rgb: Rgb) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((x) => x / len);
    if (n[2] < 0) n = n.map((x) => -x); // everything here is seen from above: face up
    for (const p of [a, b, c]) {
      this.positions.push(...p);
      this.normals.push(...n);
      this.colors.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
  }
  /** A flat disc of `n` segments, its rim coloured `rim` and its middle `mid`. */
  disc(cx: number, cy: number, z: number, r: number, mid: Rgb, rim: Rgb, n = 12) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const p0: V3 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z];
      const p1: V3 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z];
      this.tri([cx, cy, z], p0, p1, i % 2 ? mid : rim);
    }
  }
  /** A low box turned by `yaw`, from its centre: length along yaw, width across, height up (a stone, a log). */
  box(cx: number, cy: number, z: number, length: number, width: number, height: number, yaw: number, top: Rgb, side: Rgb) {
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const at = (u: number, v: number, w: number): V3 => [cx + (u * c - v * s), cy + (u * s + v * c), z + w];
    const [l, h] = [length / 2, width / 2];
    const corners = [[-l, -h], [l, -h], [l, h], [-l, h]];
    const topRing = corners.map(([u, v]) => at(u * 0.85, v * 0.8, height));
    const base = corners.map(([u, v]) => at(u, v, 0));
    this.tri(topRing[0], topRing[1], topRing[2], top);
    this.tri(topRing[0], topRing[2], topRing[3], top);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.tri(base[i], base[j], topRing[j], side);
      this.tri(base[i], topRing[j], topRing[i], side);
    }
  }
  mesh() {
    return {
      attributes: {
        positions: { value: new Float32Array(this.positions), size: 3 },
        normals: { value: new Float32Array(this.normals), size: 3 },
        colors: { value: new Float32Array(this.colors), size: 3 },
      },
    };
  }
}

const shade = (rgb: Rgb, k: number): Rgb => [rgb[0] * k, rgb[1] * k, rgb[2] * k];

/** The hearth's meshes in metres, its middle at the origin, the woodpile on the +x side: `hearth` lit like the ground, `embers` unlit. */
export function hearthMeshes() {
  const hearth = new Soup();
  hearth.disc(0, 0, 0.02, ASH_M, CHAR_RGB, ASH_RGB, 14);
  for (let i = 0; i < STONES; i++) {
    const a = (i / STONES) * Math.PI * 2 + 0.3 * Math.sin(i * 2.7);
    const size = STONE_M * (0.8 + 0.4 * ((i * 0.618) % 1));
    const k = 0.85 + 0.3 * ((i * 0.37) % 1);
    hearth.box(Math.cos(a) * HEARTH_RING_M, Math.sin(a) * HEARTH_RING_M, 0, size * 1.3, size, size * 0.8, a + 0.6 * i, shade(STONE_RGB, k * 1.1), shade(STONE_RGB, k * 0.8));
  }
  // Four logs pushed into the fire from outside, their inner ends charred.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const mid = LOG_LENGTH_M * 0.5 + 0.08;
    hearth.box(Math.cos(a) * mid, Math.sin(a) * mid, 0.03, LOG_LENGTH_M, LOG_THICK_M, LOG_THICK_M, a, LOG_RGB, shade(LOG_RGB, 0.7));
    hearth.box(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.04, 0.22, LOG_THICK_M * 1.05, LOG_THICK_M * 1.05, a, CHAR_RGB, CHAR_RGB);
  }
  // A small pile of firewood beside it.
  for (let i = 0; i < 7; i++) {
    const layer = i < 4 ? 0 : 1;
    const y = (layer === 0 ? i - 1.5 : i - 5) * LOG_THICK_M * 1.15;
    hearth.box(WOODPILE_M, y, layer * LOG_THICK_M * 0.9, LOG_LENGTH_M * 0.8, LOG_THICK_M, LOG_THICK_M, 0.08 * Math.sin(i * 3.1), shade(LOG_RGB, 1.05 - 0.05 * i), shade(LOG_RGB, 0.65));
  }
  const embers = new Soup();
  embers.disc(0, 0, 0.06, 0.24, EMBER_RGB, shade(EMBER_RGB, 0.75), 10);
  return { hearth: hearth.mesh(), embers: embers.mesh() };
}
