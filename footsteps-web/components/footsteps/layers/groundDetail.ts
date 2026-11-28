// Procedural surface detail for the close-up 3D ground (`?ground=1`): a deck.gl extension that paints the biome on the
// ground mesh in the fragment shader, with no texture download. The mesh carries two numbers per vertex (lib/close3d.ts
// `Cover`, in texCoords); the shader turns them into grass tone and tufts, a lumpy closed canopy, sand ripples and dunes,
// cracked ice, reed and pool tint on wet low ground, and strata on steep rock. The pattern is imagined: only the biome
// that picks it is data.
//
// Pattern size: every pattern is a few octaves of value noise on the ground's metres, with a nominal size (a crown is
// ~14 m). At close-up zoom a pixel is 20-80 m, so a lattice never drops below ~3 pixels: it grows with the pixel size
// (`gFbm`) and cross-fades between doublings, so the texture stays visible and does not shimmer as the camera moves.
//
// The same extension also draws the imagined weather (`?weather=1`, lib/weather.ts): cloud shadows drifting over everything,
// and gusts running through grass, reeds and crops. `weather.biome` and `weather.on` say which of the two parts run, so
// `?ground=1` alone and `?weather=1` alone each paint only their own part, and with neither flag no extension is attached.
import { LayerExtension } from '@deck.gl/core';
import { advanceWeather, newWeatherClock, type Weather, type WeatherClock } from '@/lib/weather';
import { animSeconds, stillOn } from '@/lib/still';

/** The weather a ground tile's layer draws: `Close3DLayer` sets `current` each time the view moves (the place at the screen centre),
 * and the same object goes to every tile so a pan costs no new props. */
export type WeatherRef = { current: Weather | null };

/** One clock per page: every tile's draw advances it to the frame's time, so the patterns agree across tile edges. */
const clock: WeatherClock = newWeatherClock();

const WEATHER_BLOCK = /* glsl */ `uniform weatherUniforms {
  float on;
  float biome;
  float cover;
  vec2 wind;
  vec2 cloud;
  vec2 gust;
  vec2 origin;
} weather;
`;
const WEATHER_MODULE = {
  name: 'weather',
  vs: WEATHER_BLOCK,
  fs: WEATHER_BLOCK,
  uniformTypes: { on: 'f32', biome: 'f32', cover: 'f32', wind: 'vec2<f32>', cloud: 'vec2<f32>', gust: 'vec2<f32>', origin: 'vec2<f32>' },
} as const;

/** The patterns' origin (lon, lat degrees), near the view. The shaders measure metres east as (lon - origin) x cos(lat): measured from
 * Greenwich instead, a metre north moved "east" by (lon in radians) x sin(lat), so far from 0° (the Americas, Asia, Beringia) every
 * pattern was sheared into diagonal streaks, and float32 degrees lost a metre. It moves only after the view travels ANCHOR_STEP
 * degrees from it (the patterns re-roll once then), so panning about a place never shifts them. */
const ANCHOR_STEP = 3;
let anchor: [number, number] | null = null;
export function patternOrigin(lon: number, lat: number): [number, number] {
  if (!anchor || Math.abs(lon - anchor[0]) > ANCHOR_STEP || Math.abs(lat - anchor[1]) > ANCHOR_STEP) anchor = [Math.round(lon), Math.round(lat)];
  return anchor;
}
type Drawn = { props: Record<string, unknown>; context?: { viewport?: object }; state: { model?: { shaderInputs: { setProps: (p: object) => void } } } };
const originOf = (layer: Drawn) => {
  const v = layer.context?.viewport as { longitude?: number; latitude?: number } | undefined;
  return patternOrigin(v?.longitude ?? 0, v?.latitude ?? 0);
};

const VS_DECL = `out vec4 vGround;`;
// Ground position in degrees from the pattern origin (patternOrigin; the corner's difference is exact, so it keeps the offset's
// precision), the mesh normal's up part (steepness) and the drawn height (strata).
const VS_MAIN_END = `vGround = vec4((instancePositions.xy - weather.origin) + positions.xy, normals.z, positions.z);`;

