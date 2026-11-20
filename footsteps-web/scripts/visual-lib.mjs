// Pure parts of the visual regression run (scripts/visual.mjs, docs/ops/visual-regression.md): the scene table,
// the data folders the static server needs, and the image comparison. No browser here, so lib/visualRegression.test.ts can pin them.
//
// The data shape:
//   Scene   = { id, label, year, lat?, lon?, zoom?, query?, wait?, interact? }     (a fixed place, year and view state)
//   Verdict = { id, status: 'pass' | 'fail' | 'new', diffPixels, ratio, limit, ... }
// A scene's URL always carries `still=1` (lib/still.ts: no time-based animation), so the same scene gives the same pixels.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

export const VIEWPORT = { width: 1280, height: 800 };

/** pixelmatch's per-pixel colour distance (0 = identical only, 1 = anything): below this two pixels count as equal. */
export const PIXEL_THRESHOLD = 0.1;
/** A scene fails when more than this share of its pixels differ. A one-line colour change touches far more than this;
 * the run-to-run noise on an unchanged tree is zero or a handful of pixels. */
export const MAX_DIFF_RATIO = 0.001;
/** Baselines are lossy WebP at this quality (docs/ops/visual-regression.md says why lossy is safe). */
export const WEBP = { quality: 80, effort: 6, smartSubsample: false };

/**
 * Scenes. `wait` = a selector, `waitText` = a regexp for the page text, that must be on screen before the scene counts as settled (a note, a card, marks drawn);
 * `interact` = a named step in visual.mjs run after the first settle (hover a place, click a person).
 * Rome is the one place shown in every look, so the looks compare like for like.
 */
/** The stats panel counts what is drawn: grid, Dots and Units draw their marks a moment after the data arrives, with no loading flag. */
const DRAWN = 'Dots drawn [1-9]';

export const SCENES = [
  { id: 'globe-1900', label: 'Globe, 1900', year: 1900, waitText: DRAWN },
  { id: 'rome-1000bce-units', label: 'Rome, 1000 BCE, Units', year: -1000, lat: 41.9, lon: 12.5, zoom: 7, query: { mode: 'units' }, waitText: DRAWN },
  { id: 'rome-1000bce-grid', label: 'Rome, 1000 BCE, Grid', year: -1000, lat: 41.9, lon: 12.5, zoom: 7, query: { mode: 'grid' }, waitText: DRAWN },
  { id: 'rome-1000bce-dots', label: 'Rome, 1000 BCE, Dots', year: -1000, lat: 41.9, lon: 12.5, zoom: 7, query: { mode: 'dots' }, waitText: DRAWN },
  { id: 'nile-3000bce-3d', label: 'Nile, 3000 BCE, close-up 3D', year: -3000, lat: 25.7, lon: 32.6, zoom: 9 },
  { id: 'doggerland-10000bce-3d', label: 'Doggerland, 10,000 BCE, close-up 3D (sea level)', year: -10000, lat: 54.8, lon: 2.0, zoom: 9 },
  { id: 'uk-50000bce-empty', label: 'UK, 50,000 BCE, empty-view note', year: -50000, lat: 54, lon: -2, zoom: 7, wait: '[data-testid="empty-view-note"]' },
  { id: 'croatia-50000bce-humans', label: 'Croatia, 50,000 BCE, other humans', year: -50000, lat: 45.6, lon: 16, zoom: 6.5, waitText: DRAWN },
  { id: 'rome-1000bce-hover', label: 'Rome, 1000 BCE, hover card', year: -1000, lat: 41.9, lon: 12.5, zoom: 7, query: { mode: 'units' }, interact: 'hover', wait: '[data-testid="hover-card"]' },
  { id: 'rome-1000bce-person', label: 'Rome, 1000 BCE, a selected person', year: -1000, lat: 41.9, lon: 12.5, zoom: 12.8, interact: 'person', wait: '[aria-label="What we know here"]' },
];

/** The address of a scene. Everything is in the URL, so a failing scene can be opened by hand. */
export function sceneUrl(base, scene, { lat = scene.lat, lon = scene.lon, zoom = scene.zoom } = {}) {
  const q = new URLSearchParams({ year: String(scene.year) });
  if (lat !== undefined) q.set('lat', String(lat));
  if (lon !== undefined) q.set('lon', String(lon));
  if (zoom !== undefined) q.set('zoom', String(zoom));
  for (const [k, v] of Object.entries(scene.query ?? {})) q.set(k, v);
  q.set('still', '1');
  return `${base.replace(/\/$/, '')}/?${q}`;
}

