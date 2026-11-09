import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import vs from './unitMorphVertex';

type MorphProps = { progress: number; brightness: number };
const morph = {
  name: 'morph',
  vs: /* glsl */ `uniform morphUniforms {
  float progress;
  float brightness;
} morph;
`,
  uniformTypes: { progress: 'f32', brightness: 'f32' },
} as const;

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
    return { ...shaders, vs, modules: [...shaders.modules, morph] };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    const { progress, brightness } = this.props;
    this.state.model?.shaderInputs.setProps({ morph: { progress, brightness } });
    super.draw(params);
  }
}
