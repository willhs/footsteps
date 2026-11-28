#!/usr/bin/env node
// A contact sheet of the 3D person (`?avatar=3d`, docs/ops/avatar.md) across eras and places: the real viewer
// (avatarScene.ts) and the real spec (lib/avatarSpec.ts) for a dozen imagined people, without the map, so it is quick and
// repeatable. The atlas record for each place and era comes from prod's API (GET /api/anthropology), as the card would
// read it; `--offline` uses none.
//
//   pnpm --dir footstep-generator/avatar install && pnpm --dir footsteps-web install
//   node footstep-generator/avatar/sheet.mjs [out.webp] [--offline] [--at SECONDS] [--only id,id] [--scale 2] [--detail]
//
// `--detail` draws as the large view does (avatarDetail.ts: skin, hair and eye maps, cloth surfaces, soft shadows); use it
// with a big `--scale` (the large view is up to 720 px tall: `--scale 4.3`) to compare with and without.
// Writes the sheet (default docs/ops/avatar-sheet.webp) and prints each person's spec line. Still frames (`?still=1`'s
// pose, work at full strength) at `--at` seconds into the clip.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const WEB = path.join(REPO, 'footsteps-web');
const webRequire = createRequire(path.join(WEB, 'package.json'));
const { chromium } = webRequire('@playwright/test');
const sharp = (await import('sharp')).default;
const { serveStatic } = await import(pathToFileURL(path.join(WEB, 'scripts', 'static-server.mjs')).href);

const argv = process.argv.slice(2);
const out = path.resolve(argv[0] && !argv[0].startsWith('--') ? argv.shift() : path.join(REPO, 'docs', 'ops', 'avatar-sheet.webp'));
const opt = {};
for (let i = 0; i < argv.length; i++) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];

/** The people: [id, label, year, lat, lon, groupKind (0 band, 1 village, 2 camp), sex, age, role, other human]. */
const PEOPLE = [
  ['iceage', 'Ice Age Europe, 20,000 BCE', -20000, 48.9, 16.6, 0, 'm', 30, 'hunter'],
  ['eafrica', 'East Africa, 50,000 BCE', -50000, -1.3, 36.8, 0, 'f', 24, 'gatherer'],
  ['natufian', 'Natufian Levant, 11,000 BCE', -11000, 32.7, 35.0, 0, 'm', 34, 'toolmaker'],
  ['nile', 'Nile, 3000 BCE', -3000, 26.1, 32.6, 1, 'f', 25, 'farmer'],
  ['steppe', 'Bronze Age steppe, 2000 BCE', -2000, 52.6, 59.6, 2, 'm', 32, 'herder'],
  ['rome', 'Rome, 100 CE', 100, 41.9, 12.5, 1, 'm', 40, 'farmer'],
  ['han', 'Han China, 100 CE', 100, 34.6, 112.4, 1, 'f', 28, 'weaver'],
  ['andes', 'Andes, 1400 CE', 1400, -13.5, -72.0, 1, 'm', 30, 'herder'],
  ['meseta', 'Meseta, 1500 CE', 1500, 40.4, -3.7, 1, 'f', 35, 'potter'],
  ['child', 'Child, Bronze Age Denmark, 1400 BCE', -1400, 55.6, 9.1, 1, 'f', 8, 'child'],
  ['elder', 'Elder, central Mexico, 1200 CE', 1200, 19.4, -99.1, 1, 'm', 70, 'elder'],
  ['neanderthal', 'Neanderthal, Iberia, 60,000 BCE', -60000, 43.3, -3.0, 0, 'f', 26, 'toolmaker', 'neanderthals'],
].filter((p) => !opt.only || String(opt.only).split(',').includes(p[0]));

