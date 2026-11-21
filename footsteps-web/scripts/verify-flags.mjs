#!/usr/bin/env node
// Flag sweep: every URL flag on and off, alone and together, across six scenes (docs/ops/flags.md).
//
//   pnpm build && node scripts/verify-flags.mjs                 the whole sweep (6 scenes x ~28 variants), exit 1 on any problem
//   node scripts/verify-flags.mjs --list                        print the scenes and variants, run nothing
//   node scripts/verify-flags.mjs --scenes nile-3000bce-3d --variants none,all-opt-in,ground
//   node scripts/verify-flags.mjs --jobs 3 --out DIR            pages in parallel (default 2); DIR gets report.md and a picture per failure
//   node scripts/verify-flags.mjs --base URL --data DIR --still --shots --strict   a server already running; data folder; ?still=1; keep every picture; missing optional data fails
//
// Per load it fails on: a console error, a page error, a failed request that is not known-optional data (flags-lib.mjs KNOWN_OPTIONAL; `--strict` fails those too),
// a page with no canvas, a blank middle of the picture (one colour, or a handful), or a page that never settles.
// Settling is visual.mjs's rule without the pixel-stability step: no request in flight for QUIET_MS, `main[data-loading]` off, a few frames
// drawn. The app is not made still (time-based animation runs, as for a visitor); `--still` makes it still. The same GPU flags as `pnpm visual`.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { cacheElevationTiles, dataRoots, findDataRoot } from './visual-lib.mjs';
import { SCENES, VIEWPORT, canvasStats, judge, loadUrl, variants } from './flags-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET_MS = 1000;
const SETTLE_TIMEOUT_MS = 90_000;
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const argv = process.argv.slice(2);
const flagKeys = new Set(['list', 'still', 'shots', 'headed', 'strict']);
const flags = new Set();
const values = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
  const key = argv[i].slice(2);
  if (flagKeys.has(key)) flags.add(key);
  else values[key] = argv[++i];
}

const allVariants = variants();
const pick = (all, ids, what) => {
  const chosen = ids ? all.filter((x) => ids.split(',').includes(x.id)) : all;
  if (!chosen.length) throw new Error(`No ${what} matches ${ids}. Known: ${all.map((x) => x.id).join(', ')}`);
  return chosen;
};
const scenes = pick(SCENES, values.scenes, 'scene');
const chosenVariants = pick(allVariants, values.variants, 'variant');

if (flags.has('list')) {
  console.log(`scenes:\n${SCENES.map((s) => `  ${s.id.padEnd(22)} ${s.label}`).join('\n')}\nvariants:\n${allVariants.map((v) => `  ${v.id.padEnd(18)} ${JSON.stringify(v.query)}`).join('\n')}`);
  process.exit(0);
}

const outDir = path.resolve(values.out ?? path.join(WEB, 'flags-out'));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const jobs = Math.max(1, Number(values.jobs ?? 2));

let server = null;
let base = values.base;
if (!base) {
  const out = path.join(WEB, 'out');
  if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('No out/ to serve: run `pnpm build`, or pass --base URL.');
  const dataRoot = findDataRoot(WEB, values.data ?? process.env.FOOTSTEPS_DATA);
  if (!dataRoot) throw new Error('No real data: need a folder holding data/tiles/grid (pass --data DIR or set FOOTSTEPS_DATA). A sweep on stand-in data would pass for the wrong reason.');
  console.log(`serving ${out} + data from ${dataRoot}`);
  ({ server, base } = await serveStatic([out, ...dataRoots(dataRoot)]));
}

const browser = await chromium.launch({ headless: !(flags.has('headed') || process.env.HEADED), args: GPU_ARGS });

