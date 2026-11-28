#!/usr/bin/env node
// Builds the person card's 3D figure assets (docs/ops/avatar.md) from two CC0 Quaternius packs (sources.json):
//
//   pnpm --dir footstep-generator/avatar install
//   node footstep-generator/avatar/build.mjs                  download (or reuse data/raw/avatar/), check sha256, build
//   node footstep-generator/avatar/build.mjs --zips DIR       use zips already in DIR (same file names as sources.json)
//   node footstep-generator/avatar/build.mjs --out DIR        write somewhere else (default footsteps-web/public/avatar/)
//
// Output (all meshopt-compressed GLB, no textures):
//   body_male.glb, body_female.glb   the body, eyes and eyebrows, skinned to the pack's 65-joint skeleton
//   piece_<name>_<sex>.glb           one garment piece each (pieces.mjs): fitted shells and hanging lathes on the same skeleton
//   hair_<style>.glb                 one skinned hair mesh per style (long, buns, parted, buzzed, buzzed_female, beard)
//   anims.glb                        the skeleton and the clips we keep (idle, talk, walk, sit, crouch, work, hold, dance, push), no mesh
//   detail_*.webp                    the large view's maps (DETAIL below): skin and hair shading, their normal maps, the eye
//   manifest.json                    sources, licence, sha256 and bytes of every file, clip names, the vertex-colour encoding
//
// Why the card has no textures: at card size the useful detail fits in vertex colours, so the card fetches no image. The
// figure opened large (and zoomed to a face) is 4-6 times taller on screen, where per-vertex shading blurs the face; it
// fetches the detail maps instead (each body, brows, hair and eye mesh names its maps in its glTF extras, and keeps
// TEXCOORD_0 for them). Greyscale WebP at these sizes is small (about 0.25 MB a person), so no KTX2 toolchain is needed. COLOR_0 on body and hair = (shade / SHADE_MAX, garment, trim): shade is the texture's brightness relative
// to its typical skin (or hair) pixel, garment is 1 where the person's garment colour goes (the pack's painted underwear
// on the body; all of a garment piece), trim marks a piece's hem, cuffs and neck. The body also carries `_COVER`: which
// fitted pieces cover each vertex, so the viewer can hide skin under them. Eyes keep real RGB. The viewer turns these
// into per-person colours on the CPU (footsteps-web/components/footsteps/overlays/avatarScene.ts).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LATHES, SHELLS, bodyData, coverBits, latheGeometry, shellGeometry } from './pieces.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SOURCES = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

/** Shade is stored as shade / SHADE_MAX so highlights up to 1.5× the typical pixel fit in a normalised byte. */
export const SHADE_MAX = 1.5;
/** Clips kept from UAL1_Standard.glb (root motion off), under the short names the viewer uses. */
const CLIPS = {
  idle: 'Idle_Loop',
  talk: 'Idle_Talking_Loop',
  walk: 'Walk_Loop',
  sit: 'Sitting_Idle_Loop',
  crouch: 'Crouch_Idle_Loop',
  work: 'Fixing_Kneeling',
  hold: 'Idle_Torch_Loop',
  dance: 'Dance_Loop',
  push: 'Push_Loop',
};
/**
 * The large view's maps. Skin and hair shade maps hold the base colour's brightness against its typical pixel, divided by
 * SHADE_MAX, as the vertex colours do; normal maps are the pack's OpenGL-convention ("Normals Unity - Godot") maps. Sizes
 * are each source's own 2048 px for the body (the face is about a sixth of its width) and half that for hair and eyes.
 */
const DETAIL = {
  skinPx: 2048,
  hairPx: 1024,
  eyePx: 256,
  webpQuality: 82,
};
/** A base-colour pixel this grey (channel spread under this, in 0-255) is the pack's painted underwear, not skin. */
const UNDERWEAR_SPREAD = 8;

const HAIR = {
  long: 'Hair_Long',
  buns: 'Hair_Buns',
  parted: 'Hair_SimpleParted',
  buzzed: 'Hair_Buzzed',
  buzzed_female: 'Hair_BuzzedFemale',
  beard: 'Hair_Beard',
};

