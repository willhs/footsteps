// Procedural surface detail for the close-up 3D ground (`?ground=1`): a deck.gl extension that paints the biome on the
// ground mesh in the fragment shader, with no texture download. The mesh carries two numbers per vertex (lib/close3d.ts
// `Cover`, in texCoords); the shader turns them into grass tone and tufts, a lumpy closed canopy, sand ripples and dunes,
// cracked ice, reed and pool tint on wet low ground, and strata on steep rock. The pattern is imagined: only the biome
// that picks it is data.
//
// Pattern size: every pattern is a few octaves of value noise on the ground's metres, with a nominal size (a crown is
// ~14 m). At close-up zoom a pixel is 20-80 m, so a lattice never drops below ~3 pixels: it grows with the pixel size
// (`gFbm`) and cross-fades between doublings, so the texture stays visible and does not shimmer as the camera moves.
import { LayerExtension } from '@deck.gl/core';

const VS_DECL = `out vec4 vGround;`;
// Ground position in degrees (tile corner + offset: float32 is good to ~1 m, finer than any pattern), the mesh normal's
// up part (steepness) and the drawn height (strata).
const VS_MAIN_END = `vGround = vec4(instancePositions.xy + positions.xy, normals.z, positions.z);`;

const FS_DECL = `
in vec4 vGround;

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

const FS_FILTER_COLOR = `
  vec2 gm = vec2(vGround.x * cos(radians(vGround.y)), vGround.y) * 111320.0;
  float gmpp = max(max(fwidth(gm.x), fwidth(gm.y)) * 0.5, 0.01);
  float gHeightRate = fwidth(vGround.w);
  float gLayer = geometry.uv.y;
  if (gLayer > -0.75) {
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

    // Ice: cooler, wind-scoured streaks and a net of cracks.
    if (wIce > 0.01) {
      float streak = gNoise(vec2(along / max(500.0, 3.0 * gmpp), across / max(45.0, 3.0 * gmpp)) + 9.0) - 0.5;
      float crackField = abs(gFbm(gm + 100.0 * vec2(gNoise(gm / 400.0), gNoise(gm / 400.0 + 5.0)) + 2500.0, 420.0, gmpp) - 0.5);
      float crack = (1.0 - smoothstep(0.0, 0.02, crackField)) * smoothstep(0.42, 0.55, gNoise(gm / 1600.0 + 3.0));
      c = mix(c, vec3(0.80, 0.89, 0.98), 0.4 * wIce);
      c *= 1.0 + wIce * 0.16 * streak;
      c = mix(c, vec3(0.34, 0.54, 0.78), wIce * crack * 0.5);
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
      float strata = 0.5 + 0.5 * sin(vGround.w * 0.18 + 5.0 * gFbm(gm + 4300.0, 260.0, gmpp));
      strata = mix(0.5, strata, 1.0 - smoothstep(0.1, 0.35, gHeightRate / 40.0));
      float grain = gFbm(gm + 4900.0, 20.0, gmpp) - 0.5;
      c = mix(c, vec3(0.47, 0.44, 0.4) * (0.78 + 0.4 * strata + 0.3 * grain), rock * 0.8);
    }
    color.rgb = clamp(c, 0.0, 1.0);
  }
`;

/** Add to the ground mesh's SimpleMeshLayer: `extensions: [new GroundDetail()]`. It reads the mesh's texCoords as
 * lib/close3d.ts `Cover` (dryCold, layer), so only a mesh built with `cover` should get it. */
export default class GroundDetail extends LayerExtension {
  static extensionName = 'GroundDetail';

  getShaders() {
    return {
      inject: {
        'vs:#decl': VS_DECL,
        'vs:#main-end': VS_MAIN_END,
        'fs:#decl': FS_DECL,
        'fs:DECKGL_FILTER_COLOR': FS_FILTER_COLOR,
      },
    };
  }
}
