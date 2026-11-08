import { test, expect } from '@playwright/test';
import path from 'path';

test('Units clicks read the loaded image, including empty cells, without fetching facts', async ({ page }) => {
  test.setTimeout(120_000);
  let gridRequests = 0;
  await page.route('**/grid/humans_*.webp', async route => {
    gridRequests++;
    if (route.request().url().includes('humans_-1000.webp')) {
      await route.fulfill({ path: path.join(__dirname, 'fixtures/humans_-1000.webp'), contentType: 'image/webp' });
    } else await route.abort();
  });
  await page.goto('/?mode=units&lat=0.5&lon=0.5&zoom=6', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.getByText('9K people', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Globe view', exact: true }).click();
  await expect(page.locator('#view-GlobeView')).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const panel = page.getByRole('region', { name: 'What we know here' });
  await expect(panel).toContainText('≈ 997');
  await expect(panel).toContainText('≈ 8,973');
  await expect(panel).toContainText('village');
  await expect(panel).toContainText('sparse evidence');
  const requestsBefore = gridRequests;
  if (process.env.GROUNDING_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.GROUNDING_EVIDENCE_DIR, 'grounding-panel.png') });
  }
  await page.getByRole('button', { name: 'Close grounding facts' }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Map view', exact: true }).click();
  await page.mouse.click(box.x + box.width / 2 + 220, box.y + box.height / 2);
  await expect(panel).toContainText('≈ 0');
  expect(gridRequests).toBe(requestsBefore);
  // A failed next-year image must never relabel the previous grid as that year.
  await page.getByRole('slider').focus();
  await page.getByRole('slider').press('Home');
  await expect(panel).toContainText('not loaded yet');
  await page.getByRole('button', { name: 'Units', exact: true }).click();
  await expect(panel).toHaveCount(0);
});
