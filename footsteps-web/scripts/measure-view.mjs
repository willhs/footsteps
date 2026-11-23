#!/usr/bin/env node
// Scripted pan/zoom/scrub measurement for the people view, on the real GPU.
//   node scripts/measure-view.mjs <base-url> <out-dir> [--headed]
//   node scripts/measure-view.mjs --serve <out-dir>   serves out/ with the real data itself (scripts/visual-lib.mjs), base-url not needed
// Close-up mode: CLOSE=lat,lon,year [QUERY='fields=1'] measures only a pan at zoom 13, 14 and 15 there (people and the 3D ground drawn),
// e.g. with and without ?fields=1 (docs/ops/close-up-scene.md).
// Headless by default (measured 2026-11-21: headless Chrome gets 60 rAF/s and the Metal GPU); HEADED=1 shows the window.
// Serve a static build first, e.g. `python3 -m http.server -d out 4600`.
// For each scene it screenshots the settled view, then (for 1900) drags the map
// for ~4 s and wheels in/out while counting requestAnimationFrame frames, and
// finally scrubs every year with the keyboard while recording long tasks.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

if (process.argv.includes('--trees')) {
  await import('./measure-trees.mjs');
  process.exit(process.exitCode ?? 0);
}

const serve = process.argv.includes('--serve');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [baseArg = 'http://localhost:4600', outDir = 'perf-out'] = serve ? [undefined, positional[0]] : positional;
let base = baseArg;
let server = null;
if (serve) {
  const { serveStatic } = await import('./static-server.mjs');
  const { dataRoots, findDataRoot } = await import('./visual-lib.mjs');
  const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const root = findDataRoot(web, process.env.FOOTSTEPS_DATA);
  if (!root) throw new Error('No real data: need a folder holding data/tiles/grid');
  ({ server, base } = await serveStatic([path.join(web, 'out'), ...dataRoots(root)]));
}
const headed = process.argv.includes('--headed') || !!process.env.HEADED;
const mode = (process.env.MODE ? `&mode=${process.env.MODE}` : '') + (process.env.QUERY ? `&${process.env.QUERY}` : '');
// CLOSE=1 measures street zoom only (1000 CE, a Madrid village at zoom 15 and Rome at 14): a still view for 6 s, then the pan. QUERY=smoke=1 adds URL flags (compare with and without).
const CLOSE = !!process.env.CLOSE && !process.env.CLOSE.includes(','); // CLOSE=lat,lon,year is the pan-at-a-place mode below
fs.mkdirSync(outDir, { recursive: true });

const YEARS = { '-10000': 'Home', 1900: 'End' };
const SCENES = CLOSE ? [
  { name: 'madrid-z15', lat: 40.45, lon: -3.7, zoom: 15 },
  { name: 'rome-z14', lat: 41.9, lon: 12.5, zoom: 14 },
] : [
  { name: 'world', lat: 20, lon: 10, zoom: 1.5 },
  { name: 'europe', lat: 50, lon: 10, zoom: 4.2 },
  { name: 'units', lat: 48, lon: 10, zoom: 6 },
  { name: 'close', lat: 51.5, lon: 0, zoom: 7.5 },
];

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));

async function setYear(year) {
  const handle = page.locator('[role="slider"]').first();
  await handle.focus();
  if (year === 1000) {
    await page.keyboard.press('End');
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowLeft');
  } else await page.keyboard.press(YEARS[year]);
}

async function settle(ms = 4000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

// Count frames and long tasks while `action` runs.
async function measure(action) {
  await page.evaluate(() => {
    const w = window;
    w.__frames = [];
    w.__long = [];
    w.__run = true;
    const tick = (t) => {
      w.__frames.push(t);
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    w.__obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    });
    w.__obs.observe({ type: 'longtask' });
  });
  await action();
  return page.evaluate(() => {
    const w = window;
    w.__run = false;
    w.__obs.disconnect();
    const f = w.__frames;
    const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
    const span = (f[f.length - 1] - f[0]) / 1000;
    return {
      fps: +((f.length - 1) / span).toFixed(1),
      p95FrameMs: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1),
      maxFrameMs: +gaps[gaps.length - 1].toFixed(1),
      longTasks: w.__long.length,
      longestTaskMs: Math.round(Math.max(0, ...w.__long)),
    };
  });
}

