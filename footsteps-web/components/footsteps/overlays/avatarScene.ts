// The 3D figure in the person card (`?avatar=3d`, docs/ops/avatar.md): three.js, loaded only with the flag (never in the
// first load: overlays/avatarLazy.ts). One small WebGL canvas per open card; it draws only while on screen and the tab is
// visible, at most 30 frames a second, and gives its GPU context back when the card closes.
//
// Assets come from public/avatar/ (footstep-generator/avatar/build.mjs): a body per sex, a hair mesh per style, and the
// clips on the same 65-joint skeleton, and garment pieces (lib/wardrobe.ts) bound to it. Meshes carry COLOR_0 = (shade /
// SHADE_MAX, garment, trim); this file turns that into the person's skin and cloth colours on the CPU, so there are no
// textures to fetch. Tools, ornaments and caps are primitives fixed to bones (avatarProps.ts); work loops are the pack's
// clips plus keyframed bone turns (lib/avatarWork.ts).
import {
  AnimationMixer,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
  type AnimationClip,
  type Bone,
  type BufferAttribute,
  type Object3D,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarSpec } from '@/lib/avatarSpec';
import { LOOPS, workPose, workWeight } from '@/lib/avatarWork';
import type { Material } from '@/lib/wardrobe';
import { STILL_SECONDS } from '@/lib/still';
import { potOnGround, REF_BONES, toolProps, wornProps, type Placed } from './avatarProps';
import { applyDetail, clothSurface, enableShadows, loadDetailMaps } from './avatarDetail';

/** Where the build writes the files, and its shade encoding (build.mjs `SHADE_MAX`). */
const BASE = '/avatar/';
const SHADE_MAX = 1.5;
/** The adult bodies are about this tall (m) in the bind pose. */
const BODY_M = 1.8;
const FRAME_MS = 1000 / 30;

/**
 * Orbit view limits. The camera circles the figure; these keep it framed and above ground.
 * Distances are in metres from the point looked at; angles in radians from straight up.
 */
const ORBIT = {
  /** Close enough to fill the view with a face (an adult head is about 0.23 m tall). */
  minDistance: 0.55,
  /** Times the starting (full-figure) distance: a little room around the whole person. */
  maxDistanceScale: 1.35,
  /** From above, never straight down onto the head. */
  minPolarAngle: 0.35,
  /** From a little below eye level, never under the ground. */
  maxPolarAngle: Math.PI / 2 + 0.08,
  /** The point looked at stays on the person: within this many metres sideways of them... */
  targetSideM: 0.6,
  /** ...and between the ankles and just above the head. */
  targetMinY: 0.1,
  targetMaxY: BODY_M + 0.1,
  /** Coast after letting go (three's OrbitControls damping, per update at 30 fps). */
  damping: 0.12,
  /** The canvas is small: a full drag across it turns the view about one full turn. */
  rotateSpeed: 0.9,
  zoomSpeed: 1.1,
  panSpeed: 0.8,
} as const;

/** The view starts three-quarter on: the camera this far round the figure (radians). */
const START_AZIMUTH = 0.35;

export const AVATAR_REQUESTED = 'footsteps:avatar-requested';
export const AVATAR_FIRST_FRAME = 'footsteps:avatar-first-frame';

const files = new Map<string, Promise<GLTF>>();
/** One download per file for the whole visit; a failure can be retried. */
function load(name: string): Promise<GLTF> {
  let p = files.get(name);
  if (!p) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(`${BASE}${name}.glb`);
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return p;
}

const linear = (css: string) => new Color().setStyle(css, SRGBColorSpace);

