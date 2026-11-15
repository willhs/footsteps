// Real-data browser proof; data stays on production, application runs locally.
// node footsteps-web/scripts/verify-sun-seasons.mjs http://localhost:4444 /abs/evidence
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [base, out, only] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected base URL and evidence directory');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
const errors = [];
const warnings = [];
const results = [];
const consoleLog = [];
const inflightData = new Set();
const responses = [];
await page.addInitScript(() => {
  window.shaderErrors = [];
  const compile = WebGL2RenderingContext.prototype.compileShader;
  WebGL2RenderingContext.prototype.compileShader = function(shader) {
    compile.call(this, shader);
    if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) window.shaderErrors.push(this.getShaderInfoLog(shader));
  };
});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  consoleLog.push({ type: message.type(), text: message.text() });
  if (message.type() === 'error') errors.push(message.text());
  if (message.type() === 'warning' && /shader|grid.*failed/i.test(message.text())) warnings.push(message.text());
});
await page.route(/\/(grid|terrain|habitat|fauna|pmtiles)\//, async route => {
  const request = (async () => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}${url.search}` });
    responses.push({ path: url.pathname, status: response.status() });
    await route.fulfill({ response });
  })();
  inflightData.add(request);
  try { await request; } finally { inflightData.delete(request); }
});
async function capture(name) {
  const file = path.join(out, `${name}.png`);
  const png = await page.screenshot({ path: file });
  const brightness = await page.evaluate(async data => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(600, 300, 200, 200).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    return sum / (pixels.length / 4 * 3);
  }, png.toString('base64'));
  return { screenshot: file, brightness };
}
try {
  for (const scene of [
    { name: 'flat', mode: 'units', zoom: 6, lat: 35, lon: -120 },
    { name: 'plain', mode: 'units', zoom: 6, lat: 35, lon: -120, plain: true },
    { name: 'daylight', mode: 'grid', zoom: 6, lat: 35, lon: 0, daylight: true },
    { name: 'globe', mode: 'auto', zoom: 2, lat: 35, lon: -120, globe: true },
    { name: 'close3d', mode: 'units', zoom: 9, lat: 35, lon: -120 },
    { name: 'grid', mode: 'grid', zoom: 6, lat: 35, lon: -120 },
    { name: 'dots', mode: 'dots', zoom: 6, lat: 35, lon: -120 },
    { name: 'seasons', mode: 'units', zoom: 7, lat: 32.86, lon: 35.55, seasons: true, year: '21000 BCE' },
    { name: 'herders', mode: 'units', zoom: 8, lat: 45, lon: 70, seasons: true },
  ].filter(scene => !only || scene.name === only)) {
    await page.context().clearCookies();
    await page.goto(`${base}/?mode=${scene.mode}&zoom=${scene.zoom}&lat=${scene.lat}&lon=${scene.lon}&hover=0${scene.seasons ? '&seasons=1' : ''}`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year ?? '0 CE');
    await page.getByTestId('year-input').press('Enter');
    if (scene.globe) await page.getByRole('button', { name: 'Globe view', exact: true }).click();
    if (scene.plain) await page.getByRole('button', { name: 'Plain', exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    // route.fetch runs outside the page's network-idle accounting. Await the
    // actual proxy responses before comparing off/on pixels.
    while (inflightData.size) await Promise.all([...inflightData]);
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('loading'), undefined, { timeout: 90000 });
    await page.waitForTimeout(6000);
    const toggle = page.getByRole('button', { name: 'Day/night shading', exact: true });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByRole('group', { name: 'Seasonal scenario', exact: true }).count(), scene.seasons ? 1 : 0);
    let before = await capture(`${scene.name}-off`);
    await toggle.click();
    await page.waitForTimeout(2000);
    const after = await capture(`${scene.name}-night`);
    if (scene.globe) {
      // A projection switch in an occluded headed browser can leave the first
      // terrain upload undrawn. Exercise the reverse toggle and compare that
      // rendered Off state; this also proves shading is reversible.
      await toggle.click();
      await page.waitForTimeout(2000);
      before = await capture(`${scene.name}-restored`);
      await toggle.click();
    }
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    if (scene.daylight) assert(Math.abs(after.brightness - before.brightness) < before.brightness * 0.1, 'Daylit terrain must retain its colours');
    else if (!scene.seasons) assert(after.brightness < before.brightness * 0.8, `${scene.name}: night must darken the actual map (${JSON.stringify({before, after})})`);
    if (scene.name === 'close3d') assert.match(await page.getByTestId('sun-time').innerText(), /4:00 am · night/);
    if (scene.seasons) {
      const population = await page.locator('.ov-stats .whitespace-nowrap .metric-value').innerText();
      await toggle.click();
      await page.getByRole('button', { name: 'Season june', exact: true }).click();
      await page.waitForTimeout(3000);
      const june = await capture(`${scene.name}-june`);
      await page.getByRole('button', { name: 'Season december', exact: true }).click();
      await page.waitForTimeout(3000);
      const december = await capture(`${scene.name}-december`);
      assert.match(await page.locator('body').innerText(), /Seasonal rounds · modelled \(December\)/);
      assert.equal(await page.getByRole('button', { name: 'Season december', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.ov-stats .whitespace-nowrap .metric-value').innerText(), population);
      results.push({ scene: scene.name, june, december });
    }
    results.push({ scene: scene.name, before, after });
    if (scene.name === 'herders') {
      const slider = page.getByRole('slider', { name: 'Time', exact: true });
      await slider.focus();
      await slider.press('End');
      assert.equal(await slider.getAttribute('aria-valuenow'), '1900');
      await page.waitForTimeout(1500);
      assert.match(await page.locator('.ov-stats').innerText(), /1900 CE/);
      assert.match(await page.locator('.ov-stats .whitespace-nowrap .metric-value').innerText(), /B people/);
      const bar = await page.getByTestId('time-bar').boundingBox();
      await page.mouse.move(bar.x + bar.width - 4, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + bar.width - 80, bar.y + bar.height / 2, { steps: 8 });
      await page.mouse.up();
      assert(Number(await slider.getAttribute('aria-valuenow')) < 1900);
      await page.getByRole('button', { name: 'Units', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Grid', exact: true }).count(), 1);
      await page.waitForLoadState('networkidle', { timeout: 90000 });
      while (inflightData.size) await Promise.all([...inflightData]);
      results.push({ scene: 'scrub-population-mode-switch', year: await slider.getAttribute('aria-valuenow'), ...(await capture('scrub-grid')) });
    }
  }
} finally {
  const shaderErrors = await page.evaluate(() => window.shaderErrors).catch(() => []);
  await page.screenshot({ path: path.join(out, 'last-screen.png') });
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ results, errors, warnings, shaderErrors, consoleLog, responses }, null, 2));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}
// Hydration mismatches (dev warning or prod #418) count as errors like any other.
assert.deepEqual(errors, []);
assert.deepEqual(warnings, []);
console.log(`Verified ${results.length} real-data scene results with no browser errors`);
