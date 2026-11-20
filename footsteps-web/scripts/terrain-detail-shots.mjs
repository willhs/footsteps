#!/usr/bin/env node
// Before/after screenshots of the terrain colour pyramid (docs/ops/terrain-images.md "Detail tiles"): each view once with
// `terrain_tiles=0` (the era image alone) and once with the pyramid, headed Chrome on the real GPU.
//
//   node scripts/terrain-detail-shots.mjs <base-url | static-dir> <out-dir>      (a directory, e.g. out/, is served on a free port)
//
// Views: UK 50,000 BCE zoom 7, Nile 3000 BCE zoom 8 (flat and tilted), Doggerland 10,000 BCE zoom 6 and the globe.
// Each shot waits for the network to be quiet for 2 s, then 1 s more for the frames.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [target, outDir] = process.argv.slice(2);
if (!target || !outDir) throw new Error('Usage: node scripts/terrain-detail-shots.mjs <base-url | static-dir> <out-dir>');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.geojson': 'application/json' };
let server = null;
let base = target;
if (!/^https?:/.test(target)) {
  const root = path.resolve(target);
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(root, p);
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    fs.readFile(file, (err, body) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { name: 'uk-50000bce-z7', q: { lat: 54.0, lon: -2.5, zoom: 7, year: -50000, close3d: 0 } },
  { name: 'nile-3000bce-z8', q: { lat: 25.7, lon: 32.6, zoom: 8, year: -3000, close3d: 0 } },
  { name: 'nile-3000bce-z9-3d', q: { lat: 25.7, lon: 32.6, zoom: 9, year: -3000 } },
  { name: 'doggerland-10000bce-z6', q: { lat: 54.5, lon: 3.0, zoom: 6, year: -10000, close3d: 0 } },
  { name: 'alps-1000ce-z8', q: { lat: 46.55, lon: 8.0, zoom: 8, year: 1000, close3d: 0 } },
  { name: 'globe-20000bce', q: { lat: 45, lon: 10, zoom: 1.6, year: -20000 }, globe: true },
];

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const view of VIEWS) {
  for (const [label, tiles] of [['before', '0'], ['after', '1']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const host = new URL(base).hostname;
    if (view.globe) await context.addCookies([{ name: 'globe-view-mode', value: 'true', domain: host, path: '/' }]);
    const page = await context.newPage();
    let inflight = 0;
    let last = Date.now();
    page.on('request', () => {
      inflight++;
      last = Date.now();
    });
    for (const ev of ['requestfinished', 'requestfailed'])
      page.on(ev, () => {
        inflight--;
        last = Date.now();
      });
    const q = new URLSearchParams(Object.entries({ ...view.q, terrain_tiles: tiles }).map(([k, v]) => [k, String(v)]));
    await page.goto(`${base.replace(/\/$/, '')}/?${q}`, { waitUntil: 'load' });
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000 && !(inflight <= 0 && Date.now() - last > 2000)) await page.waitForTimeout(200);
    await page.waitForTimeout(1000);
    const file = path.join(outDir, `${view.name}-${label}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(file);
    await context.close();
  }
}
await browser.close();
server?.close();
