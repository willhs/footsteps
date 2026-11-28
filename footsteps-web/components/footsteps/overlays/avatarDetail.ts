// The large view's detail (docs/ops/avatar.md, "The large view"): the figure opened large is 4-6 times taller on screen
// than in the card, where per-vertex shading blurs the face and plain-coloured cloth reads as plastic. There:
//
// - Skin, brows and hair take their shading from the pack's own textures (shade maps baked by build.mjs, the same
//   encoding as the vertex colours, per texel) and its normal maps, so eyelids, lips, nostrils, ears, knuckles, nails and
//   hair strands show. Each mesh names its maps in its glTF extras (`userData.detail`).
// - The eyes take the pack's eye texture: iris and pupil, not one blended colour.
// - Cloth gets a surface by material, drawn on a small canvas here (no bytes to fetch) and laid on the body's bind pose
//   from three sides, so it moves with the cloth: a plain weave for linen and cotton, a twill for wool, a fine sheen weave
//   for silk, matted felt, tufted fur, grained hide, beaten bark cloth, twined plant fibre.
// - The key light casts soft shadows: arms on the body, a hood on the face, a cape's folds.
//
// The card keeps vertex colours only: it fetches no image.
import {
  CanvasTexture,
  NoColorSpace,
  PCFSoftShadowMap,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type DirectionalLight,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Material } from '@/lib/wardrobe';

/** The maps a mesh names in its glTF extras (build.mjs `detailFor`). */
export type DetailMaps = { shade?: string; normal?: string; colour?: string };

const BASE = '/avatar/';

const textures = new Map<string, Promise<Texture | null>>();
/** One download per map for the whole visit. A map that fails to load is skipped: the mesh keeps its vertex shading. */
function loadMap(name: string, colour: boolean): Promise<Texture | null> {
  let p = textures.get(name);
  if (!p) {
    p = new TextureLoader()
      .loadAsync(`${BASE}${name}.webp`)
      .then((t) => {
        // glTF UVs start at the top left.
        t.flipY = false;
        t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
        t.anisotropy = MAX_ANISOTROPY;
        t.needsUpdate = true;
        return t;
      })
      .catch((e) => {
        console.warn(`[avatar] detail map ${name} did not load; keeping the vertex shading`, e);
        textures.delete(name);
        return null;
      });
    textures.set(name, p);
  }
  return p;
}

/** Sharper maps on surfaces seen at a slant (the cheek, the side of the body). */
const MAX_ANISOTROPY = 4;

export const detailOf = (o: Object3D): DetailMaps | null => (o.userData?.detail as DetailMaps | undefined) ?? null;

/** Every map these meshes name, loaded together. */
export async function loadDetailMaps(meshes: Object3D[]): Promise<Map<string, Texture>> {
  const wanted = new Map<string, boolean>();
  for (const m of meshes) {
    const d = detailOf(m);
    if (d?.shade) wanted.set(d.shade, false);
    if (d?.normal) wanted.set(d.normal, false);
    if (d?.colour) wanted.set(d.colour, true);
  }
  const got = await Promise.all([...wanted].map(async ([name, colour]) => [name, await loadMap(name, colour)] as const));
  return new Map(got.filter((e): e is [string, Texture] => e[1] !== null));
}

/**
 * Put a mesh's detail maps on its material. Returns whether the shading now comes from a shade map (the vertex colours
 * must then leave the baked shade out) or, for the eyes, whether the colour does (vertex colours off).
 */
export function applyDetail(mesh: Mesh, material: MeshStandardMaterial, maps: Map<string, Texture>, shadeMax: number): { shadeFromMap: boolean; colourFromMap: boolean } {
  const d = detailOf(mesh);
  const shade = d?.shade ? maps.get(d.shade) : undefined;
  const normal = d?.normal ? maps.get(d.normal) : undefined;
  const colour = d?.colour ? maps.get(d.colour) : undefined;
  if (shade) {
    material.map = shade;
    // The map holds shade / SHADE_MAX: scale it back up.
    material.color.setScalar(shadeMax);
  }
  if (normal) material.normalMap = normal;
  if (colour) {
    material.map = colour;
    material.vertexColors = false;
  }
  material.needsUpdate = true;
  return { shadeFromMap: !!shade, colourFromMap: !!colour };
}

