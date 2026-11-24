// Close-up light, haze and water (`?sky=1`; lib/sky.ts, docs/ops/close-up-scene.md): a deck.gl extension on the ground mesh
// that lights the relief with the sun clock's sun (or the imagined moon), draws open water with moving ripples, a sun glint, a lighter
// shallow band and a soft foam line at the shore, and fades everything into the sky's horizon colour with distance. The mesh is built
// unshaded for it (`buildTerrainMesh(..., lit)`), with open water marked in texCoords.y (lib/close3d.ts COVER_WATER). Imagined
// presentation: no part of it is data.
//
// Haze: `1 − exp(−d · density / HAZE_M)`, where density is the air's mean along the line of sight (exp(−z / HAZE_SCALE_M), thinner up
// high), so zooming out does not fog the view over: at zoom 9 the camera is ~150 km from the ground it looks at, but almost all of that
// through thin air (before 2026-11-24 the haze counted distance only and whited the view out from zoom ~11.5 down). Then, where the far
// clipping plane cuts the ground short of the top of the screen (`farFade`, the steep sky tilt), ramped to full between 55% and 97% of the
// far plane's depth, so the mesh meets the sky backdrop (lib/sky.ts skyBackdrop) at the horizon colour instead of ending on an edge.
import { LayerExtension, type Layer } from '@deck.gl/core';
import { animSeconds } from '@/lib/still';
import type { SceneLight } from '@/lib/sky';
import { farMultiplier } from '@/lib/close3d';

type SkyProps = { skyLight: SceneLight | null };

/** How long the shader clock runs before it wraps (s): long enough that the jump is rare, short enough for float32. */
const CLOCK_WRAP_S = 1800;

const sky = {
  name: 'sky',
  fs: `uniform skyUniforms {
    vec3 sun;
    vec3 direct;
    vec3 ambient;
    vec3 horizon;
    float glint;
    float time;
    float farW;
    float farFade;
    float mPerUnit;
    float enabled;
  } sky;`,
  uniformTypes: {
    sun: 'vec3<f32>',
    direct: 'vec3<f32>',
    ambient: 'vec3<f32>',
    horizon: 'vec3<f32>',
    glint: 'f32',
    time: 'f32',
    farW: 'f32',
    farFade: 'f32',
    mPerUnit: 'f32',
    enabled: 'f32',
  },
} as const;

const VS_DECL = `out vec3 vSkyNormal; out vec2 vSkyPos; out vec3 vSkyEye; out float vSkyW; out float vSkyZ;`;
// The mesh normal is east-north-up (lib/close3d.ts), like the light vector; the position in degrees is the tile corner + offset.
const VS_MAIN_END = `vSkyNormal = normals; vSkyPos = instancePositions.xy + positions.xy;`;
// From the point to the camera in common space (x east, y north, z up), set once geometry.position is known.
const VS_GL_POSITION = `vSkyEye = project.cameraPosition - geometry.position.xyz; vSkyW = position.w; vSkyZ = geometry.position.z;`;

const FS_DECL = `
in vec3 vSkyNormal;
in vec2 vSkyPos;
in vec3 vSkyEye;
in float vSkyW;
in float vSkyZ;

// Through sea-level air the haze reaches 63% at HAZE_M; the air thins with height over HAZE_SCALE_M (drawn metres).
const float HAZE_M = 45000.0;
const float HAZE_SCALE_M = 8000.0;

float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Water surface height (0..1) at m metres: two noise layers drifting different ways, lattice s metres.
float sWaves(vec2 m, float s, float t) {
  return 0.6 * sNoise(m / s + t * vec2(0.11, 0.05)) + 0.4 * sNoise(m / (s * 0.53) + vec2(7.3, 1.9) - t * vec2(0.04, 0.13));
}

// Slope of the water surface at m (per lattice), the lattice never under ~3 pixels (mpp metres per pixel) so it does not shimmer.
vec2 sRipple(vec2 m, float mpp, float t) {
  float s = max(9.0, 4.0 * mpp);
  float d = 0.35 * s;
  float h0 = sWaves(m, s, t);
  return vec2(sWaves(m + vec2(d, 0.0), s, t) - h0, sWaves(m + vec2(0.0, d), s, t) - h0) / 0.35;
}
`;

