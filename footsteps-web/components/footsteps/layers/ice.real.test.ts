/** @jest-environment node */
// Real-data check of the ice sheets in group placement (docs/ops/ice-sheets.md "Measure"). Skipped unless FOOTSTEPS_ICE_REAL=1:
//   FOOTSTEPS_ICE_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_ICE_OUT=/abs/out/dir pnpm exec jest --runInBand ice.real
// For every 1 ka year from 25,000 to 10,000 BCE (FOOTSTEPS_YEARS overrides) it builds the real Units over the shipped images with and without
// the year's ice ids, and counts: people (placed + unresolved against the flag-off total), groups on an ice pixel by a nearest-pixel test of the
// mask files (not the ranker's own bilinear one), unresolved groups, and groups outside every ice region that moved (must be none).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, prepareYearGrid, type Pixels } from '../hooks/gridData';
import { createSiteRanker } from './siteRanking';
import { habitatStep } from '@/lib/habitat';
import { ICE, iceEpochAt, iceIds, iceMaskAt, iceMaskFrom, type IceLayers } from '@/lib/iceSheets';
import type { SettlementCatalog } from '@/lib/settlements';

const run = process.env.FOOTSTEPS_ICE_REAL === '1' ? describe : describe.skip;
const WEB = path.resolve(__dirname, '../../..');
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const OUT = process.env.FOOTSTEPS_ICE_OUT ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));

async function pixels(file: string): Promise<Pixels> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
const red = (p: Pixels) => Uint8Array.from({ length: p.width * p.height }, (_, i) => p.data[i * 4]);

run('the ice sheets against the shipped data', () => {
  it('keeps every person, places no group on the ice, and leaves everything outside the ice regions alone', async () => {
    const terrainImg = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const waterImg = await pixels(path.join(WEB, 'public/water/water_distance.webp'));
    const n = terrainImg.width * terrainImg.height;
    const depth = new Uint8Array(n);
    const packed = new Uint8Array(n);
    for (let i = 0; i < n; i++) { depth[i] = terrainImg.data[i * 4]; packed[i] = terrainImg.data[i * 4 + 1]; }
    const terrain = { width: terrainImg.width, height: terrainImg.height, depth, packed };
    const water = { width: waterImg.width, height: waterImg.height, code: red(waterImg) };
    const layers: IceLayers = { patches: ICE.epochs.flatMap((e) => e.patches), masks: new Map() };
    const plain = createSiteRanker({ terrain, water }, 4320);
    const iced = createSiteRanker({ terrain, water, ice: layers }, 4320);
    const catalog: SettlementCatalog = JSON.parse(fs.readFileSync(path.join(WEB, 'public/settlements.json'), 'utf8'));

    const years = (process.env.FOOTSTEPS_YEARS ?? Array.from({ length: 16 }, (_, i) => -25000 + i * 1000).join(',')).split(',').map(Number);
    const report: Record<string, unknown>[] = [];
    for (const year of years) {
      const epoch = iceEpochAt(year)!;
      for (const p of epoch.patches) if (!layers.masks.has(p.id)) layers.masks.set(p.id, iceMaskFrom(p, await pixels(path.join(WEB, 'public/ice', p.file))));
      const masks = epoch.patches.map((p) => layers.masks.get(p.id)!);
      const modelled = year < -10000;
      const pop = await pixels(path.join(DATA, modelled ? 'prehistory' : 'grid', `humans_${year}.webp`));
      const landFile = path.join(DATA, 'grid', `landuse_${year}.png`);
      const land = !modelled && fs.existsSync(landFile) ? await pixels(landFile) : null;
      const data = gridDataFrom(year, pop, land, modelled ? terrain : null);
      const habitat = modelled ? (await pixels(path.join(DATA, 'habitat', `bp_${habitatStep(year)}.webp`))).data : null;
      const ids = iceIds(year);
      const off = prepareYearGrid(year, data, { catalog, habitat, sites: plain });
      const t1 = performance.now();
      const on = prepareYearGrid(year, data, { catalog, habitat, sites: iced, epochs: ids });
      const onMs = performance.now() - t1;
      const sumOf = (u: { people: Float32Array; length: number }) => { let s = 0; for (let i = 0; i < u.length; i++) s += u.people[i]; return s; };
      const onIce = (u: typeof off.units) => { let c = 0; for (let i = 0; i < u.length; i++) if (iceMaskAt(masks, u.positions[i * 2], u.positions[i * 2 + 1])) c++; return c; };
      const byId = (u: typeof off.units) => new Map(Array.from(u.ids, (id, i) => [id, [u.positions[i * 2], u.positions[i * 2 + 1], u.people[i]] as const]));
      const a = byId(off.units);
      const b = byId(on.units);
      let outside = 0;
      let outsideMoved = 0;
      for (const [id, v] of a) {
        if (iced.inScenario(Math.floor(id / 32))) continue;
        outside++;
        const w = b.get(id);
        if (!w || w[0] !== v[0] || w[1] !== v[1] || w[2] !== v[2]) outsideMoved++;
      }
      const offPeople = sumOf(off.units);
      const onPeople = sumOf(on.units) + (on.units.unresolved?.people ?? 0);
      const row = {
        year, epoch: `${epoch.ka} ka`, ids, worldPeople: Math.round(data.total),
        flagOff: { groups: off.units.length, people: Math.round(offPeople), onIce: onIce(off.units) },
        flagOn: { groups: on.units.length, people: Math.round(sumOf(on.units)), onIce: onIce(on.units), unresolved: on.units.unresolved ?? null, buildMs: Math.round(onMs) },
        placedPlusUnresolved: Math.round(onPeople),
        outsideRegions: { groups: outside, moved: outsideMoved },
        totalsEqual: Math.abs(offPeople - onPeople) < 1,
      };
      report.push(row);
      console.log(JSON.stringify(row));
      expect(row.flagOn.onIce).toBe(0);
      expect(row.totalsEqual).toBe(true);
      expect(outsideMoved).toBe(0);
    }
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, 'ice_placement.json'), JSON.stringify({ digest: ICE.digest, report }, null, 2));
    }
  }, 1_800_000);
});
