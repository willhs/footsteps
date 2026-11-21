#!/usr/bin/env node
// Steps through the `?tour=1` guided tour on the real build and real data and screenshots every stop (docs/ops/tour.md).
//
//   node scripts/tour-shots.mjs <out-dir>          serve out/ + data (like `pnpm visual`), shoot each stop to <out-dir>/NN-<id>.png
//   node scripts/tour-shots.mjs <out-dir> --base URL   use a server already running
//
// Fails (exit 1) on any console error or page error, if a stop's card does not appear, if a drag during a flight does not
// stop the flight, if Back does not go back, or if Finish leaves the tour on screen or `tour=1` in the address.
// Headless on the real GPU like the other verify scripts; HEADED=1 shows the browser. Run `pnpm build` first.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { VIEWPORT, dataRoots, findDataRoot } from './visual-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const FLY_MS = 2400; // lib/tour.ts FLY_MS

const argv = process.argv.slice(2);
const outDir = path.resolve(argv[0] ?? '');
if (!argv[0]) throw new Error('usage: node scripts/tour-shots.mjs <out-dir> [--base URL]');
const baseArg = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : null;
fs.mkdirSync(outDir, { recursive: true });

let server = null;
let base = baseArg;
if (!base) {
  const out = path.join(WEB, 'out');
  if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('No out/: run `pnpm build` first.');
  const dataRoot = findDataRoot(WEB, process.env.FOOTSTEPS_DATA);
  if (!dataRoot) throw new Error('No real data (data/tiles/grid): set FOOTSTEPS_DATA.');
  ({ server, base } = await serveStatic([out, ...dataRoots(dataRoot)]));
}

const browser = await chromium.launch({ headless: !process.env.HEADED, args: GPU_ARGS });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
// Elevation tiles from AWS: served from the visual run's cache when there, fetched (and cached) otherwise.
const DEM_CACHE = path.join(WEB, 'visual-cache');
fs.mkdirSync(DEM_CACHE, { recursive: true });
await context.route(/^https:\/\/(s3\.amazonaws\.com\/elevation-tiles-prod|elevation-tiles-prod\.s3\.amazonaws\.com)\//, async (route) => {
  const file = path.join(DEM_CACHE, `${createHash('sha1').update(route.request().url()).digest('hex')}.png`);
  if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  const res = await route.fetch().catch(() => null);
  if (!res || !res.ok()) return route.abort();
  const body = await res.body();
  fs.writeFileSync(file, body);
  return route.fulfill({ response: res, body });
});

const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const net = { inflight: 0, lastEnd: Date.now() };
page.on('request', () => net.inflight++);
for (const ev of ['requestfinished', 'requestfailed'])
  page.on(ev, () => {
    net.inflight = Math.max(0, net.inflight - 1);
    net.lastEnd = Date.now();
  });

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

/** The camera centre deck.gl is drawing, read through React's ref (same trick as scripts/visual.mjs). */
const camera = () =>
  page.evaluate(() => {
    if (!window.__deck)
      for (const el of document.querySelectorAll('canvas')) {
        let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
        for (; f && !window.__deck; f = f.return)
          for (let h = f.memoizedState; h; h = h.next) if (h.memoizedState?.current?.deck?.layerManager) window.__deck = h.memoizedState.current.deck;
      }
    const vp = window.__deck?.getViewports()[0];
    return vp ? { lon: vp.longitude, lat: vp.latitude, zoom: vp.zoom } : null;
  });

async function settle() {
  const started = Date.now();
  await page.waitForTimeout(FLY_MS + 300);
  for (;;) {
    const quiet = net.inflight === 0 && Date.now() - net.lastEnd > 1000;
    const ready = await page.evaluate(() => document.querySelector('main')?.getAttribute('data-loading') === 'false');
    if ((quiet && ready) || Date.now() - started > 60_000) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(600);
}

const panel = '[data-testid="tour-panel"]';
const indexShown = (i) => page.waitForSelector(`${panel}[data-index="${i}"]`, { timeout: 15_000 }).then(() => true, () => false);
const away = () => page.mouse.move(VIEWPORT.width - 20, 20); // off the map's middle, so no hover card takes the column

await page.goto(`${base.replace(/\/$/, '')}/?tour=1&still=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30_000 });
await away();

// The stops come from the page (lib/tour.ts is the one list): the card says its index, id and the count.
check(await indexShown(0), 'the tour opens at its first stop');
const count = Number(await page.locator(panel).getAttribute('data-count'));
check(count >= 8 && count <= 10, `8-10 stops (${count})`);
const rows = [];
let dragged = null;
for (let i = 0; i < count; i++) {
  check(await indexShown(i), `stop ${i + 1} card shown`);
  const id = await page.locator(panel).getAttribute('data-stop');
  await settle();
  const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${id}.png`);
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
  const cam = await camera();
  const text = await page.locator(panel).innerText();
  rows.push({ id, file: path.basename(file), camera: cam, text });
  console.log(`     ${path.basename(file)}  camera ${cam && `${cam.lat.toFixed(1)}, ${cam.lon.toFixed(1)}, z${cam.zoom.toFixed(2)}`}`);

  if (dragged) {
    const far = Math.abs(dragged.lon - cam.lon) > 5 || Math.abs(dragged.zoom - cam.zoom) > 0.2;
    check(far, `a drag mid-flight stopped the flight (it ended at ${dragged.lat.toFixed(1)}, ${dragged.lon.toFixed(1)}, z${dragged.zoom.toFixed(2)}, not this stop)`);
    dragged = null;
  }

  if (i === 2) {
    // Back goes back, then forward again.
    await page.keyboard.press('ArrowLeft');
    check(await indexShown(1), 'ArrowLeft goes back a stop');
    await page.keyboard.press('ArrowRight');
    check(await indexShown(2), 'ArrowRight comes forward again');
    await settle();
  }
  if (i === 3) {
    // A drag mid-flight hands the camera back: the flight must not finish at the next stop.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await page.mouse.move(800, 400);
    await page.mouse.down();
    await page.mouse.move(1000, 500, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(FLY_MS + 500);
    dragged = await camera(); // compared with the next stop's own camera once it is reached properly
    await away();
    // Back and forward again with the buttons, to fly to the next stop properly.
    await page.locator(`${panel} button`, { hasText: 'Back' }).click();
    check(await indexShown(3), 'the Back button goes back');
    await page.locator('[data-testid="tour-next"]').click();
    await away();
    continue;
  }
  if (i < count - 1) await page.keyboard.press('ArrowRight');
}

await page.locator('[data-testid="tour-next"]').click(); // Finish
await page.waitForTimeout(500);
check((await page.locator(panel).count()) === 0, 'Finish closes the tour');
check(!new URL(page.url()).searchParams.has('tour'), 'Finish removes tour=1 from the address');
check(errors.length === 0, `no console or page errors (${errors.length})`);
for (const e of errors.slice(0, 10)) console.log(`     ${e}`);

fs.writeFileSync(path.join(outDir, 'tour-shots.json'), JSON.stringify({ base, stops: rows, errors, failures }, null, 2));
await browser.close();
server?.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : `\nall ${count} stops shot, no errors · ${outDir}`);
process.exit(failures.length ? 1 : 0);
