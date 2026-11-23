#!/usr/bin/env node
// Draws public/trees/atlas.webp: 6 tree kinds (columns) x 3 variants (rows), 128x192 cells, trunk base at (64, 184).
// Deterministic (seeded) procedural SVG rendered by sharp; no paid image service. Run from footsteps-web:
//   node scripts/tree-atlas.mjs
// Crowns are many small leaf clusters inside a few lumps. Each cluster is lit as a point on the lump's sphere by a sun to the
// upper left and towards the viewer, drawn back to front, over a dark interior: lit top-left, shaded underside, soft ragged edge.
// Column order must match TREE_KINDS in lib/trees.ts.
import sharp from 'sharp';
import fs from 'node:fs/promises';

const KINDS = ['conifer', 'broadleaf', 'palm', 'acacia', 'shrub', 'dead'];
const W = 128, H = 192, BASE_X = 64, BASE_Y = 184;
const SUN = (() => { const v = [-0.55, -0.65, 0.52]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
const LEAF = { conifer: [44, 72, 55], broadleaf: [66, 96, 46], palm: [78, 104, 52], acacia: [92, 102, 50], shrub: [74, 92, 50] };
const BARK = '#5b5144';

let seed = 1;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const rgb = (c, k) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;

function drawCell(kind) {
  const back = []; // bark first, then leaves sorted by depth
  const leaves = [];
  const limb = (x, y, a, b, w) =>
    back.push(`<path d="M${x.toFixed(1)},${y.toFixed(1)} L${a.toFixed(1)},${b.toFixed(1)}" stroke="${BARK}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  /** A lump of foliage: an ellipsoid of leaf clusters. */
  const lump = (cx, cy, rx, ry, count, base, size = 1) => {
    // Interior shadow, so gaps between clusters read as depth rather than holes.
    back.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.78}" ry="${ry * 0.78}" fill="${rgb(base, 0.42)}"/>`);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * (0.75 + 0.3 * random());
      const nx = Math.cos(a) * r, ny = Math.sin(a) * r;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r) ** 2));
      const lambert = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
      const k = 0.5 + 0.75 * lambert + 0.12 * (random() - 0.5);
      const px = clamp(cx + nx * rx, 3, W - 3), py = clamp(cy + ny * ry, 3, BASE_Y);
      const s = size * (1.4 + random() * 2.2);
      leaves.push({ z: nz + random() * 0.15, svg: `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(s * 1.2).toFixed(2)}" ry="${s.toFixed(2)}" transform="rotate(${Math.round(random() * 180)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="${rgb(base, k)}"/>` });
    }
  };
  const lean = (random() - 0.5) * 6;

  if (kind === 'conifer') {
    // Narrow spire of drooping whorls: widest near the base of the crown.
    const top = 10 + random() * 8, bottom = 150 + random() * 10;
    limb(BASE_X, BASE_Y, BASE_X + lean, top + 10, 3.5);
    for (let y = bottom; y > top; y -= 6 + random() * 2) {
      const u = (y - top) / (bottom - top);
      const half = 4 + u * (32 + random() * 6);
      const x = BASE_X + lean * (1 - (y - top) / (BASE_Y - top));
      lump(x, y, half, 5 + u * 3, Math.round(30 + half * 2.4), LEAF.conifer, 0.8);
    }
  } else if (kind === 'broadleaf') {
    // Rounded, billowing crown of several lumps on a short trunk that forks.
    const crownY = 56 + random() * 10, fork = crownY + 40;
    limb(BASE_X, BASE_Y, BASE_X + lean, fork, 5);
    for (let j = 0; j < 4; j++) limb(BASE_X + lean, fork, BASE_X + lean + (j - 1.5) * 16, crownY + 10, 2.5);
    const lumps = [[0, 4, 44, 38], [-30, 22, 26, 26], [30, 20, 27, 26], [-12, -24, 28, 24], [15, -20, 27, 24], [0, 32, 30, 18]];
    for (const [dx, dy, rx, ry] of lumps)
      lump(BASE_X + lean + dx + (random() - 0.5) * 6, crownY + dy + (random() - 0.5) * 6, rx * (0.9 + random() * 0.15), ry * (0.9 + random() * 0.15), Math.round(rx * ry * 0.55), LEAF.broadleaf);
  } else if (kind === 'palm') {
    // Tall slender curving stem; a rosette of arching fronds.
    const headX = BASE_X + lean * 2.5, headY = 34 + random() * 8;
    for (let k = 0; k < 12; k++) {
      const u0 = k / 12, u1 = (k + 1) / 12;
      const x = (u) => BASE_X + (headX - BASE_X) * u * u, y = (u) => BASE_Y + (headY - BASE_Y) * u;
      limb(x(u0), y(u0), x(u1), y(u1), 4.2 - u0 * 1.4);
    }
    for (let j = 0; j < 13; j++) {
      const a = (j / 13) * Math.PI * 2 + random() * 0.3, reach = 46 + random() * 10;
      let px = headX, py = headY;
      for (let k = 1; k <= 14; k++) {
        const u = k / 14;
        const nx = headX + Math.cos(a) * reach * u, ny = headY + Math.sin(a) * reach * 0.35 * u - 14 * u + 34 * u * u;
        limb(px, py, nx, ny, 0.9);
        lump(nx, ny + 1, 4 * (1 - u) + 2, 3 * (1 - u) + 1.5, 6, LEAF.palm, 0.55);
        px = nx; py = ny;
      }
    }
  } else if (kind === 'acacia') {
    // Umbrella thorn: limbs diverging from low down to a wide, flat, thin crown.
    const crownY = 40 + random() * 10, fork = 118 + random() * 12;
    limb(BASE_X, BASE_Y, BASE_X + lean, fork, 4);
    const tips = [-44, -22, 0, 22, 44].map((d) => d + (random() - 0.5) * 8);
    for (const d of tips) {
      const mx = BASE_X + lean + d * 0.45, my = (fork + crownY) / 2 + 10;
      limb(BASE_X + lean, fork, mx, my, 2.4);
      limb(mx, my, BASE_X + lean + d, crownY + 6, 1.6);
    }
    for (const d of tips) lump(BASE_X + lean + d, crownY + (random() - 0.5) * 4, 22 + random() * 4, 10 + random() * 3, 120, LEAF.acacia, 0.9);
  } else if (kind === 'shrub') {
    // Multi-stemmed bush from the ground, wider than tall.
    for (let j = 0; j < 5; j++) limb(BASE_X + (j - 2) * 3, BASE_Y, BASE_X + (j - 2) * 14, 130, 1.8);
    const lumps = [[0, 112, 40, 36], [-30, 138, 26, 30], [30, 136, 27, 30], [-12, 88, 26, 22], [14, 92, 26, 22]];
    for (const [dx, cy, rx, ry] of lumps)
      lump(BASE_X + dx + (random() - 0.5) * 6, cy + (random() - 0.5) * 6, rx, ry, Math.round(rx * ry * 0.5), LEAF.shrub);
  } else {
    // Dead snag: bare forking limbs, some broken.
    const branch = (x, y, length, angle, depth, width) => {
      const nx = x + Math.cos(angle) * length, ny = y + Math.sin(angle) * length;
      limb(x, y, nx, ny, width);
      if (depth === 0 || random() < 0.12) return;
      branch(nx, ny, length * (0.62 + random() * 0.12), angle - 0.35 - random() * 0.35, depth - 1, width * 0.62);
      branch(nx, ny, length * (0.62 + random() * 0.12), angle + 0.35 + random() * 0.35, depth - 1, width * 0.62);
    };
    limb(BASE_X, BASE_Y, BASE_X + lean, 96, 5);
    limb(BASE_X + lean, 96, BASE_X + lean * 1.5, 18 + random() * 10, 3);
    for (let j = 0; j < 4; j++) branch(BASE_X + lean, 120 - j * 22, 24 - j * 3, -Math.PI / 2 + (j % 2 ? 0.75 : -0.75), 2, 2.2);
  }
  leaves.sort((a, b) => a.z - b.z);
  return [...back, ...leaves.map((l) => l.svg)].join('');
}

const cells = [];
for (let row = 0; row < 3; row++)
  for (let col = 0; col < KINDS.length; col++) {
    seed = 19 + row * 101 + col * 7919;
    cells.push(`<svg x="${col * W}" y="${row * H}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">${drawCell(KINDS[col])}</svg>`);
  }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * KINDS.length}" height="${H * 3}">${cells.join('')}</svg>`;
await fs.mkdir('public/trees', { recursive: true });
// Supersampled then reduced: soft anti-aliased edges in the alpha channel.
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * KINDS.length, H * 3)
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile('public/trees/atlas.webp');
console.log('public/trees/atlas.webp', (await fs.stat('public/trees/atlas.webp')).size, 'bytes');
