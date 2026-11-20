#!/usr/bin/env node
// Before/after screenshots and frame times of the close-up 3D ground, with and without ?ground=1.
//   node scripts/measure-ground.mjs <base-url> <out-dir> [--headless] [--scene=amazon] [--zoom=10]
// Per scene and zoom it loads the page twice (ground off = before, `&ground=1` = after), waits for the DEM tiles, saves
// `<scene>-z<zoom>-before.png` / `-after.png`, then wiggles the camera in a small circle for a few seconds (so tiles stay
// cached and only drawing costs) and prints frames per second and the 95th percentile frame time.
// Frame limits are lifted (--disable-gpu-vsync, --disable-frame-rate-limit) so a faster shader shows as a higher fps rather
// than 60 either way. Headed by default: headless Chromium throttles requestAnimationFrame. Needs `pnpm dev` or a static
// build served (`python3 -m http.server -d out 4600`) with the data under public/ (grid, terrain, habitat).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [base = 'http://localhost:4466', outDir = 'ground-out'] = args.filter((a) => !a.startsWith('--'));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const headed = !args.includes('--headless');
fs.mkdirSync(outDir, { recursive: true });

const SCENES = [
  { name: 'amazon', what: 'Amazon forest, 1000 CE', lat: -3.2, lon: -60.4, year: 1000 },
  { name: 'sahara', what: 'Sahara sand sea, 1000 CE', lat: 24.5, lon: 11.5, year: 1000 },
  { name: 'steppe', what: 'Mongolian steppe, 0 CE', lat: 47.6, lon: 103.5, year: 0 },
  { name: 'scandinavia', what: 'Scandinavian ice sheet, 20,000 BCE', lat: 66.5, lon: 16, year: -20000 },
  { name: 'mesopotamia', what: 'Mesopotamian marsh, 3000 BCE', lat: 31, lon: 47.3, year: -3000 },
].filter((s) => !opt('scene') || s.name === opt('scene'));
const ZOOMS = opt('zoom') ? [Number(opt('zoom'))] : [10, 12];

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 300)));

async function wiggle(ms) {
  await page.evaluate(() => {
    const w = window;
    w.__frames = [];
    w.__run = true;
    const tick = (t) => {
      w.__frames.push(t);
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cx = 900;
  const cy = 450;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < ms; i++) {
    const a = i / 6;
    await page.mouse.move(cx + 40 * Math.cos(a), cy + 30 * Math.sin(a));
  }
  await page.mouse.up();
  return page.evaluate(() => {
    const w = window;
    w.__run = false;
    const f = w.__frames;
    const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
    const span = (f[f.length - 1] - f[0]) / 1000;
    return { fps: +((f.length - 1) / span).toFixed(1), p95FrameMs: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), frames: f.length };
  });
}

const results = [];
for (const scene of SCENES) {
  for (const zoom of ZOOMS) {
    for (const after of [false, true]) {
      const url = `${base}/?lat=${scene.lat}&lon=${scene.lon}&zoom=${zoom}&year=${scene.year}${after ? '&ground=1' : ''}`;
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(Number(process.env.SETTLE ?? 6000));
      const file = path.join(outDir, `${scene.name}-z${zoom}-${after ? 'after' : 'before'}.png`);
      await page.screenshot({ path: file });
      const perf = await wiggle(4000);
      const row = { scene: scene.name, zoom, ground: after ? 'on' : 'off', ...perf };
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }
}
fs.writeFileSync(path.join(outDir, 'fps.json'), JSON.stringify(results, null, 2));
await browser.close();
