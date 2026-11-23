import { IconLayer } from '@deck.gl/layers';
import { animSeconds } from '@/lib/still';
import { TREE_KINDS, type TreeInstance } from '@/lib/trees';
export { treesForTile, outsideClearings, treeLodShare } from '@/lib/trees';

export const TREE_MAPPING = Object.fromEntries(TREE_KINDS.flatMap((kind, x) => [0, 1, 2].map(y => [`${kind}-${y}`, {
  x: x * 128, y: y * 192, width: 128, height: 192, anchorX: 64, anchorY: 184, mask: false,
}])));
const wind = { name: 'treeWind', vs: 'uniform treeWindUniforms { float time; } treeWind;', uniformTypes: { time: 'f32' } } as const;

/** Alpha-tested billboards anchored at the trunk base. One atlas and one draw call per terrain tile. */
export default class TreeLayer extends IconLayer<TreeInstance> {
  static layerName = 'TreeLayer';
  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, wind], inject: {
      // Hook functions are emitted before main's attributes and varyings, so this all runs at main-end, where they are in scope.
      'vs:#decl': 'out float treeFade; out vec3 treeTint;',
      'vs:#main-end': `
        // Top of the sprite sways most; uv.y is -1 at the crown, +1 at the root.
        float treeTop = (1.0 - positions.y) * 0.5;
        float treePhase = instancePositions.x * 71.0 + instancePositions.y * 113.0;
        float sway = sin(treeWind.time * 0.8 + treePhase) * sizePixels * 0.018 * treeTop * treeTop;
        if (icon.billboard) gl_Position.x += project_pixel_size_to_clipspace(vec2(sway, 0.0)).x;
        // On-screen height includes perspective: crowns under a pixel or so fade out instead of shimmering.
        treeFade = smoothstep(1.0, 4.0, sizePixels * project.focalDistance / max(1e-3, gl_Position.w));
        treeTint = instanceColors.rgb;
      `,
      'fs:#decl': 'in float treeFade; in vec3 treeTint;',
      'fs:DECKGL_FILTER_COLOR': 'color.rgb *= treeTint; color.a *= treeFade; if (color.a < 0.25) discard;',
    } };
  }
  draw(params: Parameters<IconLayer<TreeInstance>['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({ treeWind: { time: animSeconds(600) } });
    super.draw(params);
  }
}
