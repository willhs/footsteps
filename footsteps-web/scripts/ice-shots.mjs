// Real-data screenshots of the dated ice sheets (`?ice=1`), each scene flag off and on (docs/ops/ice-sheets.md).
//   pnpm build && node scripts/ice-shots.mjs [--out DIR] [--scenes id,id] [--data DIR]
// Serves `out/` with the real data (as scripts/visual.mjs does: this checkout's data/tiles, or the primary checkout's from a worktree).
// With the flag on, the cursor rests on the scene's centre so the hover card shows its ice line. Writes {id}_off.png, {id}_on.png and
// notes.json (the ice note's label and title, and the hover card's text, per shot).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = [
  { id: 'scandinavia-20000', year: -20000, lat: 61.0, lon: 16.0, zoom: 3.6 }, // the Fennoscandian sheet at 22.5 ka (DATED-1 based)
  { id: 'greatlakes-15000', year: -15000, lat: 44.0, lon: -84.0, zoom: 4.2 }, // the Laurentide's southern lobes at 17.5 ka
  { id: 'patagonia-20000', year: -20000, lat: -47.0, lon: -71.0, zoom: 4.2 }, // the Patagonian ice sheet at 22.5 ka
  { id: 'ohio-close-15000', year: -15000, lat: 41.15, lon: -84.0, zoom: 9.5 }, // the close-up: the Laurentide's 17.5 ka edge in NW Ohio, where Krapp's biome is not ice
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'ice-shots'));
const wanted = arg('scenes')?.split(',');
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]);
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
      if (on) q.set('ice', '1');
      await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => /Dots drawn [1-9]/.test(document.body.innerText), undefined, { timeout: 120_000 }).catch(() => {});
      if (on) await page.waitForSelector('[data-testid="ice-note"]', { timeout: 60_000 }).catch(() => {});
      const started = Date.now();
      while (Date.now() - started < 60_000 && (inflight > 0 || Date.now() - lastEnd < 2500)) await page.waitForTimeout(250);
      if (on) {
        await page.mouse.move(VIEWPORT.width / 2 + 40, VIEWPORT.height / 2);
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
        await page.waitForSelector('[data-testid="hover-card"]', { timeout: 20_000 }).catch(() => {});
      }
      await page.waitForTimeout(2500);
      const file = path.join(outDir, `${scene.id}_${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file });
      if (on) {
        const note = page.locator('[data-testid="ice-note"]');
        const card = page.locator('[data-testid="hover-card"]');
        notes[scene.id] = {
          note: (await note.count()) ? { label: await note.innerText(), title: await note.getAttribute('title') } : null,
          hover: (await card.count()) ? await card.innerText() : null,
        };
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
