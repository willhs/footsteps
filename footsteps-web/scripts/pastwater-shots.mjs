// Real-data screenshots of the past-water scenarios (`?pastwater=1`), each scene flag off and on (docs/ops/past-water.md).
//   pnpm build && node scripts/pastwater-shots.mjs [--out DIR] [--scenes id,id] [--data DIR]
// Serves `out/` with the real data (as scripts/visual.mjs does: this checkout's data/tiles, or the primary checkout's from a worktree),
// plus this checkout's own data/tiles/terrain/pastwater (`terrain_image.py --pastwater`), which answers /terrain/pastwater/ first.
// Writes {id}_off.png, {id}_on.png and notes.json (the past-water note's label and title per shot).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = [
  { id: 'po-20000', year: -20000, lat: 45.0, lon: 12.5, zoom: 6 }, // LGM: the Po across the dry Adriatic shelf (fresh water, not wet)
  { id: 'caspian-20000', year: -20000, lat: 46.5, lon: 50.0, zoom: 4.5 }, // LGM: the Caspian and Aral outlines keep groups out
  { id: 'blacksea-20000', year: -20000, lat: 44.0, lon: 34.0, zoom: 5 }, // no Black Sea in the source: unchanged
  { id: 'basra-4000', year: -4000, lat: 30.9, lon: 47.0, zoom: 6.5 }, // Mesopotamia ~6 ka: the bay over Basra
  { id: 'basra-2000', year: -2000, lat: 30.9, lon: 47.0, zoom: 6.5 }, // ~4 ka: the bay has closed
  { id: 'basra-close-4000', year: -4000, lat: 30.75, lon: 47.6, zoom: 10.5 }, // the close-up: the bay's water at the sea, no group in it
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'pastwater-shots'));
const wanted = arg('scenes')?.split(',');
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const frames = path.join(WEB, '..', 'data', 'tiles', 'terrain', 'pastwater');
const { server, base } = await serveStatic([path.join(WEB, 'out'), { prefix: '/terrain/pastwater', dir: frames }, ...dataRoots(dataRoot)]);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const notes = {};
try {
  for (const scene of SCENES.filter((s) => !wanted || wanted.includes(s.id))) {
    for (const on of [false, true]) {
      const page = await browser.newPage({ viewport: VIEWPORT });
      let inflight = 0;
      let lastEnd = Date.now();
      page.on('request', () => inflight++);
      const done = () => { inflight = Math.max(0, inflight - 1); lastEnd = Date.now(); };
      page.on('requestfinished', done);
      page.on('requestfailed', done);
      const q = new URLSearchParams({ year: String(scene.year), lat: String(scene.lat), lon: String(scene.lon), zoom: String(scene.zoom), mode: 'units', still: '1' });
      if (on) q.set('pastwater', '1');
      await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => /(?:Dots drawn|whole map) [1-9]/.test(document.body.innerText), undefined, { timeout: 120_000 }).catch(() => {});
      if (on) await page.waitForSelector('[data-testid="pastwater-note"]', { timeout: 60_000 }).catch(() => {});
      const started = Date.now();
      while (Date.now() - started < 60_000 && (inflight > 0 || Date.now() - lastEnd < 2500)) await page.waitForTimeout(250);
      await page.waitForTimeout(2000);
      const file = path.join(outDir, `${scene.id}_${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file });
      if (on) {
        const note = page.locator('[data-testid="pastwater-note"]');
        notes[scene.id] = (await note.count()) ? { label: await note.innerText(), title: await note.getAttribute('title') } : null;
      }
      console.log(file);
      await page.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(outDir, 'notes.json'), JSON.stringify(notes, null, 2));
  await browser.close();
  server.close();
}
