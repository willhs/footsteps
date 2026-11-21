/** @jest-environment node */
// Real-data check of the climate-adjusted spread (`?spread=1`, docs/ops/hyde-climate-spread.md) through the browser's own decoder.
// Skipped unless FOOTSTEPS_SPREAD_REAL=1:
//   FOOTSTEPS_SPREAD_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_SPREAD_OUT=/abs/out.json pnpm exec jest --runInBand adjustedSpread.real
// FOOTSTEPS_DATA holds grid/ (HYDE) and grid_adjusted/. For every adjusted year it decodes both images with gridDataFrom and asserts the
// world total is HYDE's (what the counter relies on), and that the Green Sahara and the North Sea floor gain people at 8,000 BCE.
// It also records the Sahara across the -4000 → -3000 step, where the adjustment ends.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, type GridData, type Pixels } from './gridData';
import { ADJUSTED_SPREAD_YEARS, spreadTotalOk } from '@/lib/adjustedSpread';

const run = process.env.FOOTSTEPS_SPREAD_REAL === '1' ? describe : describe.skip;
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const OUT = process.env.FOOTSTEPS_SPREAD_OUT ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));
const TOTAL_RTOL = 3e-4 * 3; // grid_image.TOTAL_RTOL, with the margin hyde_climate_spread --verify allows

async function pixels(file: string): Promise<Pixels> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** People in a lon/lat box (the generator's PLACES boxes, without its shelf-only filter). */
function inBox(g: GridData, [west, south, east, north]: [number, number, number, number]): number {
  let s = 0;
  for (let i = 0; i < g.length; i++) {
    const lon = g.positions[i * 2];
    const lat = g.positions[i * 2 + 1];
    if (lon >= west && lon <= east && lat >= south && lat <= north) s += g.people[i];
  }
  return s;
}
const SAHARA: [number, number, number, number] = [-17, 15, 35, 30];
const NORTH_SEA: [number, number, number, number] = [-4, 51, 9, 62];

run('the adjusted spread against the shipped data', () => {
  it('keeps HYDE\'s world total every year and puts people in the Green Sahara and on the North Sea floor', async () => {
    const decode = async (dir: string, year: number) => gridDataFrom(year, await pixels(path.join(DATA, dir, `humans_${year}.webp`)), null);
    const rows: Record<string, number>[] = [];
    for (const year of ADJUSTED_SPREAD_YEARS) {
      const hyde = await decode('grid', year);
      const adj = await decode('grid_adjusted', year);
      rows.push({
        year, hydeTotal: Math.round(hyde.total), adjustedTotal: Math.round(adj.total), relDiff: Math.abs(adj.total - hyde.total) / hyde.total,
        saharaHyde: Math.round(inBox(hyde, SAHARA)), saharaAdjusted: Math.round(inBox(adj, SAHARA)),
        northSeaHyde: Math.round(inBox(hyde, NORTH_SEA)), northSeaAdjusted: Math.round(inBox(adj, NORTH_SEA)),
      });
      expect(Math.abs(adj.total - hyde.total) / hyde.total).toBeLessThan(TOTAL_RTOL);
      expect(spreadTotalOk(adj.total, year)).toBe(true); // the decoder's own guard accepts it
      expect(spreadTotalOk(hyde.total, year)).toBe(true);
    }
    const at = (y: number) => rows.find((r) => r.year === y)!;
    expect(at(-8000).saharaAdjusted).toBeGreaterThan(2 * at(-8000).saharaHyde);
    expect(at(-8000).northSeaAdjusted).toBeGreaterThan(at(-8000).northSeaHyde);
    // The step where the adjustment ends: -4000 adjusted, -3000 HYDE's own.
    const after = await decode('grid', -3000);
    const step = { saharaAdjusted4000: at(-4000).saharaAdjusted, saharaHyde4000: at(-4000).saharaHyde, saharaHyde3000: Math.round(inBox(after, SAHARA)), worldHyde3000: Math.round(after.total) };
    if (OUT) fs.writeFileSync(OUT, JSON.stringify({ years: rows, step }, null, 2));
  }, 600_000);
});