/**
 * Where the data that is not in git lives: `<root>/data/tiles/...`. This checkout, or, in a git worktree (Manager jobs),
 * the primary checkout the worktree belongs to. `--data` / FOOTSTEPS_DATA overrides (a folder that holds `data/tiles`).
 * Returns the root, or null if none has it.
 */
export function findDataRoot(webDir, override) {
  const candidates = [];
  if (override) candidates.push(path.resolve(override));
  candidates.push(path.resolve(webDir, '..'));
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: webDir, encoding: 'utf8' });
  if (common.status === 0 && common.stdout.trim()) candidates.push(path.dirname(common.stdout.trim()));
  return candidates.find((c) => fs.existsSync(path.join(c, 'data', 'tiles', 'grid'))) ?? null;
}

/**
 * The folders the static server adds behind `out/`, so a build made where the data is not copied in (a fresh worktree) still has real data.
 * Same mapping as scripts/deploy-budgie.sh. `out/` answers first, so a normal build is served exactly as it is.
 */
export function dataRoots(dataRoot) {
  const tiles = path.join(dataRoot, 'data', 'tiles');
  const pub = path.join(dataRoot, 'footsteps-web', 'public');
  return [
    { prefix: '/grid', dir: path.join(tiles, 'grid') },
    { prefix: '/grid', dir: path.join(tiles, 'prehistory') },
    { prefix: '/terrain', dir: path.join(tiles, 'terrain') },
    { prefix: '/habitat', dir: path.join(tiles, 'habitat') },
    { prefix: '/fauna', dir: path.join(tiles, 'fauna') },
    { prefix: '/pmtiles', dir: path.join(tiles, 'humans') },
    { prefix: '/food', dir: path.join(pub, 'food') },
    { prefix: '/evidence', dir: path.join(pub, 'evidence') },
  ];
}

/** Lossy WebP bytes of a PNG screenshot: what is committed as the baseline. */
export const toBaseline = (png) => sharp(png).webp(WEBP).toBuffer();

/** RGBA pixels of an encoded image. */
async function pixels(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Compare a fresh screenshot (PNG bytes) with a committed baseline (WebP bytes, or null when there is none yet).
 * The screenshot goes through the same lossy encode as the baseline first, so both sides carry the same codec noise
 * and only a real change in the picture shows. Returns the verdict plus, on a difference, a `sheet`:
 * expected | actual | diff side by side, as PNG bytes, for the person reading the failure.
 */
export async function compareToBaseline(baseline, actualPng, { threshold = PIXEL_THRESHOLD, maxRatio = MAX_DIFF_RATIO } = {}) {
  const actualWebp = await toBaseline(actualPng);
  if (!baseline) return { status: 'new', diffPixels: 0, ratio: 0, limit: 0, actualWebp };
  const [exp, act] = await Promise.all([pixels(baseline), pixels(actualWebp)]);
  if (exp.width !== act.width || exp.height !== act.height) {
    return { status: 'fail', reason: `size ${act.width}x${act.height}, baseline ${exp.width}x${exp.height}`, diffPixels: exp.width * exp.height, ratio: 1, limit: 0, actualWebp };
  }
  const { width, height } = exp;
  const diff = Buffer.alloc(width * height * 4);
  const diffPixels = pixelmatch(exp.data, act.data, diff, width, height, { threshold, includeAA: false });
  const total = width * height;
  const limit = Math.floor(total * maxRatio);
  const status = diffPixels > limit ? 'fail' : 'pass';
  const verdict = { status, diffPixels, ratio: diffPixels / total, limit, actualWebp };
  if (diffPixels > 0) {
    const raw = { raw: { width, height, channels: 4 } };
    const [e, a, d] = await Promise.all([exp, act, { data: diff }].map((p) => sharp(p.data, raw).png().toBuffer()));
    verdict.sheet = await sharp({ create: { width: width * 3 + 20, height, channels: 4, background: '#222' } })
      .composite([
        { input: e, left: 0, top: 0 },
        { input: a, left: width + 10, top: 0 },
        { input: d, left: width * 2 + 20, top: 0 },
      ])
      .png()
      .toBuffer();
  }
  return verdict;
}

/** One line per scene for the console and the report. */
export function describeVerdict(v) {
  const pct = (v.ratio * 100).toFixed(3);
  if (v.status === 'new') return 'NEW   no baseline (run with --update)';
  if (v.status === 'pass') return `PASS  ${v.diffPixels} px differ (${pct}%, limit ${v.limit})`;
  return `FAIL  ${v.reason ?? `${v.diffPixels} px differ (${pct}%, limit ${v.limit})`}`;
}

export const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
