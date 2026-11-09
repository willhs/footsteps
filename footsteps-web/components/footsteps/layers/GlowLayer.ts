import { COORDINATE_SYSTEM, type DefaultProps } from '@deck.gl/core';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';
import { GLOW_MAX_LAT, type GlowImage } from '../hooks/gridData';
import { BAND_MAX_CELL, GLOW_MIN_CELL } from './units';

const LOG_MAX = Math.log1p(5_000_000); // gridData.ts MAX_PEOPLE
const level = (people: number) => (Math.log1p(people) / LOG_MAX).toFixed(4);
const rgb = (r: number, g: number, b: number) =>
  `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;

// The texture holds log people per cell (one byte). Colour it with the Units
// palette by the same density classes, so zooming from glow to units keeps the
// colour of each place: bands orange, villages pale gold, towns and cities cyan.
const ramp = /* glsl */ `
  float t = color.r;
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
  float strength = 0.1 + 0.9 * s * s;
  color = vec4(hue, strength * color.a);
`;

type Props = BitmapLayerProps;
export const glowImage = (glow: GlowImage) => glow as Props['image'];

/** One year of people as a single texture: cost is the same at any year and zoom.
 * Cross-fades by drawing the incoming year over the outgoing one (see parameters). */
export default class GlowLayer extends BitmapLayer<Props> {
  static layerName = 'GlowLayer';
  static defaultProps: DefaultProps<Props> = {
    ...BitmapLayer.defaultProps,
    bounds: [-180, -GLOW_MAX_LAT, 180, GLOW_MAX_LAT],
    _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false,
    parameters: {
      depthTest: false,
      // Normal "over" blending: the incoming year is drawn on top of the
      // outgoing one at opacity p, so a fade is a mix of the two years and can
      // never be brighter than both (additive (1-p)+p visibly over-brightened).
      blend: true,
      blendColorSrcFactor: 'src-alpha',
      blendColorDstFactor: 'one-minus-src-alpha',
      blendAlphaSrcFactor: 'one',
      blendAlphaDstFactor: 'one-minus-src-alpha',
    },
  } as DefaultProps<Props>;

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: { ...shaders.inject, 'fs:DECKGL_FILTER_COLOR': ramp },
    };
  }
}
