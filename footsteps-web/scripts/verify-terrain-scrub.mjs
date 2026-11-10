#!/usr/bin/env node
// Scrub the time bar across terrain steps and sample a Sahara patch: it must
// never go dark (blank terrain) or jump between samples (a flash).
//   node scripts/verify-terrain-scrub.mjs <base-url> <evidence-dir>
// Runs headed (real GPU). Writes samples.json and first/last screenshots.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [base = 'http://localhost:4455', outDir = 'terrain-scrub'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(`${base}/?lat=20&lon=10&zoom=2.6&year=-9800`);
await page.waitForLoadState('networkidle').catch(() => {});
await page.getByRole('button', { name: 'Terrain' }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, 'start.png') });

// Central Sahara (desert -> green Sahara and back), away from the legend.
const clip = { x: 560, y: 330, width: 80, height: 40 };
// Decode screenshots in a second page (no image library needed).
const helper = await browser.newPage();
const lum = async () => {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return helper.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bmp = await createImageBitmap(blob);
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let s = 0;
    for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    return s / (px.length / 4);
  }, b64);
};
const label = () => page.locator('.font-mono span').nth(1).innerText();

const bar = page.locator('canvas[tabindex]').first();
await bar.focus();
const samples = [];
for (let i = 0; i < 90; i++) {
  await page.keyboard.press('ArrowRight');
  samples.push({ year: await label(), lum: +(await lum()).toFixed(1) });
}
await page.screenshot({ path: path.join(outDir, 'end.png') });
await browser.close();
fs.writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 1));

const values = samples.map((s) => s.lum);
const jumps = values.slice(1).map((v, i) => Math.abs(v - values[i]));
const report = {
  from: samples[0].year,
  to: samples[samples.length - 1].year,
  minLum: Math.min(...values),
  maxLum: Math.max(...values),
  maxJump: Math.max(...jumps),
};
console.log(JSON.stringify(report));
assert(report.minLum > 30, `terrain went dark mid-scrub (min luminance ${report.minLum})`);
assert(report.maxJump < 15, `terrain jumped between samples (max ${report.maxJump})`);
console.log('ok   terrain scrub: no blank or flashing frames');
