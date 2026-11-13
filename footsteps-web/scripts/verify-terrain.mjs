#!/usr/bin/env node
// Real GPU terrain screenshots and scrub proof. Static assets may be supplied
// from the live server for a fresh checkout: DATA_ORIGIN=https://footsteps.willhs.me
// node scripts/verify-terrain.mjs http://localhost:4444 /absolute/evidence/path
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [base = 'http://localhost:4444', out = 'terrain-evidence'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const navigationErrors = [];
let navigating = false;
const demRequests = [];
const failedRequests = [];
page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), failure: r.failure() }));
const logs = [];
const knownHydrationErrors = [];
page.on('pageerror', (e) => {
  // Existing URL view-state SSR mismatch; retain it explicitly in evidence.
  if (/Minified React error #418|Hydration failed/.test(e.message)) knownHydrationErrors.push(e.message);
  else errors.push(e.message);
});
page.on('console', (m) => {
  logs.push(m.text());
  if (m.type() === 'error') {
    if (navigating && /^TypeError: Failed to fetch/.test(m.text())) navigationErrors.push(m.text());
    else { errors.push(m.text()); console.error(m.text()); }
  }
});
const goto = page.goto.bind(page);
page.goto = async (...args) => {
  navigating = true;
  try { return await goto(...args); } finally { navigating = false; }
};
page.on('request', (r) => { if (r.url().includes('/terrarium/')) demRequests.push(r.url()); });
if (process.env.DATA_ORIGIN) {
  const cache = new Map();
  await page.route(/\/(terrain|grid|pmtiles)\//, async (route) => {
    const url = new URL(route.request().url());
    const remote = process.env.DATA_ORIGIN + url.pathname + url.search;
    if (url.pathname.startsWith('/pmtiles/')) {
      await route.fulfill({ response: await route.fetch({ url: remote }) });
      return;
    }
    let response = cache.get(remote);
    if (!response) {
      response = await page.request.get(remote);
      cache.set(remote, response);
    }
    await route.fulfill({ response });
  });
}
async function year(value) {
  const input = page.getByTestId('year-input');
  if (!(await input.isVisible())) await page.getByTestId('year-label').click();
  await input.fill(value < 0 ? `${-value} BCE` : `${value} CE`);
  await input.press('Enter');
  assert.equal((await page.getByTestId('year-label').textContent()).replace(/[,\s]/g, ''),
    `${Math.abs(value)}${value < 0 ? 'BCE' : 'CE'}`, 'Year edit did not reach the map');
  await page.waitForTimeout(2500);
}
async function settle() {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
async function scrub(action = async () => {
  for (const t of [1400, 1500, 1600, 1500, 1400, 1500]) await year(t);
}) {
  await page.evaluate(() => {
    window.terrainFrames = [];
    window.terrainRunning = true;
    const tick = (t) => { window.terrainFrames.push(t); if (window.terrainRunning) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await action();
  return page.evaluate(() => {
    window.terrainRunning = false;
    const f = window.terrainFrames;
    const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
    return { fps: 1000 * (f.length - 1) / (f.at(-1) - f[0]), p95Ms: gaps[Math.floor(gaps.length * 0.95)] };
  });
}
async function oldBarScrub(origin) {
  await page.goto(`${origin}/?lat=50.3&lon=-1.5&zoom=8&bar=old`);
  await settle();
  const slider = page.getByRole('slider', { name: 'Time', exact: true });
  await slider.focus();
  await slider.press('End');
  await settle();
  const years = [];
  const timing = await scrub(async () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) {
      await slider.press(key);
      years.push(await slider.getAttribute('aria-valuenow'));
      await page.waitForTimeout(2500);
    }
  });
  return { ...timing, years };
}
const results = { scenes: [], errors, navigationErrors, knownHydrationErrors, logs, demRequests, failedRequests, dataOrigin: process.env.DATA_ORIGIN ?? 'local' };
try {
  for (const time of [-20000, 1500]) {
    for (const zoom of [6, 8, 10]) {
      await page.goto(`${base}/?lat=43.5&lon=6.8&zoom=${zoom}`);
      await settle();
      await year(time);
      await settle();
      const shot = `${time}-zoom-${zoom}.png`;
      await page.screenshot({ path: path.join(out, shot) });
      results.scenes.push({ time, zoom, shot });
      console.log('captured', time, zoom);
    }
  }
  await page.goto(`${base}/?lat=50.3&lon=-1.5&zoom=8`);
  await settle();
  await year(-10000);
  await settle();
  await page.screenshot({ path: path.join(out, 'shelf--10000.png') });
  await year(1500);
  await settle();
  // Shelf at the LGM, same coordinates at a recent era: sea must remain flat.
  for (const time of [-20000, 1500]) {
    await page.goto(`${base}/?lat=50.3&lon=-1.5&zoom=8`);
    await settle();
    await year(time);
    await settle();
    await page.screenshot({ path: path.join(out, `shelf-${time}.png`) });
  }
  const before = demRequests.length;
  results.scrub = await scrub();
  results.scrub.additionalDemRequests = demRequests.length - before;
  assert.equal(results.scrub.additionalDemRequests, 0, 'Scrubbing reloaded elevation');
  for (const mode of ['units', 'grid', 'dots']) {
    await page.goto(`${base}/?lat=43.5&lon=6.8&zoom=8&mode=${mode}`);
    await settle();
    await year(1500);
    await settle();
    await page.screenshot({ path: path.join(out, `mode-${mode}.png`) });
  }
  await page.goto(`${base}/?lat=43.5&lon=6.8&zoom=6`);
  await settle();
  await year(1500);
  await page.getByRole('button', { name: 'Globe view', exact: true }).click();
  await settle();
  await page.screenshot({ path: path.join(out, 'globe.png') });
  const worldBefore = demRequests.length;
  await page.goto(`${base}/?zoom=2`);
  await settle();
  assert.equal(demRequests.length - worldBefore, 0, 'World view requested DEM tiles');
  results.worldDemRequests = 0;
  if (process.env.BASELINE_ORIGIN) {
    results.comparableScrub = await oldBarScrub(base);
    results.baselineScrub = await oldBarScrub(process.env.BASELINE_ORIGIN);
    assert.deepEqual(results.comparableScrub.years, results.baselineScrub.years, 'Baseline scrub years differ');
  }
  assert.ok(demRequests.length > 0, 'No elevation tiles requested');
  assert.ok(navigationErrors.length <= failedRequests.filter(r => r.failure?.errorText === 'net::ERR_ABORTED').length,
    'Navigation fetch error without an aborted request');
  assert.deepEqual(errors, [], 'Browser errors');
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