async function pan() {
  const box = { x: 720, y: 450 };
  await page.mouse.move(box.x - 300, box.y);
  await page.mouse.down();
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    await page.mouse.move(box.x - 300 + 600 * Math.sin(t * Math.PI), box.y + 120 * Math.sin(t * 2 * Math.PI));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, i < 20 ? -60 : 60);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(500);
}

const results = {};
const renderer = { value: null };
if (process.env.CLOSE && !CLOSE) {
  const [lat, lon, year] = process.env.CLOSE.split(',');
  const query = process.env.QUERY ? `&${process.env.QUERY}` : '';
  for (const zoom of [13, 14, 15]) {
    await page.goto(`${base}/?year=${year}&lat=${lat}&lon=${lon}&zoom=${zoom}&hover=0${mode}${query}`);
    await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-loading') === 'false', undefined, { timeout: 120_000 }).catch(() => {});
    await settle(6000);
    await page.screenshot({ path: path.join(outDir, `close-z${zoom}.png`) });
    const name = `close z${zoom}${query}`;
    results[name] = await measure(pan);
    console.log(name, results[name]);
  }
  results.renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  server?.close();
  process.exit(0);
}
for (const year of CLOSE ? [1000] : [-10000, 1000, 1900]) {
  for (const scene of SCENES) {
    await page.goto(`${base}/?lat=${scene.lat}&lon=${scene.lon}&zoom=${scene.zoom}${mode}`, CLOSE ? { waitUntil: 'commit', timeout: 120_000 } : undefined);
    if (CLOSE) await page.waitForFunction(() => document.querySelector('canvas'), undefined, { timeout: 120_000 });
    if (!renderer.value)
      renderer.value = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
    await settle(1500);
    await setYear(year);
    await settle();
    await page.screenshot({ path: path.join(outDir, `${year}-${scene.name}.png`) });
    if (CLOSE) {
      // Wait until the people are in deck.gl (the settlement model has run for this view) and the network is quiet, then let tiles finish.
      await page.waitForFunction(() => {
        for (const el of document.querySelectorAll('canvas')) {
          let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
          for (; f; f = f.return)
            for (let h = f.memoizedState; h; h = h.next) {
              const deck = h.memoizedState?.current?.deck;
              if (deck?.layerManager) return deck.props.layers.flat(Infinity).some((l) => l?.id === 'people' && l.props.data?.length > 0);
            }
        }
        return false;
      }, undefined, { timeout: 240_000 }).catch(() => console.log('no people drawn'));
      await settle(15000);
      results[`still ${year} ${scene.name}`] = await measure(() => page.waitForTimeout(6000));
      console.log(`still ${year} ${scene.name}`, results[`still ${year} ${scene.name}`]);
    }
    if (year === 1900 || CLOSE) {
      results[`pan ${year} ${scene.name}`] = await measure(pan);
      console.log(`pan ${year} ${scene.name}`, results[`pan ${year} ${scene.name}`]);
    }
  }
}

if (!CLOSE) // Scrub all 30 years, ~4 per second, at world zoom (glow) and units zoom.
for (const [name, query] of [
  ['scrub world', 'lat=30&lon=20&zoom=2'],
  ['scrub units', 'lat=48&lon=10&zoom=6'],
]) {
  await page.goto(`${base}/?${query}${mode}`);
  await settle(1500);
  const handle = page.locator('[role="slider"]').first();
  await handle.focus();
  await page.keyboard.press('Home');
  await settle(1500);
  results[name] = await measure(async () => {
    for (let i = 0; i < 29; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
  });
  console.log(name, results[name]);
}
results.renderer = renderer.value;
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.log('renderer', renderer.value);
await browser.close();
server?.close();
