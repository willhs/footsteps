/** @jest-environment node */
// Real-data measurement of group placement (docs/ops/site-terrain.md "Measure"). Skipped unless FOOTSTEPS_SITES_REAL=1:
//   FOOTSTEPS_SITES_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_SITES_OUT=/abs/out/dir pnpm test -- settlementSites.real
// It builds the real ?settlements=1 Units for several years from the shipped images, with the old random positions ("before")
// and with ranked spots ("after"), counts groups in the sea or on a lake, and writes the counts (and, for 1900 CE, the group
// positions for footstep-generator/site_check.py, which tests them against Natural Earth's polygons).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, prepareYearGrid, type Pixels } from '../hooks/gridData';
import { createSiteRanker } from './siteRanking';
import { habitatStep } from '@/lib/habitat';
import { seaLevelAt } from '@/lib/climate';
import type { SettlementCatalog } from '@/lib/settlements';

const run = process.env.FOOTSTEPS_SITES_REAL === '1' ? describe : describe.skip;
const WEB = path.resolve(__dirname, '../../..');
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const OUT = process.env.FOOTSTEPS_SITES_OUT ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));

async function pixels(file: string): Promise<Pixels & { channels: number }> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), channels: 4 };
}

run('placement against the shipped data', () => {
  const years = process.env.FOOTSTEPS_YEARS ? process.env.FOOTSTEPS_YEARS.split(',').map(Number) : [1900, 1000, 0, -5000, -10000, -21000];
  it('counts groups in the sea before and after', async () => {
    const terrainImg = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const waterImg = await pixels(path.join(WEB, 'public/water/water_distance.webp'));
    const n = terrainImg.width * terrainImg.height;
    const depth = new Uint8Array(n);
    const packed = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      depth[i] = terrainImg.data[i * 4];
      packed[i] = terrainImg.data[i * 4 + 1];
    }
    const code = new Uint8Array(waterImg.width * waterImg.height);
    for (let i = 0; i < code.length; i++) code[i] = waterImg.data[i * 4];
    const ranker = createSiteRanker({
      terrain: { width: terrainImg.width, height: terrainImg.height, depth, packed },
      water: { width: waterImg.width, height: waterImg.height, code },
    }, 4320);
    const catalog: SettlementCatalog = JSON.parse(fs.readFileSync(path.join(WEB, 'public/settlements.json'), 'utf8'));

    /** Nearest terrain pixel to a point: mostly sea at the year's level, or a lake (a coarser test than the ranker's, which interpolates). */
    const wetAtPoint = (lon: number, lat: number, drop: number) => {
      const x = Math.min(terrainImg.width - 1, Math.floor(((lon + 180) / 360) * terrainImg.width));
      const y = Math.min(terrainImg.height - 1, Math.floor(((90 - lat) / 180) * terrainImg.height));
      const i = y * terrainImg.width + x;
      const share = (packed[i] >> 4) / 15;
      return { sea: depth[i] > drop && share >= 0.5, lake: (packed[i] & 8) !== 0 };
    };
    const report: Record<string, unknown>[] = [];
    for (const year of years) {
      const modelled = year < -10000;
      const popFile = path.join(DATA, 'grid', `humans_${year}.webp`);
      const pop = await pixels(popFile);
      const landFile = path.join(DATA, 'grid', `landuse_${year}.png`);
      const land = !modelled && fs.existsSync(landFile) ? await pixels(landFile) : null;
      const data = gridDataFrom(year, pop, land);
      const habitat = modelled ? (await pixels(path.join(DATA, 'habitat', `bp_${habitatStep(year)}.webp`))).data : null;
      const drop = Math.max(0, -seaLevelAt(year));
      const row: Record<string, unknown> = { year, seaLevelM: Math.round(seaLevelAt(year) * 10) / 10, cells: data.length };
      for (const mode of ['before', 'after'] as const) {
        const t0 = performance.now();
        const grid = prepareYearGrid(year, data, { catalog, habitat, sites: mode === 'after' ? ranker : null });
        const ms = performance.now() - t0;
        const units = grid.units;
        let sea = 0;
        let lake = 0;
        let people = 0;
        for (let u = 0; u < units.length; u++) {
          const w = wetAtPoint(units.positions[u * 2], units.positions[u * 2 + 1], drop);
          if (w.sea) sea++;
          else if (w.lake) lake++;
          people += units.people[u];
        }
        const stats: Record<string, number> = { groups: units.length, inSea: sea, onLake: lake, people: Math.round(people), buildMs: Math.round(ms) };
        if (mode === 'after') {
          // why the rest: groups in cells where the baked coast leaves no dry spot, and groups the ranker itself calls wet
          const level = seaLevelAt(year);
          const noDryCells = new Set<number>();
          let noDryGroups = 0;
          let seaNoDry = 0;
          let seaDry = 0;
          const noDryFlag = new Uint8Array(units.length);
          for (let u = 0; u < units.length; u++) {
            const cell = Math.floor(units.ids[u] / 32);
            const none = ranker.spotsFor(cell, level, 1).dry === 0;
            noDryFlag[u] = none ? 1 : 0;
            if (none) { noDryCells.add(cell); noDryGroups++; }
            const w = wetAtPoint(units.positions[u * 2], units.positions[u * 2 + 1], drop);
            if (w.sea) { if (none) seaNoDry++; else seaDry++; }
          }
          if (OUT && year === 1900) fs.writeFileSync(path.join(OUT, 'positions_1900_after_nodry.bin'), noDryFlag);
          Object.assign(stats, { cellsWithNoDrySpot: noDryCells.size, groupsInThem: noDryGroups, inSeaInThem: seaNoDry, inSeaElsewhere: seaDry });
        }
        row[mode] = stats;
        if (OUT && year === 1900) {
          fs.mkdirSync(OUT, { recursive: true });
          fs.writeFileSync(path.join(OUT, `positions_${year}_${mode}.bin`), Buffer.from(units.positions.buffer, units.positions.byteOffset, units.positions.byteLength));
        }
      }
      // a second "after" build is warm: every cell's list is cached
      const t1 = performance.now();
      prepareYearGrid(year, data, { catalog, habitat, sites: ranker });
      row.afterWarmMs = Math.round(performance.now() - t1);
      report.push(row);
      console.log(JSON.stringify(row));
    }
    if (OUT) fs.writeFileSync(path.join(OUT, 'placement.json'), JSON.stringify({ cachedCells: ranker.size, report }, null, 2));
  }, 600_000);
});