async function atlas(lat, lon, year) {
  if (opt.offline) return null;
  const y = Math.max(-100000, Math.min(1900, year));
  try {
    const res = await fetch(`https://footsteps.willhs.me/api/anthropology?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&year=${y}`, { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const people = [];
for (const [id, label, year, lat, lon, groupKind, sex, age, role, kindOfHuman] of PEOPLE) {
  people.push({
    id,
    label,
    year,
    rec: await atlas(lat, lon, year),
    person: { id: 1, position: [lon, lat], age, ageStructure: 'forager', female: sex === 'f', role, groupKind, groupPeople: 30, color: [0, 0, 0, 255], radius: 6, footwear: 0, gait: (Math.abs(lat * 7.13 + lon * 3.1) % 1) || 0.37, ...(kindOfHuman ? { kindOfHuman } : {}) },
  });
}

// The page: the real modules, bundled once.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-sheet-'));
const entry = path.join(work, 'entry.ts');
fs.writeFileSync(
  entry,
  `import { mountAvatar } from '@/components/footsteps/overlays/avatarScene';
import { avatarCaption, avatarSpec } from '@/lib/avatarSpec';
import { portraitLooks } from '@/lib/avatar';
const { people, at, scale, detail } = (window as any).__sheet;
const grid = document.getElementById('grid')!;
const frames: Promise<number>[] = [];
const specs: any[] = [];
for (const p of people) {
  const spec = avatarSpec(p.person, portraitLooks(p.person, p.year, p.person.position[1], p.rec), { year: p.year, rec: p.rec });
  specs.push({ id: p.id, ...spec });
  const cell = document.createElement('div');
  cell.className = 'cell';
  const canvas = document.createElement('canvas');
  canvas.style.width = 120 * scale + 'px';
  canvas.style.height = 168 * scale + 'px';
  cell.appendChild(canvas);
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.innerHTML = '<b>' + p.label + '</b><br>' + (p.person.female ? 'woman' : 'man').replace('woman', p.person.age < 13 ? 'girl' : 'woman').replace(/^man$/, p.person.age < 13 ? 'boy' : 'man') + ', ' + p.person.age + ', ' + p.person.role + '<br>' + avatarCaption(spec) + (spec.otherHuman ? '<br><i>Our species\\' body; theirs differed</i>' : '');
  cell.appendChild(cap);
  grid.appendChild(cell);
  frames.push(mountAvatar(canvas, spec, { still: true, stillAt: at, detail }).firstFrame);
}
(window as any).__specs = specs;
Promise.all(frames).then(() => ((window as any).__ready = true), (e) => ((window as any).__error = String(e)));
`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  outfile: path.join(work, 'sheet.js'),
  alias: { '@': WEB },
  nodePaths: [path.join(WEB, 'node_modules')],
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  logLevel: 'warning',
});
const scale = Number(opt.scale ?? 1.5);
fs.writeFileSync(
  path.join(work, 'index.html'),
  `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#1d1914;font:${11 * scale}px/1.3 system-ui,sans-serif;color:#d9cfbd}
#grid{display:grid;grid-template-columns:repeat(6,${120 * scale + 16}px);gap:${6 * scale}px;padding:${8 * scale}px}
.cell{padding:4px}canvas{display:block;border-radius:6px;background:radial-gradient(ellipse at 50% 35%,#3b3428 0%,#2a241d 70%)}
.cap{margin-top:4px;height:${92 * scale}px;overflow:hidden;color:#a89c88}.cap b{color:#e6dccb;font-weight:600}
</style><div id="grid"></div><script>window.__sheet=${JSON.stringify({ people, at: Number(opt.at ?? 2.5), scale, detail: !!opt.detail })}</script><script type="module" src="/sheet.js"></script>`,
);

const { server, base } = await serveStatic([work, path.join(WEB, 'public')]);
// Metal on a Mac; elsewhere (Linux, CI) headless Chromium's software WebGL.
const GPU_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: GPU_ARGS, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 6 * (120 * scale + 16) + 16 * scale + 40, height: 800 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.__ready || window.__error, undefined, { timeout: 60000 });
  const err = await page.evaluate(() => window.__error);
  if (err || errors.length) throw new Error(`sheet failed: ${err ?? ''} ${errors.join(' | ')}`);
  await page.waitForTimeout(300);
  for (const s of await page.evaluate(() => window.__specs))
    console.log(`${s.id.padEnd(12)} row ${s.wardrobeRow.padEnd(18)} ${s.outfit.material.padEnd(7)} [${s.pieces.join(' ')}] hair ${s.hair}${s.hairExtra ? '+' + s.hairExtra : ''} ${s.ornaments.join(',') || '-'}${s.paint ? ' paint' : ''} | ${s.tool} ${s.loop}`);
  const png = await page.locator('#grid').screenshot();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (out.endsWith('.png')) fs.writeFileSync(out, png);
  else await sharp(png).resize({ width: Math.round(6 * (120 * scale + 16) * 1.25) }).webp({ quality: 72, effort: 6 }).toFile(out);
  console.log(`${out} ${(fs.statSync(out).size / 1024).toFixed(0)} KiB`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
