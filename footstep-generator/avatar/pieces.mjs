// Garment pieces for the 3D person (docs/ops/avatar.md, footsteps-web/lib/wardrobe.ts `PIECE_FILES`), made from each body
// in its bind pose (metres, y up, facing +z, T-pose arms along x at y ~1.455, 1.81 m tall):
//
//   shells  fitted parts (tops, trousers, hood): the body's own triangles inside a region, pushed out along their normals.
//           They bend exactly as the body does. The body triangles they cover are hidden at runtime (`_COVER` bits), so
//           skin never pokes through.
//   lathes  hanging parts (skirts, string skirt, cape, cloak): rings round the body from a top height to a hem, wide
//           enough at each height to clear the body, flaring as they fall. Skinned by copying the nearest body vertex's
//           weights, blended with the pelvis below the hips so a skirt does not split between the legs.
//
// Every piece's COLOR_0 = (shade / SHADE_MAX, 1, trim) as the bodies use it: the viewer paints garment and trim colours.

export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const band = (v, v0, w) => Math.max(0, 1 - Math.abs(v - v0) / w);

// ---- regions (bind pose). `e` insets the region (for what a piece covers on the body, so its edge never shows a gap).
const torso = ([x, y], e = 0, bottom = 0.9) => {
  const ax = Math.abs(x);
  const t = smooth(bottom + e, bottom + 0.05 + e, y) * (1 - smooth(1.62 - e, 1.68 - e, y)) * (1 - smooth(0.2 - e, 0.25 - e, ax));
  const neck = smooth(1.4, 1.46, y) * (1 - smooth(0.07 + e, 0.11 + e, ax));
  return t * (1 - neck);
};
const sleeve = ([x, y], to, e = 0) => {
  const ax = Math.abs(x);
  return smooth(0.17 + e, 0.21 + e, ax) * (1 - smooth(to - 0.02 - e, to + 0.02 - e, ax)) * smooth(1.28 + e, 1.32 + e, y) * (1 - smooth(1.6 - e, 1.64 - e, y));
};
const legs = ([x, y], e = 0) => smooth(0.1 + e, 0.14 + e, y) * (1 - smooth(1.0 - e, 1.06 - e, y)) * (1 - smooth(0.26 - e, 0.3 - e, Math.abs(x)));
const head = ([x, y, z], e = 0) => {
  const ax = Math.abs(x);
  const face = smooth(-0.01, 0.03, z) * (1 - smooth(1.78, 1.8, y)) * (1 - smooth(0.06, 0.08, ax)) * smooth(1.55, 1.58, y);
  const skull = smooth(1.58 + e, 1.62 + e, y);
  const collar = smooth(1.44 + e, 1.48 + e, y) * (1 - smooth(0.16 - e, 0.2 - e, ax)) * (1 - smooth(1.55, 1.6, y));
  return Math.max(skull, collar) * (1 - face) * (ax < 0.3 ? 1 : 0);
};
/** A band from the left shoulder across the chest and back to the right hip, over the left upper arm: a toga or shawl. */
const drapeBand = ([x, y], e = 0) => {
  const line = 0.95 + 1.82 * (x + 0.18);
  const across = (1 - smooth(0.1 - e, 0.16 - e, Math.abs(y - line))) * torso([x, y], e, 0.85);
  const shoulder = smooth(0.16, 0.2, x) * (1 - smooth(0.3, 0.34, x)) * smooth(1.3, 1.34, y) * (1 - smooth(1.6, 1.64, y));
  return Math.max(across, shoulder);
};

/** A trim band where the region ends: hem, cuffs and neck, so cloth the colour of skin still reads as cloth. */
const edgeTrim = (inner) => (p) => {
  const m = inner(p);
  return m > 0.98 ? 0 : 1 - m;
};