const NOISE_GLSL = `
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Three octaves of value noise (0..1) from lattice size s0 metres, coarsened to at least 3 pixels (mpp = metres per pixel).
float gFbm(vec2 m, float s0, float mpp) {
  float L = max(0.0, log2(3.0 * mpp / s0));
  float fl = floor(L);
  float fr = L - fl;
  float s = s0 * exp2(fl);
  float a = gNoise(m / s);
  float b = gNoise(m / (s * 2.0) + 17.3);
  float c = gNoise(m / (s * 4.0) + 41.9);
  return (1.0 - fr) * (0.62 * a + 0.38 * b) + fr * (0.62 * b + 0.38 * c);
}

// Sawtooth ridge profile 0..1 with a gentle windward side and a steep lee, t in [0,1).
float gDune(float t) {
  return t < 0.65 ? smoothstep(0.0, 0.65, t) : 1.0 - smoothstep(0.0, 0.35, (t - 0.65));
}

// 1 while a pattern of wavelength lam metres is wider than ~7 pixels, 0 below ~2.5.
float gFade(float lam, float mpp) {
  return 1.0 - smoothstep(0.14, 0.4, mpp / lam);
}
`;

const FS_DECL = `in vec4 vGround;
${NOISE_GLSL}`;

const FS_FILTER_COLOR = `
  vec2 gm = vec2(vGround.x * cos(radians(weather.origin.y + vGround.y)), vGround.y) * 111320.0;
  float gmpp = max(max(fwidth(gm.x), fwidth(gm.y)) * 0.5, 0.01);
  float gHeightRate = fwidth(vGround.w);
  float gLayer = geometry.uv.y;
  if (gLayer > -0.75 && weather.biome > 0.5) {
    vec3 c = color.rgb;
    float dc = geometry.uv.x;
    float wDesert = clamp(1.0 - dc, 0.0, 1.0);
    float wGrass = clamp(1.0 - abs(dc - 1.0), 0.0, 1.0);
    float wIce = clamp(dc - 1.0, 0.0, 1.0);
    float canopy = clamp(gLayer, 0.0, 1.0);
    float wet = clamp(-gLayer * 2.0, 0.0, 1.0);
    vec2 wind = vec2(0.8, 0.6);
    float along = dot(gm, wind);
    float across = dot(gm, vec2(-wind.y, wind.x));

    // Grass: patches of lush and dry, a fine grain, clumps.
    float grass = wGrass * (1.0 - 0.85 * canopy) * (1.0 - wet);
    if (grass > 0.01) {
      float lush = gFbm(gm, 45.0, gmpp) - 0.5;
      float grain = gFbm(gm + 300.0, 4.0, gmpp) - 0.5;
      float clump = smoothstep(0.62, 0.78, gFbm(gm + 700.0, 9.0, gmpp));
      c *= 1.0 + grass * (0.9 * lush + 0.7 * grain);
      c = mix(c, c * vec3(1.14, 1.02, 0.72), grass * smoothstep(0.0, 0.18, lush));
      c = mix(c, c * vec3(0.66, 0.84, 0.6), grass * clump * 0.7);
    }

    // Tree canopy seen from above: crowns where the noise is high, dark gaps between; a sparse canopy is single crowns.
    float trees = canopy * (1.0 - wet);
    if (trees > 0.01) {
      float lump = gFbm(gm + 1100.0, 14.0, gmpp);
      float thr = mix(0.8, 0.3, canopy);
      float crown = smoothstep(thr - 0.09, thr + 0.09, lump);
      float lit = clamp((lump - thr) / max(1.0 - thr, 0.25), 0.0, 1.0);
      float gap = mix(1.0, 0.68, canopy);
      float top = mix(0.6, 1.75, lit);
      float tone = mix(gap, top, crown);
      float hue = gFbm(gm + 1900.0, 30.0, gmpp) - 0.5;
      c *= mix(1.0, tone, smoothstep(0.0, 0.12, canopy));
      c *= 1.0 + crown * canopy * vec3(0.16 * hue, 0.12 * hue, -0.2 * hue);
      c += crown * lit * canopy * vec3(0.012, 0.045, 0.008);
    }

    // Sand: megadunes, dunes, ripples and grain, each fading out as it shrinks under a few pixels.
    float sand = wDesert * (1.0 - wet);
    if (sand > 0.01) {
      float swirl = gNoise(gm / 2200.0) - 0.5;
      float big = gDune(fract((along + 1600.0 * swirl) / 1800.0));
      float mid = gDune(fract((along + 260.0 * (gNoise(gm / 700.0) - 0.5) + 90.0 * across / 1000.0) / 320.0));
      float rip = 0.5 + 0.5 * sin(6.2832 * (along + 18.0 * (gNoise(gm / 60.0) - 0.5)) / 16.0);
      float grain = gFbm(gm + 500.0, 3.0, gmpp) - 0.5;
      float shade = 0.28 * (big - 0.5) * gFade(1800.0, gmpp) + 0.2 * (mid - 0.5) * gFade(320.0, gmpp) + 0.1 * (rip - 0.5) * gFade(16.0, gmpp) + 0.16 * grain;
      c *= 1.0 + sand * shade;
      c = mix(c, c * vec3(1.06, 0.97, 0.84), sand * clamp(shade * 2.0 + 0.5, 0.0, 1.0) * 0.5);
    }

    // Ice: cooler, wind-scoured streaks, and crevasse fields where the ice steepens: short slots across the fall line (along the
    // contours, so they follow the height), in patches, a slot every ~20 m of height. Thin slots fade out once they are under a
    // pixel apart, so from far away the ice is smooth, not netted with lines that read as contours or rivers.
    if (wIce > 0.01) {
      // Faded by how fast its own coordinate runs across the screen: on a steep face seen head-on the horizontal metres per pixel
      // (gmpp) are few while the streaks are packed tight, and a clamp on gmpp let them alias into hatching.
      vec2 streakAt = vec2(along / 500.0, across / 45.0);
      float streakRate = max(fwidth(streakAt.x), fwidth(streakAt.y));
      float streak = (gNoise(streakAt + 9.0) - 0.5) * (1.0 - smoothstep(0.15, 0.4, streakRate));
      c = mix(c, vec3(0.80, 0.89, 0.98), 0.4 * wIce);
      c *= 1.0 + wIce * 0.16 * streak;
      float steepIce = smoothstep(0.985, 0.9, vGround.z);
      float field = smoothstep(0.5, 0.62, gNoise(gm / 900.0 + 3.0)) * steepIce;
      if (field > 0.01) {
        float slot = abs(fract(vGround.w / 20.0 + 0.6 * gNoise(gm / 120.0)) - 0.5);
        float dash = smoothstep(0.56, 0.68, gNoise(gm / 45.0 + 11.0));
        float seen = (1.0 - smoothstep(0.04, 0.16, gHeightRate / 20.0)) * (1.0 - smoothstep(1.5, 4.0, gmpp));
        float crev = (1.0 - smoothstep(0.02, 0.06, slot)) * dash * field * seen;
        c = mix(c, vec3(0.3, 0.44, 0.6), wIce * crev * 0.55);
      }
    }

    // Wet low ground: reed-olive with darker pools.
    if (wet > 0.01) {
      float pool = smoothstep(0.54, 0.6, gFbm(gm + 3100.0, 320.0, gmpp));
      float reed = gFbm(gm + 3700.0, 14.0, gmpp) - 0.5;
      vec3 reedCol = vec3(0.4, 0.45, 0.22) * (0.95 + 0.7 * reed);
      vec3 wetCol = mix(mix(c * vec3(0.92, 1.0, 0.72), reedCol, 0.5), vec3(0.16, 0.29, 0.31), pool * 0.85);
      c = mix(c, wetCol, wet);
    }

    // Bare rock on steep ground: banded strata, darker and greyer. The mesh is steepened by the 1.6 relief factor.
    float rock = smoothstep(0.9, 0.7, vGround.z) * (1.0 - 0.7 * wIce);
    if (rock > 0.01) {
      // Faded by how fast the band phase runs across the screen (radians per pixel): gone before bands are ~15 pixels apart, so a
      // far steep face isn't ruled like paper. The grain is faded the same way, by its own lattice per pixel.
      float strataPhase = vGround.w * 0.18 + 5.0 * gFbm(gm + 4300.0, 260.0, gmpp);
      float strata = mix(0.5, 0.5 + 0.5 * sin(strataPhase), 1.0 - smoothstep(0.2, 0.45, fwidth(strataPhase)));
      float grain = (gFbm(gm + 4900.0, 20.0, gmpp) - 0.5) * (1.0 - smoothstep(0.2, 0.45, max(fwidth(gm.x), fwidth(gm.y)) / 20.0));
      c = mix(c, vec3(0.47, 0.44, 0.4) * (0.78 + 0.4 * strata + 0.3 * grain), rock * 0.8);
    }
    color.rgb = clamp(c, 0.0, 1.0);
  }
`;

