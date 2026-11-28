// Pure parts of the flag sweep (scripts/verify-flags.mjs, docs/ops/flags.md): the flag registry, the scene table, the variants
// built from them, and the verdict on one load. No browser here, so lib/flags.test.ts can pin them.
//
// The data shape:
//   Flag    = { name, kind, on?, default, what, doc, reviewed }   kind: 'opt-in' (off until `?name=on`) | 'off-switch' (on until `?name=0`)
//                                                                       | 'choice' (a value picks a look) | 'debug' | 'view' (where the camera starts)
//   Scene   = { id, label, year, lat?, lon?, zoom? }
//   Variant = { id, label, query }            query: { name: value }, the flags that load turns on
//   Load    = { consoleErrors, pageErrors, failedRequests: { url, status (0 = network failure), reason }[], canvas: { distinct, range } | null, notSettled }   what one page load saw
//   Verdict = { ok, problems: string[], notes: string[] }   problems fail the load; notes are known-optional data that was missing
// Every flag the code reads from the URL must be in FLAGS and in docs/ops/flags.md: lib/flags.test.ts greps the source and fails otherwise.
import sharp from 'sharp';

export const VIEWPORT = { width: 1280, height: 800 };

export { FLAGS, FLAG_NAMES } from '../lib/flagRegistry.js';
import { FLAGS } from '../lib/flagRegistry.js';

/** Six places and years where flags meet different code: the whole globe, a dense city, the 3D ground, empty ice-age land, a green Sahara, other humans. */
export const SCENES = [
  { id: 'globe-1900', label: 'Globe, 1900', year: 1900 },
  { id: 'rome-1000bce-z9', label: 'Rome, 1000 BCE, zoom 9', year: -1000, lat: 41.9, lon: 12.5, zoom: 9 },
  { id: 'nile-3000bce-3d', label: 'Nile, 3000 BCE, close-up 3D', year: -3000, lat: 25.7, lon: 32.6, zoom: 9.5 },
  { id: 'uk-50000bce-z7', label: 'UK, 50,000 BCE, zoom 7', year: -50000, lat: 54, lon: -2, zoom: 7 },
  { id: 'sahara-6000bce-z8', label: 'Sahara, 6000 BCE, zoom 8', year: -6000, lat: 24, lon: 12, zoom: 8 },
  { id: 'croatia-50000bce-z10', label: 'Croatia, 50,000 BCE, zoom 10', year: -50000, lat: 45.6, lon: 16, zoom: 10 },
];

const optIn = () => FLAGS.filter((f) => f.kind === 'opt-in');

/**
 * What the sweep loads in each scene: no flags, each opt-in flag alone, each off switch alone, each mode, every opt-in together,
 * every off switch together, and every opt-in together under Grid and Dots (the looks that skip Units' own code).
 */
export function variants() {
  const all = Object.fromEntries(optIn().map((f) => [f.name, f.on]));
  const off = Object.fromEntries(FLAGS.filter((f) => f.kind === 'off-switch').map((f) => [f.name, f.on]));
  return [
    { id: 'none', label: 'no flags', query: {} },
    ...optIn().map((f) => ({ id: f.name, label: `?${f.name}=${f.on}`, query: { [f.name]: f.on } })),
    ...FLAGS.filter((f) => f.kind === 'off-switch').map((f) => ({ id: `${f.name}=0`, label: `?${f.name}=${f.on}`, query: { [f.name]: f.on } })),
    ...['units', 'grid', 'dots'].map((m) => ({ id: `mode=${m}`, label: `?mode=${m}`, query: { mode: m } })),
    { id: 'all-opt-in', label: 'every opt-in flag together', query: all },
    { id: 'all-off', label: 'every off switch together', query: off },
    { id: 'all-opt-in+grid', label: 'every opt-in flag, mode=grid', query: { ...all, mode: 'grid' } },
    { id: 'all-opt-in+dots', label: 'every opt-in flag, mode=dots', query: { ...all, mode: 'dots' } },
  ];
}

