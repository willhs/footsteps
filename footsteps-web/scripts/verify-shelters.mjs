// Real-data browser proof of the close-up shelters (?shelters=1); data stays on production, the app runs locally.
//   node footsteps-web/scripts/verify-shelters.mjs http://localhost:4444 /abs/evidence [sceneName]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, out, only] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
// Places where the task wants proof; zoom 12 shows camps as clusters, 13 as separate roofs.
// OFF=1 also takes each scene without the flag, for comparison.
const SCENES = [
  { name: 'ohalo-ii', year: -21000, lat: 32.7, lon: 35.6, zoom: 13 },
  { name: 'mezhyrich', year: -15000, lat: 49.63, lon: 31.41, zoom: 13 },
  { name: 'catalhoyuk', year: -7000, lat: 37.67, lon: 32.83, zoom: 13 },
  { name: 'rome', year: 100, lat: 41.9, lon: 12.5, zoom: 12 },
  { name: 'mongolia', year: 1000, lat: 47.5, lon: 105, zoom: 12 },
  { name: 'amazon', year: 1000, lat: -3.3, lon: -60, zoom: 12 },
];
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const inflight = new Set();
await page.route(/\/(grid|terrain|habitat|fauna|pmtiles)\//, async (route) => {
  const req = (async () => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}${url.search}` }) });
  })();
  inflight.add(req);
  try { await req; } finally { inflight.delete(req); }
});
const results = [];
// AT=x,y ZOOM=15: load at the scene's zoom, then scroll-zoom in at that screen pixel (to reach a group seen in the first shot).
// ZOOM=15 overrides every scene's zoom; HOVER=1 sweeps the cursor over the view until a dwelling's card shows, and shoots it.
for (const s0 of SCENES.filter((s) => !only || s.name === only)) {
  const s = { ...s0, zoom: process.env.ZOOM && !process.env.AT ? Number(process.env.ZOOM) : s0.zoom, tag: process.env.ZOOM ? `-z${process.env.ZOOM}` : '' };
  for (const shelters of process.env.OFF ? [true, false] : [true]) {
    await page.goto(`${base}/?year=${s.year}&lat=${s.lat}&lon=${s.lon}&zoom=${s.zoom}&hover=0${shelters ? '&shelters=1' : ''}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    while (inflight.size) await Promise.all([...inflight]);
    await page.waitForFunction(() => !/loading/i.test(document.body.innerText), undefined, { timeout: 270000 }).catch(() => console.warn('still loading', s.name));
    await page.waitForTimeout(12000);
    if (process.env.AT && process.env.ZOOM) {
      const [ax, ay] = process.env.AT.split(',').map(Number);
      await page.mouse.move(ax, ay);
      for (let i = 0; i < 60; i++) {
        const zoom = Number((await page.locator('text=/^Zoom /').first().innerText()).replace(/[^0-9.]/g, '').slice(0, 4));
        if (zoom >= Number(process.env.ZOOM) - 0.2) break;
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(15000);
    }
    const file = path.join(out, `${s.name}${s.tag}${shelters ? '' : '-off'}.png`);
    await page.screenshot({ path: file });
    results.push({ scene: s.name, shelters, file });
    if (process.env.HOVER && shelters) {
      let found = false;
      const [cx, cy] = process.env.AT ? process.env.AT.split(',').map(Number) : [720, 440];
      for (let y = cy - 80; y < cy + 80 && !found; y += 3)
        for (let x = Math.max(420, cx - 140); x < cx + 140 && !found; x += 3) {
          await page.mouse.move(x, y);
          await page.waitForTimeout(25);
          found = (await page.getByTestId('shelter-info').count()) > 0;
        }
      if (found) {
        await page.waitForTimeout(300);
        const hoverFile = path.join(out, `${s.name}${s.tag}-hover.png`);
        await page.screenshot({ path: hoverFile });
        console.log(s.name, 'hover card:', (await page.getByTestId('shelter-info').innerText()).replace(/\n/g, ' | '));
        results.push({ scene: s.name, hover: hoverFile });
      } else console.log(s.name, 'no dwelling under the cursor sweep');
    }
  }
}
console.log(JSON.stringify({ results, errors: errors.slice(0, 10) }, null, 1));
await browser.close();