const FS_WEATHER = `
  if (weather.on > 0.5) {
    vec3 w = color.rgb;
    vec2 wd = weather.wind;
    // Wind: grass, reeds and crops (the green axis, open or wet, thinned by tree cover) brighten and dim as gusts travel through.
    // Patches of gust a few hundred metres across, and, close in, ripples in the grass a few metres apart that run with the wind
    // and show only inside a gust.
    if (gLayer > -0.75) {
      float sway = clamp(1.0 - abs(geometry.uv.x - 1.0), 0.0, 1.0) * (1.0 - 0.85 * clamp(gLayer, 0.0, 1.0));
      if (sway > 0.01) {
        float gust = gFbm(gm - weather.gust, 90.0, gmpp);
        float front = smoothstep(0.42, 0.7, gust);
        float ripple = sin(6.2832 * (dot(gm - weather.gust, wd) / 13.0) + 4.0 * gust);
        w *= 1.0 + sway * (0.5 * (gust - 0.5) + 0.12 * front * ripple * gFade(13.0, gmpp));
      }
    }
    // Cloud shadows: soft patches a kilometre or two across, more of them the cloudier the place; over land and water alike.
    // The cutoff 0.71 - 0.58 cover puts about that share of the noise above it, and the shadow is a little cool as well as dark.
    float thr = 0.71 - 0.58 * weather.cover;
    float cloud = smoothstep(thr, thr + 0.16, gFbm(gm - weather.cloud + 8000.0, 1100.0, gmpp));
    w = mix(w, w * vec3(0.9, 0.95, 1.04), 0.6 * cloud) * (1.0 - 0.3 * cloud);
    color.rgb = clamp(w, 0.0, 1.0);
  }
`;