// ---- arguments --------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
  opt[argv[i].slice(2)] = argv[++i];
}
const OUT = path.resolve(opt.out ?? path.join(REPO, 'footsteps-web', 'public', 'avatar'));
const CACHE = path.resolve(opt.zips ?? path.join(REPO, 'data', 'raw', 'avatar'));

// ---- fetch ------------------------------------------------------------------------------------------------
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** itch.io's free-download flow, as the browser does it: a download page, its csrf token, then a signed file URL. */
async function fetchFromItch(pack) {
  const base = `https://quaternius.itch.io/${pack.game}`;
  const jar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
    return res;
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const xhr = { 'X-Requested-With': 'XMLHttpRequest' };
  const r1 = keep(await fetch(`${base}/download_url`, { method: 'POST', headers: xhr }));
  const { url: page } = await r1.json();
  if (!page) throw new Error(`${pack.game}: no download page from itch.io`);
  const html = await keep(await fetch(page, { headers: { cookie: cookie() } })).text();
  const csrf = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error(`${pack.game}: no csrf token on the download page`);
  const r3 = await fetch(`${base}/file/${pack.upload_id}?source=game_download`, {
    method: 'POST',
    headers: { ...xhr, cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf_token: csrf }),
  });
  const { url, errors } = await r3.json();
  if (!url) throw new Error(`${pack.game}: itch.io refused the file (${errors?.join(', ')})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${pack.game}: download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function zipFor(pack) {
  const file = path.join(CACHE, pack.file);
  let buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!buf) {
    if (opt.zips) throw new Error(`--zips: ${file} not found`);
    console.log(`fetching ${pack.title} (${(pack.bytes / 1e6).toFixed(0)} MB) from itch.io`);
    buf = await fetchFromItch(pack);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, buf);
  }
  const got = sha256(buf);
  if (got !== pack.sha256) throw new Error(`${pack.file}: sha256 ${got}, expected ${pack.sha256}. The upload changed: check the licence again and update sources.json on purpose.`);
  return file;
}

// ---- texture sampling -------------------------------------------------------------------------------------
/** An image as linear-ish luminance and RGB, downscaled (sharp averages) so a vertex samples a small area, not one texel. */
async function loadImage(file, size = 512) {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (u, v) => {
    const x = Math.min(info.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * info.width)));
    const y = Math.min(info.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * info.height)));
    const i = (y * info.width + x) * 3;
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  };
  return { at };
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 1;

/** Underwear in the base colour: near black and grey, where skin is never that dark in the light-skin texture. */
const painted = (rgb) => (lum(rgb) < 0.12 ? 1 : 0);

function setColour(doc, prim, values) {
  const acc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(values)).setBuffer(doc.getRoot().listBuffers()[0]);
  prim.setAttribute('COLOR_0', acc);
}

function stripTo(prim, keep) {
  for (const s of prim.listSemantics()) if (!keep.includes(s)) prim.setAttribute(s, null);
}

/** Read a .gltf whose JSON may name images that are not in the folder: drop images first, we sample textures ourselves. */
async function readGltf(io, file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    const p = m.pbrMetallicRoughness ?? {};
    delete p.baseColorTexture;
    delete p.metallicRoughnessTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
  }
  const tmp = path.join(path.dirname(file), `.${path.basename(file, '.gltf')}.notex.gltf`);
  fs.writeFileSync(tmp, JSON.stringify(json));
  try {
    return await io.read(tmp);
  } finally {
    fs.rmSync(tmp);
  }
}

const KEEP = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0', '_COVER'];

// ---- detail maps (the large view) ---------------------------------------------------------------------------
/** Which pack texture each hair file uses (its first material's name says). */
const hairTexture = (materialName) => (/Hair_2/.test(materialName) ? 'hair_2' : 'hair_1');
/** Maps named in a mesh node's extras; the viewer reads them as `userData.detail`. */
const detailFor = {
  body: (sex) => ({ shade: `detail_skin_${sex}`, normal: `detail_skin_normal_${sex}` }),
  brows: (sex) => ({ shade: `detail_${sex === 'male' ? 'hair_1' : 'hair_2'}`, normal: `detail_${sex === 'male' ? 'hair_1' : 'hair_2'}_normal` }),
  hair: (tex) => ({ shade: `detail_${tex}`, normal: `detail_${tex}_normal` }),
  eyes: () => ({ colour: 'detail_eye' }),
};

/** A shade map: each pixel's luminance against the median skin (or hair) pixel, over SHADE_MAX, as one grey channel. */
async function shadeMap(file, size, outFile) {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const lums = new Float32Array(n);
  const underwear = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    lums[i] = lum([r / 255, g / 255, b / 255]);
    underwear[i] = Math.max(r, g, b) - Math.min(r, g, b) < UNDERWEAR_SPREAD ? 1 : 0;
  }
  const typical = median(Array.from(lums).filter((_, i) => !underwear[i]));
  const grey = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    // Underwear reads as plain skin (shade 1): outfits put cloth there, and bare hips should not show a grey patch.
    const shade = underwear[i] ? 1 : Math.min(SHADE_MAX, Math.max(0.35, lums[i] / typical));
    grey[i] = Math.round((shade / SHADE_MAX) * 255);
  }
  await sharp(grey, { raw: { width: info.width, height: info.height, channels: 1 } }).webp({ quality: DETAIL.webpQuality }).toFile(outFile);
}

async function copyMap(file, size, outFile) {
  await sharp(file).resize(size, size, { fit: 'fill' }).removeAlpha().webp({ quality: DETAIL.webpQuality }).toFile(outFile);
}

/** Every detail map, written into OUT. Returns the file names. */
async function bakeDetailMaps(dir) {
  const tex = path.join(dir, 'Base Characters', 'Textures');
  const hairTex = path.join(dir, 'Hairstyles', 'Textures');
  const normals = (folder) => path.join(folder, 'Normals Unity - Godot');
  const jobs = [
    [shadeMap, path.join(tex, 'T_Superhero_Male_Ligh.png'), DETAIL.skinPx, 'detail_skin_male'],
    [shadeMap, path.join(tex, 'T_Superhero_Female_Light_BaseColor.png'), DETAIL.skinPx, 'detail_skin_female'],
    [copyMap, path.join(normals(tex), 'T_Superhero_Male_Normal.png'), DETAIL.skinPx, 'detail_skin_normal_male'],
    [copyMap, path.join(normals(tex), 'T_Superhero_Female_Normal.png'), DETAIL.skinPx, 'detail_skin_normal_female'],
    [shadeMap, path.join(hairTex, 'T_Hair_1_BaseColor.png'), DETAIL.hairPx, 'detail_hair_1'],
    [shadeMap, path.join(hairTex, 'T_Hair_2_BaseColor.png'), DETAIL.hairPx, 'detail_hair_2'],
    [copyMap, path.join(normals(hairTex), 'T_Hair_1_Normal.png'), DETAIL.hairPx, 'detail_hair_1_normal'],
    [copyMap, path.join(normals(hairTex), 'T_Hair_2_Normal.png'), DETAIL.hairPx, 'detail_hair_2_normal'],
    [copyMap, path.join(tex, 'T_Eye_Brown.png'), DETAIL.eyePx, 'detail_eye'],
  ];
  const out = [];
  for (const [fn, src, size, name] of jobs) {
    const file = path.join(OUT, `${name}.webp`);
    await fn(src, size, file);
    out.push(file);
  }
  return out;
}
/** Each body's bind-pose data and joint names, for the garment pieces made from it. */
const bodies = {};

async function bakeBody(io, dir, sex) {
  const base = path.join(dir, 'Base Characters');
  const doc = await readGltf(io, path.join(base, 'Godot - UE', `Superhero_${sex === 'male' ? 'Male' : 'Female'}_FullBody.gltf`));
  const skinTex = await loadImage(path.join(base, 'Textures', sex === 'male' ? 'T_Superhero_Male_Ligh.png' : 'T_Superhero_Female_Light_BaseColor.png'));
  const eyeTex = await loadImage(path.join(base, 'Textures', 'T_Eye_Brown.png'), 256);
  const hairTex = await loadImage(path.join(base, 'Textures', sex === 'male' ? 'T_Hair_1_BaseColor.png' : 'T_Hair_2_BaseColor.png'), 256);
  const stats = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mat = mesh.listPrimitives()[0].getMaterial()?.getName() ?? '';
    const part = /Eyes/.test(mat) ? 'eyes' : /Hair/.test(mat) ? 'brows' : 'body';
    node.setName(part);
    mesh.setName(part);
    node.setExtras({ detail: detailFor[part](sex) });
    for (const prim of mesh.listPrimitives()) {
      prim.getMaterial()?.setName(part);
      const pos = prim.getAttribute('POSITION');
      const uv = prim.getAttribute('TEXCOORD_0');
      const n = pos.getCount();
      const out = new Array(n * 3).fill(0);
      if (part === 'eyes') {
        for (let i = 0; i < n; i++) out.splice(i * 3, 3, ...eyeTex.at(...uv.getElement(i, [])));
      } else {
        const tex = part === 'body' ? skinTex : hairTex;
        const rgbs = Array.from({ length: n }, (_, i) => tex.at(...uv.getElement(i, [])));
        const skinLums = rgbs.filter((c) => !painted(c)).map(lum);
        const typical = median(skinLums);
        let garmentVerts = 0;
        for (let i = 0; i < n; i++) {
          // The pack's painted underwear stays in the garment colour: what shows when an outfit leaves the hips bare.
          const g = part === 'body' ? painted(rgbs[i]) : 0;
          // Garment is flat cloth; skin keeps the painted muscle and face shading.
          const shade = painted(rgbs[i]) ? 1 : Math.min(SHADE_MAX, Math.max(0.35, lum(rgbs[i]) / typical));
          out[i * 3] = shade / SHADE_MAX;
          out[i * 3 + 1] = g;
          out[i * 3 + 2] = 0;
          if (g > 0.5) garmentVerts++;
        }
        stats[part] = { vertices: n, garmentVertices: garmentVerts };
      }
      setColour(doc, prim, out);
      stripTo(prim, KEEP);
      if (part === 'body') {
        const data = bodyData(prim);
        const bits = coverBits(data);
        prim.setAttribute('_COVER', doc.createAccessor().setType('SCALAR').setArray(bits).setBuffer(doc.getRoot().listBuffers()[0]));
        stats.cover = Object.fromEntries(Object.entries(SHELLS).filter(([, v]) => v.bit).map(([k, v]) => [k, bits.reduce((a, b) => a + ((b & v.bit) ? 1 : 0), 0)]));
        bodies[sex] = { data, joints: node.getSkin().listJoints().map((j) => j.getName()) };
      }
    }
  }
  return { doc, stats };
}

/**
 * One garment piece as its own file: the body's skeleton and skin, and one skinned mesh (lib/wardrobe.ts PIECE_FILES).
 * Read the body afresh, drop its meshes, add the piece bound to the same skin.
 */
async function bakePiece(io, dir, sex, name) {
  const base = path.join(dir, 'Base Characters');
  const doc = await readGltf(io, path.join(base, 'Godot - UE', `Superhero_${sex === 'male' ? 'Male' : 'Female'}_FullBody.gltf`));
  const { data, joints } = bodies[sex];
  let skin = null;
  let parent = null;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    if (node.getSkin() && !skin) {
      skin = node.getSkin();
      parent = node.getParentNode();
    }
    node.setMesh(null);
    node.setSkin(null);
  }
  const jointIndex = {
    toThigh: (j) => {
      const n = joints[j];
      const side = /_l$/.test(n) ? 'l' : /_r$/.test(n) ? 'r' : null;
      return side && /^(calf|foot|ball)/.test(n) ? joints.indexOf(`thigh_${side}`) : j;
    },
  };
  const built = SHELLS[name] ? shellGeometry(data, SHELLS[name]) : latheGeometry(data, LATHES[name], { pelvisJoint: joints.indexOf('pelvis'), jointIndex });
  const buffer = doc.getRoot().listBuffers()[0];
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const g = built.geo;
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', g.POSITION))
    .setAttribute('NORMAL', acc('VEC3', g.NORMAL))
    .setAttribute('COLOR_0', acc('VEC3', g.COLOR_0))
    .setAttribute('JOINTS_0', acc('VEC4', g.JOINTS_0))
    .setAttribute('WEIGHTS_0', acc('VEC4', g.WEIGHTS_0))
    .setIndices(acc('SCALAR', g.indices))
    .setMaterial(doc.createMaterial('garment').setDoubleSided(true));
  const node = doc.createNode('garment').setMesh(doc.createMesh('garment').addPrimitive(prim)).setSkin(skin);
  if (parent) parent.addChild(node);
  else doc.getRoot().listScenes()[0].addChild(node);
  for (const m of doc.getRoot().listMeshes()) if (m !== node.getMesh()) m.dispose();
  return { doc, stats: { vertices: built.vertices, triangles: built.triangles } };
}

async function bakeHair(io, dir, name) {
  const folder = path.join(dir, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)');
  const doc = await readGltf(io, path.join(folder, `${name}.gltf`));
  const json = JSON.parse(fs.readFileSync(path.join(folder, `${name}.gltf`), 'utf8'));
  const texName = hairTexture(json.materials?.[0]?.name ?? '') === 'hair_2' ? 'T_Hair_2_BaseColor.png' : 'T_Hair_1_BaseColor.png';
  const tex = await loadImage(path.join(folder, texName), 256);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    node.setName('hair');
    mesh.setName('hair');
    node.setExtras({ detail: detailFor.hair(hairTexture(json.materials?.[0]?.name ?? '')) });
    for (const prim of mesh.listPrimitives()) {
      prim.getMaterial()?.setName('hair');
      const uv = prim.getAttribute('TEXCOORD_0');
      const n = uv.getCount();
      const ls = Array.from({ length: n }, (_, i) => lum(tex.at(...uv.getElement(i, []))));
      const typical = median(ls);
      setColour(doc, prim, ls.flatMap((l) => [Math.min(SHADE_MAX, Math.max(0.35, l / typical)) / SHADE_MAX, 0, 0]));
      stripTo(prim, KEEP);
    }
  }
  return doc;
}

/** Dispose a sampler and whichever of its keyframe accessors nothing else uses (inputs are often shared by a clip's channels). */
function dropSampler(s) {
  const accs = [s.getInput(), s.getOutput()].filter(Boolean);
  s.dispose();
  for (const a of accs) if (a.listParents().every((p) => p.propertyType === 'Root')) a.dispose();
}

async function trimAnims(io, dir) {
  const doc = await io.read(path.join(dir, 'Unreal-Godot', 'UAL1_Standard.glb'));
  const root = doc.getRoot();
  const wanted = new Map(Object.entries(CLIPS).map(([k, v]) => [v, k]));
  for (const anim of root.listAnimations()) {
    const short = wanted.get(anim.getName());
    if (short) {
      anim.setName(short);
      continue;
    }
    // Disposing an animation leaves its samplers holding their keyframe accessors, which would still be written (~3.8 MB).
    for (const c of anim.listChannels()) c.dispose();
    for (const s of anim.listSamplers()) dropSampler(s);
    anim.dispose();
  }
  const missing = Object.values(CLIPS).filter((c) => !root.listAnimations().some((a) => a.getName() === Object.keys(CLIPS).find((k) => CLIPS[k] === c)));
  if (missing.length) throw new Error(`clips not in UAL1_Standard.glb: ${missing.join(', ')}`);
  // The skeleton stays (the clips target its nodes); the mannequin mesh, skin and materials go.
  for (const node of root.listNodes()) if (node.getMesh()) { node.setMesh(null); node.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  // Scale tracks that never move, and translations on anything but the pelvis, add bytes and nothing to see.
  for (const anim of root.listAnimations())
    for (const ch of anim.listChannels()) {
      const path_ = ch.getTargetPath();
      const name = ch.getTargetNode()?.getName();
      if (path_ === 'scale' || (path_ === 'translation' && name !== 'pelvis')) {
        const s = ch.getSampler();
        ch.dispose();
        if (s && !s.listParents().some((p) => p.propertyType === 'AnimationChannel')) dropSampler(s);
      }
    }
  const clips = root.listAnimations().map((a) => ({
    name: a.getName(),
    source: CLIPS[a.getName()],
    seconds: Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0)),
    targets: [...new Set(a.listChannels().map((c) => c.getTargetNode()?.getName()))],
  }));
  return { doc, clips };
}

async function write(io, doc, file, { anims = false } = {}) {
  await doc.transform(dedup(), ...(anims ? [resample({ tolerance: 1e-4 })] : [weld()]), prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(file, doc);
  const buf = fs.readFileSync(file);
  return { file: path.basename(file), bytes: buf.length, sha256: sha256(buf) };
}

// ---- main -------------------------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-'));
const dirs = {};
for (const pack of SOURCES.packs) {
  const zip = await zipFor(pack);
  execFileSync('unzip', ['-oq', zip, '-d', path.join(work, pack.id)]);
  dirs[pack.id] = path.join(work, pack.id, fs.readdirSync(path.join(work, pack.id)).find((d) => !d.startsWith('.') && !d.startsWith('__')));
}
fs.mkdirSync(OUT, { recursive: true });
const files = [];
const stats = {};
for (const sex of ['male', 'female']) {
  const { doc, stats: s } = await bakeBody(io, dirs.characters, sex);
  stats[sex] = s;
  files.push(await write(io, doc, path.join(OUT, `body_${sex}.glb`)));
}
const PIECES = [...Object.keys(SHELLS), ...Object.keys(LATHES)];
stats.pieces = {};
for (const sex of ['male', 'female'])
  for (const name of PIECES) {
    const { doc, stats: s } = await bakePiece(io, dirs.characters, sex, name);
    stats.pieces[`${name}_${sex}`] = s;
    files.push(await write(io, doc, path.join(OUT, `piece_${name}_${sex}.glb`)));
  }
for (const [style, name] of Object.entries(HAIR)) files.push(await write(io, await bakeHair(io, dirs.characters, name), path.join(OUT, `hair_${style}.glb`)));
const { doc: animDoc, clips } = await trimAnims(io, dirs.animations);

// Every clip must drive only joints the bodies have, or a part-2 clip would silently not move them.
const bodyJoints = new Set();
for (const sex of ['male', 'female']) {
  const d = await io.read(path.join(OUT, `body_${sex}.glb`));
  for (const s of d.getRoot().listSkins()) for (const j of s.listJoints()) bodyJoints.add(j.getName());
}
for (const c of clips) {
  const stray = c.targets.filter((t) => !bodyJoints.has(t));
  if (stray.length) throw new Error(`clip ${c.name} targets joints the bodies lack: ${stray.join(', ')}`);
}
files.push(await write(io, animDoc, path.join(OUT, 'anims.glb'), { anims: true }));
for (const file of await bakeDetailMaps(dirs.characters)) {
  const buf = fs.readFileSync(file);
  files.push({ file: path.basename(file), bytes: buf.length, sha256: sha256(buf) });
}
fs.rmSync(work, { recursive: true, force: true });

const total = files.reduce((a, f) => a + f.bytes, 0);
const manifest = {
  generated_by: 'footstep-generator/avatar/build.mjs',
  licence: SOURCES.licence,
  author: SOURCES.author,
  sources: SOURCES.packs.map(({ id, title, page, itch, upload_id, file, version, sha256: s }) => ({ id, title, page, itch, upload_id, file, version, sha256: s })),
  encoding: {
    COLOR_0: `body, brows, hair and garment pieces: (shade / ${SHADE_MAX}, garment 0-1, trim 0-1); eyes: RGB`,
    _COVER: 'body only: bits of the fitted pieces covering the vertex (vest 1, shortsleeve 2, longsleeve 4, trousers 8, hood 16); the viewer hides covered triangles',
    shade_max: SHADE_MAX,
    TEXCOORD_0: 'body, brows, eyes and hair: the pack UVs, for the large view\'s detail maps',
    detail: 'large view only: detail_<skin|hair>*.webp = shade / shade_max as grey (underwear = 1); *_normal = OpenGL normal maps; detail_eye = sRGB eye colour. Each mesh node names its maps in extras.detail',
    skeleton: '65 joints, UE mannequin names (root, pelvis, spine_01-03, neck_01, Head, ...)',
  },
  clips: clips.map(({ name, source, seconds }) => ({ name, source, seconds: Math.round(seconds * 100) / 100 })),
  hair: Object.fromEntries(Object.entries(HAIR).map(([k, v]) => [k, v])),
  bake: stats,
  files,
  total_bytes: total,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const f of files) console.log(`${f.file.padEnd(24)} ${(f.bytes / 1024).toFixed(1).padStart(8)} KiB`);
console.log(`${'total'.padEnd(24)} ${(total / 1024).toFixed(1).padStart(8)} KiB`);