/** One page load: open the URL, settle, move the mouse over the map (the hover card is a code path of its own), settle again, read what happened. */
async function load(scene, variant) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const result = { consoleErrors: [], pageErrors: [], failedRequests: [], canvas: null, notSettled: null };
  const net = { inflight: 0, lastEnd: Date.now() };
  const done = () => {
    net.inflight = Math.max(0, net.inflight - 1);
    net.lastEnd = Date.now();
  };
  page.on('console', (m) => m.type() === 'error' && result.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => result.pageErrors.push(String(e.message ?? e).split('\n')[0]));
  page.on('request', () => net.inflight++);
  page.on('requestfinished', done);
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? 'failed';
    if (!/ERR_ABORTED/.test(reason)) result.failedRequests.push({ url: r.url(), status: 0, reason }); // aborted = superseded by a newer request, not a failure
    done();
  });
  page.on('response', (r) => r.status() >= 400 && result.failedRequests.push({ url: r.url(), status: r.status(), reason: r.statusText() }));
  await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), (url) => result.failedRequests.push({ url, status: 0, reason: 'elevation tile fetch failed' }));

  const ready = () =>
    page
      .evaluate(() => !!document.querySelector('canvas') && document.querySelector('main')?.getAttribute('data-loading') === 'false')
      .catch(() => false);
  const settle = async () => {
    const started = Date.now();
    while (Date.now() - started < SETTLE_TIMEOUT_MS) {
      if (net.inflight === 0 && Date.now() - net.lastEnd >= QUIET_MS && (await ready())) {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        return true;
      }
      await page.waitForTimeout(200);
    }
    return false;
  };

  let png = null;
  try {
    await page.goto(loadUrl(base, scene, variant, { still: flags.has('still') }), { waitUntil: 'commit' });
    if (!(await settle())) result.notSettled = `${net.inflight} request(s) in flight or the page's loading flag stayed on for ${SETTLE_TIMEOUT_MS / 1000}s`;
    await page.mouse.move(VIEWPORT.width / 2 - 20, VIEWPORT.height / 2 - 10);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await page.waitForTimeout(700);
    await settle();
    png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    if (await page.evaluate(() => !!document.querySelector('canvas'))) result.canvas = await canvasStats(png);
  } catch (e) {
    result.pageErrors.push(`could not capture: ${String(e.message).split('\n')[0]}`);
  }
  await context.close();
  return { result, png };
}

const results = [];
const queue = scenes.flatMap((scene) => chosenVariants.map((variant) => ({ scene, variant })));
const total = queue.length;
let n = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { scene, variant } = item;
      const started = Date.now();
      const { result, png } = await load(scene, variant);
      const verdict = judge(result, { strict: flags.has('strict') });
      results.push({ scene, variant, result, verdict });
      const name = `${scene.id}__${variant.id.replace(/[^a-z0-9+=_-]/gi, '_')}`;
      if (png && (!verdict.ok || flags.has('shots'))) await sharp(png).webp({ quality: 70 }).toFile(path.join(outDir, `${name}.webp`));
      console.log(`[${++n}/${total}] ${verdict.ok ? 'PASS' : 'FAIL'}  ${scene.id.padEnd(22)} ${variant.id.padEnd(18)} ${((Date.now() - started) / 1000).toFixed(1)}s${verdict.problems.map((p) => `\n        ${p}`).join('')}${verdict.notes.length ? `  (+${verdict.notes.length} optional-data note(s))` : ''}`);
    }
  }),
);
await browser.close();
server?.close();

results.sort((a, b) => SCENES.indexOf(a.scene) - SCENES.indexOf(b.scene) || allVariants.indexOf(a.variant) - allVariants.indexOf(b.variant));
const failed = results.filter((r) => !r.verdict.ok);
const report = [
  '# Flag sweep',
  '',
  `${new Date().toISOString()} · ${base} · ${scenes.length} scene(s) x ${chosenVariants.length} variant(s) = ${results.length} loads · ${failed.length} failed`,
  '',
  '| scene | variant | result | problems |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.scene.id} | ${r.variant.id} | ${r.verdict.ok ? 'pass' : 'FAIL'} | ${r.verdict.problems.join('<br>').replace(/\|/g, '\\|')} |`),
  '',
  '## Optional data that was missing (the flag ran without it)',
  '',
  ...[...new Set(results.flatMap((r) => r.verdict.notes.map((x) => x.replace(/^optional data missing \(\w+\) /, ''))))].map((x) => `- ${x}`),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), report);
console.log(`\n${results.length - failed.length}/${results.length} loads passed · report${failed.length ? ' and a picture per failure' : ''} in ${path.relative(process.cwd(), outDir) || '.'}`);
if (failed.length) process.exit(1);
