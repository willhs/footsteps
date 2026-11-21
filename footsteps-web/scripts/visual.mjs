#!/usr/bin/env node
// Visual regression: fixed scenes, screenshot each, compare with the committed baselines (docs/ops/visual-regression.md).
//
//   pnpm visual                       run every scene against e2e/visual/*.webp; exit 1 if any differs or has no baseline
//   pnpm visual --update              write the baselines for the scenes run (on purpose: see the doc)
//   pnpm visual --scenes a,b          only these scene ids
//   pnpm visual --build               `pnpm build` first (the static export is out/; a stale out/ tests stale code)
//   pnpm visual --base URL            use a server already running instead of serving out/
//   pnpm visual --data DIR            a folder holding data/tiles (default: this checkout, or the primary checkout of a worktree)
//   pnpm visual --headed              show the browser (pixels can differ from headless: baselines are headless)
//   pnpm visual --out DIR             where actual images, diff sheets and report.md go (default visual-out/, not in git)
//
// Each scene opens in its own browser context at a URL with `?still=1` (no time-based animation) and counts as settled when
//   1. no request is in flight and none finished for QUIET_MS, 2. the page's loading flag (`main[data-loading]`) is off,
//   3. the scene's own selector (a note, a card) is on screen, and 4. STABLE_SHOTS screenshots taken STABLE_MS apart are pixel-identical.
// The fourth is what makes this honest about work the first three cannot see (workers building marks, textures uploading).
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { SCENES, VIEWPORT, compareToBaseline, dataRoots, describeVerdict, findDataRoot, kib, sceneUrl } from './visual-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const BASELINES = path.join(WEB, 'e2e', 'visual');
const QUIET_MS = 1000;
const STABLE_MS = 700;
const STABLE_SHOTS = 3; // this many identical screenshots in a row
const SETTLE_TIMEOUT_MS = 90_000;
// The GPU flags verify-dna-evidence.mjs uses: real Metal in headless Chromium (software GL draws different pixels and is slow).
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const argv = process.argv.slice(2);
const flags = new Set();
const values = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
  const key = argv[i].slice(2);
  if (['update', 'build', 'headed'].includes(key)) flags.add(key);
  else values[key] = argv[++i];
}
const update = flags.has('update');
const wanted = values.scenes?.split(',');
const scenes = SCENES.filter((s) => !wanted || wanted.includes(s.id));
if (!scenes.length) throw new Error(`No scene matches --scenes ${values.scenes}. Known: ${SCENES.map((s) => s.id).join(', ')}`);
const outDir = path.resolve(values.out ?? path.join(WEB, 'visual-out'));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(BASELINES, { recursive: true });

if (flags.has('build')) {
  const b = spawnSync('pnpm', ['build'], { cwd: WEB, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('pnpm build failed');
}

let server = null;
let base = values.base;
if (!base) {
  const out = path.join(WEB, 'out');
  if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('No out/ to serve: run `pnpm visual --build` (or `pnpm build`), or pass --base URL.');
  const dataRoot = findDataRoot(WEB, values.data ?? process.env.FOOTSTEPS_DATA);
  if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid (pass --data DIR or set FOOTSTEPS_DATA). Baselines are made with real data, not stand-ins.');
  console.log(`serving ${out} + data from ${dataRoot}`);
  ({ server, base } = await serveStatic([out, ...dataRoots(dataRoot)]));
}

const browser = await chromium.launch({ headless: !flags.has('headed'), args: GPU_ARGS });

/**
 * The 3D landscape and the flat relief read elevation tiles from AWS (Terrarium: `s3.amazonaws.com/elevation-tiles-prod` and its twin `elevation-tiles-prod.s3.amazonaws.com`), the one thing
 * the app loads from outside. They are kept on disk (`visual-cache/`, not in git) the first time and served from there after, so a run
 * is the same offline, fast, and cannot change because a tile did. The first run needs the network.
 */
const EXTERNAL_DEM = /^https:\/\/(s3\.amazonaws\.com\/elevation-tiles-prod|elevation-tiles-prod\.s3\.amazonaws\.com)\//;
const DEM_CACHE = path.join(WEB, 'visual-cache');
async function cacheElevationTiles(context, net) {
  fs.mkdirSync(DEM_CACHE, { recursive: true });
  await context.route(EXTERNAL_DEM, async (route) => {
    const url = route.request().url();
    const file = path.join(DEM_CACHE, `${createHash('sha1').update(url).digest('hex')}.png`);
    if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    const res = await route.fetch().catch(() => null);
    if (!res || !res.ok()) {
      net.externalFailed.push(url);
      return route.abort();
    }
    const body = await res.body();
    fs.writeFileSync(file, body);
    return route.fulfill({ response: res, body });
  });
}

/** Watch a page's network: a count in flight and when the last request ended. Workers' requests are reported on the page too. */
function watchNetwork(page) {
  const net = { inflight: 0, lastEnd: Date.now(), externalFailed: [] };
  const done = () => {
    net.inflight = Math.max(0, net.inflight - 1);
    net.lastEnd = Date.now();
  };
  page.on('request', () => net.inflight++);
  page.on('requestfinished', done);
  page.on('requestfailed', (r) => {
    if (!r.url().startsWith(base)) net.externalFailed.push(r.url());
    done();
  });
  return net;
}

/** The loading flag and the scene's own selector, read in the page. */
const pageReady = (page, scene) =>
  page
    .evaluate(
      ({ wait, waitText }) =>
        !!document.querySelector('canvas') &&
        document.querySelector('main')?.getAttribute('data-loading') === 'false' &&
        (!wait || !!document.querySelector(wait)) &&
        (!waitText || new RegExp(waitText).test(document.body.innerText)),
      { wait: scene.wait ?? null, waitText: scene.waitText ?? null },
    )
    .catch(() => false);

const shot = (page) => page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });

