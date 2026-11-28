import { IconLayer } from '@deck.gl/layers';
import { animSeconds } from '@/lib/still';
import { TREE_KINDS, type TreeInstance } from '@/lib/trees';
import { sunShadowNow } from '@/lib/sunShadow';
export { treesForTile, clearedMask, clearingsKey, treeLodShare } from '@/lib/trees';

export const TREE_MAPPING = Object.fromEntries(TREE_KINDS.flatMap((kind, x) => [0, 1, 2].map(y => [`${kind}-${y}`, {
  x: x * 128, y: y * 192, width: 128, height: 192, anchorX: 64, anchorY: 184, mask: false,
}])));
const WIND_BLOCK = 'uniform treeWindUniforms { float time; float share; float topdown; vec2 shadowDir; float shadow; } treeWind;';
const wind = {
  name: 'treeWind', vs: WIND_BLOCK, fs: WIND_BLOCK,
  uniformTypes: { time: 'f32', share: 'f32', topdown: 'f32', shadowDir: 'vec2<f32>', shadow: 'f32' },
} as const;

/** A tree's shadow from above is its crown cast onto the ground: the crown's middle stands at about this share of the tree's height, so the
 * shadow's middle lies that far along the sun's shadow vector (lib/sunShadow.ts). */
const CROWN_MIDDLE_SHARE = 0.65;
/** How dark a crown's shadow is at full sun: leaves let some light through, and the sky lights the shade. */
const TREE_SHADOW_ALPHA = 0.42;

/** Below this camera tilt (degrees) a tree is drawn as its crown seen from above, not as a standing sprite: from straight overhead a
 * camera-facing sprite showed every tree side-on, a lollipop lying on the map. */
export const TOPDOWN_BELOW_PITCH = 25;

/** `getRank`: a tree's place in the tile's random order, 0-1 (above 1: hidden, standing in a clearing). `lodShare`: draw ranks up to this.
 * Thinning and clearings are done here, on the GPU, so the tile's instance buffers are built once and never rebuilt as the camera moves. */
type TreeProps = {
  getRank?: (t: TreeInstance, info: { index: number }) => number;
  lodShare?: number;
  /** Draw the crowns' shadows on the ground instead of the crowns (a second layer over the same trees, drawn first). Top-down view only. */
  shadow?: boolean;
};

