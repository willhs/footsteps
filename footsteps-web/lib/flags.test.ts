/** @jest-environment node */
// Pins the flag inventory (docs/ops/flags.md, scripts/flags-lib.mjs): every URL parameter the code reads is in the registry and in the doc,
// so a new flag cannot land unlisted and the sweep (scripts/verify-flags.mjs) cannot silently skip it. Also pins the sweep's variants and its verdicts.
import fs from 'node:fs';
import path from 'node:path';
import { FLAGS, FLAG_NAMES, SCENES, canvasStats, isBlank, judge, loadUrl, variants } from '../scripts/flags-lib.mjs';
import sharp from 'sharp';

const WEB = path.resolve(__dirname, '..');
const DOC = fs.readFileSync(path.join(WEB, '..', 'docs', 'ops', 'flags.md'), 'utf8');

/** Source files that can read the URL: app/, components/, lib/, without tests. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Names read as `<URLSearchParams or a variable holding one>.get('x')`, or set/deleted on `url.searchParams`. */
function paramsRead(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const re = /(?:URLSearchParams\([^)]*\)|\bparams|\bsp|\bsearchParams)\.(?:get|has|set|delete)\(\s*['"]([A-Za-z0-9_]+)['"]/g;
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of sources(path.join(WEB, dir))) {
      if (file.endsWith('QueryParamRangeSource.ts')) continue; // its `rk` is a cache-busting key on data requests, not a page flag
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(re)) found.set(m[1], [...(found.get(m[1]) ?? []), path.relative(WEB, file)]);
    }
  }
  return found;
}

describe('flag inventory', () => {
  const read = paramsRead();

  it('finds the flags the code reads (the scan itself works)', () => {
    for (const known of ['ground', 'pastwater', 'close3d', 'mode', 'terrain_tiles', 'lat', 'year']) expect(read.has(known)).toBe(true);
  });

  it('lists every URL parameter the code reads in the registry', () => {
    const missing = [...read.keys()].filter((k) => !FLAG_NAMES.includes(k));
    expect(missing).toEqual([]);
  });

  it('lists every registered flag in docs/ops/flags.md', () => {
    const missing = FLAGS.filter((f) => !DOC.includes(`\`?${f.name}`)).map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it('has no flag in the registry that the code no longer reads', () => {
    const gone = FLAGS.filter((f) => ![f.name, ...(f.aliases ?? [])].some((n) => read.has(n))).map((f) => f.name);
    expect(gone).toEqual([]);
  });

  it('has each flag once', () => {
    expect(new Set(FLAG_NAMES).size).toBe(FLAG_NAMES.length);
  });
});

describe('sweep variants', () => {
  const all = variants();

  it('has every opt-in flag alone and every off switch alone', () => {
    for (const f of FLAGS.filter((f) => f.kind === 'opt-in' || f.kind === 'off-switch')) {
      expect(all.find((v) => JSON.stringify(v.query) === JSON.stringify({ [f.name]: f.on }))).toBeDefined();
    }
  });

  it('turns every opt-in flag on together, with and without a forced mode', () => {
    const optIn = FLAGS.filter((f) => f.kind === 'opt-in');
    for (const id of ['all-opt-in', 'all-opt-in+grid', 'all-opt-in+dots']) {
      const q = all.find((v) => v.id === id)!.query as Record<string, string>;
      for (const f of optIn) expect(q[f.name]).toBe(f.on);
    }
  });

  it('gives each variant its own id and builds an address with the scene and the flags', () => {
    expect(new Set(all.map((v) => v.id)).size).toBe(all.length);
    const url = new URL(loadUrl('http://x/', SCENES[1], all.find((v) => v.id === 'ground=0')!));
    expect(url.searchParams.get('year')).toBe('-1000');
    expect(url.searchParams.get('zoom')).toBe('9');
    expect(url.searchParams.get('ground')).toBe('0');
    expect(url.searchParams.get('still')).toBeNull();
  });

  it('covers six scenes', () => {
    expect(SCENES).toHaveLength(6);
  });
});

describe('verdicts', () => {
  const good = { consoleErrors: [], pageErrors: [], failedRequests: [], canvas: { distinct: 9, range: 40 }, notSettled: null };

  it('passes a clean load', () => {
    expect(judge(good).ok).toBe(true);
  });

  it('fails on a console error, a page error, a failed request, a blank map, no canvas and a page that never settled', () => {
    expect(judge({ ...good, consoleErrors: ['TypeError: x'] }).ok).toBe(false);
    expect(judge({ ...good, pageErrors: ['boom'] }).ok).toBe(false);
    expect(judge({ ...good, failedRequests: [{ url: 'http://x/grid/humans_1.webp', status: 404, reason: 'Not Found' }] }).ok).toBe(false);
    expect(judge({ ...good, canvas: { distinct: 1, range: 0 } }).ok).toBe(false);
    expect(judge({ ...good, canvas: null }).ok).toBe(false);
    expect(judge({ ...good, notSettled: 'stuck' }).ok).toBe(false);
  });

  it('counts the browser\'s "Failed to load resource" echo once, as the request', () => {
    const v = judge({ ...good, consoleErrors: ['Failed to load resource: the server responded with a status of 404 (Not Found)'], failedRequests: [{ url: 'http://x/a.webp', status: 404, reason: '' }] });
    expect(v.problems).toHaveLength(1);
  });

  it('notes missing optional data, and fails it under strict', () => {
    const missing = { ...good, failedRequests: [{ url: 'http://x/terrain/detail/ref.webp?v=2', status: 404, reason: 'Not Found' }] };
    expect(judge(missing)).toMatchObject({ ok: true, notes: [expect.stringContaining('/terrain/detail/ref.webp')] });
    expect(judge(missing, { strict: true }).ok).toBe(false);
  });

  it('reads a flat picture as blank and a busy one as a map', async () => {
    const flat = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#101820' } }).png().toBuffer();
    const px = Buffer.alloc(200 * 200 * 3);
    for (let i = 0; i < 200 * 200; i++) px.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256], i * 3);
    const busy = await sharp(px, { raw: { width: 200, height: 200, channels: 3 } }).png().toBuffer();
    expect(isBlank(await canvasStats(flat))).toBe(true);
    expect(isBlank(await canvasStats(busy))).toBe(false);
  });
});