export const SHELLS = {
  vest: { bit: 1, mask: (p, e) => torso(p, e), push: (y) => 0.012 + 0.012 * (1 - smooth(0.95, 1.2, y)), trim: edgeTrim((p) => torso(p, 0.035)) },
  shortsleeve: { bit: 2, mask: (p, e) => Math.max(torso(p, e), sleeve(p, 0.36, e)), push: (y) => 0.012 + 0.012 * (1 - smooth(0.95, 1.2, y)), trim: edgeTrim((p) => Math.max(torso(p, 0.035), sleeve(p, 0.36, 0.035))) },
  longsleeve: { bit: 4, mask: (p, e) => Math.max(torso(p, e, 0.86), sleeve(p, 0.68, e)), push: (y) => 0.02 + 0.015 * (1 - smooth(0.95, 1.2, y)), trim: edgeTrim((p) => Math.max(torso(p, 0.035, 0.86), sleeve(p, 0.68, 0.035))) },
  trousers: { bit: 8, mask: (p, e) => legs(p, e), push: () => 0.014, trim: (p) => band(p[1], 0.13, 0.035) },
  hood: { bit: 16, mask: (p, e) => head(p, e), push: (y) => (y > 1.56 ? 0.035 : 0.025), trim: ([, y, z]) => smooth(-0.045, -0.005, z) * smooth(1.55, 1.6, y) }, // a ruff round the face
  drape: { bit: 0, mask: (p, e) => drapeBand(p, e), push: () => 0.03, trim: edgeTrim((p) => drapeBand(p, 0.04)) },
};

/** Hanging pieces: top and hem heights, the front opening (radians either side of +z left open), flare per metre of drop. */
export const LATHES = {
  loin: { top: 1.02, hem: 0.84, open: 0, flare: 0.05, margin: 0.012, trim: 'hem' },
  skirt_short: { top: 1.0, hem: 0.66, open: 0, flare: 0.12, margin: 0.014, trim: 'hem' },
  skirt_knee: { top: 1.0, hem: 0.46, open: 0, flare: 0.16, margin: 0.014, trim: 'hem' },
  skirt_long: { top: 1.0, hem: 0.07, open: 0, flare: 0.16, margin: 0.014, trim: 'hem' },
  strings: { top: 1.0, hem: 0.56, open: 0, flare: 0.1, margin: 0.014, trim: 'strings' },
  cape: { top: 1.53, hem: 1.0, open: 0.75, flare: 0.1, margin: 0.015, trim: 'hem', shoulders: true },
  cloak: { top: 1.53, hem: 0.42, open: 0.6, flare: 0.1, margin: 0.02, trim: 'hem', shoulders: true },
};

/** Body data the pieces are made from (one primitive, bind pose). */
export function bodyData(prim) {
  const pos = prim.getAttribute('POSITION');
  const n = pos.getCount();
  const P = Array.from({ length: n }, (_, i) => pos.getElement(i, []));
  const N = Array.from({ length: n }, (_, i) => prim.getAttribute('NORMAL').getElement(i, []));
  const J = Array.from({ length: n }, (_, i) => prim.getAttribute('JOINTS_0').getElement(i, []));
  const W = Array.from({ length: n }, (_, i) => prim.getAttribute('WEIGHTS_0').getElement(i, []));
  const C = Array.from({ length: n }, (_, i) => prim.getAttribute('COLOR_0').getElement(i, []));
  return { n, P, N, J, W, C, idx: prim.getIndices().getArray() };
}

/** Bits of the shells that cover each body vertex well inside their region (inset), for hiding covered skin. */
export function coverBits(body) {
  const out = new Uint16Array(body.n);
  for (let i = 0; i < body.n; i++) for (const s of Object.values(SHELLS)) if (s.bit && s.mask(body.P[i], 0.03) > 0.95) out[i] |= s.bit;
  return out;
}

const SHADE_MAX = 1.5;