/** Alpha-tested billboards anchored at the trunk base. One atlas and one draw call per terrain tile. */
export default class TreeLayer extends IconLayer<TreeInstance, TreeProps> {
  static layerName = 'TreeLayer';
  static defaultProps = { ...IconLayer.defaultProps, getRank: { type: 'accessor', value: 0 }, lodShare: 1, shadow: false } as unknown as typeof IconLayer.defaultProps;
  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({ instanceRank: { size: 1, accessor: 'getRank', defaultValue: 0 } });
  }
  getShaders() {
    const shaders = super.getShaders();
    // Extensions' injections (SkyTint with ?sky=1) come in `shaders.inject`: keep them, after the tree's own code for each hook.
    const ext: Record<string, string> = shaders.inject ?? {};
    const own: Record<string, string> = {
      // Hook functions are emitted before main's attributes and varyings, so this all runs at main-end, where they are in scope.
      'vs:#decl': 'in float instanceRank; out float treeFade; out vec3 treeTint; out float treeTop_; out float treeSeed_; out float treeKind_;',
      'vs:#main-end': `
        // Top of the sprite sways most; uv.y is -1 at the crown, +1 at the root.
        float treeTop = (1.0 - positions.y) * 0.5;
        float treePhase = instancePositions.x * 71.0 + instancePositions.y * 113.0;
        float sway = sin(treeWind.time * 0.8 + treePhase) * sizePixels * 0.018 * treeTop * treeTop;
        if (icon.billboard) gl_Position.x += project_pixel_size_to_clipspace(vec2(sway, 0.0)).x;
        // On-screen height includes perspective: crowns under a pixel or so fade out instead of shimmering.
        treeFade = smoothstep(1.0, 4.0, sizePixels * project.focalDistance / max(1e-3, gl_Position.w));
        treeTint = instanceColors.rgb;
        treeTop_ = 0.0;
        treeSeed_ = 0.0;
        treeKind_ = 0.0;
        if (treeWind.topdown > 0.5) {
          // Seen from above: a lobed crown about a third of the tree's height across, centred on the trunk. Its colour is the sprite's
          // own foliage (one texel near the middle of its crown, so each kind keeps its colour); its shape and leaf clumps are drawn
          // in the fragment shader (the sprite's own texture, squeezed into a disc, showed a conifer as a spike or every crown as a
          // striped marble).
          // Kind = the frame's column in the atlas (TREE_KINDS order): conifer, broadleaf, palm, acacia, shrub, dead.
          float kindIx = floor(instanceIconFrames.x / instanceIconFrames.z + 0.5);
          // Crown radius as a share of the tree's height, and where in the sprite its foliage colour is.
          float crownR = kindIx < 0.5 ? 0.2 : kindIx < 1.5 ? 0.34 : kindIx < 2.5 ? 0.3 : kindIx < 3.5 ? 0.44 : kindIx < 4.5 ? 0.36 : 0.22;
          vec2 leafAt = kindIx < 0.5 ? vec2(0.5, 0.45) : kindIx < 1.5 ? vec2(0.5, 0.3) : kindIx < 2.5 ? vec2(0.42, 0.14)
            : kindIx < 3.5 ? vec2(0.5, 0.1) : kindIx < 4.5 ? vec2(0.5, 0.55) : vec2(0.5, 0.45);
          vec4 treeBase;
          // Its shadow: the same crown moved along the sun's shadow vector by the crown's height, a little larger and softer.
          vec3 treeCast = treeWind.shadow > 0.0
            ? project_size(vec3(treeWind.shadowDir * instanceSizes * ${CROWN_MIDDLE_SHARE.toFixed(2)}, 0.0))
            : vec3(0.0);
          gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, treeCast, treeBase);
          gl_Position.xy += project_pixel_size_to_clipspace(positions * sizePixels * crownR * (treeWind.shadow > 0.0 ? 1.08 : 1.0));
          vTextureCoords = (instanceIconFrames.xy + leafAt * instanceIconFrames.zw) / icon.iconsTextureDim;
          treeSeed_ = fract(treePhase * 0.137);
          treeKind_ = kindIx;
          treeTop_ = 1.0;
        }
        // Thinned out by distance, or in a clearing: behind the far plane, so the GPU drops it. A shadow only from above, by day.
        if (instanceRank > treeWind.share || (treeWind.shadow > 0.0 && treeWind.topdown < 0.5)) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      `,
      'fs:#decl': 'in float treeFade; in vec3 treeTint; in float treeTop_; in float treeSeed_; in float treeKind_;',
      'fs:DECKGL_FILTER_COLOR': `
        color.rgb *= treeTint;
        if (treeTop_ > 0.5) {
          // Lobes round the rim, leaf clumps inside, lit from the north-west (screen up-left), darker towards the rim.
          vec2 q = geometry.uv;
          float r = length(q);
          float k = 6.2832 * treeSeed_;
          float ang = atan(q.y, q.x);
          // Broadleaf, shrub, acacia: a few round lobes. Conifer: a finer, spikier rim. Palm: fronds in a star. Dead: bare branches.
          float lobes = 6.0 + floor(treeSeed_ * 3.0);
          float rim = 0.84 + 0.06 * sin(ang * lobes + k) + 0.04 * sin(ang * 13.0 + 2.0 * k);
          if (treeKind_ < 0.5) rim = 0.82 + 0.12 * abs(sin(ang * 5.5 + k));
          else if (treeKind_ > 1.5 && treeKind_ < 2.5) rim = 0.35 + 0.62 * pow(abs(sin(ang * 3.5 + k)), 3.0);
          else if (treeKind_ > 4.5) rim = 0.25 + 0.7 * pow(abs(sin(ang * 2.5 + k)), 14.0);
          color.a = 1.0 - smoothstep(rim - 0.1, rim, r);
          if (treeWind.shadow > 0.0) {
            // Soft-edged, cool and dark; leaf gaps let a little light through.
            float gaps = 0.85 + 0.15 * sin(q.x * 9.0 + k) * sin(q.y * 9.0 - k);
            color = vec4(0.03, 0.05, 0.04, ${TREE_SHADOW_ALPHA.toFixed(2)} * treeWind.shadow * gaps * (1.0 - smoothstep(rim - 0.35, rim, r)) * treeFade);
            if (color.a < 0.01) discard;
            return;
          }
          float clump = sin(q.x * 8.0 + k) * sin(q.y * 8.0 - 1.3 * k);
          color.rgb *= 1.08 - 0.5 * r * r + 0.28 * dot(q, vec2(-0.7, -0.7)) + 0.12 * clump;
        }
        color.a *= treeFade;
        if (color.a < 0.25) discard;`,
    };
    const inject = { ...ext };
    for (const [hook, code] of Object.entries(own)) inject[hook] = hook in ext ? `${code}\n${ext[hook]}` : code;
    return { ...shaders, modules: [...shaders.modules, wind], inject };
  }
  draw(params: Parameters<IconLayer<TreeInstance>['draw']>[0]) {
    const pitch = (this.context.viewport as unknown as { pitch?: number }).pitch ?? 0;
    const viewport = this.context.viewport as unknown as { longitude: number; latitude: number };
    const sun = this.props.shadow ? sunShadowNow(viewport.longitude, viewport.latitude) : null;
    this.state.model?.shaderInputs.setProps({
      treeWind: {
        time: animSeconds(600),
        share: this.props.lodShare ?? 1,
        topdown: pitch < TOPDOWN_BELOW_PITCH ? 1 : 0,
        shadowDir: sun ? [sun.east, sun.north] : [0, 0],
        shadow: sun ? Math.max(1e-3, sun.strength) : 0,
      },
    });
    super.draw(params);
  }
}