// ---- soft shadows --------------------------------------------------------------------------------------------

/** The key light's shadow: a box round a standing adult (metres), soft-edged, sharp enough at 720 px. */
const SHADOW = {
  mapPx: 2048,
  halfWidthM: 1.1,
  bottomM: -0.2,
  topM: 2.1,
  nearM: 0.5,
  farM: 8,
  /** Pulls the comparison toward the light: stops cloth and skin from shadowing themselves in stripes. */
  bias: -0.0004,
  normalBias: 0.012,
  /** PCF blur radius (texels). */
  radius: 3,
} as const;

/** Soft self-shadows from the key light. Call before the first render (it changes every material's program). */
export function enableShadows(renderer: WebGLRenderer, key: DirectionalLight, lookAtY: number) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  key.castShadow = true;
  key.target.position.set(0, lookAtY, 0);
  const cam = key.shadow.camera;
  cam.left = -SHADOW.halfWidthM;
  cam.right = SHADOW.halfWidthM;
  cam.bottom = SHADOW.bottomM - lookAtY;
  cam.top = SHADOW.topM - lookAtY;
  cam.near = SHADOW.nearM;
  cam.far = SHADOW.farM;
  cam.updateProjectionMatrix();
  key.shadow.mapSize.set(SHADOW.mapPx, SHADOW.mapPx);
  key.shadow.bias = SHADOW.bias;
  key.shadow.normalBias = SHADOW.normalBias;
  key.shadow.radius = SHADOW.radius;
}

// ---- cloth surfaces --------------------------------------------------------------------------------------------

/** Canvas size of one tile of a cloth surface (px); each tile repeats seamlessly. */
const TILE_PX = 256;

/**
 * Each material's surface: how many metres one tile covers on the body, how much it lightens and darkens the cloth's
 * colour (albedo, ±), and how strongly it bends the light (bump). Threads and tufts are drawn about 4 times coarser than
 * real homespun (10-20 threads a centimetre) so the weave reads at the large view's ~1.5 mm a pixel instead of
 * shimmering; fur tufts, hide grain and twined cords are near life size.
 */
type ClothLook = { tileM: number; albedo: number; bump: number };
const CLOTH: Record<Material, ClothLook> = {
  linen: { tileM: 0.06, albedo: 0.1, bump: 1.2 },
  cotton: { tileM: 0.05, albedo: 0.08, bump: 1.0 },
  silk: { tileM: 0.03, albedo: 0.05, bump: 0.5 },
  wool: { tileM: 0.08, albedo: 0.12, bump: 1.6 },
  felt: { tileM: 0.1, albedo: 0.1, bump: 0.9 },
  fur: { tileM: 0.12, albedo: 0.3, bump: 2.2 },
  hide: { tileM: 0.14, albedo: 0.14, bump: 1.0 },
  bark: { tileM: 0.12, albedo: 0.18, bump: 1.4 },
  fibre: { tileM: 0.08, albedo: 0.22, bump: 2.0 },
};

/** Threads across one tile (weaves) and how many strokes fill a tile (fur, bark, fibre). */
const THREADS: Partial<Record<Material, number>> = { linen: 16, cotton: 16, silk: 24, wool: 12 };
const FUR_STROKES = 900;
const BARK_STREAKS = 140;
const CORDS = 10;
const FELT_FLECKS = 1600;
const HIDE_PORES = 2200;

