// Measure first-visit bytes for the default view (Units, default year).
//   pnpm build   (NEXT_PUBLIC_CDN_HOST= NEXT_PUBLIC_PMTILES_DIRECT=false)
//   GRID_DIR=/abs/path/to/grid node scripts/measure-first-load.mjs
// Optional: APP_DIR (default ./out), PAGE_QUERY (e.g. '?mode=grid'), SCREENSHOT=/abs/file.png.
// Serves out/ plus GRID_DIR at /grid, gzipping text like Caddy's `encode gzip`
// (images are sent as-is), then loads the page in Chromium with a cold cache and
// totals response bytes by kind. "firstPaint" = everything finished up to the first
// population image; "settled" adds the neighbour-year prefetch.
import { chromium } from '@playwright/test';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gridDir = process.env.GRID_DIR;
if (!gridDir) throw new Error('Set GRID_DIR to the directory holding grid images');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const bytes = new Map(); // url path -> bytes on the wire

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let file;
  if (url.pathname.startsWith('/grid/'))
    file = path.join(gridDir, url.pathname.slice(6));
  else {
    file = path.join(process.env.APP_DIR ?? path.join(root, 'out'), url.pathname);
    if (url.pathname.endsWith('/')) file += 'index.html';
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
  } catch {
    res.writeHead(404).end();
    return;
  }
  const type = types[path.extname(file)] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);
  const compressible = /^(text\/|application\/json|image\/svg)/.test(type);
  if (compressible && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    const body = zlib.gzipSync(await readFile(file), { level: 6 });
    res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': body.length });
    res.end(body);
    bytes.set(url.pathname, body.length);
  } else {
    bytes.set(url.pathname, (await stat(file)).size);
    res.writeHead(200, { 'Content-Length': (await stat(file)).size });
    createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const order = [];
page.on('requestfinished', (request) => {
  const u = new URL(request.url());
  if (u.origin === base) order.push(u.pathname);
});
await page.goto(base + (process.env.PAGE_QUERY ?? ''), { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0);
await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 15000));
if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
await browser.close();
server.close();

const kind = (p) =>
  /^\/grid\//.test(p) ? 'grid' : /\.js$/.test(p) ? 'js' : /\.css$/.test(p) ? 'css' : /\.html$|^\/$/.test(p) ? 'html' : 'other';
const sum = (paths) => {
  const out = { js: 0, css: 0, html: 0, grid: 0, other: 0 };
  for (const p of new Set(paths)) out[kind(p)] += bytes.get(p) ?? 0;
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
};
// Requests finished up to and including the first population image = first paint.
const firstGrid = order.findIndex((p) => p.startsWith('/grid/'));
const report = {
  grids: order.filter((p) => p.startsWith('/grid/')),
  firstPaint: sum(order.slice(0, firstGrid === -1 ? order.length : firstGrid + 1)),
  settled: sum(order),
};
console.log(JSON.stringify(report, null, 2));
