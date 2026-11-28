import { chromium } from '@playwright/test';
const [base, out, q] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/\/(grid|terrain|habitat|fauna|pmtiles|water|food|other_humans|sites|ground|languages|pastwater|ice)\//, async (route) => {
  const url = new URL(route.request().url());
  try { await route.fulfill({ response: await route.fetch({ url: `https://footsteps.willhs.me${url.pathname}${url.search}` }) }); } catch { await route.abort(); }
});
await page.goto(`${base}/?${q}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(90000);
await page.screenshot({ path: out });
console.log(JSON.stringify(errors.slice(0, 5)));
await browser.close();