/** A stable 0-1 hash per vertex, for the grain of fur and hide. */
const grain = (i: number) => (Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;
/** How much each material's surface varies vertex to vertex (fur is tufted, silk is even). */
const GRAIN: Record<Material, number> = { fur: 0.35, hide: 0.12, bark: 0.18, fibre: 0.2, felt: 0.08, linen: 0.04, wool: 0.08, cotton: 0.04, silk: 0 };
/** And how rough it is to the light (silk has a sheen). */
const ROUGH: Record<Material, number> = { fur: 1, hide: 0.85, bark: 0.95, fibre: 0.95, felt: 1, linen: 0.85, wool: 0.95, cotton: 0.9, silk: 0.45 };

/** Ochre lines across the cheeks and brow, in the bind pose (metres). */
const facePaint = (x: number, y: number, z: number) => {
  if (z < 0.04 || y < 1.62 || y > 1.78) return 0;
  const ax = Math.abs(x);
  const cheeks = ax > 0.028 && ax < 0.075 && (Math.abs(y - 1.668) < 0.006 || Math.abs(y - 1.684) < 0.006) ? 1 : 0;
  const brow = ax < 0.06 && Math.abs(y - 1.748) < 0.005 ? 1 : 0;
  return Math.max(cheeks, brow);
};
const OCHRE = new Color().setStyle('#a8442a', SRGBColorSpace);

/** Per-vertex colour for one person: skin, garment or trim by the baked masks, times the baked shading. */
function paint(mesh: Mesh, base: Color, garment: Color | null, trim: Color | null = null, { grainAmount = 0, face = false, shadeFromMap = false } = {}) {
  const geo = mesh.geometry.clone();
  mesh.geometry = geo;
  const src = geo.getAttribute('color') as BufferAttribute | undefined;
  const n = geo.getAttribute('position').count;
  const out = new Float32Array(n * 3);
  const c = new Color();
  for (let i = 0; i < n; i++) {
    // In the large view a shade map carries the shading per texel instead (avatarDetail.ts).
    const shade = src && !shadeFromMap ? src.getX(i) * SHADE_MAX : 1;
    const g = garment && src ? src.getY(i) : 0;
    // Cloth is flat: the painted muscle shading fades out under the garment.
    const s = shade + (1 - shade) * g * 0.75;
    c.copy(base);
    if (garment && g > 0) c.lerp(garment, g);
    const t = trim && src ? src.getZ(i) : 0;
    if (trim && t > 0) c.lerp(trim, t);
    const k = s * (1 - grainAmount / 2 + grainAmount * grain(i));
    if (face) {
      const pos = geo.getAttribute('position');
      if (facePaint(pos.getX(i), pos.getY(i), pos.getZ(i))) c.lerp(OCHRE, 0.85);
    }
    out[i * 3] = c.r * k;
    out[i * 3 + 1] = c.g * k;
    out[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new Float32BufferAttribute(out, 3));
}

function collectMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

/** Cover bits of the fitted pieces (build.mjs, pieces.mjs `SHELLS`). */
const COVER_BIT: Record<string, number> = { vest: 1, shortsleeve: 2, longsleeve: 4, trousers: 8, hood: 16 };

/** Hide the body's triangles that a worn fitted piece covers entirely, so skin never pokes through the cloth. */
function hideCovered(mesh: Mesh, pieces: string[]) {
  const bits = pieces.reduce((a, p) => a | (COVER_BIT[p] ?? 0), 0);
  const cover = mesh.geometry.getAttribute('_cover') as BufferAttribute | undefined;
  const index = mesh.geometry.index;
  if (!bits || !cover || !index) return;
  const keep: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if (cover.getX(a) & bits && cover.getX(b) & bits && cover.getX(c) & bits) continue;
    keep.push(a, b, c);
  }
  mesh.geometry.setIndex(keep);
}

/** The eyes keep their baked colours, which are sRGB texture values: make them linear like everything else. */
function linearizeEyes(mesh: Mesh) {
  const geo = mesh.geometry.clone();
  mesh.geometry = geo;
  const src = geo.getAttribute('color') as BufferAttribute;
  const out = new Float32Array(src.count * 3);
  const c = new Color();
  for (let i = 0; i < src.count; i++) {
    c.setRGB(src.getX(i), src.getY(i), src.getZ(i), SRGBColorSpace);
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(out, 3));
}

const material = (roughness: number) => new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });

