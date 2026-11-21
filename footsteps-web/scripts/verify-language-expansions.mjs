// The hover card's "Languages spreading here" line (?langs=deep), on real data, with the flag on and off.
// The app comes from `base` (a dev server or production); data the dev server does not have (population grids, habitat
// lookups, the atlas API) is forwarded unchanged to `data` (default production). Nothing is substituted.
//   pnpm --dir footsteps-web exec next dev -p 4455
//   node footsteps-web/scripts/verify-language-expansions.mjs http://localhost:4455 /absolute/evidence [https://footsteps.willhs.me]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [base, out, data = 'https://footsteps.willhs.me'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const FORWARD = /^\/(grid|habitat|terrain|ground|water|sites|pastwater|pmtiles|api)\//;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const tableFetches = [];
page.on('request', (req) => {
  if (new URL(req.url()).pathname === '/languages/expansions.json') tableFetches.push(req.url());
});
if (data !== base) {
  await page.route(`${base}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!FORWARD.test(url.pathname)) return route.fallback();
    const res = await fetch(`${data}${url.pathname}${url.search}`).catch(() => null);
    if (!res) return route.abort();
    await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
  });
}

const SCENES = [
  { name: 'mexico-1700', lat: 17.5, lon: -97.5, year: '1700', expected: /Languages spreading here: Spanish \(from 1519 CE;/ },
  { name: 'central-africa-1000bce', lat: -2.5, lon: 17.5, year: '1000 BCE', expected: /Languages spreading here: Bantu \(from about 4,000-5,000 years ago; Koile et al\. 2022\)/ },
  { name: 'anatolia-1200', lat: 39, lon: 33, year: '1200', expected: /Languages spreading here: Turkic \(from 1071 CE;/ },
  // The 5 ka floor: the Bantu row starts at the floor, so 4000 BCE says nothing even with the flag.
  { name: 'central-africa-4000bce', lat: -2.5, lon: 17.5, year: '4000 BCE', expected: null },
];
const results = [];
try {
  for (const flag of [true, false]) {
    for (const scene of SCENES) {
      tableFetches.length = 0;
      const name = `${scene.name}-${flag ? 'langs-deep' : 'no-flag'}`;
      await page.goto(`${base}/?lat=${scene.lat}&lon=${scene.lon}&zoom=5&mode=units&close3d=0${flag ? '&langs=deep' : ''}`);
      await page.getByTestId('year-label').click();
      await page.getByTestId('year-input').fill(scene.year);
      await page.getByTestId('year-input').press('Enter');
      await page.mouse.move(720, 550);
      const card = page.getByRole('tooltip');
      await card.waitFor();
      await card.getByText(/°N|°S/).waitFor();
      await card.getByText(/people|person|No one/).first().waitFor({ timeout: 60000 });
      if (flag && scene.expected) {
        await card.getByText(/^Languages spreading here/).waitFor({ timeout: 15000 });
        assert.match(await card.innerText(), scene.expected);
        assert.match(await card.innerText(), /hand-drawn 5° areas, not boundaries/);
      } else {
        await page.waitForTimeout(1500); // long enough for the table to have arrived
        assert.equal(await card.getByText(/spreading here/).count(), 0, `${name}: no spreading line`);
      }
      if (!flag) assert.equal(tableFetches.length, 0, `${name}: the table is not fetched without the flag`);
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      results.push({ scene: name, text: await card.innerText(), tableFetches: [...tableFetches] });
    }
  }
} finally {
  fs.writeFileSync(path.join(out, 'language-expansions-browser.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`${results.length} scenes ok -> ${out}`);