/** Wait until the scene is settled (see the header), then return the final screenshot and what the wait saw. */
async function settle(page, net, scene) {
  const started = Date.now();
  let previous = null;
  let held = 0;
  for (;;) {
    const quiet = net.inflight === 0 && Date.now() - net.lastEnd >= QUIET_MS;
    if (quiet && (await pageReady(page, scene))) {
      // Two frames have been drawn after the last arrival, then compare two screenshots a moment apart.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const png = await shot(page);
      held = previous && previous.equals(png) ? held + 1 : 0;
      if (held >= STABLE_SHOTS - 1) return { png, ms: Date.now() - started, stable: true };
      previous = png;
      await page.waitForTimeout(STABLE_MS);
    } else {
      previous = null;
      held = 0;
      await page.waitForTimeout(200);
    }
    if (Date.now() - started > SETTLE_TIMEOUT_MS) {
      const png = await shot(page);
      return { png, ms: Date.now() - started, stable: false, notReady: !(await pageReady(page, scene)), inflight: net.inflight };
    }
  }
}

/** The page's deck.gl `Deck`, found through React's own ref (no QA API in the app): same trick as scripts/measure-figures.mjs. */
async function connectDeck(page) {
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll('canvas')) {
        let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
        for (; f; f = f.return)
          for (let h = f.memoizedState; h; h = h.next) {
            if (h.memoizedState?.current?.deck?.layerManager) {
              window.__deck = h.memoizedState.current.deck;
              return true;
            }
          }
      }
      return false;
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** The people drawn nearest the screen centre, as a place and a screen point that `pickObject` returns that person at. */
const pickPerson = (page) =>
  page.evaluate(() => {
    const d = window.__deck;
    const vp = d.getViewports()[0];
    const layer = d.props.layers.flat(Infinity).find((l) => l?.id === 'people');
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    const near = [];
    for (let i = 0; i < (layer?.props.data.length ?? 0); i++) {
      const p = layer.props.data[i];
      const [x, y] = vp.project([...p.position, 0]);
      if (x > 300 && x < vp.width - 300 && y > 150 && y < vp.height - 150) near.push({ p, x, y, d2: (x - cx) ** 2 + (y - cy) ** 2 });
    }
    near.sort((a, b) => a.d2 - b.d2 || (a.p.id < b.p.id ? -1 : 1)); // nearest the centre; the id breaks ties the same way every run
    for (const { x, y, p } of near.slice(0, 200)) {
      for (let dy = -30; dy <= 30; dy += 6)
        for (let dx = -30; dx <= 30; dx += 6) {
          const hit = d.pickObject({ x: x + dx, y: y + dy, radius: 3, layerIds: ['people'] });
          if (hit?.object) return { x: x + dx, y: y + dy, lon: p.position[0], lat: p.position[1] };
        }
    }
    return null;
  });

