/** @jest-environment node */
// Real-data check of modelled people on land sub-cells (docs/ops/prehistory-population.md "Land sub-cells"). Skipped unless asked:
//   FOOTSTEPS_SITES_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles pnpm --dir footsteps-web exec jest landSubcells.real
// For each year it builds the cells with an equal share per sub-cell ("before") and with the land mask ("after") and counts the people
// on sub-cells that are wholly sea at that year's sea level, the world total, and the all-sea blocks.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, type Pixels } from './gridData';
import { seaShare, type TerrainSea } from './landSubcells';
import { seaLevelAt } from '@/lib/climate';

const run = process.env.FOOTSTEPS_SITES_REAL === '1' ? describe : describe.skip;
const WEB = path.resolve(__dirname, '../../..');
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));

async function pixels(file: string): Promise<Pixels> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

const REGIONS: Record<string, [number, number, number, number]> = {
  // [west, south, east, north]
  Doggerland: [-2, 51, 8, 56],
  Sunda: [95, -8, 117, 8],
  Beringia: [-180, 60, -160, 70],
  'Sahul shelf': [125, -20, 145, -8],
  'Bay of Biscay coast': [-10, 42, 0, 48],
};

run('modelled people on land sub-cells', () => {
  const years = process.env.FOOTSTEPS_YEARS ? process.env.FOOTSTEPS_YEARS.split(',').map(Number) : [-21000, -40000, -12000];
  it('puts no people on sub-cells that are wholly sea', async () => {
    const img = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const n = img.width * img.height;
    const terrain: TerrainSea = { width: img.width, height: img.height, depth: new Uint8Array(n), packed: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      terrain.depth[i] = img.data[i * 4];
      terrain.packed[i] = img.data[i * 4 + 1];
    }
    const report: Record<string, unknown>[] = [];
    for (const year of years) {
      const pop = await pixels(path.join(DATA, 'prehistory', `humans_${year}.webp`));
      const drop = Math.max(0, -seaLevelAt(year));
      const row: Record<string, unknown> = { year, seaLevelM: Math.round(seaLevelAt(year) * 10) / 10 };
      for (const mode of ['before', 'after'] as const) {
        const d = gridDataFrom(year, pop, null, mode === 'after' ? terrain : null);
        let inSea = 0;
        let cellsInSea = 0;
        const regional: Record<string, number> = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, 0]));
        for (let i = 0; i < d.length; i++) {
          const id = d.cellIds[i];
          if (seaShare(terrain, id % 4320, Math.floor(id / 4320), 4320, drop) >= 1) {
            inSea += d.people[i];
            cellsInSea++;
          }
          const lon = d.positions[i * 2];
          const lat = d.positions[i * 2 + 1];
          for (const [name, [w, s, e, nn]] of Object.entries(REGIONS)) {
            if (lon >= w && lon <= e && lat >= s && lat <= nn) regional[name] += d.people[i];
          }
        }
        row[mode] = {
          cells: d.length,
          total: Math.round(d.total),
          peopleInWhollySeaSubcells: Math.round(inSea),
          cellsInWhollySea: cellsInSea,
          seaBlocks: d.seaBlocks ?? null,
          regionalPeople: Object.fromEntries(Object.entries(regional).map(([k, v]) => [k, Math.round(v)])),
        };
      }
      report.push(row);
      console.log(JSON.stringify(row));
    }
    const out = process.env.FOOTSTEPS_SITES_OUT;
    if (out) fs.writeFileSync(path.join(out, 'land_subcells.json'), JSON.stringify(report, null, 2));
  }, 600_000);
});
