// Small things the 3D person holds and wears (`?avatar=3d`, docs/ops/avatar.md): tools, ornaments, a cap, braids or a
// topknot, built from three.js primitives here (no files to fetch). Each is placed in the body's bind pose (metres, y up,
// facing +z, T-pose arms along x, right hand at x -0.71, 1.455 m up) and then fixed to a bone, so it moves with it.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Color, SRGBColorSpace, type BufferGeometry, type Object3D } from 'three';
import type { Tool } from '@/lib/avatarWork';
import type { Ornament } from '@/lib/wardrobe';

export type Placed = { object: Object3D; bone: string | null };

/**
 * Where the bones props hang from sit in the man's bind pose, which the positions here are written against. The viewer
 * moves each prop by its bone's offset from these on the body actually worn (the woman's is shorter).
 */
export const REF_BONES: Record<string, [number, number, number]> = {
  Head: [0, 1.6, -0.017],
  neck_01: [0, 1.52, -0.041],
  spine_03: [0, 1.311, 0.007],
  hand_r: [-0.706, 1.455, -0.065],
  hand_l: [0.706, 1.455, -0.065],
};

const mat = (css: string, roughness = 0.85, metalness = 0) => new MeshStandardMaterial({ color: new Color().setStyle(css, SRGBColorSpace), roughness, metalness });
const WOOD = '#7a5a3a';
const DARK_WOOD = '#5a4028';
const STONE = '#8d877c';
const FLINT = '#5d5a55';
const CLAY = '#a86a45';
const REED = '#b3925e';

function mesh(geo: BufferGeometry, m: MeshStandardMaterial, at: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const o = new Mesh(geo, m);
  o.position.set(...at);
  o.rotation.set(...rot);
  return o;
}
/** A pole along +z from `from` to `to` (metres), radius r. */
function pole(from: number, to: number, r: number, m: MeshStandardMaterial) {
  return mesh(new CylinderGeometry(r, r, to - from, 6), m, [0, 0, (from + to) / 2], [Math.PI / 2, 0, 0]);
}

/** Where a right-hand grip sits in the bind pose: the palm's middle, the fist closed round +z. */
export const GRIP_R: [number, number, number] = [-0.78, 1.43, -0.04];
export const GRIP_L: [number, number, number] = [0.78, 1.43, -0.04];

function inHand(g: Group, side: 'r' | 'l' = 'r'): Placed {
  g.position.set(...(side === 'r' ? GRIP_R : GRIP_L));
  return { object: g, bone: side === 'r' ? 'hand_r' : 'hand_l' };
}

/** Tools: each a group whose long axis is +z from the grip (the HOLD pose turns +z upright). */
export function toolProps(tool: Tool): Placed[] {
  const g = new Group();
  switch (tool) {
    case 'spear':
    case 'harpoon': {
      g.add(pole(-0.45, 1.35, 0.013, mat(WOOD)));
      if (tool === 'spear') g.add(mesh(new ConeGeometry(0.025, 0.13, 5), mat(FLINT, 0.6), [0, 0, 1.41], [Math.PI / 2, 0, 0]));
      else for (const s of [-1, 1]) g.add(mesh(new ConeGeometry(0.012, 0.1, 4), mat('#d9cfb8', 0.6), [0.015 * s, 0, 1.35], [Math.PI / 2, 0, -0.4 * s]));
      return [inHand(g)];
    }
    case 'staff':
      g.add(pole(-0.95, 0.45, 0.015, mat(DARK_WOOD)));
      return [inHand(g)];
    case 'crook':
      g.add(pole(-0.95, 0.55, 0.014, mat(DARK_WOOD)));
      g.add(mesh(new TorusGeometry(0.06, 0.013, 5, 10, Math.PI * 1.3), mat(DARK_WOOD), [0, 0.06, 0.55], [0, Math.PI / 2, 0]));
      return [inHand(g)];
    case 'digging-stick':
      g.add(pole(-0.85, 0.35, 0.013, mat(WOOD)));
      g.add(mesh(new ConeGeometry(0.013, 0.08, 5), mat(WOOD), [0, 0, -0.89], [-Math.PI / 2, 0, 0]));
      return [inHand(g)];
    case 'torch':
      g.add(pole(-0.12, 0.42, 0.016, mat(DARK_WOOD)));
      g.add(mesh(new SphereGeometry(0.045, 8, 6), new MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 1.6 }), [0, 0, 0.47]));
      return [inHand(g)];
    case 'sickle': {
      g.add(pole(-0.05, 0.1, 0.014, mat(WOOD)));
      g.add(mesh(new TorusGeometry(0.11, 0.008, 4, 12, Math.PI * 0.9), mat(FLINT, 0.5), [0, -0.11, 0.1], [0, Math.PI / 2, 0]));
      return [inHand(g)];
    }
    case 'hammerstone': {
      g.add(mesh(new SphereGeometry(0.045, 7, 5), mat(STONE, 0.95), [0, 0, 0.01]));
      const core = new Group();
      core.add(mesh(new SphereGeometry(0.06, 5, 4), mat(FLINT, 0.55)));
      core.scale.set(1, 0.7, 1.2);
      return [inHand(g), inHand(wrap(core), 'l')];
    }
    case 'scraper': {
      g.add(mesh(new BoxGeometry(0.05, 0.02, 0.07), mat(FLINT, 0.6)));
      const hide = mesh(new BoxGeometry(0.7, 0.01, 0.5), mat('#a8865e', 1), [0, 0.03, 0.5]);
      return [inHand(g), { object: hide, bone: null }];
    }
    case 'quern': {
      const q = new Group();
      q.add(mesh(new BoxGeometry(0.5, 0.1, 0.32), mat(STONE, 0.95), [0, 0.05, 0]));
      q.position.set(0, 0, 0.55);
      g.add(mesh(new BoxGeometry(0.16, 0.05, 0.09), mat(STONE, 0.95)));
      return [{ object: q, bone: null }, inHand(g)];
    }
    case 'spindle': {
      // the spindle hangs from the right hand; the distaff rests in the left arm
      g.add(mesh(new CylinderGeometry(0.006, 0.006, 0.28, 5), mat(WOOD), [0, -0.2, 0]));
      g.add(mesh(new CylinderGeometry(0.035, 0.035, 0.015, 10), mat(CLAY), [0, -0.28, 0]));
      g.add(mesh(new CylinderGeometry(0.0015, 0.0015, 0.1, 3), mat('#e2d6b8'), [0, -0.04, 0]));
      const distaff = new Group();
      distaff.add(pole(-0.2, 0.45, 0.01, mat(WOOD)));
      distaff.add(mesh(new SphereGeometry(0.06, 7, 5), mat('#e2d6b8', 1), [0, 0, 0.42]));
      return [inHand(g), inHand(wrap(distaff), 'l')];
    }
    case 'pot':
      return [{ object: potOnHead(mesh(new SphereGeometry(0.13, 10, 8), mat(CLAY, 0.9))), bone: 'Head' }];
    case 'basket':
      return [{ object: potOnHead(mesh(new CylinderGeometry(0.17, 0.12, 0.14, 10, 1, true), mat(REED, 1))), bone: 'Head' }];
    default:
      return [];
  }
}