/** Add to the ground mesh's SimpleMeshLayer: `extensions: [new GroundDetail()]`. It reads the mesh's texCoords as
 * lib/close3d.ts `Cover` (dryCold, layer), so only a mesh built with `cover` should get it.
 * Layer props (declared below): `groundBiome` (default true) paints the biome; `weatherRef` (default none) draws the weather. */
export default class GroundDetail extends LayerExtension {
  static extensionName = 'GroundDetail';
  static defaultProps = {
    groundBiome: { type: 'boolean', value: true },
    weatherRef: { type: 'object', value: null, compare: false },
  };

  draw(this: Drawn) {
    const { groundBiome, weatherRef } = this.props as { groundBiome: boolean; weatherRef: WeatherRef | null };
    const target = weatherRef?.current ?? null;
    if (target) advanceWeather(clock, target, animSeconds(1e9), stillOn());
    this.state.model?.shaderInputs.setProps({
      weather: {
        on: target ? 1 : 0,
        biome: groundBiome ? 1 : 0,
        cover: clock.cover,
        wind: target?.wind ?? [1, 0],
        cloud: clock.cloud,
        gust: clock.gust,
        origin: originOf(this),
      },
    });
  }

  getShaders() {
    return {
      modules: [WEATHER_MODULE],
      inject: {
        'vs:#decl': VS_DECL,
        'vs:#main-end': VS_MAIN_END,
        'fs:#decl': FS_DECL,
        'fs:DECKGL_FILTER_COLOR': FS_FILTER_COLOR + FS_WEATHER,
      },
    };
  }
}

// --- Fields, gardens, pasture and tracks (`?fields=1`, fieldsDrape.ts) -------------------------------------------------------------
// The draped shapes carry metres along and across each patch (texCoords), metres to its far sides and a kind code (normals; the shapes
// are lit flat, so the normal is free): FIELD_KIND in fieldsDrape.ts. Before 2026-11-28 every patch was one flat colour, so close in
// they read as paper cut-outs. Imagined like the layout: rows, strips and verges are a look, not data.

const FIELD_VS_DECL = `out vec4 vField; out vec2 vFieldUv; out float vFieldKind; out vec2 vFieldPos;`;
const FIELD_VS_MAIN_END = `vFieldUv = texCoords; vField = vec4(normals.xy, 0.0, 0.0); vFieldKind = normals.z; vFieldPos = (instancePositions.xy - weather.origin) + positions.xy;`;

const FIELD_FS_DECL = `in vec4 vField; in vec2 vFieldUv; in float vFieldKind; in vec2 vFieldPos;
${NOISE_GLSL}`;

