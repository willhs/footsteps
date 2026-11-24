import { IconLayer } from '@deck.gl/layers';
import { animSeconds } from '@/lib/still';
import { TREE_KINDS, type TreeInstance } from '@/lib/trees';
export { treesForTile, clearedMask, clearingsKey, treeLodShare } from '@/lib/trees';

export const TREE_MAPPING = Object.fromEntries(TREE_KINDS.flatMap((kind, x) => [0, 1, 2].map(y => [`${kind}-${y}`, {
  x: x * 128, y: y * 192, width: 128, height: 192, anchorX: 64, anchorY: 184, mask: false,
}])));
const wind = { name: 'treeWind', vs: 'uniform treeWindUniforms { float time; float share; } treeWind;', uniformTypes: { time: 'f32', share: 'f32' } } as const;

/** `getRank`: a tree's place in the tile's random order, 0-1 (above 1: hidden, standing in a clearing). `lodShare`: draw ranks up to this.
 * Thinning and clearings are done here, on the GPU, so the tile's instance buffers are built once and never rebuilt as the camera moves. */
type TreeProps = { getRank?: (t: TreeInstance, info: { index: number }) => number; lodShare?: number };

/** Alpha-tested billboards anchored at the trunk base. One atlas and one draw call per terrain tile. */
export default class TreeLayer extends IconLayer<TreeInstance, TreeProps> {
  static layerName = 'TreeLayer';
  static defaultProps = { ...IconLayer.defaultProps, getRank: { type: 'accessor', value: 0 }, lodShare: 1 } as unknown as typeof IconLayer.defaultProps;
  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({ instanceRank: { size: 1, accessor: 'getRank', defaultValue: 0 } });
  }
  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, wind], inject: {
      // Hook functions are emitted before main's attributes and varyings, so this all runs at main-end, where they are in scope.
      'vs:#decl': 'in float instanceRank; out float treeFade; out vec3 treeTint;',
      'vs:#main-end': `
        // Top of the sprite sways most; uv.y is -1 at the crown, +1 at the root.
        float treeTop = (1.0 - positions.y) * 0.5;
        float treePhase = instancePositions.x * 71.0 + instancePositions.y * 113.0;
        float sway = sin(treeWind.time * 0.8 + treePhase) * sizePixels * 0.018 * treeTop * treeTop;
        if (icon.billboard) gl_Position.x += project_pixel_size_to_clipspace(vec2(sway, 0.0)).x;
        // On-screen height includes perspective: crowns under a pixel or so fade out instead of shimmering.
        treeFade = smoothstep(1.0, 4.0, sizePixels * project.focalDistance / max(1e-3, gl_Position.w));
        treeTint = instanceColors.rgb;
        // Thinned out by distance, or in a clearing: behind the far plane, so the GPU drops it.
        if (instanceRank > treeWind.share) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      `,
      'fs:#decl': 'in float treeFade; in vec3 treeTint;',
      'fs:DECKGL_FILTER_COLOR': 'color.rgb *= treeTint; color.a *= treeFade; if (color.a < 0.25) discard;',
    } };
  }
  draw(params: Parameters<IconLayer<TreeInstance>['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({ treeWind: { time: animSeconds(600), share: this.props.lodShare ?? 1 } });
    super.draw(params);
  }
}
