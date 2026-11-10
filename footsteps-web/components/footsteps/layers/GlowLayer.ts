import { COORDINATE_SYSTEM, type DefaultProps } from '@deck.gl/core';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';
import { GLOW_MAX_LAT, type GlowImage } from '../hooks/gridData';
import { BAND_MAX_CELL, GLOW_MIN_CELL } from './units';

const LOG_MAX = Math.log1p(5_000_000); // gridData.ts MAX_PEOPLE
const level = (people: number) => (Math.log1p(people) / LOG_MAX).toFixed(4);
const rgb = (r: number, g: number, b: number) =>
  `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;

// The texture holds log people per cell for two years: red = the year fading
// out, green = the year fading in. Mix the head counts by fade progress, then
// colour once, so a year cross-fade is one draw and can never stack two
// semi-transparent layers (that brightened the map mid-fade). Colour with the Units
// palette by the same density classes, so zooming from glow to units keeps the
// colour of each place: bands orange, villages pale gold, towns and cities cyan.
const ramp = /* glsl */ `
  if (glowFade.lights > 0.5) return; // drawn at main end (needs the texture)
  float t = mix(color.r, color.g, glowFade.progress);
  if (t <= 0.0) discard;
  vec3 band = ${rgb(255, 190, 110)};
  vec3 village = ${rgb(255, 225, 160)};
  vec3 city = ${rgb(60, 230, 255)};
  vec3 hue = mix(
    mix(band, village, smoothstep(${level(BAND_MAX_CELL / 3)}, ${level(BAND_MAX_CELL)}, t)),
    city,
    smoothstep(${level(GLOW_MIN_CELL / 4)}, ${level(GLOW_MIN_CELL)}, t)
  );
  // A small floor keeps thinly peopled land (10,000 BCE foragers) visible
  // without lighting every sparse cell as a solid block when zoomed in;
  // squared above it so density differences read clearly in farmed regions.
  float s = smoothstep(0.0, ${level(GLOW_MIN_CELL * 4)}, t);
  float strength = glowFade.minLight + (1.0 - glowFade.minLight) * s * s;
  color = vec4(hue, strength * color.a);
`;

const lightsMain = /* glsl */ `
  if (glowFade.lights > 0.5) {
    // Night lights (over natural-colour terrain): each ~10 km cell lights up
    // with a chance that rises with its people (about one light per band).
    // The hash depends only on the cell, so a lit cell stays lit as its
    // population grows, and lights hold still while scrubbing.
    vec2 g = uv * glowFade.size;
    vec2 cell = floor(g);
    float cellPx = 1.0 / max(fwidth(g.x), 1e-5);
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float flicker = 0.8 + 0.2 * (0.6 * sin(glowFade.time * (1.3 + h) + h * 6.2832)
      + 0.4 * sin(glowFade.time * (3.1 + 2.0 * h) + h * 12.566));
    vec3 fire = ${rgb(255, 214, 140)};
    if (cellPx < 3.0) {
      // Several cells per pixel: use the area-averaged (mipmapped) head count
      // and the chance that any of the covered cells is lit.
      float ta = mix(fragColor.r, fragColor.g, glowFade.progress);
      if (ta <= 0.0) discard;
      float pa = exp(ta * ${LOG_MAX.toFixed(6)}) - 1.0;
      float cells = 1.0 / (cellPx * cellPx);
      if (h >= 1.0 - exp(-pa * cells / 60.0)) discard;
      float la = 0.65 + 0.35 * smoothstep(${level(100)}, ${level(60000)}, ta);
      // premultiplied: bright light, and darken under it so it reads on sand
      fragColor = vec4(fire * la * flicker * 1.7, 0.85);
      return;
    }
    vec4 texel = texelFetch(bitmapTexture, ivec2(cell), 0);
    float tc = mix(texel.r, texel.g, glowFade.progress);
    if (tc <= 0.0) discard;
    float people = exp(tc * ${LOG_MAX.toFixed(6)}) - 1.0;
    if (h >= 1.0 - exp(-people / 120.0)) discard;
    float light = (0.55 + 0.45 * smoothstep(${level(100)}, ${level(60000)}, tc)) * flicker;
    // A point of firelight in the cell with a wide dark ring, so it reads by
    // brightness on sand, ice and forest alike.
    float r = length((fract(g) - 0.5) * cellPx);
    float core = max(1.3, 0.16 * cellPx);
    float ring = core * 3.4;
    float coreA = 1.0 - smoothstep(core - 0.8, core + 0.8, r);
    float ringA = (1.0 - smoothstep(core, ring, r)) * 0.8;
    if (coreA <= 0.0 && ringA <= 0.01) discard;
    // premultiplied: rgb adds light, alpha darkens what is underneath
    fragColor = vec4(fire * light * coreA * 1.25, max(ringA, coreA * 0.9));
    return;
  }
