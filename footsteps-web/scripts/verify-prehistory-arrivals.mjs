// Drive the local app with regenerated prehistory images and record arrival checkpoints.
// node scripts/verify-prehistory-arrivals.mjs <base-url> <evidence-dir>
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [base = 'http://localhost:4444', out] = process.argv.slice(2);
if (!out) throw new Error('Pass an evidence directory outside the repository');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const rows = [];
try {
  // 30,000 BCE is still within Tibet's ramp; 28,000 BCE is after its 30 ka BP end.
  for (const year of [-100000, -50000, -30000, -28000]) {
    for (const [place, lat, lon] of [['Jerusalem', 31.8, 35.2], ['Lhasa', 29.7, 91.1]]) {
      await page.goto(`${base}/?year=${year}&lat=${lat}&lon=${lon}&zoom=5&mode=grid&hover=0`);
      await page.locator('canvas').first().waitFor();
      await page.waitForFunction(() => document.body.innerText.includes('modelled'));
      // Read the served WebP with the same colour-preserving browser path as gridData.ts.
      const cells = await page.evaluate(async ({ year }) => {
        const response = await fetch(`/grid/humans_${year}.webp`);
        if (!response.ok) throw new Error(`Population image: HTTP ${response.status}`);
        const bmp = await createImageBitmap(await response.blob(), {
          colorSpaceConversion: 'none', premultiplyAlpha: 'none',
        });
        if (bmp.width !== 720 || bmp.height !== 360) throw new Error('Expected a 0.5 degree image');
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        const pixels = ctx.getImageData(0, 0, 720, 360).data;
        return [['Jerusalem', 31.8, 35.2], ['Lhasa', 29.7, 91.1], ['Kyushu', 33.6, 130.4]].map(([place, lat, lon]) => {
          const i = (Math.floor((90 - lat) / 0.5) * 720 + Math.floor((lon + 180) / 0.5)) * 4;
          const level = pixels[i] * 256 + pixels[i + 1];
          return { place, level, people: Math.expm1(level / 1023 * Math.log1p(5000000)) };
        });
      }, { year });
      for (const cell of cells) {
        if (year < -30000) assert.equal(cell.level, 0, `${year} ${cell.place}: before arrival`);
        else assert.ok(cell.people > 0, `${year} ${cell.place}: after arrival`);
      }
      await page.waitForTimeout(2500); // allow the worker decode and deck.gl upload to settle
      await page.screenshot({ path: path.join(out, `${place}-${year}-grid.png`) });
      rows.push({ year, place, cells, text: await page.locator('body').innerText() });
    }
  }
  // These modes share the prehistory interval; Dots intentionally has no pre-HYDE archive.
  for (const mode of ['units', 'dots']) {
    await page.goto(`${base}/?year=-30000&lat=29.7&lon=91.1&zoom=6&mode=${mode}&hover=0`);
    await page.locator('canvas').first().waitFor();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(out, `Lhasa--30000-${mode}.png`) });
  }
  // Deep-link hydration warnings in SupportingText predate these data changes.
  // Keep them in the evidence; this check targets arrival data and rendering failures.
  const unexpected = errors.filter((message) => !message.startsWith('Hydration failed because'));
  await fs.writeFile(path.join(out, 'browser-arrivals.json'), JSON.stringify({ rows, errors }, null, 2));
  assert.deepEqual(unexpected, [], 'Unexpected browser runtime errors');
  console.log(`Recorded ${errors.length} existing deep-link hydration warnings in browser-arrivals.json.`);
  console.log('PASS: 100,000/50,000 BCE checkpoints empty; 30,000/28,000 BCE Jerusalem/Lhasa/Kyushu populated; Grid/Units/Dots screenshots saved.');
} finally {
  await browser.close();
}
