#!/usr/bin/env node
// The terrain benchmark: fixed camera positions, measured the same way every time (docs/ops/terrain-bench.md).
//
//   node scripts/terrain-bench.mjs [--base URL] [--out DIR] [--scenes alps,nile] [--zooms 8,10] [--modes flat,3d]
//                                  [--no-warm] [--headless] [--label text] [--build] [--max-load N] [--max-wait SECONDS]
//   node scripts/terrain-bench.mjs --compare old.json new.json
//
// Without --base it serves `out/` (a static export: `pnpm build`, or --build here) on a free port with the
// production cache headers. Per scene x zoom x mode it opens the page twice: cold (a fresh browser context, so
// empty HTTP cache) and warm (a second page in the same context). Each load reports
//   - time to detail: ms from navigation start until the era image, the elevation tiles and the habitat lookup
//     have all arrived and two animation frames have followed (the first builds meshes and uploads textures,
//     the second shows them). The camera is placed by the URL, so arrival is navigation start.
//   - fps: requestAnimationFrame deltas while a fixed 600 px drag pans the map;
//   - long tasks: PerformanceObserver 'longtask' (> 50 ms), count and longest, while loading and while panning;
//   - network: requests and bytes (compressed, on the wire) for the load and for the pan;
//   - texel: the terrain colour texel in screen px, from the era image's real size and the zoom.
// plus one screenshot per variant. It never touches rendering: only the URL's lat/lon/zoom/year and `close3d=0`.
// A busy machine ruins every number here: each result records the 1-minute load average when it started, and
// --max-load N makes it wait (up to --max-wait seconds, default 300) for the load to fall to N before each variant.
// Headed by default: headless Chromium throttles requestAnimationFrame, so its fps is meaningless.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  ERA_IMAGE_FALLBACK,
  demSamplePx,
  demTileZoom,
  frameStats,
  longTaskStats,
  renderCompare,
  renderMarkdown,
  resourceKind,
  sceneUrl,
  texelOf,
  timeToDetail,
  variants,
  webpSize,
  isTracked,
  emptyTally,
  expectsDem,
} from './terrain-bench-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const VIEWPORT = { width: 1440, height: 900 };
const SETTLE_QUIET_MS = 1500; // no tracked request finished or in flight for this long = loaded
const LOAD_TIMEOUT_MS = 90_000;
const PAN_STEPS = 120;

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--compare') {
      args.compare = [argv[i + 1], argv[i + 2]];
      i += 2;
    } else if (['--base', '--out', '--scenes', '--zooms', '--modes', '--label', '--max-load', '--max-wait'].includes(a)) args.values[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) args.flags.add(a.slice(2));
    else throw new Error(`Unexpected argument ${a}`);
  }
  return args;
}
const list = (s) =>
  s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

