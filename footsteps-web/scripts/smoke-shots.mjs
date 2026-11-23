// Real-data screenshots of hearth smoke and firelight (`?smoke=1`, docs/ops/close-up-scene.md "Hearth smoke and firelight").
//   pnpm build && node scripts/smoke-shots.mjs [--out DIR] [--scenes id,id] [--data DIR] [--still 0]
// Serves `out/` with the real data (as ice-shots.mjs does) and shoots each scene with the flag off and on. A night scene sets `?utc=` (the sun
// clock, lib/solarClock.ts) and turns the Day/night shading on, so the ground is dark and the fires read. `?still=1` keeps the shots the same each run;
// `--still 0` lets the smoke move (a second shot a few seconds later shows it drift).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, cacheElevationTiles, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// utc: hours UTC. Madrid is ~0.25 h behind UTC, East Africa (36°E) 2.4 h ahead, Rome (12.5°E) 0.8 h ahead.
// Smoke and light are drawn where the people are (sea-level height), so a village is in view at the same place with or without the flag.
export const SCENES = [
  { id: 'meseta-1000-day', year: 1000, lat: 40.45, lon: -3.7, zoom: 15, utc: 12 },
  { id: 'meseta-1000-night', year: 1000, lat: 40.45, lon: -3.7, zoom: 15, utc: 22.5, night: true },
  { id: 'eastafrica-50000bce-night', year: -50000, lat: 4.7769, lon: 35.9869, zoom: 15, utc: 18.5, night: true },
  { id: 'rome-100-day', year: 100, lat: 41.9, lon: 12.5, zoom: 14, utc: 11 },
  { id: 'rome-100-night', year: 100, lat: 41.9, lon: 12.5, zoom: 14, utc: 20, night: true },
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'smoke-shots'));
const wanted = arg('scenes')?.split(',');
const still = arg('still') !== '0';
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];

try {
  for (const scene of SCENES.filter((s) => !wanted || wanted.includes(s.id))) {
    for (const on of [false, true]) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), (url) => console.warn('elevation tile failed', url));
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${scene.id}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${scene.id}: ${m.text()}`); });
      let inflight = 0;
      let lastEnd = Date.now();
      page.on('request', () => inflight++);
      const done = () => { inflight = Math.max(0, inflight - 1); lastEnd = Date.now(); };
      page.on('requestfinished', done);
      page.on('requestfailed', done);
      const q = new URLSearchParams({ year: String(scene.year), lat: String(scene.lat), lon: String(scene.lon), zoom: String(process.env.ZOOM || scene.zoom), utc: String(scene.utc), hover: '0' });
      if (still) q.set('still', '1');
      if (on) q.set('smoke', '1');
      await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
      // The people are in deck.gl (the settlement model has finished for this view), found through React's own ref as scripts/visual.mjs does.
      await page.waitForFunction((wantHearths) => {
        for (const el of document.querySelectorAll('canvas')) {
          let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
          for (; f; f = f.return)
            for (let h = f.memoizedState; h; h = h.next) {
              const deck = h.memoizedState?.current?.deck;
              if (deck?.layerManager) {
                window.__deck = deck;
                const layers = deck.props.layers.flat(Infinity);
                return wantHearths ? layers.some((l) => l?.id === 'smoke' && l.props.data?.length > 0) : layers.some((l) => l?.id === 'people' && l.props.data?.length > 0);
              }
            }
        }
        return false;
      }, on, { timeout: on ? 240_000 : 120_000 }).catch(() => console.warn(on ? 'no hearths' : 'no people drawn', scene.id));
      if (scene.night) await page.getByRole('button', { name: /Day\/night shading/ }).click();
      const started = Date.now();
      while (Date.now() - started < 90_000 && (inflight > 0 || Date.now() - lastEnd < 3000)) await page.waitForTimeout(250);
      await page.waitForTimeout(3000);
      const file = path.join(outDir, `${scene.id}_${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file });
      // What was drawn: puffs and pools across the page's layers (the close-up's sit inside its tile layers).
      const drawn = await page.evaluate(() => {
        const out = { smoke: 0, firelight: 0 };
        const walk = (layers) => {
          for (const l of layers) {
            if (!l) continue;
            if (l.constructor?.layerName === 'SmokeLayer') out.smoke += l.props.data.length;
            if (l.constructor?.layerName === 'FirelightLayer') out.firelight += l.props.data.length;
            walk(l.getSubLayers?.() ?? []);
          }
        };
        walk(window.__deck?.layerManager?.getLayers() ?? []);
        return out;
      }).catch(() => null);
      console.log(file, JSON.stringify(drawn));
      if (on && !still) {
        await page.waitForTimeout(6000);
        await page.screenshot({ path: path.join(outDir, `${scene.id}_on_later.png`) });
      }
      await context.close();
    }
  }
} finally {
  if (errors.length) console.warn(`console/page errors:\n${[...new Set(errors)].join('\n')}`);
  await browser.close();
  server.close();
}
