// Check that browsers decode the population WebPs to exactly the levels Pillow
// reads from the same files (the grid_image.py reference), in every engine.
//   GRID_DIR=/abs/path/to/grid node scripts/verify-webp-decode.mjs [year ...]
// The page runs the same steps as gridData.ts decodeYearGrid: fetch, createImageBitmap
// with colour conversion and premultiplication off, canvas, getImageData; then
// hashes the R and G bytes of every pixel.
import { chromium, firefox, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const gridDir = process.env.GRID_DIR;
if (!gridDir) throw new Error('Set GRID_DIR to the directory holding humans_<year>.webp');
const years = process.argv.slice(2).map(Number);
if (!years.length) years.push(-10000, -1000, 0, 1900);

const reference = (year) =>
  execFileSync(
    'python3',
    [
      '-c',
      'import sys,hashlib,numpy as np;from PIL import Image;a=np.array(Image.open(sys.argv[1]));print(hashlib.sha256(a[...,:2].tobytes()).hexdigest())',
      path.join(gridDir, `humans_${year}.webp`),
    ],
    { encoding: 'utf8' },
  ).trim();

const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>decode</title>');
    return;
  }
  const file = path.join(gridDir, path.basename(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let failed = false;
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  let browser;
  try {
    browser = await engine.launch();
  } catch (error) {
    console.log(`${name}: not installed (${String(error).split('\n')[0]})`);
    continue;
  }
  const page = await browser.newPage();
  await page.goto(base);
  for (const year of years) {
    const got = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const bmp = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      const { width: w, height: h } = bmp;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      const rg = new Uint8Array(w * h * 2);
      for (let i = 0; i < w * h; i++) {
        rg[i * 2] = px[i * 4];
        rg[i * 2 + 1] = px[i * 4 + 1];
      }
      const digest = await crypto.subtle.digest('SHA-256', rg);
      return {
        size: [w, h],
        hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
      };
    }, `${base}/humans_${year}.webp`);
    const want = reference(year);
    const ok = got.hash === want && got.size.join('x') === '4320x2160';
    failed ||= !ok;
    console.log(`${name} ${year}: ${ok ? 'identical to Pillow' : `MISMATCH ${got.hash} vs ${want}`} (${got.size.join('x')})`);
  }
  await browser.close();
}
server.close();
process.exit(failed ? 1 : 0);
