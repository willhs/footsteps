// Real-data shots, a frame sequence and frame rates of the imagined weather (`?weather=1`, docs/ops/close-up-scene.md "Weather").
//   pnpm build && node scripts/weather-shots.mjs [--out DIR] [--scenes id,id] [--data DIR] [--fps] [--headless]
// Serves `out/` with the real data (as scripts/visual.mjs does). Per scene:
//   {id}_off.png, {id}_on.png         `?still=1`, weather off and on (same frozen clock, so the only difference is the weather)
//   {id}_on_ground.png                 weather on with `?ground=1`
//   {id}_seq_{0..3}.png                weather on, real clock, 3 s apart: the clouds and gusts move
// and prints how many pixels differ between the first and last frame of the sequence. With --fps it also loads zoom 14 of each scene
// with and without the flag and prints frames per second while the camera wiggles (a headed browser: headless Chromium throttles
// animation frames; the frame limit is lifted so a cheaper shader shows as more fps).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, cacheElevationTiles, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = [
  { id: 'nile-3000bce', what: 'Nile, 3000 BCE (clear)', year: -3000, lat: 25.7, lon: 32.6, zoom: 13 },
  { id: 'britain-1000ce', what: 'Britain, 1000 CE (cloudy)', year: 1000, lat: 52.2, lon: -1.5, zoom: 13 },
  { id: 'pampas-1500ce', what: 'Pampas, 1500 CE (wind on grass)', year: 1500, lat: -35.5, lon: -60, zoom: 13 },
  { id: 'pampas-1500ce-z16', what: 'Pampas, 1500 CE, close in: gust ripples in the grass', year: 1500, lat: -35.5, lon: -60, zoom: 16 },
];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const outDir = path.resolve(arg('out') ?? path.join(WEB, 'weather-shots'));
const wanted = arg('scenes')?.split(',');
const headed = !argv.includes('--headless');
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, arg('data') ?? process.env.FOOTSTEPS_DATA);
if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid');
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]);
const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', ...(argv.includes('--fps') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
});
const context = await browser.newContext({ viewport: VIEWPORT });
await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), (url) => console.log('DEM tile not fetched', url));

/** Open a scene with these extra flags and wait until the ground has been drawn and the network is quiet. */
async function open(scene, query, zoom = scene.zoom) {
  const page = await context.newPage();
  let inflight = 0;
  let lastEnd = Date.now();
  page.on('request', () => inflight++);
  const done = () => { inflight = Math.max(0, inflight - 1); lastEnd = Date.now(); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 300)));
  const q = new URLSearchParams({ year: String(scene.year), lat: String(scene.lat), lon: String(scene.lon), zoom: String(zoom), ...query });
  await page.goto(`${base}/?${q}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-loading') === 'false', undefined, { timeout: 120_000 }).catch(() => {});
  const started = Date.now();
  while (Date.now() - started < 90_000 && (inflight > 0 || Date.now() - lastEnd < 2500)) await page.waitForTimeout(250);
  await page.waitForTimeout(2500);
  return page;
}

/** Frames per second while the camera wiggles (tiles stay cached, so it is drawing and page work). */
async function fps(page, ms = 6000) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__run = true;
    const tick = (t) => { window.__frames.push(t); if (window.__run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const [cx, cy] = [VIEWPORT.width * 0.6, VIEWPORT.height * 0.5];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < ms; i++) await page.mouse.move(cx + 40 * Math.cos(i / 6), cy + 30 * Math.sin(i / 6));
  await page.mouse.up();
  const frames = await page.evaluate(() => { window.__run = false; return window.__frames; });
  const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
  return { fps: (frames.length - 1) / ((frames.at(-1) - frames[0]) / 1000), p95ms: gaps[Math.floor(gaps.length * 0.95)] };
}

const results = {};
try {
  for (const scene of SCENES.filter((s) => !wanted || wanted.includes(s.id))) {
    for (const [name, query] of [['off', { still: '1' }], ['on', { still: '1', weather: '1' }], ['on_ground', { still: '1', weather: '1', ground: '1' }]]) {
      const page = await open(scene, query);
      const file = path.join(outDir, `${scene.id}_${name}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      await page.close();
    }
    const page = await open(scene, { weather: '1' });
    const frames = [];
    for (let i = 0; i < 4; i++) {
      if (i) await page.waitForTimeout(3000);
      frames.push(await page.screenshot({ path: path.join(outDir, `${scene.id}_seq_${i}.png`) }));
    }
    await page.close();
    const sharp = (await import('sharp')).default;
    const [a, b] = await Promise.all([frames[0], frames[3]].map((f) => sharp(f).raw().toBuffer()));
    let differ = 0;
    for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) differ++;
    results[scene.id] = { seqDifferPx: differ, of: a.length / 3 };
    console.log(scene.id, `pixels that differ between the first and last frame: ${differ} of ${a.length / 3}`);
    if (argv.includes('--fps')) {
      results[scene.id].fps = {};
      for (const [name, query] of [['off', {}], ['on', { weather: '1' }], ['ground', { ground: '1' }], ['ground+weather', { ground: '1', weather: '1' }]]) {
        const runs = [];
        for (let r = 0; r < 3; r++) {
          const p = await open(scene, query, 14);
          runs.push(await fps(p));
          await p.close();
        }
        results[scene.id].fps[name] = runs;
        console.log(scene.id, 'zoom 14', name, runs.map((x) => `${x.fps.toFixed(1)} fps (p95 ${x.p95ms.toFixed(0)} ms)`).join(', '));
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  server.close();
}