// ---- --compare -------------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
if (args.compare) {
  const [a, b] = args.compare;
  if (!a || !b) throw new Error('Usage: --compare old.json new.json');
  process.stdout.write(renderCompare(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8'))));
  process.exit(0);
}

// ---- static server for out/ ------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pmtiles': 'application/octet-stream',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.geojson', '.svg', '.txt']);

/** Cache headers like production (public/_headers, Caddy): the shell revalidates, hashed assets are immutable, data lasts a day. */
function cacheControl(urlPath, ext) {
  if (ext === '.html' || urlPath === '/' || urlPath === '/sw.js') return 'public, max-age=0, must-revalidate';
  if (urlPath.startsWith('/_next/') || ext === '.js' || ext === '.css') return 'public, max-age=31536000, immutable';
  return 'public, max-age=86400';
}

function serveStatic(root) {
  const gz = new Map();
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = path.join(root, path.normalize(urlPath));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file += '.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end('not found');
    const ext = path.extname(file);
    const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': cacheControl(urlPath === '/index.html' ? '/' : urlPath, ext) };
    const stat = fs.statSync(file);
    headers.ETag = `"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === headers.ETag) return void res.writeHead(304, headers).end();
    let body = fs.readFileSync(file);
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!gz.has(file)) gz.set(file, zlib.gzipSync(body));
      body = gz.get(file);
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers).end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// ---- in-page recorders, installed before any page script runs --------------------------------
function installRecorders() {
  const tb = (window.__tb = { frames: [], long: [], res: [] });
  const tick = (t) => {
    if (tb.frames.length < 200_000) tb.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tb.long.push({ startTime: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) tb.res.push({ name: e.name, startTime: e.startTime, responseEnd: e.responseEnd });
  }).observe({ type: 'resource', buffered: true });
}

// ---- one page load -----------------------------------------------------------------------------

async function measureLoad(context, url, { screenshot, wantDem }) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  let tally = emptyTally();
  let inflight = 0;
  let eraImage = null; // { width, height } read from the era image's own bytes
  const demZooms = new Map();
  page.on('request', (r) => {
    if (isTracked(r.url())) inflight++;
  });
  page.on('requestfailed', (r) => {
    if (isTracked(r.url())) inflight--;
  });
  page.on('requestfinished', async (r) => {
    const tracked = isTracked(r.url());
    if (tracked) inflight--;
    const sizes = await r.sizes().catch(() => null);
    const bytes = sizes ? Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize) : 0;
    tally.requests++;
    tally.bytes += bytes;
    const kind = resourceKind(r.url());
    if (tracked) {
      tally.terrainRequests++;
      tally.terrainBytes += bytes;
    }
    if (kind === 'dem') {
      tally.demRequests++;
      const z = demTileZoom(r.url());
      if (z !== null) demZooms.set(z, (demZooms.get(z) ?? 0) + 1);
    }
    if (kind === 'era-image' && !eraImage) {
      const res = await r.response();
      const body = res ? await res.body().catch(() => null) : null;
      eraImage = (body && webpSize(body)) || null;
    }
  });

  await page.addInitScript(installRecorders);
  await page.goto(url, { waitUntil: 'commit' });
  // Loaded = the era image (and, where the scene streams them, an elevation tile) seen, nothing tracked in flight,
  // quiet for SETTLE_QUIET_MS, and two frames drawn since the last arrival. Waiting for the first elevation tile
  // matters: a busy main thread can start requesting them seconds after the era image lands.
  const started = Date.now();
  let timedOut = false;
  for (;;) {
    const s = await page.evaluate(() => ({ now: performance.now(), res: window.__tb?.res ?? [] })).catch(() => null);
    if (s) {
      const tracked = s.res.filter((e) => isTracked(e.name));
      const lastEnd = Math.max(0, ...tracked.map((e) => e.responseEnd));
      const seen = (kind) => tracked.some((e) => resourceKind(e.name) === kind);
      const drawn =
        timeToDetail(
          tracked.map((e) => ({ kind: resourceKind(e.name), responseEnd: e.responseEnd })),
          await page.evaluate(() => window.__tb.frames.slice()),
        )?.doneMs != null;
      if (seen('era-image') && (!wantDem || seen('dem')) && inflight <= 0 && s.now - lastEnd >= SETTLE_QUIET_MS && drawn) break;
    }
    if (Date.now() - started > LOAD_TIMEOUT_MS) {
      timedOut = true;
      break;
    }
    await page.waitForTimeout(200);
  }
  const snap = await page.evaluate(() => ({
    now: performance.now(),
    res: window.__tb.res.map((e) => ({ ...e })),
    frames: window.__tb.frames.slice(),
    long: window.__tb.long.slice(),
  }));
  const tracked = snap.res.filter((e) => isTracked(e.name)).map((e) => ({ kind: resourceKind(e.name), responseEnd: e.responseEnd }));
  const timing = timeToDetail(tracked, snap.frames);
  const loadNet = { ...tally };
  tally = emptyTally();
  let screenshotError = null;
  if (screenshot)
    await page.screenshot({ path: screenshot, type: 'jpeg', quality: 80, timeout: 120_000 }).catch((e) => (screenshotError = e.message.split('\n')[0]));

  // Fixed pan: a 600 px drag along a sine, 120 steps. Same path in every scene so fps compares.
  const panStart = await page.evaluate(() => performance.now());
  const cx = 760;
  const cy = 450;
  await page.mouse.move(cx - 300, cy);
  await page.mouse.down();
  for (let i = 0; i <= PAN_STEPS; i++) {
    const t = i / PAN_STEPS;
    await page.mouse.move(cx - 300 + 600 * Math.sin(t * Math.PI), cy + 120 * Math.sin(t * 2 * Math.PI));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const end = await page.evaluate(() => ({ now: performance.now(), frames: window.__tb.frames.slice(), long: window.__tb.long.slice() }));
  const panNet = { ...tally };
  await page.waitForTimeout(100);
  await page.close();

  return {
    timedOut,
    timing,
    pan: frameStats(end.frames, panStart, end.now),
    longTasks: {
      load: longTaskStats(end.long, 0, timing?.doneMs ?? snap.now),
      pan: longTaskStats(end.long, panStart, end.now),
    },
    net: { load: loadNet, pan: panNet },
    demTileZooms: Object.fromEntries([...demZooms].sort((a, b) => a[0] - b[0])),
    eraImage,
    screenshotError,
    errors: errors.slice(0, 5),
  };
}

// ---- main -------------------------------------------------------------------------------------
const git = (...a) => spawnSync('git', a, { cwd: WEB, encoding: 'utf8' }).stdout.trim();

if (args.flags.has('build')) {
  const b = spawnSync('pnpm', ['build'], { cwd: WEB, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('pnpm build failed');
}
let server = null;
let base = args.values.base;
if (!base) {
  const root = path.join(WEB, 'out');
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('No out/ to serve: run `pnpm build` first (or pass --build, or --base URL).');
  ({ server, base } = await serveStatic(root));
}

const headless = args.flags.has('headless');
const wantWarm = !args.flags.has('no-warm');
const picked = variants({ scenes: list(args.values.scenes), zooms: list(args.values.zooms)?.map(Number), modes: list(args.values.modes) });
if (!picked.length) throw new Error('No scene matches --scenes/--zooms/--modes');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const commit = git('rev-parse', '--short', 'HEAD') || 'unknown';
const outDir = path.resolve(args.values.out ?? path.join(WEB, 'terrain-bench-out', `${stamp}-${commit}`));
fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const probe = await browser.newPage();
const renderer = await probe.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
});
await probe.close();

const file = {
  meta: {
    date: new Date().toLocaleDateString('en-CA'), // local date, YYYY-MM-DD
    commit,
    dirty: git('status', '--porcelain', '--', '.', ':!terrain-bench-out').length > 0,
    base,
    label: args.values.label ?? null,
    viewport: VIEWPORT,
    headless,
    renderer,
    browser: browser.version(),
    node: process.version,
    loadavg: null, // [1-minute load average at start, at end]
  },
  results: [],
};
const loadavg = () => +os.loadavg()[0].toFixed(1);
file.meta.loadavg = [loadavg(), loadavg()];
const save = () => {
  file.meta.loadavg[1] = loadavg();
  fs.writeFileSync(path.join(outDir, 'terrain-bench.json'), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, 'terrain-bench.md'), renderMarkdown(file));
};

const maxLoad = args.values['max-load'] ? Number(args.values['max-load']) : null;
const maxWaitMs = Number(args.values['max-wait'] ?? 300) * 1000;
async function waitForQuiet() {
  const until = Date.now() + maxWaitMs;
  while (maxLoad !== null && loadavg() > maxLoad && Date.now() < until) await new Promise((r) => setTimeout(r, 10_000));
}

try {
  for (const v of picked) {
    await waitForQuiet();
    const url = sceneUrl(base, v);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const t0 = Date.now();
    const startLoad = loadavg();
    let cold = null;
    let warm = null;
    let error = null;
    try {
      cold = await measureLoad(context, url, { screenshot: path.join(outDir, 'shots', `${v.id}.jpg`), wantDem: expectsDem(v.zoom) });
      warm = wantWarm ? await measureLoad(context, url, { screenshot: null, wantDem: expectsDem(v.zoom) }) : null;
    } catch (e) {
      error = String(e.message ?? e).split('\n')[0];
    }
    await context.close().catch(() => {});
    const era = cold?.eraImage ?? ERA_IMAGE_FALLBACK;
    const texel = texelOf({ kind: 'era-image', ...era }, v.zoom, v.scene.lat);
    const tileZ = Object.keys(cold?.demTileZooms ?? {}).map(Number);
    const result = {
      id: v.id,
      scene: v.scene.name,
      sceneLabel: v.scene.label,
      zoom: v.zoom,
      mode: v.mode,
      year: v.scene.year,
      lat: v.scene.lat,
      lon: v.scene.lon,
      texel: { ...texel, demSamplePx: tileZ.length ? demSamplePx(v.zoom, Math.max(...tileZ)) : null },
      loadavg: startLoad,
      error,
      cold,
      warm,
    };
    file.results.push(result);
    save();
    if (error) console.log(`${v.id.padEnd(22)} FAILED: ${error}`);
    else
      console.log(
        `${v.id.padEnd(22)} cold ${cold.timing?.doneMs ?? '-'} ms, warm ${warm?.timing?.doneMs ?? '-'} ms, ${warm?.pan.fps ?? cold.pan.fps} fps, long ${cold.longTasks.load.count + cold.longTasks.pan.count}, texel ${texel.eastWestPx}px (${((Date.now() - t0) / 1000).toFixed(0)} s, load ${loadavg()})`,
      );
  }
} finally {
  save();
  await browser.close();
  server?.close();
}
console.log(
  `\nWrote ${path.join(outDir, 'terrain-bench.json')} and terrain-bench.md (${file.results.length} variants), screenshots in ${path.join(outDir, 'shots')}`,
);
const bad = file.results.filter((r) => r.error || r.cold.errors.length || r.warm?.errors.length || r.cold.timedOut);
if (bad.length) console.log(`Browser errors or timeouts in: ${bad.map((r) => r.id).join(', ')}`);
