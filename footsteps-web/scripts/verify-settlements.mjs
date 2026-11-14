// Real browser proof with shipped population/habitat data. No synthetic map data.
// node scripts/verify-settlements.mjs http://localhost:4444 /absolute/evidence/path
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const warnings = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
  if (message.type() === 'warning' && /grid|settlement|shader/i.test(message.text())) warnings.push(message.text());
});
// Large existing PMTiles stay on production; forward only this data route.
await page.route('**/pmtiles/**', async route => {
  const url = new URL(route.request().url());
  const response = await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}` });
  await route.fulfill({ response });
});
const results = [];
try {
  for (const scene of [
    { name: 'rome-modelled', flag: '&settlements=1', mode: 'units', year: '100 CE', lat: 41.9, lon: 12.5 },
    { name: 'rome-default', flag: '', mode: 'units', year: '100 CE', lat: 41.9, lon: 12.5 },
    { name: 'foragers-modelled', flag: '&settlements=1', mode: 'units', year: '21000 BCE', lat: 32.86, lon: 35.55 },
    { name: 'grid-unchanged', flag: '&settlements=1', mode: 'grid', year: '100 CE', lat: 41.9, lon: 12.5 },
    { name: 'dots-unchanged', flag: '&settlements=1', mode: 'dots', year: '0 CE', lat: 41.9, lon: 12.5 },
  ]) {
    const startErrors = errors.length;
    await page.goto(`${base}/?mode=${scene.mode}&lat=${scene.lat}&lon=${scene.lon}&zoom=7${scene.flag}`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year);
    await page.getByTestId('year-input').press('Enter');
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('loading'), { timeout: 90000 });
    await page.waitForTimeout(6000);
    const text = await page.locator('body').innerText();
    const canvas = await page.locator('canvas').count();
    if (!canvas) throw new Error(`${scene.name}: no canvas`);
    const expectedLabel = !!scene.flag && scene.mode === 'units';
    if (text.includes('Settlement experiment') !== expectedLabel) throw new Error(`${scene.name}: incorrect flag label`);
    const screenshot = path.join(out, `${scene.name}.png`);
    await page.screenshot({ path: screenshot });
    results.push({ scene: scene.name, text, canvas, screenshot, errors: errors.slice(startErrors) });
  }
} finally {
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ results, errors, warnings }, null, 2));
  await browser.close();
}
if (errors.length || warnings.length) throw new Error(`Browser reported ${errors.length} errors and ${warnings.length} relevant warnings; see browser.json`);
console.log(`Captured ${results.length} real-data scenes with no browser errors`);
