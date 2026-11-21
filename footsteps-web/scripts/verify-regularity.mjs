// Real browser proof that groups no longer line up in rows under ?settlements=1 (docs/ops/site-terrain.md "Regularity").
// node scripts/verify-regularity.mjs http://localhost:4466 /absolute/evidence/path      (ONLY=name filters scenes, SUFFIX=-before names the files)
// Each scene is flat (close3d=0, zoom 7: about one group a cell) or in the tilted 3D landscape (zoom 9.5), in Italy 1000 BCE or on the Nile 1500 CE.
// Needs the local data linked into public/ (grid, habitat, terrain, fauna: see footsteps-web/AGENTS.md). Headless by default (measured 2026-11-21: headless Chrome gets 60 rAF/s and the Metal GPU); HEADED=1 shows the window.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const scenes = [
  { name: 'italy-flat', year: '1000 BCE', lat: 42.6, lon: 12.4, zoom: 7, flat: true },
  { name: 'italy-3d', year: '1000 BCE', lat: 42.6, lon: 12.4, zoom: 9.5, flat: false },
  { name: 'nile-flat', year: '1500 CE', lat: 26.2, lon: 32.4, zoom: 7, flat: true },
  { name: 'nile-3d', year: '1500 CE', lat: 26.2, lon: 32.4, zoom: 9.5, flat: false },
].filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY));
const results = [];
try {
  for (const scene of scenes) {
    const start = errors.length;
    await page.goto(`${base}/?mode=units&lat=${scene.lat}&lon=${scene.lon}&zoom=${scene.zoom}&settlements=1&hover=0${scene.flat ? '&close3d=0' : ''}`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year);
    await page.getByTestId('year-input').press('Enter');
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('loading'), undefined, { timeout: 240000 });
    await page.waitForTimeout(scene.flat ? 12000 : 20000);
    await page.mouse.move(720, 450);
    await page.mouse.move(724, 452);
    await page.waitForTimeout(1500);
    const shot = path.join(out, `regularity-${scene.name}${process.env.SUFFIX ?? ''}.png`);
    await page.screenshot({ path: shot });
    results.push({ scene: scene.name, year: scene.year, errors: errors.slice(start), shot });
  }
} finally {
  fs.writeFileSync(path.join(out, `regularity-shots${process.env.SUFFIX ?? ''}.json`), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results.map(({ scene, shot, errors: e }) => ({ scene, shot, errors: e.length })), null, 1));
if (errors.length) throw new Error(`Browser reported ${errors.length} errors; see regularity-shots.json`);