`;

const glowFade = {
  name: 'glowFade',
  fs: /* glsl */ `uniform glowFadeUniforms {
  float progress;
  float minLight;
  float lights;
  vec2 size;
  float time;
} glowFade;
`,
  uniformTypes: {
    progress: 'f32',
    minLight: 'f32',
    lights: 'f32',
    size: 'vec2<f32>',
    time: 'f32',
  },
} as const;

/** `floor`: minimum brightness of any peopled cell (raised over terrain so
 * sparse eras stay visible against the satellite image). */
type Props = BitmapLayerProps & {
  progress: number;
  floor: number;
  /** Draw people as night lights (for natural-colour terrain) instead of glow. */
  lights: boolean;
  /** Texture size in cells, for the night-lights cell grid. */
  size: [number, number];
};

export const ADDITIVE = {
  depthTest: false,
  blend: true,
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
} as const;
// Premultiplied "over": light adds through rgb, the dark ring through alpha.
export const LIGHTS = {
  depthTest: false,
  blend: true,
  blendColorSrcFactor: 'one',
  blendColorDstFactor: 'one-minus-src-alpha',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one-minus-src-alpha',
} as const;

/** Pack two years (or one year twice) into one RG texture: R = from, G = to.
 * Built once per transition; the per-frame fade is only a uniform. */
export function glowPair(from: GlowImage, to: GlowImage): Props['image'] {
  const n = to.width * to.height;
  const data = new Uint8Array(n * 2);
  const a = from.data;
  const b = to.data;
  for (let i = 0; i < n; i++) {
    data[2 * i] = a[i];
    data[2 * i + 1] = b[i];
  }
  return { data, width: to.width, height: to.height, format: 'rg8unorm' } as Props['image'];
}

/** People as one texture: cost is the same at any year and zoom. */
export default class GlowLayer extends BitmapLayer<Props> {
  static layerName = 'GlowLayer';
  static defaultProps: DefaultProps<Props> = {
    ...BitmapLayer.defaultProps,
    bounds: [-180, -GLOW_MAX_LAT, 180, GLOW_MAX_LAT],
    _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false,
    progress: 1,
    floor: 0.1,
    lights: false,
    size: [1, 1],
    // Additive, so people read as light over the dark map. Safe for year
    // fades: both years are mixed inside this one draw.
    parameters: ADDITIVE,
  } as DefaultProps<Props>;

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, glowFade],
      inject: {
        ...shaders.inject,
        'fs:DECKGL_FILTER_COLOR': ramp,
        'fs:#main-end': lightsMain,
      },
    };
  }

  draw(params: Parameters<BitmapLayer['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      glowFade: {
        progress: this.props.progress,
        minLight: this.props.floor,
        lights: this.props.lights ? 1 : 0,
        size: this.props.size,
        time: (performance.now() / 1000) % 1000,
      },
    });
    super.draw(params);
  }
}
