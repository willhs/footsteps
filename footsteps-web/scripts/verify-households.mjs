// Real browser proof for households + the hover-only regional tint (?settlements=1). Production data is proxied.
// node scripts/verify-households.mjs http://localhost:4444 /absolute/evidence/path
// Headless by default (measured 2026-11-21: headless Chrome gets 60 rAF/s and the Metal GPU); HEADED=1 shows the window.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
// Data that is not in git stays on production; forward those routes only.
await page.route(/\/(grid|habitat|fauna|food|pmtiles|terrain|evidence|prehistory)\//, async (route) => {
  const url = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}${url.search}` }) });
});

async function fps(ms = 3000) {
  return page.evaluate((span) => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = (t) => { frames++; if (t - t0 < span) requestAnimationFrame(tick); else resolve(Math.round((frames * 1000) / (t - t0))); };
    requestAnimationFrame(tick);
  }), ms);
}

const results = [];
// Forager band before 10,000 BCE (Natufian Levant at 11,000 BCE, the densest modelled block) and a 1500 CE village
// (the Nile near Luxor), flat and in close-up 3D, at street zoom (12.6: people just full) and close (15.5: households apart).
const FORAGER = { year: '11000 BCE', lat: 33.7603, lon: 35.7348 }; // centred on one band seen at zoom 12.6 from (33.75, 35.75)
const VILLAGE = { year: '1500 CE', lat: 25.656, lon: 32.677 };
const scenes = [
  ...[['street', 12.6], ['close', 15.5]].flatMap(([zoomName, zoom]) => [
    { name: `forager-${zoomName}-flat`, ...FORAGER, zoom, q: '&close3d=0' },
    { name: `forager-${zoomName}-3d`, ...FORAGER, zoom, q: '' },
    { name: `village-${zoomName}-flat`, ...VILLAGE, zoom, q: '&close3d=0' },
    { name: `village-${zoomName}-3d`, ...VILLAGE, zoom, q: '' },
  ]),
  // Wider, where the regional tint is readable.
  { name: 'forager-region', ...FORAGER, zoom: 9, q: '&close3d=0', hover: true },
  { name: 'village-region', year: '1500 CE', lat: 39.0, lon: 33.0, zoom: 9, q: '&close3d=0', hover: true },
].filter((scene) => !process.env.ONLY || scene.name.includes(process.env.ONLY));
try {
  for (const scene of scenes) {
    for (const flag of ['&settlements=1', '']) {
      if (flag === '' && (scene.hover || !scene.name.includes('close'))) continue;
      const label = `${scene.name}${flag ? '' : '-default'}`;
      const start = errors.length;
      await page.goto(`${base}/?mode=units&lat=${scene.lat}&lon=${scene.lon}&zoom=${scene.zoom}${scene.q}${flag}`);
      await page.getByTestId('year-label').click();
      await page.getByTestId('year-input').fill(scene.year);
      await page.getByTestId('year-input').press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('loading'), undefined, { timeout: 150000 });
      await page.waitForTimeout(8000);
      if (scene.hover) {
        await page.mouse.move(720, 450);
        await page.mouse.move(724, 452);
        await page.waitForTimeout(1500);
      }
      const card = await page.locator('[role="tooltip"]').allInnerTexts();
      const regionLine = card.find((t) => /regional group/.test(t)) ?? null;
      const text = await page.locator('body').innerText();
      const shot = path.join(out, `${label}.png`);
      await page.screenshot({ path: shot });
      const rate = scene.hover ? null : await fps();
      results.push({ scene: label, regionLine, legendHouseholds: text.includes('Households (about 4'), fps: rate, errors: errors.slice(start), shot });
    }
  }
} finally {
  fs.writeFileSync(path.join(out, 'households.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results.map(({ scene, regionLine, legendHouseholds, fps }) => ({ scene, regionLine, legendHouseholds, fps })), null, 1));
if (errors.length) throw new Error(`Browser reported ${errors.length} errors; see households.json`);