const FIELD_FS_FILTER_COLOR = `
  {
    vec2 fm = vec2(vFieldPos.x * cos(radians(weather.origin.y + vFieldPos.y)), vFieldPos.y) * 111320.0;
    float fmpp = max(max(fwidth(fm.x), fwidth(fm.y)) * 0.5, 0.01);
    float kind = floor(vFieldKind + 0.001);
    float seed = fract(vFieldKind + 0.001);
    float u = vFieldUv.x;
    float v = vFieldUv.y;
    float edge = min(min(u, vField.x), min(v, vField.y));
    vec3 c = color.rgb;
    // Uneven growth and soil over the whole patch, and a fine grain.
    float mott = gFbm(fm + seed * 517.0, 16.0, fmpp) - 0.5;
    c *= 1.0 + 0.24 * mott + 0.1 * (gFbm(fm + 300.0, 2.5, fmpp) - 0.5);
    if (kind < 0.5) {
      // Crop: rows along the patch, a little more than 2 m apart, and strips worked a little differently, 8-14 m wide.
      float rows = sin(6.2832 * v / 2.2 + 0.6 * sin(u / 23.0 + seed * 6.0));
      c *= 1.0 + 0.13 * rows * gFade(2.2, fmpp);
      float stripW = 8.0 + 6.0 * seed;
      float strip = gHash(vec2(floor(v / stripW), seed * 91.0)) - 0.5;
      c *= 1.0 + 0.16 * strip * gFade(stripW, fmpp);
    } else if (kind < 1.5) {
      // Fallow: weeds coming back in patches.
      float weeds = smoothstep(0.48, 0.7, gFbm(fm + 900.0, 7.0, fmpp));
      c = mix(c, c * vec3(0.82, 1.12, 0.72), 0.65 * weeds);
    } else if (kind < 2.5) {
      // Pasture: darker tussocks and paler bitten-down grass.
      float tuft = smoothstep(0.58, 0.74, gFbm(fm + 1300.0, 3.0, fmpp));
      c *= 1.0 - 0.28 * tuft;
    } else if (kind < 3.5) {
      // Garden: beds about 2.5 m apart with paths between.
      float bed = smoothstep(0.18, 0.28, fract(v / 2.5)) * (1.0 - smoothstep(0.82, 0.92, fract(v / 2.5)));
      c *= mix(1.0, mix(0.8, 1.08, bed), gFade(2.5, fmpp));
    } else if (kind > 5.5) {
      // Track: worn paler down the middle, darker ruts and grass at the sides.
      float side = min(v, vField.y) / max(v + vField.y, 0.01);
      c *= mix(0.86, 1.1, smoothstep(0.0, 0.5, side));
    }
    // A grassy verge round fields, fallow, pasture and gardens, never under about a pixel, so the patch meets the ground softly.
    if (kind < 3.5) {
      float verge = 1.0 - smoothstep(0.0, max(1.8, 0.9 * fmpp), edge);
      c = mix(c, vec3(0.36, 0.42, 0.22) * (0.9 + 0.4 * mott), 0.55 * verge);
    }
    // With ?weather=1: gusts run through standing crops and grass, and the clouds' shadows fall on the fields as on the ground.
    if (weather.on > 0.5) {
      if (kind < 2.5) {
        float gust = gFbm(fm - weather.gust, 90.0, fmpp);
        float ripple = sin(6.2832 * (dot(fm - weather.gust, weather.wind) / 13.0) + 4.0 * gust);
        c *= 1.0 + (kind < 0.5 ? 0.8 : 0.6) * (0.5 * (gust - 0.5) + 0.12 * smoothstep(0.42, 0.7, gust) * ripple * gFade(13.0, fmpp));
      }
      float thr = 0.71 - 0.58 * weather.cover;
      float cloud = smoothstep(thr, thr + 0.16, gFbm(fm - weather.cloud + 8000.0, 1100.0, fmpp));
      c = mix(c, c * vec3(0.9, 0.95, 1.04), 0.6 * cloud) * (1.0 - 0.3 * cloud);
    }
    color.rgb = clamp(c, 0.0, 1.0);
  }
`;

/** Add to the draped fields' SimpleMeshLayer (Close3DLayer `landLayers`): rows, strips, weeds, tussocks, beds, worn tracks and verges,
 * plus the weather's gusts and cloud shadows when `weatherRef` is given. Reads fieldsDrape.ts DrapedMesh texCoords and normals. */
export class FieldDetail extends LayerExtension {
  static extensionName = 'FieldDetail';
  static defaultProps = { weatherRef: { type: 'object', value: null, compare: false } };

  draw(this: Drawn) {
    const { weatherRef } = this.props as { weatherRef: WeatherRef | null };
    const target = weatherRef?.current ?? null;
    if (target) advanceWeather(clock, target, animSeconds(1e9), stillOn());
    this.state.model?.shaderInputs.setProps({
      weather: { on: target ? 1 : 0, biome: 0, cover: clock.cover, wind: target?.wind ?? [1, 0], cloud: clock.cloud, gust: clock.gust, origin: originOf(this) },
    });
  }

  getShaders() {
    return {
      modules: [WEATHER_MODULE],
      inject: {
        'vs:#decl': FIELD_VS_DECL,
        'vs:#main-end': FIELD_VS_MAIN_END,
        'fs:#decl': FIELD_FS_DECL,
        'fs:DECKGL_FILTER_COLOR': FIELD_FS_FILTER_COLOR,
      },
    };
  }
}