/** The address of one load: the scene's view plus the variant's flags (no `still` unless asked: the sweep wants the real animation). */
export function loadUrl(base, scene, variant, { still = false } = {}) {
  const q = new URLSearchParams({ year: String(scene.year) });
  for (const k of ['lat', 'lon', 'zoom']) if (scene[k] !== undefined) q.set(k, String(scene[k]));
  for (const [k, v] of Object.entries(variant.query)) q.set(k, v);
  if (still) q.set('still', '1');
  return `${base.replace(/\/$/, '')}/?${q}`;
}

/**
 * Requests that may fail without it being a bug. Each entry says why; a request that matches is reported as a note, not a failure
 * (`--strict` makes it a failure, for a base URL or data folder that has everything). Keep this short: a new entry is a decision.
 */
export const KNOWN_OPTIONAL = [
  { pattern: /\/favicon\.ico$/, why: 'the browser probes for an icon; the export has none' },
  { pattern: /^https:\/\/(s3\.amazonaws\.com\/elevation-tiles-prod|elevation-tiles-prod\.s3\.amazonaws\.com)\//, why: 'outside elevation tiles: absent over open ocean, and the first run needs the network' },
  { pattern: /\/api\/(anthropology|day)\b/, why: 'the day API runs on budgie (deploy/budgie/api); the static server has none, and the cards fall back to the facts they already hold' },
  { pattern: /\/terrain\/detail\//, why: '?terrain_tiles=1 data (the 500 m photo pyramid) is not built on every machine; the app falls back to the ordinary Earth image' },
  { pattern: /\/terrain\/pastwater\//, why: '?pastwater=1 Earth images are not built on every machine; the app falls back to the ordinary image (docs/ops/past-water.md)' },
  { pattern: /\/grid\/adjusted\//, why: '?spread=1 adjusted grids (data/tiles/grid_adjusted) are not built on every machine; the app reads the ordinary grid instead' },
];

/** The known-optional entry a failed request's URL matches, or undefined. */
export const knownOptional = (url) => KNOWN_OPTIONAL.find((k) => k.pattern.test(url));

/**
 * Is a screenshot's map blank? Sample the middle of the picture (the panels sit at the edges): a blank map is one flat colour. `distinct` counts colours quantised to 16 levels per channel; `range` is the spread of brightness.
 */
export async function canvasStats(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.floor(info.width * 0.3);
  const x1 = Math.floor(info.width * 0.7);
  const y0 = Math.floor(info.height * 0.3);
  const y1 = Math.floor(info.height * 0.7);
  const seen = new Set();
  let lo = 255;
  let hi = 0;
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < lo) lo = lum;
      if (lum > hi) hi = lum;
    }
  return { distinct: seen.size, range: Math.round(hi - lo) };
}

/**
 * Below these the middle of the picture is not a map: one flat fill (a cleared canvas, a black frame). A real scene is at least a smooth
 * terrain image: the Sahara at zoom 8 has 8-11 colours at this quantisation and a brightness range of 36-46, so these are set well under that.
 */
export const BLANK = { minDistinct: 3, minRange: 10 };

export const isBlank = (stats) => stats.distinct < BLANK.minDistinct || stats.range < BLANK.minRange;

/**
 * The verdict on one load: `problems` fail it, `notes` are known-optional data that was missing (so the flag ran without it).
 * Console "Failed to load resource" lines are the browser echoing a failed request, so they count once, as the request.
 */
export function judge(load, { strict = false } = {}) {
  const problems = [];
  const notes = [];
  const echo = /^Failed to load resource/;
  for (const e of load.consoleErrors.filter((t) => !echo.test(t))) problems.push(`console error: ${e}`);
  for (const e of load.pageErrors) problems.push(`page error: ${e}`);
  for (const r of load.failedRequests) {
    const optional = knownOptional(r.url);
    if (optional && !strict) notes.push(`optional data missing (${r.status || r.reason}) ${new URL(r.url).pathname}: ${optional.why}`);
    else problems.push(`failed request: ${r.status || r.reason} ${r.url}`);
  }
  if (!load.canvas) problems.push('no canvas on the page');
  else if (isBlank(load.canvas)) problems.push(`blank map (${load.canvas.distinct} colours, brightness range ${load.canvas.range})`);
  if (load.notSettled) problems.push(`never settled: ${load.notSettled}`);
  return { ok: problems.length === 0, problems, notes };
}