const FS_FILTER_COLOR = `
  if (sky.enabled > 0.5) {
    vec3 eye = vSkyEye;
    float distM = length(eye) * sky.mPerUnit;
    vec3 view = normalize(eye);
    vec2 m = vec2(vSkyPos.x * cos(radians(vSkyPos.y)), vSkyPos.y) * 111320.0;
    float mpp = max(max(fwidth(m.x), fwidth(m.y)) * 0.5, 0.01);
    vec3 n = normalize(vSkyNormal);
    vec3 albedo = color.rgb;
    // Land: the sky's light from everywhere plus the direct light on slopes facing it.
    vec3 c = albedo * (0.7 * sky.ambient + 0.8 * sky.direct * max(dot(n, sky.sun), 0.0));
    // A little more colour than the era image's muted tones: the close-up should read as a place in daylight.
    c = max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.18), 0.0);
    // Open water: the cover layer is -1 at water vertices, 0 (or more) on land; the shoreline is where it crosses -0.75.
    float wLayer = geometry.uv.y;
    float wobble = (sNoise(m / max(70.0, 4.0 * mpp)) - 0.5) * 0.1;
    float water = smoothstep(-0.7 + wobble, -0.8 + wobble, wLayer);
    if (water > 0.001) {
      float t = sky.time;
      vec3 wn = normalize(vec3(-0.3 * sRipple(m, mpp, t), 1.0));
      float offshore = clamp((-0.75 - wLayer) / 0.25, 0.0, 1.0); // 0 at the shore, 1 a vertex out
      // A lighter, greener band in the shallows.
      vec3 base = mix(albedo * vec3(1.3, 1.45, 1.25) + vec3(0.04, 0.07, 0.05), albedo, smoothstep(0.0, 0.9, offshore));
      float sunH = max(sky.sun.z, 0.0);
      vec3 wc = base * (0.75 * sky.ambient + 0.7 * sky.direct * (0.4 + 0.6 * sunH));
      // The sky in the water, more at grazing angles.
      float fresnel = 0.03 + 0.6 * pow(1.0 - max(dot(view, wn), 0.0), 5.0);
      wc = mix(wc, sky.horizon * 0.95, fresnel);
      // The sun's (or moon's) glint off the ripples.
      vec3 h = normalize(view + sky.sun);
      float spec = pow(max(dot(wn, h), 0.0), 180.0) * 3.0 + pow(max(dot(wn, h), 0.0), 24.0) * 0.12;
      wc += sky.direct * spec * sky.glint * step(0.0, sky.sun.z + 0.02);
      // Foam at the shore: broken, slowly pulsing.
      float fs = max(6.0, 3.0 * mpp);
      float broken = smoothstep(0.42, 0.72, sNoise(m / fs + vec2(t * 0.07, -t * 0.05)) + 0.18 * sin(t * 0.9 + m.x / 37.0 + m.y / 53.0));
      float foam = (1.0 - smoothstep(0.0, 0.45, offshore)) * broken * 0.85;
      wc = mix(wc, vec3(0.92, 0.95, 0.96) * (0.8 * sky.ambient + 0.7 * sky.direct * (0.3 + 0.7 * sunH)), foam);
      c = mix(c, wc, water);
    }
    // Distance haze in the horizon's colour; full before the far plane, where the sky backdrop shows.
    float zPoint = max(vSkyZ * sky.mPerUnit, 0.0);
    float zEye = max((vSkyZ + eye.z) * sky.mPerUnit, 0.0);
    float rise = zEye - zPoint;
    float density = abs(rise) < 1.0 ? exp(-zPoint / HAZE_SCALE_M) : HAZE_SCALE_M * (exp(-zPoint / HAZE_SCALE_M) - exp(-zEye / HAZE_SCALE_M)) / rise;
    float haze = max(1.0 - exp(-distM * density / HAZE_M), sky.farFade * smoothstep(0.55, 0.97, vSkyW / sky.farW));
    color.rgb = mix(c, sky.horizon, haze);
  }
`;

/** Add to the ground mesh's SimpleMeshLayer with a `skyLight` prop (lib/sky.ts sceneLight). Reads texCoords.y as the open-water
 * marker, so only a mesh built `lit` (or with `cover`) should get it. */
export default class SkyLight extends LayerExtension {
  static extensionName = 'SkyLight';
  static defaultProps = { skyLight: { type: 'object', value: null, compare: true } };

  getShaders() {
    return {
      modules: [sky],
      inject: {
        'vs:#decl': VS_DECL,
        'vs:#main-end': VS_MAIN_END,
        'vs:DECKGL_FILTER_GL_POSITION': VS_GL_POSITION,
        'fs:#decl': FS_DECL,
        // A plain string, never `{ order, injection }`: deck.gl's mergeShaders joins every extension's injection for a hook as
        // text in extension order, so an object beside groundDetail's string became "[object Object]" in the shader and the
        // close-up failed to compile with ?sky=1 and ?ground=1 or ?weather=1. Close3DLayer lists GROUND_DETAIL before SKY_LIGHT.
        'fs:DECKGL_FILTER_COLOR': FS_FILTER_COLOR,
      },
    };
  }

  draw(this: Layer<SkyProps>) {
    const light = this.props.skyLight;
    const viewport = this.context.viewport as unknown as { projectionMatrix: number[]; distanceScales: { unitsPerMeter: number[] }; pitch?: number };
    // The far clipping plane's depth, in the units of gl_Position.w, from the perspective matrix (m14 = 2fn / (n − f), m10 = (f + n) / (n − f)).
    const p = viewport.projectionMatrix;
    const farW = p[14] / (p[10] + 1);
    // The far plane cuts the ground before the top of the screen only once the sky tilt draws less than deck.gl would (lib/close3d.ts
    // farMultiplier); flatter, the ground runs to the screen's edge and needs no fade into the sky.
    const m = farMultiplier(viewport.pitch ?? 0);
    const farFade = Math.min(1, Math.max(0, (1.01 - m) / 0.11));
    for (const model of this.getModels()) {
      model.shaderInputs.setProps({
        sky: light
          ? {
            sun: light.sun,
            direct: light.direct,
            ambient: light.ambient,
            horizon: light.horizon,
            glint: light.glint,
            time: animSeconds(CLOCK_WRAP_S),
            farW,
            farFade,
            mPerUnit: 1 / viewport.distanceScales.unitsPerMeter[2],
            enabled: 1,
          }
          : { sun: [0, 0, 1], direct: [0, 0, 0], ambient: [1, 1, 1], horizon: [0, 0, 0], glint: 0, time: 0, farW: 1, farFade: 0, mPerUnit: 1, enabled: 0 },
      });
    }
  }
}
