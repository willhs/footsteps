// Drives the population chart (`?chart=1`) in the real app, headless: shots at 50,000 BCE, 5000 BCE and 1900 on desktop and
// phone width, a click and a drag on the chart set the year, and without the flag there is no chart.
//   pnpm build && node scripts/verify-chart.mjs <evidence-dir>          (HEADED=1 shows the window)
// The app is dark only, so there is no light variant to shoot.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? 'chart-shots');
fs.mkdirSync(outDir, { recursive: true });

const dataRoot = findDataRoot(WEB, process.env.FOOTSTEPS_DATA);
const { server, base } = await serveStatic([path.join(WEB, 'out'), ...(dataRoot ? dataRoots(dataRoot) : [])]);
const browser = await chromium.launch({ headless: !process.env.HEADED, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];

const open = async (viewport, query) => {
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 600 })).newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/?${query}&still=1`);
  await page.waitForSelector('[data-testid="time-bar"]');
  return page;
};
const slider = (page) => page.locator('[role="slider"][aria-label="Time"]');
const year = async (page) => Number(await slider(page).getAttribute('aria-valuenow'));
const settle = (page) => page.waitForTimeout(1500);

try {
  // 1. Without the flag nothing is drawn.
  const plain = await open({ width: 1280, height: 800 }, 'year=-5000');
  assert.equal(await plain.locator('[data-testid="population-chart"]').count(), 0, 'chart drawn without ?chart=1');
  await plain.context().close();

  // 2. Shots: desktop and phone, three years, the chart's marker over the bar's needle.
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    for (const [label, y] of [['50000bce', -50000], ['5000bce', -5000], ['1900', 1900]]) {
      const page = await open(viewport, `year=${y}&chart=1`);
      await page.waitForSelector('[data-testid="population-chart"]');
      await settle(page);
      assert.equal(await year(page), y);
      await page.screenshot({ path: path.join(outDir, `${name}-${label}.png`) });
      const chart = page.locator('[data-testid="population-chart"]');
      const box = await chart.boundingBox();
      console.log(`${name} ${label}: chart ${Math.round(box.width)}x${Math.round(box.height)} px`);
      await page.locator('[data-testid="population-chart"]').locator('xpath=ancestor::div[contains(@class,"ov-panel")]').screenshot({ path: path.join(outDir, `${name}-${label}-panel.png`) });
      await page.context().close();
    }
  }

  // 3. Click sets the year; the year then matches the marker's place on the bar (same scale); drag follows the pointer.
  const page = await open({ width: 1280, height: 800 }, 'year=1900&chart=1');
  await page.waitForSelector('[data-testid="population-chart"]');
  const chart = page.locator('[data-testid="population-chart"]');
  const box = await chart.boundingBox();
  const at = (frac) => box.x + (27 / 300) * box.width + frac * (270 / 300) * box.width; // the plot's left edge is 27 of 300
  await page.mouse.click(at(0.3), box.y + 30);
  await settle(page);
  const afterClick = await year(page);
  console.log('click at 30% of the chart ->', afterClick);
  // The bar's scale (lib/timeScale.ts): t = 2025 + 400 - exp(ln(525) + 0.7 * (ln(102425) - ln(525))) = about -18,600 for 30% across.
  assert(Math.abs(afterClick + 18600) < 400, `click at 30% should land near 18,600 BCE, got ${afterClick}`);
  await page.screenshot({ path: path.join(outDir, 'after-click.png') });

  await page.mouse.move(at(0.4), box.y + 30);
  await page.mouse.down();
  await page.mouse.move(at(0.9), box.y + 30, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  const afterDrag = await year(page);
  console.log('drag to 90% ->', afterDrag);
  assert(afterDrag > 0 && afterDrag <= 1900, `drag to 90% should land in recent history, got ${afterDrag}`);

  const markerX = Number(await page.locator('[data-testid="population-chart-marker"]').getAttribute('x1'));
  console.log('marker x (viewBox units):', markerX);
  await page.context().close();

  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log('OK');
} finally {
  await browser.close();
  server.close();
}