/** A small seeded generator, so every visit draws the same cloth. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw with wrap-around, so a stroke crossing an edge comes back on the other side and the tile repeats seamlessly. */
function wrapped(g: CanvasRenderingContext2D, draw: () => void) {
  for (const dx of [-TILE_PX, 0, TILE_PX])
    for (const dy of [-TILE_PX, 0, TILE_PX]) {
      g.save();
      g.translate(dx, dy);
      draw();
      g.restore();
    }
}

const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

/** One tile of height (grey, mid-grey = flat) for a material. */
function drawCloth(kind: Material): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TILE_PX;
  const g = c.getContext('2d')!;
  g.fillStyle = grey(0.5);
  g.fillRect(0, 0, TILE_PX, TILE_PX);
  const r = rng(kind.length * 7919 + kind.charCodeAt(0));
  const threads = THREADS[kind];
  if (threads) {
    // Over-under: each crossing shows the thread on top as a rounded bump along its length. Wool is a 2/2 twill.
    const cell = TILE_PX / threads;
    const twill = kind === 'wool';
    const slub = Array.from({ length: threads }, () => 0.9 + r() * 0.2); // linen's uneven threads
    for (let i = 0; i < threads; i++)
      for (let j = 0; j < threads; j++) {
        const warpOver = twill ? (i + j) % 4 < 2 : (i + j) % 2 === 0;
        const x = i * cell;
        const y = j * cell;
        const grad = warpOver ? g.createLinearGradient(x, 0, x + cell, 0) : g.createLinearGradient(0, y, 0, y + cell);
        const top = 0.72 * (warpOver ? slub[i] : slub[j]);
        grad.addColorStop(0, grey(0.3));
        grad.addColorStop(0.5, grey(Math.min(1, top)));
        grad.addColorStop(1, grey(0.3));
        g.fillStyle = grad;
        g.fillRect(x, y, cell, cell);
      }
    if (kind === 'wool') {
      g.filter = 'blur(1.2px)';
      g.drawImage(c, 0, 0);
      g.filter = 'none';
    }
  } else if (kind === 'fur') {
    // Tufts of hair lying downward, light tips over dark roots.
    g.lineCap = 'round';
    for (let k = 0; k < FUR_STROKES; k++) {
      const x = r() * TILE_PX;
      const y = r() * TILE_PX;
      const len = 10 + r() * 22;
      const lean = (r() - 0.5) * 8;
      const v = 0.25 + r() * 0.65;
      g.strokeStyle = grey(v, 0.8);
      g.lineWidth = 1 + r() * 1.6;
      wrapped(g, () => {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + lean, y + len * 0.5, x + lean * 1.5, y + len);
        g.stroke();
      });
    }
  } else if (kind === 'hide') {
    // Leather grain: soft mottle, then fine pores and a few creases.
    for (let k = 0; k < 60; k++) {
      const x = r() * TILE_PX;
      const y = r() * TILE_PX;
      const rad = 12 + r() * 30;
      const v = 0.42 + r() * 0.16;
      wrapped(g, () => {
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, grey(v, 0.5));
        grad.addColorStop(1, grey(v, 0));
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
    for (let k = 0; k < HIDE_PORES; k++) {
      g.fillStyle = grey(0.3 + r() * 0.15, 0.6);
      g.fillRect(r() * TILE_PX, r() * TILE_PX, 1.2, 1.2);
    }
    g.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const x = r() * TILE_PX;
      const y = r() * TILE_PX;
      const a = r() * Math.PI;
      const len = 20 + r() * 40;
      g.strokeStyle = grey(0.32, 0.5);
      wrapped(g, () => {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      });
    }
  } else if (kind === 'bark') {
    // Beaten bark cloth: long fibres running one way, some lighter, some darker, slightly wavy.
    for (let k = 0; k < BARK_STREAKS; k++) {
      const x = r() * TILE_PX;
      const v = 0.3 + r() * 0.45;
      g.strokeStyle = grey(v, 0.7);
      g.lineWidth = 0.8 + r() * 2.5;
      const wave = r() * 4;
      wrapped(g, () => {
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + wave, TILE_PX / 3, x - wave, (2 * TILE_PX) / 3, x, TILE_PX);
        g.stroke();
      });
    }
  } else if (kind === 'fibre') {
    // Twined plant fibre: vertical cords, each a row of slanted plies.
    const w = TILE_PX / CORDS;
    for (let i = 0; i < CORDS; i++) {
      const x = i * w;
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, grey(0.15));
      grad.addColorStop(0.5, grey(0.6));
      grad.addColorStop(1, grey(0.15));
      g.fillStyle = grad;
      g.fillRect(x, 0, w, TILE_PX);
      g.strokeStyle = grey(0.85, 0.55);
      g.lineWidth = 1.5;
      const ply = w * 0.9;
      for (let y = -ply; y < TILE_PX + ply; y += ply) {
        g.beginPath();
        g.moveTo(x + w * 0.15, y + ply);
        g.lineTo(x + w * 0.85, y);
        g.stroke();
      }
    }
  } else {
    // Felt: matted fibres, no pattern.
    for (let k = 0; k < FELT_FLECKS; k++) {
      const x = r() * TILE_PX;
      const y = r() * TILE_PX;
      const a = r() * Math.PI;
      const len = 3 + r() * 6;
      g.strokeStyle = grey(0.3 + r() * 0.4, 0.5);
      g.lineWidth = 1;
      wrapped(g, () => {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      });
    }
  }
  return c;
}

