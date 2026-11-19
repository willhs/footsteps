// Real browser proof for farm settlement layouts + the largest-settlement hover line (?settlements=1). Production data is proxied.
// node scripts/verify-layouts.mjs http://localhost:4444 /absolute/evidence/path      (ONLY=name filters scenes)
// SUFFIX=-before names the files layout-<scene>-before.png (for a run with layouts switched off). Each scene is flat (close3d=0), zoom 9, centred on a farming place, with the cursor over the centre so the hover card shows the line.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.route(/\/(grid|habitat|fauna|food|pmtiles|terrain|evidence|prehistory)\//, async (route) => {
  const url = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}${url.search}` }) });
});

// The catalog's EA030 mix for each place (row,col of the 5° region): what the layout should look like.
const scenes = [
  { name: 'rome', note: 'villages/complex (EA030 7-8)', year: '1 CE', lat: 41.9, lon: 12.5 },
  { name: 'nile', note: 'villages/complex (7-8)', year: '1000 CE', lat: 25.7, lon: 32.6 },
  { name: 'nw-europe', note: 'villages/complex (7-8): the catalog has NW Europe as nucleated, not dispersed', year: '1500 CE', lat: 51.0, lon: 3.5, zoom: 10 },
  { name: 'hausaland-hamlets', note: 'hamlets (6) 0.66', year: '1500 CE', lat: 12.0, lon: 8.5, zoom: 10 },
  { name: 'luzon-hamlets', note: 'hamlets (6) 0.65 + dispersed 0.34', year: '1500 CE', lat: 15.5, lon: 121.0 },
  { name: 'new-guinea-highlands', note: 'dispersed (5) 0.32 + villages', year: '1900 CE', lat: -6.0, lon: 144.5, zoom: 10 },
  { name: 'amazon-dispersed', note: 'dispersed (5) 0.64', year: '1500 CE', lat: -7.5, lon: -72.5 },
].filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY));
const results = [];
try {
  for (const scene of scenes) {
    const start = errors.length;
    await page.goto(`${base}/?mode=units&lat=${scene.lat}&lon=${scene.lon}&zoom=${scene.zoom ?? 9}&close3d=0&settlements=1`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year);
    await page.getByTestId('year-input').press('Enter');
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('loading'), undefined, { timeout: 150000 });
    await page.waitForTimeout(8000);
    await page.mouse.move(720, 450);
    await page.mouse.move(724, 452);
    await page.waitForTimeout(2500);
    const card = (await page.locator('[role="tooltip"]').allInnerTexts()).join('\n');
    const line = card.split('\n').find((t) => /Largest settlement/.test(t)) ?? null;
    const lines = card.split('\n').filter(Boolean);
    const detail = line ? lines[lines.indexOf(line) + 1] : null;
    const legend = (await page.locator('body').innerText()).includes('Farmers\' groups sit scattered');
    const box = await page.locator('[role="tooltip"]').boundingBox();
    const cardHeight = box ? Math.round(box.height) : null;
    const cardFits = box ? box.y + box.height <= 900 && box.y >= 0 : null;
    const shot = path.join(out, `layout-${scene.name}${process.env.SUFFIX ?? ''}.png`);
    await page.screenshot({ path: shot });
    results.push({ scene: scene.name, note: scene.note, year: scene.year, line, detail, legend, cardFits, cardHeight, errors: errors.slice(start), shot });
  }
} finally {
  fs.writeFileSync(path.join(out, 'layouts.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results.map(({ scene, line, detail, legend, cardFits, cardHeight }) => ({ scene, line, detail, legend, cardFits, cardHeight })), null, 1));
if (errors.length) throw new Error(`Browser reported ${errors.length} errors; see layouts.json`);
