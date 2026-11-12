import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import vs from './unitMorphVertex';

type MorphProps = { progress: number; brightness: number; settle: number; halo: number };
const block = /* glsl */ `uniform morphUniforms {
  float progress;
  float brightness;
  float time;
  float settle;
  float halo;
} morph;
`;
const morph = {
  name: 'morph',
  vs: block,
  fs: block,
  uniformTypes: { progress: 'f32', brightness: 'f32', time: 'f32', settle: 'f32', halo: 'f32' },
} as const;

// Fire look for bands and villages (vFire > 0): a solid body the mark's true
// size, a soft halo out to the sprite edge, a white-hot centre and a flicker
// while small. Picking keeps the whole sprite, so small marks are easy to hit.
const fireFs = /* glsl */ `
  if (picking.isActive < 0.5 && vFire > 0.0) {
    float d = length(geometry.uv);
    float body = 1.0 - smoothstep(vCore * 0.7, vCore, d);
    float halo = exp(-d * d * 5.0) * 0.5;
    float hot = exp(-pow(d / max(vCore, 0.05), 2.0) * 3.0);
    float ph = vSeed * 6283.0;
    float flick = 0.75 + 0.25 * sin(morph.time * (4.0 + 6.0 * vSeed) + ph) * sin(morph.time * 2.3 + ph * 2.0);
    float a = mix(1.0, max(body, halo) * mix(1.0, flick, vFire), vFire);
    color.rgb = mix(color.rgb, vec3(1.0, 0.97, 0.9), hot * 0.55 * vFire);
    color.a *= a;
  }
`;

type Props = ScatterplotLayerProps & MorphProps;

/** Interpolate each mark's endpoints in one draw instead of drawing two clouds.
 * `progress` is the year morph (0 = from year, 1 = to year); `brightness`
 * dims bands and villages by zoom. Both are uniforms: changing them never
 * touches the uploaded marks, and layer opacity stays free for zoom fades. */
export default class MorphScatterplotLayer extends ScatterplotLayer<
  unknown,
  Props
> {
  static layerName = 'MorphScatterplotLayer';
  static defaultProps: DefaultProps<Props> = {
    ...ScatterplotLayer.defaultProps,
    progress: 1,
    brightness: 1,
    settle: 1,
    halo: 0,
  } as DefaultProps<Props>;

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceTargetRadius: {
        size: 1,
        accessor: 'getTargetRadius',
        defaultValue: 1,
      },
      instanceTargetFillColors: {
        size: 4,
        type: 'unorm8',
        accessor: 'getTargetFillColor',
        defaultValue: [0, 0, 0, 0],
      },
    });
  }

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      vs,
      modules: [...shaders.modules, morph],
      inject: {
        ...shaders.inject,
        'fs:#decl': 'in float vCore;\nin float vSeed;\nin float vFire;',
        'fs:DECKGL_FILTER_COLOR': fireFs,
      },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    const { progress, brightness, settle, halo } = this.props;
    this.state.model?.shaderInputs.setProps({
      morph: { progress, brightness, settle, halo, time: (performance.now() / 1000) % 1000 },
    });
    super.draw(params);
  }
}
