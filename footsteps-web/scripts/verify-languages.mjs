// The hover card's language line, on real data: the real atlas served by deploy/budgie/api/day_api.py
// (the dev server has no /api, so /api/anthropology is forwarded to it; nothing is substituted).
//   DAY_DB=/tmp/days.db poetry run python deploy/budgie/api/day_api.py        # :8000
//   pnpm --dir footsteps-web dev                                              # :4444
//   node footsteps-web/scripts/verify-languages.mjs http://localhost:4444 /absolute/evidence [http://127.0.0.1:8000]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [base, out, api = 'http://127.0.0.1:8000'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const calls = [];
await page.route('**/api/anthropology*', async (route) => {
  const url = new URL(route.request().url());
  calls.push(url.search);
  const res = await fetch(`${api}${url.pathname}${url.search}`);
  await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
});
const results = [];
try {
  for (const scene of [
    // The Mixtec cell (Oaxaca), 15-20 N 100-95 W.
    { name: 'oaxaca-1500', lat: 17.5, lon: -97.5, year: '1500', expected: /^Languages recorded here \(about 1500 CE\): Otomanguean/m },
    { name: 'oaxaca-1900', lat: 17.5, lon: -97.5, year: '1900', expected: /^Languages recorded here \(about 1500 CE\): Otomanguean/m },
    { name: 'oaxaca-3000bce', lat: 17.5, lon: -97.5, year: '3000 BCE', expected: null },
    { name: 'oaxaca-1400', lat: 17.5, lon: -97.5, year: '1400', expected: null },
    { name: 'lagos-1500', lat: 7.5, lon: 3.5, year: '1500', expected: /^Languages recorded here \(about 1500 CE\): Atlantic-Congo/m },
  ]) {
    calls.length = 0;
    await page.goto(`${base}/?lat=${scene.lat}&lon=${scene.lon}&zoom=5&mode=units&close3d=0`);
    await page.getByTestId('year-label').click();
    await page.getByTestId('year-input').fill(scene.year);
    await page.getByTestId('year-input').press('Enter');
    await page.mouse.move(720, 550);
    const card = page.getByRole('tooltip');
    await card.waitFor();
    await card.getByText(/°N|°S/).waitFor();
    await card.getByText(/people|person|No one/).first().waitFor({ timeout: 60000 });
    if (scene.expected) {
      await card.getByText(/^Languages recorded here/).waitFor({ timeout: 15000 });
      assert.match(await card.innerText(), scene.expected);
      assert.match(await card.innerText(), /nearest:/);
      assert.ok(calls.every((c) => c.includes('fill=0')), `every atlas call skips the model: ${calls}`);
    } else {
      await page.waitForTimeout(1500); // long enough for a request to have come back
      assert.equal(await card.getByText(/anguage/).count(), 0);
      assert.equal(calls.length, 0, `no atlas request before 1500: ${calls}`);
    }
    await page.screenshot({ path: path.join(out, `${scene.name}.png`) });
    results.push({ scene: scene.name, text: await card.innerText(), atlasCalls: [...calls] });
  }
} finally {
  fs.writeFileSync(path.join(out, 'languages-browser.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
