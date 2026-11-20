/** @jest-environment node */
// Real-data measurement of the Mega-Chad scenario in group placement (docs/ops/past-water.md "Measure"). Skipped unless FOOTSTEPS_PASTWATER_REAL=1:
//   FOOTSTEPS_PASTWATER_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_PASTWATER_OUT=/abs/out/dir pnpm exec jest --runInBand pastWater.real
// It builds the real Units for -6000 (the highstand), -12000 and 0 (controls: scenario inactive) with and without the epoch, over the shipped
// images, and counts: people (cells' total vs placed + unresolved), groups in the lake by a nearest-pixel test of the mask file (not the ranker's
// own bilinear one), unresolved groups, and groups outside the past-water region that moved. It writes the counts and the placed positions.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, prepareYearGrid, type Pixels } from '../hooks/gridData';
import { createSiteRanker } from './siteRanking';
import { habitatStep } from '@/lib/habitat';
import { PAST_WATER, pastWaterEpoch, type PastWaterLayers } from '@/lib/pastWater';
import type { SettlementCatalog } from '@/lib/settlements';

const run = process.env.FOOTSTEPS_PASTWATER_REAL === '1' ? describe : describe.skip;
const WEB = path.resolve(__dirname, '../../..');
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const OUT = process.env.FOOTSTEPS_PASTWATER_OUT ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));

async function pixels(file: string): Promise<Pixels> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
const red = (p: Pixels) => Uint8Array.from({ length: p.width * p.height }, (_, i) => p.data[i * 4]);

