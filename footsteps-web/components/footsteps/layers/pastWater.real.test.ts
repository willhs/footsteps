/** @jest-environment node */
// Real-data measurement of the past-water scenarios in group placement (docs/ops/past-water.md "Measure"). Skipped unless FOOTSTEPS_PASTWATER_REAL=1:
//   FOOTSTEPS_PASTWATER_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_PASTWATER_OUT=/abs/out/dir pnpm exec jest --runInBand pastWater.real
// It builds the real Units for years in every scenario (-20000 the LGM; -6000 Mega-Chad + Mesopotamia ~7-8 ka; -4000 Mega-Chad + ~6 ka;
// -2000 ~4 ka) and controls with no scenario (-26000, -12000, 0), with and without the year's epochs, over the shipped images, and counts:
// people (cells' total vs placed + unresolved), groups in modelled water by a nearest-pixel test of each active epoch's mask file (not the
// ranker's own bilinear one), unresolved groups, and groups outside the past-water regions that moved. It writes the counts and positions.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, prepareYearGrid, type Pixels } from '../hooks/gridData';
import { createSiteRanker } from './siteRanking';
import { habitatStep } from '@/lib/habitat';
import { PAST_WATER_SCENARIOS, epochLayersFrom, pastWaterEpochs, type PastWaterLayers } from '@/lib/pastWater';
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

run('the past-water scenarios against the shipped data', () => {
  it('keeps every person, places no group in modelled water, and leaves everything outside the regions alone', async () => {
    const terrainImg = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const waterImg = await pixels(path.join(WEB, 'public/water/water_distance.webp'));
    const n = terrainImg.width * terrainImg.height;
    const depth = new Uint8Array(n);
    const packed = new Uint8Array(n);
    for (let i = 0; i < n; i++) { depth[i] = terrainImg.data[i * 4]; packed[i] = terrainImg.data[i * 4 + 1]; }
    const terrain = { width: terrainImg.width, height: terrainImg.height, depth, packed };
    const layers: PastWaterLayers = { epochs: [] };
    for (const e of PAST_WATER_SCENARIOS.flatMap((s) => s.epochs)) {
      const mask = await pixels(path.join(WEB, 'public/pastwater', e.mask.file));
      const distance = e.distance ? await pixels(path.join(WEB, 'public/pastwater', e.distance.file)) : null;
      layers.epochs.push(epochLayersFrom(e, mask, distance));
    }
    const water = { width: waterImg.width, height: waterImg.height, code: red(waterImg) };
    const plain = createSiteRanker({ terrain, water }, 4320);
    const wet = createSiteRanker({ terrain, water, pastWater: layers }, 4320);
    const catalog: SettlementCatalog = JSON.parse(fs.readFileSync(path.join(WEB, 'public/settlements.json'), 'utf8'));

    /** Nearest 2.5′ pixel of an active epoch's mask file at a point: the check that does not use the ranker's interpolation. */
    const inWaterPixel = (epochs: number[], lon: number, lat: number) => {
      const x = Math.floor(((lon + 180) / 360) * 8640);
      const y = Math.floor(((90 - lat) / 180) * 4320);
      return layers.epochs.some(({ id, lake: m }) => epochs.includes(id) && x >= m.x0 && y >= m.y0 && x < m.x0 + m.width && y < m.y0 + m.height && m.wet[(y - m.y0) * m.width + (x - m.x0)] === 1);
    };
    // the region (5′ cells) the ranker says an epoch can change
    const cellsAcross = 4320;
    const years = (process.env.FOOTSTEPS_YEARS ?? '-20000,-6000,-4000,-2000,-26000,-12000,0').split(',').map(Number);
    const report: Record<string, unknown>[] = [];
    for (const year of years) {
      const modelled = year < -10000;
      const pop = await pixels(path.join(DATA, modelled ? 'prehistory' : 'grid', `humans_${year}.webp`));
      const landFile = path.join(DATA, 'grid', `landuse_${year}.png`);
      const land = !modelled && fs.existsSync(landFile) ? await pixels(landFile) : null;
      const data = gridDataFrom(year, pop, land, modelled ? terrain : null);
      const habitat = modelled ? (await pixels(path.join(DATA, 'habitat', `bp_${habitatStep(year)}.webp`))).data : null;
      const epochs = pastWaterEpochs(year);
      const t0 = performance.now();
      const off = prepareYearGrid(year, data, { catalog, habitat, sites: plain });
      const offMs = performance.now() - t0;
      const t1 = performance.now();
      const on = prepareYearGrid(year, data, { catalog, habitat, sites: wet, epochs });
      const onMs = performance.now() - t1;
      const sumOf = (u: { people: Float32Array; length: number }) => { let s = 0; for (let i = 0; i < u.length; i++) s += u.people[i]; return s; };
      const lakeCount = (u: typeof off.units) => { let c = 0; for (let i = 0; i < u.length; i++) if (inWaterPixel(epochs, u.positions[i * 2], u.positions[i * 2 + 1])) c++; return c; };
      // groups whose cell no epoch can reach must be identical (id, position)
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
        year, epochs, cells: data.length, worldPeople: Math.round(data.total),
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
      if (!epochs.length) {
        expect(on.units.positions.slice(0, on.units.length * 2)).toEqual(off.units.positions.slice(0, off.units.length * 2)); // controls: nothing changes
        expect(on.units.unresolved).toBeUndefined();
      } else {
        expect(row.flagOn.inLakePixel).toBe(0);
        expect(row.flagOff.inLakePixel).toBeGreaterThan(0);
      }
      expect(row.totalsEqual).toBe(true);
      expect(outsideMoved).toBe(0);
    }
    if (OUT) fs.writeFileSync(path.join(OUT, 'placement.json'), JSON.stringify({ scenarios: PAST_WATER_SCENARIOS.map((s) => [s.id, s.digest]), report }, null, 2));
  }, 900_000);
});
