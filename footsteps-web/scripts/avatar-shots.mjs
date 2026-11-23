#!/usr/bin/env node
// The 3D person in the card (`?avatar=3d`, docs/ops/avatar.md): screenshots and numbers on the built app with real data.
//
//   pnpm build && node scripts/avatar-shots.mjs <out-dir>
//   node scripts/avatar-shots.mjs <out-dir> --base URL      against a running site (prod: https://footsteps.willhs.me)
//   node scripts/avatar-shots.mjs <out-dir> --scenes child,farmer
//
// For each scene it finds a person of the wanted kind at street zoom (forager child 50,000 BCE, farmer woman 3000 BCE on the
// Nile, elder man 1500 CE on the Meseta), clicks them, and keeps the card flag off and flag on (`?still=1` for both, so
// the shots repeat). Then, flag on without `still`, it measures:
//   - bytes: the viewer's code (JS chunks the flag-off visit never loads) and its files (/avatar/*.glb);
//   - first frame: click to the figure's first drawn frame (`footsteps:avatar-first-frame`), and mount to first frame;
//   - map fps with the card open vs closed (deck.gl's own frame counter and the page's rAF rate, 4 s each);
//   - offscreen pause: frames the canvas draws while the card is moved out of view (should be 0).
// Writes <out>/<scene>-{off,on}.png (the card), <out>/<scene>-on-page.png, and <out>/avatar-report.json + .md.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { cacheElevationTiles, dataRoots, findDataRoot } from './visual-lib.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const VIEWPORT = { width: 1280, height: 800 };

const SCENES = [
  // `spots`: places to look, in order, until one has a matching person in view.
  { id: 'child', label: 'Forager child, 50,000 BCE (East Africa)', year: -50000, spots: [[-1.3, 36.8], [-3.4, 36.7], [0.5, 35.3], [-6.2, 35.7]], want: 'p.age < 13 && !p.kindOfHuman', card: /^A (girl|boy|child)\b/ },
  { id: 'farmer', label: 'Farmer woman, 3000 BCE (Nile)', year: -3000, spots: [[25.7, 32.6], [26.2, 32.7], [27.2, 31.2], [29.0, 31.1], [29.9, 31.2], [30.6, 31.1]], want: "p.female && p.age >= 18 && p.age < 55 && p.role === 'farmer'", card: /^A woman, about \d+\s+Farmer/ },
  { id: 'elder', label: 'Elder man, 1500 CE (Meseta)', year: 1500, spots: [[40.4, -3.7], [41.65, -4.72], [40.96, -5.66], [39.86, -4.02], [41.5, -2.5]], want: '!p.female && p.age >= 55 && !p.kindOfHuman', card: /^An? (old )?man, about (5[5-9]|[6-9]\d)/ },
];

const argv = process.argv.slice(2);
const outDir = path.resolve(argv[0] ?? 'avatar-out');
const opts = {};
for (let i = 1; i < argv.length; i++) opts[argv[i].replace(/^--/, '')] = argv[++i];
const scenes = SCENES.filter((s) => !opts.scenes || opts.scenes.split(',').includes(s.id));
fs.mkdirSync(outDir, { recursive: true });

let server = null;
let base = opts.base;
if (!base) {
  const dataRoot = findDataRoot(WEB);
  if (!dataRoot) throw new Error('No real data (data/tiles/grid) here or in the primary checkout.');
  ({ server, base } = await serveStatic([path.join(WEB, 'out'), ...dataRoots(dataRoot)]));
}
const url = (s, q) => `${base.replace(/\/$/, '')}/?${new URLSearchParams({ year: String(s.year), ...q })}`;

const card = '[aria-label="What we know here"]';
const browser = await chromium.launch({ headless: !process.env.HEADED, args: GPU_ARGS });

async function connectDeck(page) {
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll('canvas')) {
        let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
        for (; f; f = f.return)
          for (let h = f.memoizedState; h; h = h.next)
            if (h.memoizedState?.current?.deck?.layerManager) {
              window.__deck = h.memoizedState.current.deck;
              return true;
            }
      }
      return false;
    },
    undefined,
    { timeout: 60_000 },
  );
}

