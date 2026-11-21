// First load: what a cold first visit costs (docs/ops/first-load.md).
//
//   node scripts/first-load.mjs                         serve out/ (+ the data not in git) like prod; desktop and fast 4G, 3 runs each
//   node scripts/first-load.mjs --base https://footsteps.willhs.me      the same against a running site (prod)
//   node scripts/first-load.mjs --profiles desktop --runs 5 --query 'year=1900' --json out.json --label after
//   node scripts/first-load.mjs --base https://footsteps.willhs.me --no-marks   a build without the marks: first people = images in
//   node scripts/first-load.mjs --app ../old-out          serve another build (a before/after pair on one machine)
//   node scripts/first-load.mjs --flags                  flag sweep: each opt-in loads its code, the default first load does not
//     (add --serve-extra /terrain/detail=DIR with the pyramid's manifest.png and ref.webp from prod for ?terrain_tiles=1)
//
// Each run opens a new browser context (empty HTTP cache, no service worker) on the real GPU and records:
//   - bytes on the wire by kind (JS, data images, other) and JS parsed (decoded) bytes, to first people and in total;
//   - first globe frame and first people drawn: the app's User Timing marks (lib/firstLoadMarks.ts);
//     a site without them (prod before this landed) `--no-marks` uses `peopleImage`: when the opening years' people images were in;
//   - FCP, long tasks (> 50 ms) before first people: count, longest, blocking time (sum of each beyond 50 ms).
// Profiles: desktop = no throttling; fast4g = 9 Mbps down, 1.5 Mbps up, 150 ms RTT, 4x CPU slowdown (DevTools' Fast 4G
// network with Lighthouse's mobile CPU factor). Medians over the runs are printed as a markdown table.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { dataRoots, findDataRoot, VIEWPORT } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const PROFILES = {
  desktop: null,
  fast4g: { downloadThroughput: (9_000_000 / 8), uploadThroughput: (1_500_000 / 8), latency: 150, cpu: 4 },
};
const MARKS = { globe: 'footsteps:first-globe', people: 'footsteps:first-people' };

/**
 * Flag sweep: each opt-in feature's code must arrive with its flag (and view) and not on a default visit.
 * `marker` is a string that survives minification in the feature's own chunk (a layerName, a test id, a label).
 */
const SWEEP = [
  { id: 'close-up 3D', query: 'year=-3000&lat=25.7&lon=32.6&zoom=9', marker: 'Close3DLayer' },
  { id: '?shelters=1', query: 'year=1500&lat=9.0&lon=38.7&zoom=10&shelters=1', marker: 'Close3DLayer' },
  { id: '?figures=1', query: 'year=-1000&lat=41.9&lon=12.5&zoom=16&figures=1', marker: 'AnimalsLayer' },
  { id: '?terrain_tiles=1', query: 'year=-1000&lat=41.9&lon=12.5&zoom=5&terrain_tiles=1', marker: 'TerrainDetailLayer' },
  { id: '?evidence=1', query: 'year=-8000&evidence=1', marker: 'aadr_samples.json.gz' },
  { id: '?tour=1', query: 'tour=1', marker: 'tour-panel' },
  { id: '?chart=1', query: 'chart=1', marker: 'World population over time' },
  { id: '?bar=old', query: 'bar=old', marker: 'time-overview' },
  { id: '?mode=dots', query: 'year=-1000&lat=41.9&lon=12.5&zoom=5&mode=dots', marker: 'PMTilesTileLayer' },
];

// ---- arguments ------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opts = { profiles: 'desktop,fast4g', runs: '3', query: '', timeout: '90000' };
const flags = new Set();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
  const key = a.slice(2);
  if (['flags', 'headed', 'no-marks'].includes(key)) flags.add(key);
  else opts[key] = argv[++i];
}

// ---- in-page recorder, installed before any page script ----------------------------------------------
function installRecorder() {
  const rec = (window.__firstLoad = { long: [] });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) rec.long.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
}

const kindOf = (url) => {
  const p = new URL(url).pathname;
  if (/\.(m?js)$/.test(p)) return 'js';
  if (p.startsWith('/grid/')) return 'people';
  if (p.startsWith('/terrain/')) return 'earth';
  if (/elevation-tiles-prod/.test(url)) return 'dem';
  if (/\.(webp|png|jpe?g)$/.test(p)) return 'images';
  return 'other';
};

