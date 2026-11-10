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
  float strength = glowFade.floor + (1.0 - glowFade.floor) * s * s;
  color = vec4(hue, strength * color.a);
`;

const glowFade = {
  name: 'glowFade',
  fs: /* glsl */ `uniform glowFadeUniforms {
  float progress;
  float floor;
} glowFade;
`,
  uniformTypes: { progress: 'f32', floor: 'f32' },
} as const;

/** `floor`: minimum brightness of any peopled cell (raised over terrain so
 * sparse eras stay visible against the satellite image). */
type Props = BitmapLayerProps & { progress: number; floor: number };

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
    parameters: {
      depthTest: false,
      // Additive, so people read as light over the dark map and the terrain.
      // Safe for year fades: both years are mixed inside this one draw.
      blend: true,
      blendColorSrcFactor: 'src-alpha',
      blendColorDstFactor: 'one',
      blendAlphaSrcFactor: 'one',
      blendAlphaDstFactor: 'one',
    },
  } as DefaultProps<Props>;

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, glowFade],
      inject: { ...shaders.inject, 'fs:DECKGL_FILTER_COLOR': ramp },
    };
  }

  draw(params: Parameters<BitmapLayer['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      glowFade: { progress: this.props.progress, floor: this.props.floor },
    });
    super.draw(params);
  }
}
