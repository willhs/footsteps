// Hearth smoke and firelight (`?smoke=1`, lib/hearths.ts): two instanced layers, both animated entirely on the GPU.
//   SmokeLayer     one camera-facing soft sprite per puff; its position (rise, the place's wind, a sideways wobble), size and fade are
//                  computed in the vertex shader from the time uniform and the puff's seed, so a frame does no CPU work.
//   FirelightLayer one flat warm disc per hearth on the ground, additive, flickering, lit only where the local sun is down.
// The sun is the app's sun clock (`solarNowMs`, so `?utc=` and `?warp=` bend it and `?still=1` stops it), read once a few seconds, not per hearth.
import { ScatterplotLayer } from '@deck.gl/layers';
import { animClock } from '@/lib/gait';
import { solarNowMs } from '@/lib/solarClock';
import { sunPosition } from '@/lib/sunTime';
import {
  PLUME_DRIFT_M, PLUME_RISE_M, PUFF_LIFE_S, WIND_SWING_RAD, poolOf, puffsOf,
  type Pool, type Puff, type StandingHearth,
} from '@/lib/hearths';

/** Where the sun is, as the shaders read it: longitude and declination in radians. Recomputed every few seconds (the sun moves 0.004°/s). */
let sunCache: { slot: number; value: [number, number] } | null = null;
function sunUniform(): [number, number] {
  const ms = solarNowMs();
  const slot = Math.floor(ms / 5000);
  if (!sunCache || sunCache.slot !== slot) {
    const sun = sunPosition(new Date(ms));
    sunCache = { slot, value: [(sun.longitude * Math.PI) / 180, (sun.declination * Math.PI) / 180] };
  }
  return sunCache.value;
}

const hearthFx = {
  name: 'hearthFx',
  vs: 'uniform hearthFxUniforms { float time; vec2 sun; } hearthFx;',
  uniformTypes: { time: 'f32', sun: 'vec2<f32>' },
} as const;

/** GLSL: 1 in the dark, 0 by day, smoothly through twilight, for a position in degrees (the NightExtension's terminator, a little earlier). */
const NIGHT_GLSL = `
  float hearthNight(vec2 lonLat) {
    vec2 p = radians(lonLat);
    float altitude = sin(p.y) * sin(hearthFx.sun.y) + cos(p.y) * cos(hearthFx.sun.y) * cos(p.x - hearthFx.sun.x);
    return 1.0 - smoothstep(-0.12, 0.02, altitude);
  }`;

function setFx(layer: ScatterplotLayer<never>) {
  layer.state.model?.shaderInputs.setProps({ hearthFx: { time: animClock(), sun: sunUniform() } });
}

/** Radius of a puff at the end of its life, metres, before its size and strength (the sprite is this at its widest). */
const PUFF_RADIUS_M = 16;

type PuffProps = {
  getPuff: (p: Puff) => number[];
  getWind: (p: Puff) => [number, number];
};

/** A plume's puffs as sprites. Camera-facing (`billboard`), so a plume reads from any tilt. Drawn over the ground without a depth test, as the people's footprints
 * are (layers/people.ts): they stand at sea-level height, below the raised close-up ground. */