export function shellGeometry(body, spec) {
  const keep = [];
  const inside = (i) => spec.mask(body.P[i], 0) > 0.5;
  for (let t = 0; t < body.idx.length; t += 3) if (inside(body.idx[t]) && inside(body.idx[t + 1]) && inside(body.idx[t + 2])) keep.push(body.idx[t], body.idx[t + 1], body.idx[t + 2]);
  const remap = new Map();
  for (const i of keep) if (!remap.has(i)) remap.set(i, remap.size);
  const n = remap.size;
  const g = { POSITION: new Float32Array(n * 3), NORMAL: new Float32Array(n * 3), COLOR_0: new Float32Array(n * 3), JOINTS_0: new Uint16Array(n * 4), WEIGHTS_0: new Float32Array(n * 4), indices: new Uint32Array(keep.map((i) => remap.get(i))) };
  for (const [src, dst] of remap) {
    const p = body.P[src];
    const v = body.N[src];
    const push = spec.push(p[1]);
    for (let k = 0; k < 3; k++) {
      g.POSITION[dst * 3 + k] = p[k] + v[k] * push;
      g.NORMAL[dst * 3 + k] = v[k];
    }
    // Cloth: most of the body's painted muscle shading gone.
    const shade = 1 + (body.C[src][0] * SHADE_MAX - 1) * 0.3;
    g.COLOR_0.set([shade / SHADE_MAX, 1, Math.min(1, spec.trim(p))], dst * 3);
    g.JOINTS_0.set(body.J[src], dst * 4);
    g.WEIGHTS_0.set(body.W[src], dst * 4);
  }
  return { geo: g, vertices: n, triangles: keep.length / 3 };
}

const SEG = 36;

