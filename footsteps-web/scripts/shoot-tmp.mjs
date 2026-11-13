import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = 'http://localhost:4600/';
const out = '/Users/will/workspaces/footsteps-show-modelled-pre-hyde-people-420bea/evidence';
fs.mkdirSync(out, { recursive: true });
const NOW = 2025, OFFSET = 30, AGO_MIN = 125, AGO_MAX = 102025;
const lg = (a) => Math.log(a + OFFSET);
const S = (t) => 1 - (lg(NOW - t) - lg(AGO_MIN)) / (lg(AGO_MAX) - lg(AGO_MIN));

const browser = await chromium.launch({ headless: false, executablePath: '/Users/will/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const targets = process.argv.slice(2).map(Number);
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(name, m.type(), m.text().slice(0, 200)); });
  await page.goto(base);
  await page.waitForTimeout(2500);
  for (const t of targets) {
    const ov = page.locator('[data-testid="time-overview"]');
    const box = await ov.boundingBox();
    // Click, then nudge with the keyboard until the header shows the wanted calendar year.
    await page.mouse.click(box.x + S(t) * box.width, box.y + 5);
    await page.waitForTimeout(300);
    const slider = page.locator('[role="slider"]').first();
    await slider.focus();
    let last = 0;
    for (let i = 0; i < 80; i++) {
      const now = Number(await slider.getAttribute('aria-valuenow'));
      const d = t - now;
      const dir = Math.sign(d);
      if (Math.abs(d) < 30 || (last && dir !== last)) break;
      last = dir;
      await page.keyboard.press(dir > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    await page.waitForTimeout(5000);
    const header = await page.locator('.ov-panel').filter({ hasText: 'years ago' }).first().innerText();
    const stats = await page.locator('.ov-stats').first().innerText();
    console.log(name, t, JSON.stringify(header.replace(/\n/g, ' | ')), '||', JSON.stringify(stats.replace(/\n/g, ' | ')));
    await page.screenshot({ path: `${out}/${name}_${t}.png` });
  }
  await page.close();
}
await browser.close();