/** One cold load. Returns the run's numbers (ms from navigation start, bytes). */
async function measure(browser, url, profile, timeout) {
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' });
  await context.addInitScript(installRecorder);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.clearBrowserCache');
  if (profile) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  }
  const done = []; // { url, kind, bytes, end (epoch ms) }
  const pending = [];
  page.on('requestfinished', (r) =>
    pending.push(
      r.sizes().then((s) => {
        const t = r.timing();
        // responseEnd is -1 for an answer from the HTTP cache (a worker's fetch joining a preload): no time of its own.
        done.push({ url: r.url(), kind: kindOf(r.url()), bytes: Math.max(0, s.responseBodySize) + Math.max(0, s.responseHeadersSize), end: t.responseEnd >= 0 ? t.startTime + t.responseEnd : null });
      }, () => {}),
    ),
  );

  await page.goto(url, { waitUntil: 'commit', timeout });
  // A site without the marks (`--no-marks`: prod before they landed) is read when the network settles.
  const marksIn = flags.has('no-marks')
    ? false
    : await page.waitForFunction((m) => performance.getEntriesByName(m.people).length > 0, MARKS, { timeout, polling: 100 }).then(() => true, () => false);
  // Let the rest of the first view (neighbour years, lookups) arrive, then read everything.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await Promise.all(pending);
  const inPage = await page.evaluate((m) => {
    const at = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
    const res = performance.getEntriesByType('resource');
    const scripts = res.filter((e) => /\.m?js(\?|$)/.test(e.name));
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      timeOrigin: performance.timeOrigin,
      globe: at(m.globe),
      people: at(m.people),
      fcp: at('first-contentful-paint'),
      dcl: nav?.domContentLoadedEventEnd ?? null,
      scripts: scripts.map((e) => ({ name: e.name, decoded: e.decodedBodySize, wire: e.transferSize, end: e.responseEnd })),
      long: window.__firstLoad?.long ?? [],
    };
  }, MARKS);
  await context.close();

  // Without marks: when the opening years' people images (the first two; the worker fetches them) were in.
  const imageEnd = new Map();
  for (const r of done) if (/\/grid\/humans_/.test(r.url) && r.end != null) imageEnd.set(r.url, Math.min(imageEnd.get(r.url) ?? Infinity, r.end - inPage.timeOrigin));
  const peopleEnds = [...imageEnd.values()].sort((a, b) => a - b);
  const peopleImage = peopleEnds.length ? peopleEnds[Math.min(1, peopleEnds.length - 1)] : null;
  const firstPeople = inPage.people ?? peopleImage;
  const cut = firstPeople == null ? Infinity : inPage.timeOrigin + firstPeople;
  const sum = (rows, pred = () => true) => rows.filter(pred).reduce((n, r) => n + r.bytes, 0);
  const early = done.filter((r) => r.end != null && r.end <= cut);
  const longBefore = inPage.long.filter((l) => firstPeople == null || l.start < firstPeople);
  return {
    marks: marksIn,
    globe: inPage.globe,
    people: inPage.people,
    peopleImage,
    fcp: inPage.fcp,
    dcl: inPage.dcl,
    jsWire: inPage.scripts.filter((s) => s.end <= (firstPeople ?? Infinity)).reduce((n, s) => n + s.wire, 0),
    jsParsed: inPage.scripts.filter((s) => s.end <= (firstPeople ?? Infinity)).reduce((n, s) => n + s.decoded, 0),
    jsFiles: inPage.scripts.filter((s) => s.end <= (firstPeople ?? Infinity)).length,
    wireToPeople: sum(early),
    peopleBytes: sum(early, (r) => r.kind === 'people'),
    earthBytes: sum(early, (r) => r.kind === 'earth'),
    wireTotal: sum(done),
    jsWireTotal: sum(done, (r) => r.kind === 'js'),
    longCount: longBefore.length,
    longMax: Math.max(0, ...longBefore.map((l) => l.duration)),
    blocking: longBefore.reduce((n, l) => n + Math.max(0, l.duration - 50), 0),
    requests: done.map(({ url, kind, bytes, end }) => ({ url, kind, bytes, at: end == null ? null : Math.round(end - inPage.timeOrigin) })),
    errors,
  };
}

const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const kb = (b) => (b == null ? '–' : `${(b / 1024).toFixed(0)} KiB`);
const ms = (t) => (t == null ? '–' : `${(t / 1000).toFixed(2)} s`);

async function startServer() {
  const out = path.resolve(opts.app ?? path.join(WEB, 'out'));
  if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('No out/: run `pnpm build`, or pass --base URL.');
  const dataRoot = findDataRoot(WEB, opts.data ?? process.env.FOOTSTEPS_DATA);
  if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid (pass --data DIR or set FOOTSTEPS_DATA).');
  // `--serve-extra /terrain/detail=DIR`: data that is only on prod (the colour pyramid), copied in part for a check.
  const extra = opts['serve-extra'] ? [{ prefix: opts['serve-extra'].split('=')[0], dir: opts['serve-extra'].split('=')[1] }] : [];
  return serveStatic([out, ...extra, ...dataRoots(dataRoot)]);
}

