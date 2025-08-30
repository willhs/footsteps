import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Helper: attempt to find any yearly tileset in HUMANS_TILES_DIR
function findAnyTileset(baseDir: string): { year: number; file: string } | null {
  try {
    const entries = fs.readdirSync(baseDir);
    // Prefer pmtiles for frontend PMTiles client
    const pm = entries.find((e) => /^humans_(-?\d+)\.pmtiles$/i.test(e));
    if (pm) {
      const m = pm.match(/^humans_(-?\d+)\.pmtiles$/i)!;
      return { year: Number(m[1]), file: path.join(baseDir, pm) };
    }
    // Fallback: mbtiles exists but cannot be served directly by PMTiles client
    // Return null so test can skip
    return null;
  } catch {
    return null;
  }
}

test.describe('Population rendering', () => {
  test('loads app and renders non-zero dots (PMTiles)', async ({ page }) => {
    const tilesDir = process.env.HUMANS_TILES_DIR || '';
    const found = tilesDir ? findAnyTileset(tilesDir) : null;

    // Skip when tiles not available locally; keeps CI green
    test.skip(!found, 'HUMANS_TILES_DIR not set or contains no pmtiles/mbtiles');

    // Intercept PMTiles URL and serve bytes from local file, with Range support
    const pmtilesUrl = /pmtiles.*\/humans_(-?\d+)\.pmtiles$/;

    const filePath = found!.file;
    const buffer = fs.readFileSync(filePath);

    let interceptCount = 0;
    await page.route(pmtilesUrl, async (route) => {
      interceptCount += 1;
      const headers = route.request().headers();
      const range = headers['range'] || headers['Range'];
      if (range) {
        const m = /bytes=(\d+)-(\d+)?/.exec(String(range));
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : buffer.length - 1;
        const slice = buffer.subarray(start, end + 1);
        await route.fulfill({
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(slice.length),
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
          },
          body: slice,
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(buffer.length),
          },
          body: buffer,
        });
      }
    });

    page.on('request', (req) => {
      const url = req.url();
      if (/pmtiles.*humans_.*\.pmtiles$/.test(url)) {
        // eslint-disable-next-line no-console
        console.log('[PMTILES-REQ]', url);
      }
    });

    // Debug: log network requests to verify PMTiles URL is requested
    page.on('request', (req) => {
      const url = req.url();
      if (/\.pmtiles(\?.*)?$/.test(url) || url.includes('/api/tiles/')) {
        // eslint-disable-next-line no-console
        console.log('[REQ]', url);
      }
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (/pmtiles|tile|error|humans/i.test(text)) {
        // eslint-disable-next-line no-console
        console.log('[LOG]', text);
      }
    });

    await page.goto('/');

    // Ensure our PMTiles interception is active
    const start = Date.now();
    while (Date.now() - start < 10000 && interceptCount === 0) {
      await page.waitForTimeout(100);
    }
    expect(interceptCount).toBeGreaterThan(0);

    // Wait for deck.gl canvas to appear
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    // Wait until UI shows non-zero dots
    const overlay = page.locator('div:has-text("Dots drawn:")').first();
    await expect(overlay).toBeVisible({ timeout: 30_000 });

    const getDotsCount = async (): Promise<number> => {
      const text = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('div, span, p'))
          .find((el) => /Dots drawn:/i.test(el.textContent || ''));
        if (!label) return null;
        const span = label.parentElement?.querySelector('span');
        return span?.textContent || null;
      });
      if (!text) return 0;
      const numeric = Number((text || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(numeric) ? numeric : 0;
    };

    const deadline = Date.now() + 30_000;
    let dots = 0;
    while (Date.now() < deadline) {
      dots = await getDotsCount();
      if (dots > 0) break;
      await page.waitForTimeout(250);
    }
    expect(dots).toBeGreaterThan(0);
  });
});