export class SmokeLayer extends ScatterplotLayer<Puff, PuffProps> {
  static layerName = 'SmokeLayer';
  static defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getPuff: { type: 'accessor', value: (p: Puff) => [p.phase, p.wobble, p.size, p.strength] },
    getWind: { type: 'accessor', value: (p: Puff) => p.wind },
  };
  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instancePuff: { size: 4, accessor: 'getPuff' },
      instanceWind: { size: 2, accessor: 'getWind' },
    });
  }
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, hearthFx],
      inject: {
        // The core shader's `in` attributes are declared after the hook functions, so the displacement goes at the end of main (which sees them).
        'vs:#decl': `in vec4 instancePuff; in vec2 instanceWind;\n${NIGHT_GLSL}`,
        'vs:#main-end': `
          float age = fract(hearthFx.time / ${PUFF_LIFE_S.toFixed(1)} + instancePuff.x);
          float wind = instanceWind.x + ${WIND_SWING_RAD.toFixed(2)} * sin(hearthFx.time * 0.0105 + instanceWind.y);
          vec2 along = vec2(cos(wind), sin(wind));
          // Metres east, north, up: it climbs with a slowing rise, the wind carries it further the older it is, and it wavers across the wind.
          vec2 east_north = along * ${PLUME_DRIFT_M.toFixed(1)} * pow(age, 1.4)
            + vec2(-along.y, along.x) * sin(age * 9.0 + instancePuff.y) * 3.5 * age;
          vec3 metres = vec3(east_north, 1.5 + ${PLUME_RISE_M.toFixed(1)} * pow(age, 0.8));
          vec4 centre = project_position_to_clipspace(instancePositions, instancePositions64Low, project_size(metres), geometry.position);
          // Widens as it rises; never under a pixel or two, so a plume still reads when it is a few metres across. A puff drawn larger than
          // its real size keeps its real amount of smoke (alpha × the area ratio): before 2026-11-28 the enlarged puffs of a village's
          // hundreds of hearths piled up into an opaque white cushion over it from zoom 12-13.
          float strength = instancePuff.w;
          float realPx = outerRadiusPixels * mix(0.12, 1.0, pow(age, 0.6)) * instancePuff.z * sqrt(strength);
          float px = max(realPx, 3.0 + 3.5 * age);
          float ink = clamp(realPx / px, 0.0, 1.0);
          ink *= ink;
          gl_Position = centre;
          gl_Position.xy += project_pixel_size_to_clipspace((edgePadding * positions * px).xy);
          float night = hearthNight(instancePositions.xy);
          float fade = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.4, 1.0, age));
          // Lit from below by its own fire at night, near the hearth; grey by day, darker in the dark.
          // Wood smoke is a thin blue-grey by day, browner and denser near the fire.
          vec3 smoke = mix(vec3(0.62, 0.64, 0.69), vec3(0.22, 0.22, 0.26), night);
          smoke = mix(smoke, vec3(0.5, 0.47, 0.43), (1.0 - night) * (1.0 - smoothstep(0.0, 0.3, age)));
          smoke = mix(smoke, vec3(1.0, 0.58, 0.26), night * (1.0 - smoothstep(0.0, 0.35, age)) * 0.75);
          vFillColor = vec4(smoke, 0.55 * fade * sqrt(strength) * max(ink, 0.04) * layer.opacity);
        `,
        'fs:DECKGL_FILTER_COLOR': 'color.a *= pow(max(0.0, 1.0 - length(geometry.uv)), 1.6);',
      },
    };
  }
  draw(params: Parameters<ScatterplotLayer<Puff>['draw']>[0]) {
    setFx(this as never);
    super.draw(params);
  }
}

type PoolProps = { getSeed: (p: Pool) => number };

/** A hearth's pool of light on the ground: flat (not camera-facing), additive, so it adds warmth to the night ground under it. */
export class FirelightLayer extends ScatterplotLayer<Pool, PoolProps> {
  static layerName = 'FirelightLayer';
  static defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getSeed: { type: 'accessor', value: (p: Pool) => p.seed },
  };
  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({ instanceSeed: { size: 1, accessor: 'getSeed' } });
  }
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, hearthFx],
      inject: {
        'vs:#decl': `in float instanceSeed;\n${NIGHT_GLSL}`,
        'vs:#main-end': `
          // A fire's flicker: three slow, unrelated waves per hearth, and a little flare now and then.
          float t = hearthFx.time + instanceSeed * 97.0;
          float flicker = 0.80 + 0.10 * sin(t * 7.3) + 0.06 * sin(t * 12.9 + 1.7) + 0.04 * sin(t * 3.1 + 4.2);
          float lit = hearthNight(instancePositions.xy);
          vFillColor = vec4(1.0, 0.55, 0.20, 0.95 * lit * flicker * layer.opacity);
          // No light by day: send the quad out of the clip volume, so it costs no pixels.
          if (lit < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        `,
        'fs:DECKGL_FILTER_COLOR': 'color.a *= pow(max(0.0, 1.0 - length(geometry.uv)), 0.9);',
      },
    };
  }
  draw(params: Parameters<ScatterplotLayer<Pool>['draw']>[0]) {
    setFx(this as never);
    super.draw(params);
  }
}

/** Props for a `SmokeLayer` over these hearths (the caller supplies `id`, and sub-layer props in a composite). */
export function smokeProps(hearths: readonly StandingHearth[], opacity: number) {
  return {
    data: hearths.flatMap(puffsOf),
    opacity,
    getPosition: (p: Puff) => p.position,
    getRadius: PUFF_RADIUS_M,
    radiusUnits: 'meters' as const,
    billboard: true,
    stroked: false,
    antialiasing: false,
    pickable: false,
    parameters: { depthCompare: 'always', depthWriteEnabled: false } as const,
  };
}

/** Props for a `FirelightLayer` over these hearths. */
export function firelightProps(hearths: readonly StandingHearth[], opacity: number) {
  return {
    data: hearths.map(poolOf),
    opacity,
    getPosition: (p: Pool) => p.position,
    getRadius: (p: Pool) => p.radius,
    radiusUnits: 'meters' as const,
    stroked: false,
    antialiasing: false,
    pickable: false,
    parameters: {
      depthCompare: 'always',
      depthWriteEnabled: false,
      blend: true,
      blendColorSrcFactor: 'src-alpha',
      blendColorDstFactor: 'one',
      blendAlphaSrcFactor: 'one',
      blendAlphaDstFactor: 'one',
    } as const,
  };
}
