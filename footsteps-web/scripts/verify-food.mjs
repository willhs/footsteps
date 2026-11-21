// Real local habitat/population and generated food export; no substituted API responses.
// node footsteps-web/scripts/verify-food.mjs http://localhost:4444 /absolute/evidence
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const results = [];
const requests = [];
page.on('request', (r) => { if (r.url().includes('/food/')) requests.push(r.url()); });
try {
  for (const scene of [
    { name: 'levant', lat: 33, lon: 36, year: '8000 BCE', expected: /wheat.*barley.*goat/i, mode: 'units' },
    { name: 'mexico', lat: 18, lon: -99, year: '3000 BCE', expected: /maize/i, mode: 'grid' },
    { name: 'europe', lat: 47, lon: 8, year: '20000 BCE', expected: /reindeer|horse|bison|grass seeds|berries|roots/i, mode: 'units' },
    { name: 'dots', lat: 33, lon: 36, year: '8000 BCE', expected: /wheat.*barley.*goat/i, mode: 'dots' },
    { name: 'default', lat: 33, lon: 36, year: '8000 BCE', mode: 'units' },
  ]) {
    requests.length = 0;
    await page.goto(`${base}/?lat=${scene.lat}&lon=${scene.lon}&zoom=5&mode=${scene.mode}&close3d=0${scene.name === 'default' ? '' : '&food=1'}`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year);
    await page.getByTestId('year-input').press('Enter');
    await page.mouse.move(720, 550);
    const card = page.getByRole('tooltip');
    await card.waitFor();
    if (scene.expected) {
      await card.getByText(/^Food here:/).waitFor({ timeout: 30000 });
      assert.match(await card.innerText(), scene.expected);
      assert.match(await card.innerText(), /recalled/);
      assert.match(await card.innerText(), /modelled/);
    } else {
      await card.getByText(/°N/).waitFor();
      assert.equal(await card.getByText(/^Food here:/).count(), 0);
      assert.equal(requests.length, 0);
    }
    if (scene.mode !== 'dots') await card.getByText(/people|person|No one/).first().waitFor({ timeout: 60000 });
    const text = await card.innerText();
    await page.screenshot({ path: path.join(out, `${scene.name}.png`) });
    results.push({ scene: scene.name, text, foodRequests: [...requests] });
  }
} finally {
  fs.writeFileSync(path.join(out, 'food-browser.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
