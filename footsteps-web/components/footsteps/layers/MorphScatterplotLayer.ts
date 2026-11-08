import { ScatterplotLayer } from '@deck.gl/layers';
import vs from './unitMorphVertex';

/** Interpolate each mark's endpoints in one draw instead of drawing two clouds. */
export default class MorphScatterplotLayer extends ScatterplotLayer {
  static layerName = 'MorphScatterplotLayer';
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
    return { ...super.getShaders(), vs };
  }
}