/** People in view matching `want` (a JS expression over `p`), nearest the centre first, with a screen point that picks them. */
const findPerson = (page, want, pickable) =>
  page.evaluate(
    ({ want, pickable }) => {
      const d = window.__deck;
      const vp = d.getViewports()[0];
      const layer = d.props.layers.flat(Infinity).find((l) => l?.id === 'people');
      const ok = new Function('p', `return ${want}`);
      const near = [];
      const seen = new Set();
      for (const p of layer?.props.data ?? []) {
        if (seen.has(p) || !ok(p)) continue;
        seen.add(p);
        const [x, y] = vp.project([...p.position, 0]);
        if (x > 340 && x < vp.width - 80 && y > 120 && y < vp.height - 120) near.push({ p, x, y, d2: (x - vp.width / 2) ** 2 + (y - vp.height / 2) ** 2 });
      }
      near.sort((a, b) => a.d2 - b.d2 || a.p.id - b.p.id);
      if (!pickable) return near[0] ? { lon: near[0].p.position[0], lat: near[0].p.position[1], count: near.length } : null;
      const found = [];
      for (const { x, y, p } of near.slice(0, 100)) {
        search: for (let dy = -24; dy <= 24; dy += 4)
          for (let dx = -24; dx <= 24; dx += 4) {
            const hit = d.pickObject({ x: x + dx, y: y + dy, radius: 2, layerIds: ['people'] });
            if (hit?.object === p) {
              found.push({ x: x + dx, y: y + dy, person: { id: p.id, age: p.age, female: p.female, role: p.role, kindOfHuman: p.kindOfHuman ?? null } });
              break search;
            }
          }
        if (found.length >= 10) break;
      }
      return found;
    },
    { want, pickable },
  );

const waitPeople = (page) =>
  page.waitForFunction(() => (window.__deck?.props.layers.flat(Infinity).find((l) => l?.id === 'people')?.props.data.length ?? 0) > 0, undefined, { timeout: 60_000 });

/** Open the scene, walk to a matching person at street zoom, and return where to click. */
async function approach(page, s, extra) {
  let spot = null;
  const tried = [];
  for (const [lat, lon] of s.spots) {
    await page.goto(url(s, { lat: String(lat), lon: String(lon), zoom: '12.8', close3d: '0', ...extra }), { waitUntil: 'commit' });
    await connectDeck(page);
    await waitPeople(page).catch(() => {});
    await page.waitForTimeout(1500);
    spot = await findPerson(page, s.want, false);
    if (spot) break;
    tried.push(await page.evaluate(() => {
      const data = window.__deck.props.layers.flat(Infinity).find((l) => l?.id === 'people')?.props.data ?? [];
      return `${data.length} people, roles ${[...new Set(data.map((p) => p.role))].join('/')}`;
    }));
  }
  if (!spot) throw new Error(`${s.id}: no matching person at ${JSON.stringify(s.spots)}: ${tried.join('; ')}`);
  await page.goto(url(s, { lat: spot.lat.toFixed(5), lon: spot.lon.toFixed(5), zoom: '16', close3d: '0', ...extra }), { waitUntil: 'commit' });
  await connectDeck(page);
  await waitPeople(page);
  await page.waitForTimeout(2500);
  const targets = await findPerson(page, s.want, true);
  if (!targets.length) throw new Error(`${s.id}: no pickable matching person at street zoom`);
  return targets;
}

/** Click candidates until the card names the wanted kind of person (a click can land on a neighbour). Returns the one picked. */
async function select(page, s, targets) {
  const seen = [];
  for (const t of targets) {
    const clickAt = await page.evaluate(() => performance.now());
    await page.mouse.click(t.x, t.y);
    const title = await page
      .waitForSelector(`${card} .ov-title`, { timeout: 8000 })
      .then(() => page.evaluate((sel) => document.querySelector(sel).innerText.replace(/\s+/g, ' '), `${card} .ov-title + p, ${card} .ov-title`).catch(() => ''))
      .catch(() => '');
    const text = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText).join(' '), `${card} .ov-title, ${card} .ov-title + p`).catch(() => title);
    if (s.card.test(text)) return { ...t, card: text.slice(0, 120), clickAt, tries: seen.length + 1 };
    seen.push(text.slice(0, 40));
    await page.click('button[aria-label="Close grounding facts"]').catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error(`${s.id}: no click gave the wanted card; got ${seen.join(' | ')}`);
}

/** The page's frame rate over `ms` (rAF; the map animates its footprints, so deck.gl draws every frame). */
const fps = (page, ms) =>
  page.evaluate(async (ms) => {
    let n = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const f = () => (performance.now() - t0 < ms ? (n++, requestAnimationFrame(f)) : res());
      requestAnimationFrame(f);
    });
    const s = (performance.now() - t0) / 1000;
    return { raf: Math.round((n / s) * 10) / 10 };
  }, ms);