async function openScene(page, net, scene) {
  await page.goto(sceneUrl(base, scene), { waitUntil: 'commit' });
  if (scene.interact === 'hover') {
    await settle(page, net, { ...scene, wait: null });
    // A real mouse move over the middle of the map: two moves, as the hover card waits for the pointer to settle.
    await page.mouse.move(VIEWPORT.width / 2 - 20, VIEWPORT.height / 2 - 10);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  } else if (scene.interact === 'person') {
    // Street zoom: first find where a group stands (people exist only once the marks are built), then look at that spot closer.
    await settle(page, net, { ...scene, wait: null });
    await connectDeck(page);
    const anchor = await pickPerson(page);
    if (!anchor) throw new Error('no person on screen to select');
    await page.goto(sceneUrl(base, scene, { lat: anchor.lat, lon: anchor.lon, zoom: 16 }), { waitUntil: 'commit' });
    await settle(page, net, { ...scene, wait: null });
    await connectDeck(page);
    const target = await pickPerson(page);
    if (!target) throw new Error('no person to click at street zoom');
    await page.mouse.click(target.x, target.y);
  }
}

const rows = [];
let failed = 0;
try {
  for (const scene of scenes) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const net = watchNetwork(page);
    await cacheElevationTiles(context, net);
    let row;
    try {
      await openScene(page, net, scene);
      const settled = await settle(page, net, scene);
      const baselineFile = path.join(BASELINES, `${scene.id}.webp`);
      const baseline = fs.existsSync(baselineFile) ? fs.readFileSync(baselineFile) : null;
      const verdict = await compareToBaseline(update ? null : baseline, settled.png);
      fs.writeFileSync(path.join(outDir, `${scene.id}.actual.png`), settled.png);
      if (verdict.sheet) fs.writeFileSync(path.join(outDir, `${scene.id}.diff.png`), verdict.sheet);
      if (update) {
        fs.writeFileSync(baselineFile, verdict.actualWebp);
        verdict.status = 'updated';
      }
      row = { scene, verdict, settled, errors, bytes: (update ? verdict.actualWebp : baseline)?.length ?? 0 };
    } catch (e) {
      row = { scene, verdict: { status: 'fail', reason: `could not capture: ${String(e.message).split('\n')[0]}`, diffPixels: 0, ratio: 0, limit: 0 }, settled: null, errors, bytes: 0 };
    }
    await context.close();
    if (row.verdict.status === 'fail' || row.verdict.status === 'new') failed++;
    if (row.settled && !row.settled.stable) row.warn = `never held still for ${SETTLE_TIMEOUT_MS / 1000}s (notReady=${!!row.settled.notReady}, inflight=${row.settled.inflight})`;
    if (net.externalFailed.length) row.warn = `${row.warn ? `${row.warn}; ` : ''}${net.externalFailed.length} outside request(s) failed, e.g. ${net.externalFailed[0]} (the first run needs the network for elevation tiles)`;
    rows.push(row);
    const line = row.verdict.status === 'updated' ? `UPDATED  baseline ${kib(row.bytes)}` : describeVerdict(row.verdict);
    console.log(`${scene.id.padEnd(26)} ${line}${row.settled ? `  (settled in ${(row.settled.ms / 1000).toFixed(1)}s)` : ''}${row.warn ? `\n  WARN ${row.warn}` : ''}${row.errors.length ? `\n  page errors: ${row.errors.slice(0, 2).join(' | ')}` : ''}`);
  }
} finally {
  await browser.close();
  server?.close();
}

// Total size of the committed baselines (all of them, not only the scenes run).
const baselineFiles = fs.readdirSync(BASELINES).filter((f) => f.endsWith('.webp'));
const baselineBytes = baselineFiles.reduce((n, f) => n + fs.statSync(path.join(BASELINES, f)).size, 0);
const report = [
  `# Visual regression ${update ? '(baselines updated)' : ''}`,
  '',
  `${new Date().toISOString()} · ${base} · viewport ${VIEWPORT.width}x${VIEWPORT.height} · ${update ? 'updated' : 'compared'} ${rows.length} scene(s)`,
  '',
  '| scene | result | detail |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.scene.id} | ${r.verdict.status} | ${r.verdict.status === 'updated' ? kib(r.bytes) : describeVerdict(r.verdict)}${r.warn ? ` — ${r.warn}` : ''} |`),
  '',
  `Baselines in e2e/visual: ${baselineFiles.length} files, ${kib(baselineBytes)} in total.`,
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), report);
console.log(`\nbaselines: ${baselineFiles.length} files, ${kib(baselineBytes)} total · report and images in ${path.relative(process.cwd(), outDir) || '.'}`);
if (failed) {
  console.log(`${failed} scene(s) differ or have no baseline. Diff sheets (expected | actual | diff) are in ${path.relative(process.cwd(), outDir)}/<scene>.diff.png.`);
  console.log('If the change is meant, run `pnpm visual --update --scenes <ids>` and commit the new baselines (docs/ops/visual-regression.md).');
  process.exit(1);
}