run('the Mega-Chad scenario against the shipped data', () => {
  it('keeps every person, places no group in the lake, and leaves everything outside its region alone', async () => {
    const terrainImg = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const waterImg = await pixels(path.join(WEB, 'public/water/water_distance.webp'));
    const maskImg = await pixels(path.join(WEB, 'public/pastwater', PAST_WATER.mask.file));
    const patchImg = await pixels(path.join(WEB, 'public/pastwater', PAST_WATER.distance.file));
    const n = terrainImg.width * terrainImg.height;
    const depth = new Uint8Array(n);
    const packed = new Uint8Array(n);
    for (let i = 0; i < n; i++) { depth[i] = terrainImg.data[i * 4]; packed[i] = terrainImg.data[i * 4 + 1]; }
    const terrain = { width: terrainImg.width, height: terrainImg.height, depth, packed };
    const m = PAST_WATER.mask;
    const d = PAST_WATER.distance;
    const layers: PastWaterLayers = {
      lake: { x0: m.x0, y0: m.y0, width: m.width, height: m.height, wet: red(maskImg).map((v) => (v > 127 ? 1 : 0)) },
      water: { x0: d.x0, y0: d.y0, width: d.width, height: d.height, code: red(patchImg) },
    };
    const water = { width: waterImg.width, height: waterImg.height, code: red(waterImg) };
    const plain = createSiteRanker({ terrain, water }, 4320);
    const wet = createSiteRanker({ terrain, water, pastWater: layers }, 4320);
    const catalog: SettlementCatalog = JSON.parse(fs.readFileSync(path.join(WEB, 'public/settlements.json'), 'utf8'));

    /** Nearest 2.5′ pixel of the mask file at a point: the check that does not use the ranker's interpolation. */
    const inLakePixel = (lon: number, lat: number) => {
      const x = Math.floor(((lon + 180) / 360) * 8640) - m.x0;
      const y = Math.floor(((90 - lat) / 180) * 4320) - m.y0;
      return x >= 0 && y >= 0 && x < m.width && y < m.height && layers.lake.wet[y * m.width + x] === 1;
    };
    // the region (5′ cells) the ranker says an epoch can change
    const cellsAcross = 4320;
    const years = (process.env.FOOTSTEPS_YEARS ?? '-6000,-12000,0').split(',').map(Number);
    const report: Record<string, unknown>[] = [];
    for (const year of years) {
      const modelled = year < -10000;
      const pop = await pixels(path.join(DATA, modelled ? 'prehistory' : 'grid', `humans_${year}.webp`));
      const landFile = path.join(DATA, 'grid', `landuse_${year}.png`);
      const land = !modelled && fs.existsSync(landFile) ? await pixels(landFile) : null;
      const data = gridDataFrom(year, pop, land, modelled ? terrain : null);
      const habitat = modelled ? (await pixels(path.join(DATA, 'habitat', `bp_${habitatStep(year)}.webp`))).data : null;
      const epoch = pastWaterEpoch(year);
      const t0 = performance.now();
      const off = prepareYearGrid(year, data, { catalog, habitat, sites: plain });
      const offMs = performance.now() - t0;
      const t1 = performance.now();
      const on = prepareYearGrid(year, data, { catalog, habitat, sites: wet, epoch });
      const onMs = performance.now() - t1;
      const sumOf = (u: { people: Float32Array; length: number }) => { let s = 0; for (let i = 0; i < u.length; i++) s += u.people[i]; return s; };
      const lakeCount = (u: typeof off.units) => { let c = 0; for (let i = 0; i < u.length; i++) if (inLakePixel(u.positions[i * 2], u.positions[i * 2 + 1])) c++; return c; };
      // groups whose cell the epoch cannot reach must be identical (id, position)
      const byId = (u: typeof off.units) => new Map(Array.from(u.ids, (id, i) => [id, [u.positions[i * 2], u.positions[i * 2 + 1], u.people[i]] as const]));
      const a = byId(off.units);
      const b = byId(on.units);
      let outsideMoved = 0;
      let outside = 0;
      for (const [id, v] of a) {
        const cell = Math.floor(id / 32);
        if (wet.inPastWater(cell)) continue;
        outside++;
        const w = b.get(id);
        if (!w || w[0] !== v[0] || w[1] !== v[1] || w[2] !== v[2]) outsideMoved++;
      }
      const row = {
        year, epoch, cells: data.length, worldPeople: Math.round(data.total),
        flagOff: { groups: off.units.length, people: Math.round(sumOf(off.units)), inLakePixel: lakeCount(off.units), buildMs: Math.round(offMs) },
        flagOn: {
          groups: on.units.length, people: Math.round(sumOf(on.units)), inLakePixel: lakeCount(on.units), unresolved: on.units.unresolved ?? null,
          placedPlusUnresolved: Math.round(sumOf(on.units) + (on.units.unresolved?.people ?? 0)), buildMs: Math.round(onMs), cachedCells: wet.size,
        },
        outsideRegion: { groups: outside, moved: outsideMoved },
        totalsEqual: data.total === data.total && Math.abs(sumOf(off.units) - (sumOf(on.units) + (on.units.unresolved?.people ?? 0))) < 1,
      };
      report.push(row);
      console.log(JSON.stringify(row));
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        for (const [label, u] of [['off', off.units], ['on', on.units]] as const) {
          fs.writeFileSync(path.join(OUT, `positions_${year}_${label}.bin`), Buffer.from(u.positions.buffer, u.positions.byteOffset, u.length * 8));
        }
      }
      expect(cellsAcross).toBe(4320);
      if (epoch === 0) {
        expect(on.units.positions.slice(0, on.units.length * 2)).toEqual(off.units.positions.slice(0, off.units.length * 2)); // controls: nothing changes
        expect(on.units.unresolved).toBeUndefined();
      } else {
        expect(row.flagOn.inLakePixel).toBe(0);
        expect(row.flagOff.inLakePixel).toBeGreaterThan(0);
      }
      expect(row.totalsEqual).toBe(true);
      expect(outsideMoved).toBe(0);
    }
    if (OUT) fs.writeFileSync(path.join(OUT, 'placement.json'), JSON.stringify({ scenario: PAST_WATER.digest, report }, null, 2));
  }, 900_000);
});
