// Real-data screenshots of the close-up fields, gardens and paths (`?fields=1`), each scene flag off and on (docs/ops/close-up-scene.md).
//   pnpm build && node scripts/fields-shots.mjs [--out DIR] [--scenes id,id] [--data DIR]
// Serves `out/` with the real data (as scripts/visual.mjs does: this checkout's data/tiles, or the primary checkout's from a worktree).
// Writes {id}_off.png, {id}_on.png and notes.json (the close-up note's label per shot).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCENES = [
  { id: 'nile-3000bce-z13', year: -3000, lat: 29.85, lon: 31.25, zoom: 13 }, // the Nile valley by Memphis: farmers on the floodplain
  { id: 'meseta-1000-z13', year: 1000, lat: 41.6, lon: -4.75, zoom: 13 }, // the northern Meseta by the Duero
  { id: 'rome-100-z12', year: 100, lat: 41.9, lon: 12.5, zoom: 12 }, // Rome and its fields
  { id: 'mongolia-1000-z13', year: 1000, lat: 49.708, lon: 105.958, zoom: 13 }, // the Selenga basin steppe: a 3 × 3 block of herding cells (~900 people each) in HYDE
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'fields-shots'));
const wanted = arg('scenes')?.split(',');
// --scene id,year,lat,lon,zoom: one extra scene (to look somewhere else without editing the table).
const extra = arg('scene')?.split(',');
if (extra) SCENES.push({ id: extra[0], year: +extra[1], lat: +extra[2], lon: +extra[3], zoom: +extra[4] });
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const notes = {};
try {
  for (const scene of SCENES.filter((s) => (extra ? s.id === extra[0] : !wanted || wanted.includes(s.id)))) {
    for (const on of [false, true]) {
      const page = await browser.newPage({ viewport: VIEWPORT });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 3000)}`); });
      let inflight = 0;
      let lastEnd = Date.now();
      page.on('request', () => inflight++);
      const done = () => { inflight = Math.max(0, inflight - 1); lastEnd = Date.now(); };
      page.on('requestfinished', done);
      page.on('requestfailed', (r) => { done(); errors.push(`failed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
      const q = new URLSearchParams({ year: String(scene.year), lat: String(scene.lat), lon: String(scene.lon), zoom: String(scene.zoom), hover: '0', still: '1' });
      if (on) q.set('fields', '1');
      // --query a=1&b=2: extra flags for both shots.
      for (const [k, v] of new URLSearchParams(arg('query') ?? '')) q.set(k, v);
      await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => /Dots drawn [1-9]/.test(document.body.innerText), undefined, { timeout: 120_000 }).catch(() => {});
      // The time bar's loading flag (app/page.tsx data-loading), as the visual run waits on it.
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-loading') === 'false', undefined, { timeout: 120_000 }).catch(() => {});
      const started = Date.now();
      await page.waitForTimeout(3000);
      while (Date.now() - started < 90_000 && (inflight > 0 || Date.now() - lastEnd < 3000)) await page.waitForTimeout(250);
      await page.waitForTimeout(3000);
      const file = path.join(outDir, `${scene.id}_${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file });
      const label = await page.locator('text=/^3D: ground measured/').first().textContent({ timeout: 2000 }).catch(() => null);
      notes[`${scene.id}_${on ? 'on' : 'off'}`] = { label, errors };
      console.log(file, label, errors.length ? errors : '');
      await page.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(outDir, 'notes.json'), JSON.stringify(notes, null, 2));
  await browser.close();
  server.close();
}