const report = { base, when: new Date().toISOString(), scenes: [] };
try {
  for (const s of scenes) {
    const row = { id: s.id, label: s.label };
    const jsOff = new Set();
    for (const flag of ['off', 'on']) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
      await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), () => {});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !/anthropology|api\//.test(m.text()) && errors.push(m.text()));
      const target = await select(page, s, await approach(page, s, flag === 'on' ? { avatar: '3d', still: '1' } : { still: '1' }));
      row.person = { ...target.person, card: target.card };
      if (flag === 'on') {
        await page.waitForFunction(() => performance.getEntriesByName('footsteps:avatar-first-frame').length > 0, undefined, { timeout: 30_000 });
        await page.waitForTimeout(400);
      } else {
        await page.waitForSelector(`${card} svg[role="img"]`, { timeout: 10_000 });
        await page.waitForTimeout(300);
      }
      const person = page.locator(card).locator('figure').first().locator('xpath=../..');
      await person.screenshot({ path: path.join(outDir, `${s.id}-${flag}.png`) });
      if (flag === 'on') await page.screenshot({ path: path.join(outDir, `${s.id}-on-page.png`) });
      row[`errors_${flag}`] = errors;
      if (flag === 'off') for (const e of await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))) if (/\.js$/.test(e)) jsOff.add(new URL(e).pathname);
      await context.close();
    }

    // Numbers: flag on, live (no still), a fresh browser context each time so nothing is cached.
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await cacheElevationTiles(context, path.join(WEB, 'visual-cache'), () => {});
    const page = await context.newPage();
    const targets = await approach(page, s, { avatar: '3d' });
    row.fps_no_card = await fps(page, 4000);
    // Earlier clicks can land on a neighbour (select tries again): time and count bytes from the click that picked the person.
    const { clickAt, tries } = await select(page, s, targets);
    row.clicks = tries;
    await page.waitForFunction(() => performance.getEntriesByName('footsteps:avatar-first-frame').length > 0, undefined, { timeout: 30_000 });
    const marks = await page.evaluate(() => ({
      requested: performance.getEntriesByName('footsteps:avatar-requested').at(-1)?.startTime,
      first: performance.getEntriesByName('footsteps:avatar-first-frame').at(-1)?.startTime,
    }));
    row.first_frame_ms = { from_click: Math.round(marks.first - clickAt), from_mount: Math.round(marks.first - marks.requested) };
    const res = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ name: r.name, start: r.startTime, bytes: r.transferSize || r.encodedBodySize })));
    const glb = res.filter((r) => /\/avatar\/.+\.glb$/.test(r.name) && (tries === 1 || r.start >= clickAt));
    const js = res.filter((r) => /\.js$/.test(r.name) && !jsOff.has(new URL(r.name).pathname));
    row.bytes = {
      files: glb.map((r) => ({ file: new URL(r.name).pathname, bytes: r.bytes })),
      files_total: glb.reduce((a, r) => a + r.bytes, 0),
      code: js.map((r) => ({ file: new URL(r.name).pathname, bytes: r.bytes })),
      code_total: js.reduce((a, r) => a + r.bytes, 0),
    };
    row.fps_card_open = await fps(page, 4000);
    const framesOf = () => page.evaluate(() => document.querySelector('[data-testid="avatar-3d"] canvas')?.__avatarFrames ?? null);
    const f0 = await framesOf();
    await page.waitForTimeout(2000);
    const f1 = await framesOf();
    row.canvas_fps_visible = Math.round(((f1 - f0) / 2) * 10) / 10;
    // Move the card out of view: IntersectionObserver should stop the canvas.
    await page.evaluate((sel) => (document.querySelector(sel).style.transform = 'translateX(-3000px)'), card);
    await page.waitForTimeout(300);
    const g0 = await framesOf();
    row.fps_card_offscreen = await fps(page, 3000);
    const g1 = await framesOf();
    row.canvas_frames_offscreen_3s = g1 - g0;
    await page.evaluate((sel) => (document.querySelector(sel).style.transform = ''), card);
    await page.waitForTimeout(300);
    const h0 = await framesOf();
    await page.waitForTimeout(1000);
    row.canvas_resumes = (await framesOf()) > h0;
    await page.click('button[aria-label="Close grounding facts"]');
    row.fps_card_closed = await fps(page, 4000);
    await context.close();
    report.scenes.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await browser.close();
  server?.close();
}

fs.writeFileSync(path.join(outDir, 'avatar-report.json'), `${JSON.stringify(report, null, 2)}\n`);
const kib = (b) => `${(b / 1024).toFixed(0)} KiB`;
const md = [
  '| Scene | Person | Code (new JS) | Files (GLB) | First frame from click / mount | Page fps: no card · card open · card offscreen · card closed | Canvas fps · frames offscreen 3 s |',
  '|---|---|---|---|---|---|---|',
  ...report.scenes.map(
    (r) =>
      `| ${r.label} | ${r.person.female ? 'F' : 'M'} ${r.person.age}, ${r.person.role} | ${kib(r.bytes.code_total)} | ${kib(r.bytes.files_total)} | ${r.first_frame_ms.from_click} / ${r.first_frame_ms.from_mount} ms | ${r.fps_no_card.raf} · ${r.fps_card_open.raf} · ${r.fps_card_offscreen.raf} · ${r.fps_card_closed.raf} | ${r.canvas_fps_visible} · ${r.canvas_frames_offscreen_3s} |`,
  ),
].join('\n');
fs.writeFileSync(path.join(outDir, 'avatar-report.md'), `${md}\n`);
console.log(md);