function wrap(o: Object3D) {
  const g = new Group();
  g.add(o);
  return g;
}

/** A load on the head (a carrying pad under it), in the bind pose. */
function potOnHead(load: Mesh) {
  const g = new Group();
  load.position.set(0, 0.075, 0);
  g.add(load);
  g.add(mesh(new TorusGeometry(0.06, 0.02, 5, 10), mat('#7a5c3e', 1), [0, 0, 0], [Math.PI / 2, 0, 0]));
  g.position.set(0, 1.815, -0.02);
  return g;
}

/** A pot on the ground for the potter, between the hands. */
export function potOnGround(): Placed {
  return { object: mesh(new SphereGeometry(0.12, 10, 8), mat(CLAY, 0.9), [0, 0.12, 0.42]), bone: null };
}

/** Ornaments, hair extras and a cap, in the bind pose. */
export function wornProps({ ornaments, accent, hairExtra, hairColour, cap, capColour }: { ornaments: Ornament[]; accent: string; hairExtra: 'braids' | 'topknot' | null; hairColour: string; cap: boolean; capColour: string }): Placed[] {
  const out: Placed[] = [];
  const shiny = ['torc', 'pin', 'earrings'];
  for (const o of ornaments) {
    const m = mat(accent, shiny.includes(o) ? 0.35 : 0.7, shiny.includes(o) ? 0.6 : 0);
    if (o === 'beads' || o === 'shell-beads') {
      const g = new Group();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.add(mesh(new SphereGeometry(o === 'shell-beads' ? 0.011 : 0.009, 5, 4), m, [Math.sin(a) * 0.075, 1.505 - 0.03 * Math.max(0, Math.cos(a)), -0.02 + Math.cos(a) * 0.085]));
      }
      out.push({ object: g, bone: 'spine_03' });
    } else if (o === 'torc') out.push({ object: mesh(new TorusGeometry(0.075, 0.009, 6, 16, Math.PI * 1.8), m, [0, 1.53, -0.025], [Math.PI / 2 - 0.25, 0, Math.PI / 2 + 0.31]), bone: 'neck_01' });
    else if (o === 'pin') out.push({ object: mesh(new SphereGeometry(0.018, 6, 5), m, [0.11, 1.5, 0.07]), bone: 'spine_03' });
    else if (o === 'earrings') for (const s of [-1, 1]) out.push({ object: mesh(new TorusGeometry(0.012, 0.003, 4, 8), m, [0.078 * s, 1.655, -0.01], [0, Math.PI / 2, 0]), bone: 'Head' });
    else if (o === 'headband') out.push({ object: mesh(new TorusGeometry(0.093, 0.009, 5, 18), m, [0, 1.75, -0.012], [Math.PI / 2 + 0.12, 0, 0]), bone: 'Head' });
  }
  const hm = mat(hairColour, 0.9);
  if (hairExtra === 'topknot') out.push({ object: mesh(new SphereGeometry(0.045, 8, 6), hm, [0, 1.83, -0.04]), bone: 'Head' });
  if (hairExtra === 'braids')
    for (const s of [-1, 1]) {
      const g = new Group();
      for (let i = 0; i < 6; i++) g.add(mesh(new SphereGeometry(0.019 - i * 0.0012, 6, 4), hm, [0.075 * s, 1.66 - i * 0.04, -0.035 - i * 0.004]));
      out.push({ object: g, bone: 'Head' });
    }
  if (cap) out.push({ object: mesh(new ConeGeometry(0.1, 0.16, 12), mat(capColour, 0.95), [0, 1.82, -0.025], [-0.15, 0, 0]), bone: 'Head' });
  return out;
}
