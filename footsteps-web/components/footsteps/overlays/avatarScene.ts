// The 3D figure in the person card (`?avatar=3d`, docs/ops/avatar.md): three.js, loaded only with the flag (never in the
// first load: overlays/avatarLazy.ts). One small WebGL canvas per open card; it draws only while on screen and the tab is
// visible, at most 30 frames a second, and gives its GPU context back when the card closes.
//
// Assets come from public/avatar/ (footstep-generator/avatar/build.mjs): a body per sex, a hair mesh per style, and the
// clips on the same 65-joint skeleton. Bodies carry COLOR_0 = (shade / SHADE_MAX, garment, 0); this file turns that into
// the person's skin and garment colours on the CPU, so there are no textures to fetch.
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
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarSpec } from '@/lib/avatarSpec';
import { STILL_SECONDS } from '@/lib/still';

/** Where the build writes the files, and its shade encoding (build.mjs `SHADE_MAX`). */
const BASE = '/avatar/';
const SHADE_MAX = 1.5;
/** The adult bodies are about this tall (m) in the bind pose. */
const BODY_M = 1.8;
const FRAME_MS = 1000 / 30;

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

/** Per-vertex colour for one person: skin, garment or trim by the baked masks, times the baked shading. */
function paint(mesh: Mesh, base: Color, garment: Color | null, trim: Color | null = null) {
  const geo = mesh.geometry.clone();
  mesh.geometry = geo;
  const src = geo.getAttribute('color') as BufferAttribute | undefined;
  const n = geo.getAttribute('position').count;
  const out = new Float32Array(n * 3);
  const c = new Color();
  for (let i = 0; i < n; i++) {
    const shade = src ? src.getX(i) * SHADE_MAX : 1;
    const g = garment && src ? src.getY(i) : 0;
    // Cloth is flat: the painted muscle shading fades out under the garment.
    const s = shade + (1 - shade) * g * 0.75;
    c.copy(base);
    if (garment && g > 0) c.lerp(garment, g);
    const t = trim && src ? src.getZ(i) : 0;
    if (trim && t > 0) c.lerp(trim, t);
    out[i * 3] = c.r * s;
    out[i * 3 + 1] = c.g * s;
    out[i * 3 + 2] = c.b * s;
  }
  geo.setAttribute('color', new Float32BufferAttribute(out, 3));
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
 * Draws `spec` into `canvas` until disposed. `still`: one fixed frame (no idle, no glances), redrawn only when dragged.
 * Drag (pointer) turns the figure; it never turns by itself.
 */
export function mountAvatar(canvas: HTMLCanvasElement, spec: AvatarSpec, { still }: { still: boolean }): AvatarView {
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

  const camera = new PerspectiveCamera(24, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 20);
  // Framed for an adult whatever the age, so a child stands smaller in the card than a grown-up does.
  const fitDist = (BODY_M * 0.58) / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(0, BODY_M * 0.62, fitDist);
  camera.lookAt(0, BODY_M * 0.5, 0);

  const figure = new Group(); // the person stands in this; drag turns it
  figure.rotation.y = -0.35; // a three-quarter view to begin with
  scene.add(figure);
  const shadow = blobShadow();
  shadow.scale.set(0.9 * spec.height, 0.6 * spec.height, 1);
  scene.add(shadow);

  let mixer: AnimationMixer | null = null;
  let bones = new Map<string, Bone>();
  let clipSeconds = 1;
  const disposables: { dispose: () => void }[] = [];

  // Drag to turn, with a little coast after letting go; nothing turns it otherwise.
  let dragging = false;
  let lastX = 0;
  let spin = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    spin = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    figure.rotation.y += dx * 0.012;
    spin = dx * 0.012;
    if (still) draw(performance.now());
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (still) spin = 0;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const figureQ = new Quaternion();
  let shown = false;
  // Bones the pose adjusts after the clip (stoop, glances). three's mixer only writes a bone when its animated value
  // changes, so an adjustment left on a bone would pile up frame after frame: put each back to the clip's pose first.
  const ADJUSTED = ['spine_02', 'spine_03', 'neck_01', 'Head'];
  const clipPose = new Map<string, Quaternion>();
  function pose(seconds: number) {
    for (const [name, q] of clipPose) bones.get(name)?.quaternion.copy(q);
    if (mixer) {
      if (still) mixer.setTime(STILL_SECONDS % clipSeconds);
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
    if (head && !still) {
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
    if (!dragging && spin) {
      figure.rotation.y += spin;
      spin *= 0.9;
      if (Math.abs(spin) < 1e-4) spin = 0;
    }
    draw(now);
  }
  const wake = () => {
    if (!raf && !disposed && onScreen && !document.hidden && !still && mixer) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    wake();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', wake);

  (async () => {
    const parts = await Promise.all([load(`body_${spec.body}`), load(`hair_${spec.hair}`), load('anims'), spec.beard ? load('hair_beard') : null]);
    if (disposed) return;
    const [bodyFile, hairFile, animFile, beardFile] = parts;
    const body = cloneSkinned(bodyFile.scene);
    figure.add(body);
    body.traverse((o) => {
      if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    });
    const skin = linear(spec.skin);
    const garment = linear(spec.garment);
    const hairColour = linear(spec.hairIsWrap ? spec.trim : spec.hairColour);
    const browColour = linear(spec.hairColour);
    body.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (m.name.startsWith('eyes')) {
        linearizeEyes(m);
        m.material = material(0.3);
      } else if (m.name.startsWith('garment')) {
        paint(m, garment, null, linear(spec.trim));
        m.material = material(0.95);
        (m.material as MeshStandardMaterial).side = DoubleSide;
      } else if (m.name.startsWith('brows')) {
        paint(m, browColour, null);
        m.material = material(0.9);
      } else {
        paint(m, skin, garment, linear(spec.trim));
        m.material = material(0.72);
      }
      disposables.push(m.geometry, m.material as MeshStandardMaterial);
    });
    for (const [file, colour] of [[hairFile, hairColour], [beardFile, browColour]] as const) {
      if (!file) continue;
      let bodyParent: Object3D = body;
      body.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh && o.name.startsWith('body') && o.parent) bodyParent = o.parent;
      });
      for (const m of attachToSkeleton(cloneSkinned(file.scene), bones, bodyParent)) {
        paint(m, colour, null);
        m.material = material(0.85);
        disposables.push(m.geometry, m.material as MeshStandardMaterial);
      }
    }
    body.scale.setScalar(spec.height);
    bones.get('Head')?.scale.setScalar(spec.headScale);

    mixer = new AnimationMixer(body);
    const idle = animFile.animations.find((a: AnimationClip) => a.name === 'idle') ?? animFile.animations[0];
    clipSeconds = idle.duration;
    mixer.clipAction(idle).play();
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
      document.removeEventListener('visibilitychange', wake);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
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