/**
 * Skinned meshes of a hair file, bound to the body's bones by name (both come from the one rig). They go under the same
 * parent the body mesh has, keeping their own local transform, so their bind matrices still hold.
 */
function attachToSkeleton(part: Object3D, bones: Map<string, Bone>, parent: Object3D): SkinnedMesh[] {
  const meshes: SkinnedMesh[] = [];
  part.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
  });
  for (const m of meshes) {
    const own = m.skeleton;
    const mapped = own.bones.map((b) => bones.get(b.name) ?? b);
    parent.add(m);
    m.bind(new Skeleton(mapped, own.boneInverses), m.bindMatrix);
  }
  return meshes;
}

/** A soft round shadow under the feet: cheaper than a shadow map and kinder at 120 px. */
function blobShadow(): Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/** A seeded generator for the head's glances (the same mulberry32 as lib/avatar.ts). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Now and then the head looks somewhere else and comes back: a glance every 4-10 s, held 1.5-3 s, at most ~30° aside.
 * Returns yaw and pitch (radians) for a time in seconds; pure, so `?still=1` can ask for one fixed instant.
 */
export function glanceAt(seed: number, t: number): { yaw: number; pitch: number } {
  const r = seeded(seed);
  let start = 2 + r() * 4;
  while (start < t + 20) {
    const hold = 1.5 + r() * 1.5;
    const yaw = (r() - 0.5) * 1.0;
    const pitch = (r() - 0.5) * 0.25;
    const ease = 0.6;
    const end = start + ease + hold + ease;
    if (t < start) return { yaw: 0, pitch: 0 };
    if (t < end) {
      const k = t < start + ease ? (t - start) / ease : t > end - ease ? (end - t) / ease : 1;
      const s = k * k * (3 - 2 * k);
      return { yaw: yaw * s, pitch: pitch * s };
    }
    start = end + 4 + r() * 6;
  }
  return { yaw: 0, pitch: 0 };
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const AXES = { x: X, y: Y, z: Z };
const tmpQ = new Quaternion();
const parentQ = new Quaternion();
const axis = new Vector3();

/** Turn a bone about a world axis (the figure stands upright, so world X bends forward and world Y turns aside). */
function rotateWorld(bone: Object3D, worldAxis: Vector3, angle: number, figureQ: Quaternion) {
  if (!angle) return;
  bone.parent!.getWorldQuaternion(parentQ);
  axis.copy(worldAxis).applyQuaternion(figureQ).applyQuaternion(parentQ.invert());
  bone.quaternion.premultiply(tmpQ.setFromAxisAngle(axis, angle));
  bone.updateMatrixWorld(true);
}

export type AvatarView = {
  /** Resolves with ms from mount to the first drawn frame. */
  firstFrame: Promise<number>;
  dispose: () => void;
};

/**
 * Draws `spec` into `canvas` until disposed. `still`: one fixed frame (no idle, no glances), redrawn only on input.
 * Orbit controls move the camera round the figure; it never moves by itself. The canvas may be resized: the view follows.
 */
export function mountAvatar(
  canvas: HTMLCanvasElement,
  spec: AvatarSpec,
  { still, stillAt = STILL_SECONDS, detail = false }: { still: boolean; stillAt?: number; detail?: boolean },
): AvatarView {
  const t0 = performance.now();
  performance.mark(AVATAR_REQUESTED);
  let disposed = false;
  let raf = 0;
  let onScreen = true;
  let resolveFirst!: (ms: number) => void;
  let rejectFirst!: (e: unknown) => void;
  const firstFrame = new Promise<number>((res, rej) => {
    resolveFirst = res;
    rejectFirst = rej;
  });

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  // Soft studio light: a warm sky over brown ground, a key from the front left, a warm rim from behind on the right.
  scene.add(new HemisphereLight(0xfff1dc, 0x4a3a28, 1.6));
  const key = new DirectionalLight(0xfff4e6, 2.0);
  key.position.set(-1.2, 2.2, 2.5);
  scene.add(key);
  const rim = new DirectionalLight(0xffa860, 3.2);
  rim.position.set(1.6, 1.8, -2.2);
  scene.add(rim);
  if (detail) {
    enableShadows(renderer, key, BODY_M * 0.5);
    scene.add(key.target);
  }

  // Lights keep their place relative to the viewer as the camera circles, so every side is lit like the front.
  const lightOffsets = [
    [key, key.position.clone()],
    [rim, rim.position.clone()],
  ] as const;

  const camera = new PerspectiveCamera(24, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.05, 20);
  // Framed for an adult whatever the age, so a child stands smaller in the card than a grown-up does.
  const fitDist = (BODY_M * 0.58) / Math.tan((camera.fov * Math.PI) / 360);
  const startTarget = new Vector3(0, BODY_M * 0.5, 0);
  const startOffset = new Vector3(0, BODY_M * 0.12, fitDist).applyAxisAngle(Y, START_AZIMUTH);
  camera.position.copy(startTarget).add(startOffset);
  camera.lookAt(startTarget);

  const figure = new Group(); // the person stands in this
  scene.add(figure);
  const shadow = blobShadow();
  shadow.scale.set(0.9 * spec.height, 0.6 * spec.height, 1);
  scene.add(shadow);

  let mixer: AnimationMixer | null = null;
  let bones = new Map<string, Bone>();
  let clipSeconds = 1;
  const disposables: { dispose: () => void }[] = [];

  // Orbit view: drag to circle the person, scroll or pinch to zoom (towards the cursor), right-drag or two fingers to
  // move, double-click to reset. Nothing moves it otherwise. Events stop at the canvas, so the map and the card under
  // it never see them.
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(startTarget);
  controls.minDistance = ORBIT.minDistance;
  controls.maxDistance = fitDist * ORBIT.maxDistanceScale;
  controls.minPolarAngle = ORBIT.minPolarAngle;
  controls.maxPolarAngle = ORBIT.maxPolarAngle;
  controls.rotateSpeed = ORBIT.rotateSpeed;
  controls.zoomSpeed = ORBIT.zoomSpeed;
  controls.panSpeed = ORBIT.panSpeed;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  // A still frame redraws only on input, so no coast to finish there.
  controls.enableDamping = !still;
  controls.dampingFactor = ORBIT.damping;
  controls.update();
  controls.saveState();

  const keepOnPerson = () => {
    const t = controls.target;
    const side = Math.hypot(t.x, t.z);
    if (side > ORBIT.targetSideM) t.multiplyScalar(ORBIT.targetSideM / side).setY(controls.target.y);
    t.y = Math.min(ORBIT.targetMaxY, Math.max(ORBIT.targetMinY, t.y));
  };
  const placeLights = () => {
    const azimuth = controls.getAzimuthalAngle();
    for (const [light, offset] of lightOffsets) light.position.copy(offset).applyAxisAngle(Y, azimuth);
  };
  const onChange = () => {
    keepOnPerson();
    placeLights();
    if (!mixer) return; // nothing to draw until the figure is built
    if (still) draw(performance.now());
    else wake();
  };
  const resetView = () => controls.reset();
  const stopHere = (e: Event) => e.stopPropagation();
  controls.addEventListener('change', onChange);
  canvas.addEventListener('dblclick', resetView);
  for (const type of ['pointerdown', 'wheel', 'click', 'contextmenu'] as const) canvas.addEventListener(type, stopHere);
  placeLights();

  // The canvas can change size (the card's figure opened large): keep the drawing sharp and unstretched.
  const resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (mixer && still) draw(performance.now());
  });
  resize.observe(canvas);

  const figureQ = new Quaternion();
  let shown = false;
  // Bones the pose adjusts after the clip (stoop, glances). three's mixer only writes a bone when its animated value
  // changes, so an adjustment left on a bone would pile up frame after frame: put each back to the clip's pose first.
  const loop = LOOPS[spec.loop];
  const workBones = new Set(Array.from({ length: 8 }, (_, i) => workPose(spec.loop, i * 0.37).map((t) => t.bone)).flat());
  const ADJUSTED = [...new Set(['spine_02', 'spine_03', 'neck_01', 'Head', ...workBones])];
  const clipPose = new Map<string, Quaternion>();
  function pose(seconds: number) {
    for (const [name, q] of clipPose) bones.get(name)?.quaternion.copy(q);
    if (mixer) {
      if (still) mixer.setTime(stillAt % clipSeconds);
      else mixer.setTime(((spec.phase * clipSeconds + seconds * spec.idleSpeed) % clipSeconds + clipSeconds) % clipSeconds);
    }
    for (const name of ADJUSTED) {
      const b = bones.get(name);
      if (b) clipPose.set(name, (clipPose.get(name) ?? new Quaternion()).copy(b.quaternion));
    }
    figure.updateMatrixWorld(true);
    figure.getWorldQuaternion(figureQ);
    const spine2 = bones.get('spine_02');
    const spine3 = bones.get('spine_03');
    const neck = bones.get('neck_01');
    const head = bones.get('Head');
    if (spec.stoop) {
      if (spine2) rotateWorld(spine2, X, spec.stoop * 0.45, figureQ);
      if (spine3) rotateWorld(spine3, X, spec.stoop * 0.35, figureQ);
      if (neck) rotateWorld(neck, X, spec.stoop * 0.2, figureQ);
      if (head) rotateWorld(head, X, -spec.stoop * 0.6, figureQ); // still looks ahead
    }
    // The work loop over the clip, faded in and out as work and rest alternate.
    // A still frame shows the work itself, not a rest from it.
    const t = still ? stillAt : seconds;
    const w = still ? 1 : workWeight(spec.loop, spec.workSeed, t);
    if (w > 0) for (const turn of workPose(spec.loop, t)) {
      const b = bones.get(turn.bone);
      if (b) rotateWorld(b, AXES[turn.axis], turn.angle * w, figureQ);
    }
    // Glances only while resting from work, or for loops that keep the head free.
    if (head && !still && (w < 0.05 || !loop.rests)) {
      const g = glanceAt(spec.turnSeed, seconds);
      rotateWorld(head, Y, g.yaw, figureQ);
      rotateWorld(head, X, g.pitch, figureQ);
    }
  }

  let last = 0;
  let clockStart = 0;
  let frames = 0;
  function draw(now: number) {
    pose((now - clockStart) / 1000);
    renderer.render(scene, camera);
    // A plain property, not an attribute (no style work): scripts/avatar-shots.mjs reads it to check the canvas pauses offscreen.
    (canvas as HTMLCanvasElement & { __avatarFrames?: number }).__avatarFrames = ++frames;
    if (!shown) {
      shown = true;
      performance.mark(AVATAR_FIRST_FRAME);
      resolveFirst(performance.now() - t0);
    }
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || !onScreen || document.hidden) return;
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS - 1) return;
    last = now;
    controls.update();
    draw(now);
  }
  function wake() {
    if (!raf && !disposed && onScreen && !document.hidden && !still && mixer) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    wake();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', wake);

  (async () => {
    const parts = await Promise.all([
      load(`body_${spec.body}`),
      load(`hair_${spec.hair}`),
      load('anims'),
      spec.beard ? load('hair_beard') : null,
      Promise.all(spec.pieces.map((p) => load(`piece_${p}_${spec.body}`))),
    ]);
    if (disposed) return;
    const [bodyFile, hairFile, animFile, beardFile, pieceFiles] = parts;
    // The large view's maps (avatarDetail.ts): named in the meshes' extras, fetched once a visit.
    const maps = detail ? await loadDetailMaps([bodyFile.scene, hairFile.scene, beardFile?.scene].flatMap((s) => (s ? collectMeshes(s) : []))) : new Map();
    if (disposed) return;
    /** A mesh's material, with its detail maps in the large view; says whether the shading now comes from a map. */
    const dress = (m: Mesh, roughness: number) => {
      const mat = material(roughness);
      m.material = mat;
      return detail ? applyDetail(m, mat, maps, SHADE_MAX) : { shadeFromMap: false, colourFromMap: false };
    };
    const body = cloneSkinned(bodyFile.scene);
    figure.add(body);
    body.traverse((o) => {
      if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    });
    const skin = linear(spec.skin);
    const garment = linear(spec.garment);
    const trim = linear(spec.trim);
    const hairColour = linear(spec.hairIsWrap ? spec.garment : spec.hairColour);
    const browColour = linear(spec.hairColour);
    const cloth = spec.outfit.material;
    body.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (m.name.startsWith('eyes')) {
        if (!dress(m, 0.3).colourFromMap) linearizeEyes(m);
      } else if (m.name.startsWith('brows')) {
        paint(m, browColour, null, null, dress(m, 0.9));
      } else {
        paint(m, skin, garment, trim, { face: spec.paint, ...dress(m, 0.72) });
        hideCovered(m, spec.pieces);
      }
      disposables.push(m.geometry, m.material as MeshStandardMaterial);
    });
    let bodyParent: Object3D = body;
    body.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh && o.name.startsWith('body') && o.parent) bodyParent = o.parent;
    });
    for (const [file, colour] of [[hairFile, hairColour], [beardFile, browColour]] as const) {
      if (!file) continue;
      for (const m of attachToSkeleton(cloneSkinned(file.scene), bones, bodyParent)) {
        paint(m, colour, null, null, dress(m, 0.85));
        disposables.push(m.geometry, m.material as MeshStandardMaterial);
      }
    }
    for (const file of pieceFiles)
      for (const m of attachToSkeleton(cloneSkinned(file.scene), bones, bodyParent)) {
        paint(m, garment, garment, trim, { grainAmount: GRAIN[cloth] });
        const mm = material(ROUGH[cloth]);
        mm.side = DoubleSide;
        if (detail) clothSurface(mm, cloth);
        m.material = mm;
        disposables.push(m.geometry, mm);
      }

    // Tools, ornaments, hair extras and a cap: placed in the bind pose, then fixed to their bones.
    const placed: Placed[] = [
      ...(spec.loop === 'shape' ? [potOnGround()] : toolProps(spec.tool)),
      ...wornProps({ ornaments: spec.ornaments, accent: spec.accent, hairExtra: spec.hairExtra, hairColour: spec.hairColour, cap: spec.outfit.head === 'cap', capColour: spec.garment }),
    ];
    body.updateMatrixWorld(true);
    const inBody = new Vector3();
    for (const { object, bone } of placed) {
      body.add(object);
      const b = bone ? bones.get(bone) : null;
      const ref = bone ? REF_BONES[bone] : null;
      if (b && ref) object.position.add(body.worldToLocal(b.getWorldPosition(inBody)).sub(new Vector3(...ref)));
      object.updateMatrixWorld(true);
      if (b) b.attach(object);
      object.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) disposables.push(m.geometry, m.material as MeshStandardMaterial);
      });
    }
    if (detail)
      figure.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
    body.scale.setScalar(spec.height);
    bones.get('Head')?.scale.setScalar(spec.headScale);

    mixer = new AnimationMixer(body);
    const clip = animFile.animations.find((a: AnimationClip) => a.name === loop.clip) ?? animFile.animations.find((a: AnimationClip) => a.name === 'idle') ?? animFile.animations[0];
    clipSeconds = clip.duration;
    mixer.clipAction(clip).play();
    clockStart = performance.now();
    draw(performance.now());
    wake();
  })().catch((e) => {
    if (!disposed) rejectFirst(e);
  });

  return {
    firstFrame,
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', wake);
      controls.removeEventListener('change', onChange);
      controls.dispose();
      canvas.removeEventListener('dblclick', resetView);
      for (const type of ['pointerdown', 'wheel', 'click', 'contextmenu'] as const) canvas.removeEventListener(type, stopHere);
      mixer?.stopAllAction();
      for (const d of disposables) d.dispose();
      (shadow.material as MeshBasicMaterial).map?.dispose();
      (shadow.material as MeshBasicMaterial).dispose();
      shadow.geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      bones = new Map();
    },
  };
}
