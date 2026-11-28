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

/** @type {Array<{name:string,kind:string,on?:string,default:string,what:string,doc:string,reviewed:string,aliases?:string[]}>} */
export const FLAGS = [
  // Opt-in: the look is off until the flag is set. Order is the order the sweep turns them on together.
  { name: 'trees', kind: 'off-switch', on: '0', default: 'on', what: 'Shaded biome tree impostors, household clearings and distance LOD; trees imagined', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'ground', kind: 'off-switch', on: '0', default: 'on', what: 'Biome surface detail (grass, canopy, sand ripples, cracked ice, reeds, rock) in the close-up ground shader; the note says "surface imagined"', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'weather', kind: 'off-switch', on: '0', default: 'on', what: 'Imagined weather in the close-up ground shader: cloud shadows drifting by the place\'s rainfall, gusts through grass and reeds; works with or without ground=1; the note says "weather imagined"', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'shelters', kind: 'off-switch', on: '0', default: 'on', what: 'One dwelling per household in the close-up, typed from the analog society\'s house codes', doc: 'settlements.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'fields', kind: 'off-switch', on: '0', default: 'on', what: 'Imagined fields, gardens, terraces, corrals, grazed grass and worn paths round each group in the close-up; farmed share from HYDE cropland', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'smoke', kind: 'off-switch', on: '0', default: 'on', what: 'A smoke plume from each household\'s hearth, drifting with the wind, and warm light pools on the ground at night (all imagined)', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'routine', kind: 'off-switch', on: '0', default: 'on', what: 'Each person at street zoom follows a daily routine for the local sun time (asleep, hearth, play, trip)', doc: 'routine.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'avatar', kind: 'off-switch', on: '0', default: 'on', what: 'The person card shows a rigged, animated 3D figure (CC0 Quaternius body; clothes, hair and ornaments by era, place and way of life from a cited table; a tool and work loop by role; drag to turn) instead of the drawing', doc: 'avatar.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'pastwater', kind: 'off-switch', on: '0', default: 'on', what: 'Dated past-water scenarios (Lake Mega-Chad, European LGM lakes and rivers, Mesopotamian coast) in the Earth image, the site ranker and the close-up lake plane', doc: 'past-water.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'terrain_tiles', kind: 'off-switch', on: '0', default: 'on', what: 'The 500 m photo pyramid recoloured per year on the GPU, zoom 3-8 and the close-up ground colours', doc: 'terrain-images.md, terrain-bench.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'food', kind: 'off-switch', on: '0', default: 'on', what: 'Hover card row: crops and animals around, and forager staples (modelled)', doc: 'food.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'explain', kind: 'opt-in', on: '1', default: 'off', what: '"How is this estimated?" link under the counter: a panel naming the sources, methods and a confidence word for the place and year', doc: 'estimate-panel.md', reviewed: 'no' },
  { name: 'coast', kind: 'opt-in', on: '1', default: 'off', what: 'Draws the modern coastline (Natural Earth 110m) over the terrain image', doc: 'terrain-images.md', reviewed: 'n/a (debug overlay)' },
  { name: 'spread', kind: 'off-switch', on: '0', default: 'on', what: 'HYDE people moved by climate-then-vs-now within continent regions, 10,000-4,000 BCE ("Adjusted spread (modelled on HYDE)")', doc: 'hyde-climate-spread.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'ice', kind: 'off-switch', on: '0', default: 'on', what: 'Dated ice-sheet margins (PaleoMIST 1.0, nearest 2.5 ka epoch, 0-80 ka): white overlay, close-up ice surface, groups kept off the ice, hover row', doc: 'ice-sheets.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'langs', kind: 'off-switch', on: '0', default: 'on', what: '"Languages spreading here" hover line from cited expansion boxes (never before 3050 BCE)', doc: 'languages.md', reviewed: 'yes (2026-11-28, kept on)' },
  { name: 'sky', kind: 'off-switch', on: '0', default: 'on', what: 'Close-up light from the local sun clock, distance haze into a sky at the horizon, animated water with glint, shallows and shore foam', doc: 'close-up-scene.md', reviewed: 'yes (2026-11-28, kept on)' },
  // Off switches: on by default, `=0` turns it off (compare, or a fallback).
  { name: 'settlements', kind: 'off-switch', on: '0', default: 'on', what: 'The settlement model (group sizes and layouts from ethnographic analogs); `=0` gives even groups at random spots ', doc: 'settlements.md', reviewed: 'n/a (default)' },
  { name: 'sites', kind: 'off-switch', on: '0', default: 'on', what: 'Spot ranking inside each cell (flat, near fresh water, off the sea); `=0` keeps the old random positions', doc: 'site-terrain.md', reviewed: 'n/a (default)' },
  { name: 'humans', kind: 'off-switch', on: '0', default: 'on', what: 'Other kinds of human (Neanderthals, Denisovans, floresiensis, luzonensis)', doc: 'other-humans.md', reviewed: 'n/a (default)' },
  { name: 'rivers', kind: 'off-switch', on: '0', default: 'on', what: "Today's rivers (Natural Earth 10m, `public/water/rivers.json`) draped on the close-up ground as paths; courses that moved are drawn where they run now; none under the sea, ice or past water", doc: 'close-up-scene.md', reviewed: 'no' },
  { name: 'close3d', kind: 'off-switch', on: '0', default: 'on', what: 'The 3D landscape from zoom 8, seen from straight above; `=0` keeps the map flat', doc: 'close-up-scene.md', reviewed: 'n/a (default)' },
  { name: 'hover', kind: 'off-switch', on: '0', default: 'on', what: 'The hover card (habitat, climate, people, way of life under the cursor)', doc: 'habitat-lookup.md', reviewed: 'n/a (default)' },
  { name: 'tags', kind: 'off-switch', on: '0', default: 'on', what: 'Name tags on people at street zoom', doc: '../../footsteps-web/AGENTS.md (no ops doc)', reviewed: 'n/a (default)' },
  // A value picks a look.
  { name: 'mode', kind: 'choice', default: 'units (people view chosen by zoom)', what: '`units`, `grid` or `dots` forces one people look and shows the mode button', doc: 'grid-images.md', reviewed: 'n/a (debug)' },
  { name: 'bar', kind: 'choice', default: 'new time bar', what: '`old` shows the previous two-strip time navigator for comparison', doc: '../../footsteps-web/AGENTS.md (no ops doc)', reviewed: 'n/a (debug)' },
  // Debug.
  { name: 'still', kind: 'debug', on: '1', default: 'off', what: 'Stops time-based animation so the same scene gives the same pixels (visual regression)', doc: 'visual-regression.md', reviewed: 'n/a (debug)' },
  { name: 'utc', kind: 'debug', default: 'now', what: 'Start the sun clock at this UTC hour (e.g. 6.5)', doc: 'routine.md', reviewed: 'n/a (debug)' },
  { name: 'warp', kind: 'debug', default: '1', what: 'Run the sun clock this many times faster than real time', doc: 'routine.md', reviewed: 'n/a (debug)' },
  // Where the camera starts.
  { name: 'year', kind: 'view', default: 'the app\'s start year', what: 'Start year (negative = BCE)', doc: 'visual-regression.md', reviewed: 'n/a (view)' },
  { name: 'lat', kind: 'view', default: 'globe', what: 'Start latitude', doc: 'visual-regression.md', reviewed: 'n/a (view)' },
  { name: 'lon', kind: 'view', default: 'globe', what: 'Start longitude', doc: 'visual-regression.md', reviewed: 'n/a (view)', aliases: ['lng'] },
  { name: 'zoom', kind: 'view', default: 'globe', what: 'Start zoom', doc: 'visual-regression.md', reviewed: 'n/a (view)', aliases: ['z'] },
  { name: 'hour', kind: 'view', default: '10.5', what: 'Start the time-of-day dial at this local sun hour (e.g. 22)', doc: 'routine.md', reviewed: 'n/a (view)' },
];

/** Every name a flag can be spelled as in the URL. */
export const FLAG_NAMES = FLAGS.flatMap((f) => [f.name, ...(f.aliases ?? [])]);

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
