import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import vs from './unitMorphVertex';
import { animSeconds } from '@/lib/still';

/** `homes`: 0..1, how much of a group's households (and a town's roofs) to draw close in; 0 where the close-up stands 3D dwellings
 * in their place (`?shelters=1`), which the flat house icons, added on top, turned into a glowing cream pancake. */
type MorphProps = { progress: number; brightness: number; settle: number; halo: number; homes: number };
const block = /* glsl */ `uniform morphUniforms {
  float progress;
  float brightness;
  float time;
  float settle;
  float halo;
  float homes;
} morph;
`;
const morph = {
  name: 'morph',
  vs: block,
  fs: block,
  uniformTypes: { progress: 'f32', brightness: 'f32', time: 'f32', settle: 'f32', halo: 'f32', homes: 'f32' },
} as const;

// Shapes, in a frame where |p| <= 1 is the shape's box; `aa` is about a pixel in that frame.
const shapesDecl = /* glsl */ `
in float vCore;
in float vSeed;
in float vFire;
in float vSign;
in float vKind;
in float vCorePx;
in float vCellPx;
in float vOuterPx;
float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float boxMask(vec2 p, vec2 c, vec2 hs, float aa) { vec2 d = hs - abs(p - c); return smoothstep(-aa, aa, min(d.x, d.y)); }
// An upright triangle: apex at (0, top), base from -w to w at y = bottom.
float triMask(vec2 p, float top, float bottom, float w, float aa) {
  float k = (top - p.y) / (top - bottom);
  return smoothstep(-aa, aa, min(min(w * k - abs(p.x), p.y - bottom), top - p.y));
}
// A tent (herders): a triangle with a dark door.
float tentMask(vec2 p, float aa) { return triMask(p, 0.85, -0.75, 0.9, aa) * (1.0 - 0.75 * triMask(p, -0.15, -0.75, 0.24, aa)); }
// A house (farmers): walls and a pitched roof, with a lit door.
float houseMask(vec2 p, float aa) { return max(boxMask(p, vec2(0.0, -0.4), vec2(0.62, 0.38), aa), triMask(p, 0.85, -0.04, 0.9, aa)); }
float houseLight(vec2 p, float aa) { return boxMask(p, vec2(0.0, -0.5), vec2(0.14, 0.28), aa); }
// A town: three roofs of different heights.
float townMask(vec2 p, float aa) {
  return max(max(boxMask(p, vec2(-0.5, -0.45), vec2(0.28, 0.4), aa), boxMask(p, vec2(0.05, -0.2), vec2(0.3, 0.65), aa)),
             boxMask(p, vec2(0.58, -0.55), vec2(0.24, 0.3), aa));
}
float flicker(float seed) {
  float ph = seed * 6283.0;
  return 0.75 + 0.25 * sin(morph.time * (4.0 + 6.0 * seed) + ph) * sin(morph.time * 2.3 + ph * 2.0);
}
`;

