// Real-data screenshots of the close-up light, sky and water (`?sky=1`), each scene with the flag off and on (docs/ops/close-up-scene.md).
//   pnpm build && node scripts/sky-shots.mjs [--out DIR] [--scenes id,id] [--data DIR] [--moving] [--query k=v&k=v] [--only on|off]
// Serves `out/` with the real data (as scripts/visual.mjs does). Every shot is `?still=1` (frozen shader clock, sun clock on 21 June at `utc`
// hours), so a scene gives the same pixels each run; `--moving` drops `still` to see the water move. Writes {id}_off.png and {id}_on.png.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, cacheElevationTiles, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `utc` is the hour on the still day (21 June 2024). Local sun time = utc + lon / 15.
const SCENES = [
  { id: 'nile-3000bce-z14-midday', year: -3000, lat: 25.7, lon: 32.6, zoom: 14, utc: 9.8 }, // local 12:00
  { id: 'nile-3000bce-z14-dusk', year: -3000, lat: 25.7, lon: 32.6, zoom: 14, utc: 16.45 }, // local 18:36, sun ~2° up
  { id: 'nile-3000bce-z14-night', year: -3000, lat: 25.7, lon: 32.6, zoom: 14, utc: 20.5 }, // local 22:40
  { id: 'naples-100-z13', year: 100, lat: 40.72, lon: 14.22, zoom: 13, utc: 9.5 }, // the bay, looking north to Naples; local 10:27
  { id: 'naples-100-z13-evening', year: 100, lat: 40.72, lon: 14.22, zoom: 13, utc: 16.6 }, // local 17:33, low sun in the west-north-west: glint
  { id: 'alps-1000bce-z13', year: -1000, lat: 46.55, lon: 8.0, zoom: 13, utc: 7.5 }, // local 08:02, low morning sun
  { id: 'doggerland-10000bce-z12', year: -10000, lat: 54.8, lon: 2.0, zoom: 12, utc: 12 }, // local 12:08
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'sky-shots'));
const wanted = arg('scenes')?.split(',');
const moving = argv.includes('--moving');
const extra = new URLSearchParams(arg('query') ?? '');
const only = arg('only');
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const scene of SCENES.filter((s) => !wanted || wanted.includes(s.id))) {
    for (const on of [false, true].filter((o) => !only || only === (o ? 'on' : 'off'))) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), (url) => console.log('DEM failed', url));
      const page = await context.newPage();
      page.on('pageerror', (e) => console.log('pageerror', e.message));
      let inflight = 0;
      let lastEnd = Date.now();
      page.on('request', () => inflight++);
      const done = () => { inflight = Math.max(0, inflight - 1); lastEnd = Date.now(); };
      page.on('requestfinished', done);
      page.on('requestfailed', done);
      const q = new URLSearchParams({ year: String(scene.year), lat: String(scene.lat), lon: String(scene.lon), zoom: String(scene.zoom), utc: String(scene.utc) });
      if (!moving) q.set('still', '1');
      if (on) q.set('sky', '1');
      for (const [k, v] of extra) q.set(k, v);
      await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
      await page.waitForSelector('main[data-loading="false"]', { timeout: 120_000 }).catch(() => {});
      const started = Date.now();
      while (Date.now() - started < 60_000 && (inflight > 0 || Date.now() - lastEnd < 2500)) await page.waitForTimeout(250);
      await page.waitForTimeout(2500);
      const file = path.join(outDir, `${scene.id}_${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