/** The body's reach in each of SEG directions round (0, zc) at height y: how far out a ring must be to clear it. */
function reachAt(body, y, zc, { shoulders }) {
  const r = new Float32Array(SEG).fill(0.05);
  for (let i = 0; i < body.n; i++) {
    const [x, vy, z] = body.P[i];
    if (Math.abs(vy - y) > 0.035) continue;
    // The T-pose arms are not in the way of a cape: hanging, they are at the shoulders' width.
    if (Math.abs(x) > (shoulders ? 0.24 : 0.3)) continue;
    const a = Math.atan2(x, z - zc);
    const d = Math.hypot(x, z - zc);
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2 - Math.PI;
      const diff = Math.abs(((a - th + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 0.35) r[s] = Math.max(r[s], d * Math.cos(diff));
    }
  }
  return r;
}

/** A hanging piece: rings from `top` down to `hem`, never narrower than the ring above, flaring as it falls. */
export function latheGeometry(body, spec, { pelvisJoint, jointIndex }) {
  const rows = Math.max(4, Math.round((spec.top - spec.hem) / 0.035));
  const zc = -0.03;
  const verts = [];
  let prev = null;
  const ringAngles = [];
  for (let s = 0; s <= SEG; s++) {
    const th = (s / SEG) * Math.PI * 2 - Math.PI; // -π..π, 0 = front (+z)
    ringAngles.push(th);
  }
  // Leave the front open for capes and cloaks: angles within `open` of the front are skipped.
  const arc = spec.open ? ringAngles.filter((th) => Math.abs(th) >= spec.open) : ringAngles;
  const backFirst = spec.open ? [...arc.filter((t) => t > 0), ...arc.filter((t) => t < 0)] : arc; // one continuous strip round the back
  for (let r = 0; r <= rows; r++) {
    const y = spec.top + (spec.hem - spec.top) * (r / rows);
    const reach = reachAt(body, y, zc, spec);
    const drop = spec.top - y;
    const ring = backFirst.map((th) => {
      const s = Math.min(SEG - 1, Math.max(0, Math.round(((th + Math.PI) / (Math.PI * 2)) * SEG) % SEG));
      // Smooth across neighbours so a ring is not jagged.
      const near = [-2, -1, 0, 1, 2].map((k) => reach[(s + k + SEG) % SEG]);
      let rad = Math.max(...near) + spec.margin + spec.flare * drop;
      if (spec.shoulders) rad += 0.03 * Math.abs(Math.sin(th)); // clear the hanging arms
      return rad;
    });
    if (prev) for (let k = 0; k < ring.length; k++) ring[k] = Math.max(ring[k], prev[k] + (spec.shoulders ? 0 : 0.0));
    // Capes come in at the top towards the neck.
    const neckIn = spec.shoulders ? smooth(0, 0.08, drop) : 1;
    ring.forEach((rad, k) => {
      const th = backFirst[k];
      const rr = spec.shoulders ? 0.09 + (rad - 0.09) * neckIn : rad;
      const yy = spec.shoulders ? y - 0.02 * (1 - neckIn) : y;
      verts.push({ p: [Math.sin(th) * rr, yy, zc + Math.cos(th) * rr], th, r, rows, drop });
    });
    prev = ring;
  }
  const cols = backFirst.length;
  const idx = [];
  const wrap = !spec.open;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols - 1 + (wrap ? 0 : 0); k++) {
      const a = r * cols + k;
      const b = r * cols + k + 1;
      const c = (r + 1) * cols + k;
      const d = (r + 1) * cols + k + 1;
      idx.push(a, c, b, b, c, d);
    }
  const n = verts.length;
  const g = { POSITION: new Float32Array(n * 3), NORMAL: new Float32Array(n * 3), COLOR_0: new Float32Array(n * 3), JOINTS_0: new Uint16Array(n * 4), WEIGHTS_0: new Float32Array(n * 4), indices: new Uint32Array(idx) };
  verts.forEach(({ p, th, r, rows, drop }, i) => {
    g.POSITION.set(p, i * 3);
    g.NORMAL.set([Math.sin(th), 0.15, Math.cos(th)].map((v, k, a) => v / Math.hypot(...a)), i * 3);
    // Weights: the nearest body vertex's (feet and calves count as the thigh), blended with the pelvis below the hips.
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < body.n; j++) {
      const q = body.P[j];
      if (Math.abs(q[0]) > 0.3 && q[1] > 1.2) continue; // not the arms
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    const w = new Map();
    const pelvisShare = p[1] < 0.98 ? 0.55 : spec.shoulders ? 0 : 0.3;
    for (let k = 0; k < 4; k++) {
      const wt = body.W[best][k];
      if (!wt) continue;
      const joint = jointIndex.toThigh(body.J[best][k]);
      w.set(joint, (w.get(joint) ?? 0) + wt * (1 - pelvisShare));
    }
    if (pelvisShare) w.set(pelvisJoint, (w.get(pelvisJoint) ?? 0) + pelvisShare);
    const top4 = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top4.reduce((a, [, v]) => a + v, 0);
    top4.forEach(([j, v], k) => {
      g.JOINTS_0[i * 4 + k] = j;
      g.WEIGHTS_0[i * 4 + k] = v / sum;
    });
    // Trim: a hem band, a waist band for skirts, or the strands of a string skirt.
    const rowT = r / rows;
    let trim = 0;
    if (spec.trim === 'hem') trim = Math.max(band(rowT, 1, 0.12 * (8 / rows) + 0.05), spec.shoulders ? 0 : band(rowT, 0, 0.1));
    if (spec.trim === 'strings') trim = rowT < 0.15 ? 1 : Math.round((th / (Math.PI * 2)) * 40) % 2 === 0 ? 0.85 : 0;
    let shade = 0.92 + 0.08 * Math.cos(th * 9 + drop * 3) * smooth(0, 0.2, drop); // a hint of folds
    if (spec.trim === 'strings' && rowT >= 0.15 && trim === 0) shade = 0.55; // the gaps between strands, in shadow
    g.COLOR_0.set([shade / SHADE_MAX, 1, trim], i * 3);
  });
  return { geo: g, vertices: n, triangles: idx.length / 3 };
}