// Far out (vFire): a fire — a body the mark's true size, a soft halo out to the sprite edge, a white-hot centre and a
// flicker. Middle zoom (vSign): the kind's sign — a fire for a band, a tent for a herding camp, a house for a village —
// with a dim glow behind. Closer (the rest): the group's households at their real spread — hearths, tents, roofs — over
// a faint wash of its footprint. Towns and cities: a soft glow with roofs. Picking keeps the whole sprite.
const shapesFs = /* glsl */ `
  if (picking.isActive < 0.5) {
    float d = length(geometry.uv);
    float aaUv = 1.2 / vOuterPx;
    float white = 0.0;
    float a = 0.0;
    if (vKind > 1.5 && vKind < 2.5) {
      // Town or city: built-up area (vCorePx) packed with roofs, denser towards the middle, in a glow that runs well
      // beyond it; small towns at middle zoom show the town sign (three roofs).
      float r = d * vOuterPx / max(vCorePx, 0.5);
      float glow = exp(-r * r * 0.45) * 0.5;
      float built = (1.0 - smoothstep(0.8, 1.05, r)) * 0.22;
      vec2 p = geometry.uv * vOuterPx;
      vec2 cell = floor(p / vCellPx);
      vec2 q = (p / vCellPx - cell - 0.5) * 2.0;
      float rc = length((cell + 0.5) * vCellPx) / max(vCorePx, 0.5);
      float edge = 0.8 + 0.2 * hash12(cell * 0.41 + vSeed * 17.0);
      float roof = step(hash12(cell + vSeed * 91.0), 0.9 - 0.4 * rc) * (1.0 - step(edge, rc));
      float aaC = 2.4 / vCellPx;
      float roofs = roof * boxMask(q, vec2(0.0), vec2(0.6), aaC) * smoothstep(6.0, 12.0, vCorePx) * morph.homes;
      float signW = (1.0 - morph.settle) * (1.0 - smoothstep(5.0, 10.0, vCorePx));
      float sign = townMask(geometry.uv / 0.55, aaUv / 0.55) * signW;
      a = max(max(glow, built), max(roofs * 0.95, sign));
      white = roofs * 0.35 + sign * 0.35 + exp(-r * r * 3.0) * 0.25 * (1.0 - signW);
    } else {
      // Fire (far out), the kind's sign (middle zoom) and households (close in) are weighted by vFire, vSign and the rest,
      // which are the same for the whole sprite: compute only the looks that are drawn. Far out (zoom ~5) the households
      // and signs of ~170,000 marks were computed per pixel and multiplied by zero, which halved the frame rate.
      float rest = max(0.0, 1.0 - vFire - vSign);
      float halo = exp(-d * d * 5.0) * 0.5;
      float fl = vFire > 0.001 || (vSign > 0.001 && vKind < 0.5) ? flicker(vSeed) : 1.0;
      if (vFire > 0.001) {
        // Fire: a body the mark's true size, a soft halo, a white-hot centre.
        float body = 1.0 - smoothstep(vCore * 0.7, vCore, d);
        float hot = exp(-pow(d / max(vCore, 0.05), 2.0) * 3.0);
        a += vFire * max(body, halo) * fl;
        white += vFire * hot * 0.55;
      }
      if (vSign > 0.001) {
        // The kind's sign, drawn in the inner 70% of the sprite.
        vec2 s = geometry.uv / 0.72;
        float aaS = aaUv / 0.72;
        float signShape = vKind < 0.5 ? max(exp(-d * d * 14.0), halo * 0.6) * fl : vKind < 1.5 ? houseMask(s, aaS) : tentMask(s, aaS);
        float signGlow = exp(-d * d * 4.0) * 0.22;
        float signLight = vKind > 0.5 && vKind < 1.5 ? houseLight(s, aaS) : 0.0;
        a += vSign * max(signShape, signGlow);
        white += vSign * (signLight * 0.8 + (vKind < 0.5 ? exp(-d * d * 30.0) * 0.5 : 0.0));
      }
      if (rest > 0.001) {
        // Households at their real spread: a cell grid in pixels, about 60% of cells inside the footprint taken.
        vec2 p = geometry.uv * vOuterPx;
        vec2 cell = floor(p / vCellPx);
        vec2 jit = (vec2(hash12(cell + 3.1 + vSeed), hash12(cell + 7.7 + vSeed)) - 0.5) * 0.5;
        vec2 q = (p / vCellPx - cell - 0.5 - jit * 0.5) * 2.0;
        float edge = vCorePx * (0.72 + 0.28 * hash12(cell * 0.37 + vSeed * 13.0));
        float inside = 1.0 - step(edge, length((cell + 0.5) * vCellPx));
        float taken = step(hash12(cell + vSeed * 97.0), 0.6) * inside;
        float aaC = 2.4 / vCellPx;
        vec2 hq = q / 0.72;
        float aaH = aaC / 0.72;
        float hearth = exp(-dot(q, q) * 9.0) * flicker(hash12(cell + vSeed));
        float home = vKind < 0.5 ? hearth : vKind < 1.5 ? houseMask(hq, aaH) : tentMask(hq, aaH);
        float wash = (1.0 - smoothstep(0.75, 1.0, d * vOuterPx / max(vCorePx, 1.0))) * 0.07;
        a += rest * max(taken * home * morph.homes, wash);
        white += rest * taken * morph.homes * (vKind < 0.5 ? hearth * 0.4 : vKind < 1.5 ? houseLight(hq, aaH) * 0.7 : 0.0);
      }
    }
    color.rgb = mix(color.rgb, vec3(1.0, 0.97, 0.9), clamp(white, 0.0, 1.0));
    color.a *= clamp(a, 0.0, 1.0);
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
    homes: 1,
  } as DefaultProps<Props>;

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceCrowd: { size: 2, accessor: 'getCrowd', defaultValue: [0, 1] },
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
        'fs:#decl': shapesDecl,
        'fs:DECKGL_FILTER_COLOR': shapesFs,
      },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    const { progress, brightness, settle, halo, homes } = this.props;
    this.state.model?.shaderInputs.setProps({
      morph: { progress, brightness, settle, halo, homes, time: animSeconds(1000) },
    });
    super.draw(params);
  }
}