const clothTiles = new Map<Material, Texture>();
function clothTile(kind: Material): Texture {
  let t = clothTiles.get(kind);
  if (!t) {
    t = new CanvasTexture(drawCloth(kind));
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = NoColorSpace;
    t.anisotropy = MAX_ANISOTROPY;
    clothTiles.set(kind, t);
  }
  return t;
}

/** How sharply the three projections hand over as the surface turns (higher = narrower blends). */
const TRIPLANAR_SHARPNESS = 4;

/**
 * Lay a material's surface on a garment: sampled from three sides in the bind pose (so it sticks to the cloth as the body
 * moves), it lightens and darkens the colour and bends the light as a bump would.
 */
export function clothSurface(material: MeshStandardMaterial, kind: Material) {
  const look = CLOTH[kind];
  const tile = clothTile(kind);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClothTile = { value: tile };
    shader.uniforms.uClothScale = { value: 1 / look.tileM };
    shader.uniforms.uClothAlbedo = { value: look.albedo };
    shader.uniforms.uClothBump = { value: look.bump };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClothPos;\nvarying vec3 vClothNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothPos = position;\nvClothNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vClothPos;
varying vec3 vClothNrm;
uniform sampler2D uClothTile;
uniform float uClothScale;
uniform float uClothAlbedo;
uniform float uClothBump;
float clothHeight() {
  vec3 w = pow(abs(normalize(vClothNrm)), vec3(${TRIPLANAR_SHARPNESS.toFixed(1)}));
  w /= (w.x + w.y + w.z);
  vec3 p = vClothPos * uClothScale;
  // Fibres hang down the body: the side views keep the tile's vertical along the body's height.
  return texture2D(uClothTile, p.zy).r * w.x + texture2D(uClothTile, p.xz).r * w.y + texture2D(uClothTile, p.xy).r * w.z;
}
vec3 clothBumped(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sigmaX = normalize(dFdx(surfPos));
  vec3 sigmaY = normalize(dFdy(surfPos));
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float clothH = clothHeight();
vec2 clothGrad = vec2(dFdx(clothH), dFdy(clothH));
diffuseColor.rgb *= 1.0 + uClothAlbedo * (clothH - 0.5) * 2.0;`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = clothBumped(-vViewPosition, normal, clothGrad * uClothBump, faceDirection);');
  };
  material.customProgramCacheKey = () => `cloth-${kind}`;
  material.needsUpdate = true;
}
