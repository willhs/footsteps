// Verify the opt-in evidence layer using real, locally served datasets.
// node scripts/verify-dna-evidence.mjs http://localhost:4444 /absolute/evidence/dir
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [base = 'http://localhost:4444', out] = process.argv.slice(2);
if (!out) throw new Error('Pass an evidence directory outside git');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/evidence/')) requests.push(r.url());
});
const rows = [];
try {
  for (const [name, year, zoom, evidence] of [
    ['default-units', -3000, 6, false],
    ['europe-40000', -40000, 4.2, true],
    ['europe-3000', -3000, 4.2, true],
    ['dna-neanderthal', -40000, 6, true],
    ['dna-modern', -40000, 6, true],
  ]) {
    const lat =
      name === 'dna-modern'
        ? 45.12
        : name === 'dna-neanderthal'
          ? 50.48222
          : 48;
    const lon =
      name === 'dna-modern' ? 21.9 : name === 'dna-neanderthal' ? 4.66917 : 12;
    await page.goto(
      `${base}/?year=${year}&lat=${lat}&lon=${lon}&zoom=${zoom}&hover=0${evidence ? '&evidence=1' : ''}`,
    );
    await page.locator('canvas').first().waitFor();
    await page.waitForTimeout(6000);
    if (!evidence)
      assert.equal(requests.length, 0, 'Default must not load evidence');
    else {
      assert.ok(requests.some((u) => u.endsWith('/aadr_samples.json.gz')));
      if (name.startsWith('dna-')) {
        // The selected locality is at the centre of the map viewport.
        await page.mouse.move(720, 450);
        await page.waitForTimeout(800);
      }
    }
    const text = await page.locator('body').innerText();
    if (name.startsWith('dna-')) {
      assert.match(text, /MEASURED EVIDENCE.*ANCIENT DNA/);
      assert.match(
        text,
        name === 'dna-neanderthal' ? /Neanderthal/ : /Modern human/,
      );
      assert.match(text, /Source:/);
    }
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    rows.push({ name, year, zoom, text });
  }
  await fs.writeFile(
    path.join(out, 'browser.json'),
    JSON.stringify({ rows, requests, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: default makes no evidence requests; opt-in loads AADR; screenshots saved.',
  );
} finally {
  await browser.close();
}
