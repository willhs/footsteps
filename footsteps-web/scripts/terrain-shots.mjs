#!/usr/bin/env node
// Screenshot terrain mode at fixed years and views.
//   node scripts/terrain-shots.mjs <base-url> <out-dir> [--keys] [--2d|--globe]
//   YEARS=-10000,1900 limits the years.
// Years open with ?year=; --keys instead steps the time bar with the arrow keys
// until the label passes the year (for builds without ?year=). Runs headed: the
// globe needs the real GPU.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [base = 'http://localhost:4455', outDir = 'terrain-shots'] = args.filter((a) => !a.startsWith('--'));
const byKeys = args.includes('--keys');
const flat = args.includes('--2d');
const globe = args.includes('--globe');
fs.mkdirSync(outDir, { recursive: true });

const YEARS = (process.env.YEARS || '-10000,-6000,1000,1900').split(',').map(Number);
const VIEWS = [
  { name: 'world', lat: 20, lon: 10, zoom: 1.4 },
  { name: 'europe-nafrica', lat: 38, lon: 12, zoom: 2.9 },
];

const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));

const label = () => page.locator('.font-mono span').nth(1).innerText();
const yearOf = (text) => {
  const n = Number(text.replace(/[^0-9]/g, ''));
  return text.includes('BCE') ? -n : n;
};

async function stepTo(year) {
  const bar = page.locator('canvas[tabindex]').first();
  await bar.focus();
  // Coarse steps until past the year, then fine steps until it flips back.
  const start = yearOf(await label());
  const left = year < start;
  for (let i = 0; i < 200 && (yearOf(await label()) > year) === left; i++)
    await page.keyboard.press(left ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
  for (let i = 0; i < 200 && (yearOf(await label()) > year) !== left; i++)
    await page.keyboard.press(left ? 'ArrowRight' : 'ArrowLeft');
}

for (const view of VIEWS) {
  for (const year of YEARS) {
    const q = `lat=${view.lat}&lon=${view.lon}&zoom=${view.zoom}${byKeys ? '' : `&year=${year}`}`;
    await page.goto(`${base}/?${q}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    if (flat) await page.getByRole('button', { name: 'Map view' }).click();
    if (globe) await page.getByRole('button', { name: 'Globe view' }).click();
    await page.getByRole('button', { name: 'Terrain' }).click();
    if (byKeys) await stepTo(year);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(Number(process.env.WAIT_MS || 3500));
    const shown = await label();
    const file = path.join(outDir, `${view.name}_${year}${flat ? '_2d' : ''}${globe ? '_globe' : ''}.png`);
    await page.screenshot({ path: file });
    console.log(file, shown);
  }
}
await browser.close();