const local = !opts.base;
const { server, base } = local ? await startServer() : { server: null, base: opts.base.replace(/\/$/, '') };
const browser = await chromium.launch({ headless: !flags.has('headed'), args: GPU_ARGS });
const timeout = Number(opts.timeout);

try {
  if (flags.has('flags')) {
    // Load each page, then read every script it ran and look for the feature's marker.
    const scriptsOf = async (query) => {
      const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const bodies = [];
      let peopleDrawn = false; // scripts that arrive after the first people (the idle prefetch) are not the first load
      page.on('response', (r) => {
        if (/\.m?js(\?|$)/.test(r.url())) bodies.push(r.text().then((t) => ({ t, early: !peopleDrawn }), () => ({ t: '', early: false })));
      });
      await page.goto(`${base}/?${query}`, { waitUntil: 'commit' });
      await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, MARKS.people, { timeout }).catch(() => {});
      peopleDrawn = true;
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const all = await Promise.all(bodies);
      await context.close();
      return { text: all.map((b) => b.t).join('\n'), first: all.filter((b) => b.early).map((b) => b.t).join('\n'), errors };
    };
    const plain = await scriptsOf('');
    const rows = [];
    for (const f of SWEEP) {
      const withFlag = await scriptsOf(f.query);
      const ok = withFlag.text.includes(f.marker);
      const inDefault = plain.first.includes(f.marker);
      const later = !inDefault && plain.text.includes(f.marker);
      rows.push({ ...f, loaded: ok, inDefault, later, errors: withFlag.errors });
      console.log(`${ok ? 'ok  ' : 'MISS'} ${f.id.padEnd(18)} ${f.marker.padEnd(28)} with flag: ${ok ? 'loaded' : 'NOT loaded'} · default visit: ${inDefault ? 'in the first load (not split)' : later ? 'prefetched after first people' : 'not loaded'}${withFlag.errors.length ? ` · errors: ${withFlag.errors.join(' | ')}` : ''}`);
    }
    if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(rows, null, 2));
    process.exitCode = rows.every((r) => r.loaded && !r.inDefault && !r.errors.length) ? 0 : 1;
  } else {
    const url = `${base}/${opts.query ? `?${opts.query.replace(/^\?/, '')}` : ''}`;
    const result = { label: opts.label ?? null, url, date: new Date().toISOString(), local, profiles: {} };
    for (const name of opts.profiles.split(',')) {
      if (!(name in PROFILES)) throw new Error(`Unknown profile ${name}: ${Object.keys(PROFILES).join(', ')}`);
      const runs = [];
      for (let i = 0; i < Number(opts.runs); i++) {
        const r = await measure(browser, url, PROFILES[name], timeout);
        runs.push(r);
        console.error(`${name} run ${i + 1}: globe ${ms(r.globe)} people ${ms(r.people ?? r.peopleImage)}${r.marks ? '' : ' (no marks: people image)'} js ${kb(r.jsWire)} wire / ${kb(r.jsParsed)} parsed${r.errors.length ? ` errors: ${r.errors.length}` : ''}`);
      }
      const med = {};
      for (const k of ['globe', 'people', 'peopleImage', 'fcp', 'dcl', 'jsWire', 'jsParsed', 'jsFiles', 'wireToPeople', 'peopleBytes', 'earthBytes', 'wireTotal', 'jsWireTotal', 'longCount', 'longMax', 'blocking'])
        med[k] = median(runs.map((r) => r[k]));
      med.marks = runs.every((r) => r.marks);
      result.profiles[name] = { median: med, runs };
    }
    const lines = [
      `# First load ${result.label ?? ''}`.trim(),
      '',
      `${result.date} · ${url} · ${opts.runs} cold run(s) per profile, medians`,
      '',
      '| profile | JS wire | JS parsed | first globe | people images in | first people | FCP | long tasks (max, blocking) | bytes to first people | total bytes |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...Object.entries(result.profiles).map(([name, { median: m }]) =>
        `| ${name} | ${kb(m.jsWire)} | ${kb(m.jsParsed)} | ${ms(m.globe)} | ${ms(m.peopleImage)} | ${m.marks ? ms(m.people) : '– (no marks)'} | ${ms(m.fcp)} | ${m.longCount ?? '–'} (${Math.round(m.longMax ?? 0)} ms, ${Math.round(m.blocking ?? 0)} ms) | ${kb(m.wireToPeople)} | ${kb(m.wireTotal)} |`,
      ),
    ];
    console.log(lines.join('\n'));
    if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(result, null, 2));
  }
} finally {
  await browser.close();
  server?.close();
}
