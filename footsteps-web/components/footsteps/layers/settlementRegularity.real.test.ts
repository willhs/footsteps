/** @jest-environment node */
// Real-data regularity of group positions (docs/ops/site-terrain.md "Regularity"). Skipped unless FOOTSTEPS_SITES_REAL=1:
//   FOOTSTEPS_SITES_REAL=1 FOOTSTEPS_DATA=/path/to/data/tiles FOOTSTEPS_SITES_OUT=/abs/out \
//     pnpm --dir footsteps-web exec jest components/footsteps/layers/settlementRegularity.real.test.ts
// For Italy 1000 BCE and the Nile 1500 CE it builds the Units three ways (the default path with no flag, `?settlements=1&sites=0`,
// `?settlements=1`) and measures how regular the group positions are (siteRegularity.ts). Writes regularity.json to FOOTSTEPS_SITES_OUT.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gridDataFrom, prepareYearGrid, type Pixels } from '../hooks/gridData';
import { CANDIDATES, candidateOffsets, createSiteRanker } from './siteRanking';
import { regularity, type Box } from './siteRegularity';
import type { SettlementCatalog } from '@/lib/settlements';

const run = process.env.FOOTSTEPS_SITES_REAL === '1' ? describe : describe.skip;
const WEB = path.resolve(__dirname, '../../..');
const DATA = process.env.FOOTSTEPS_DATA ?? '';
const OUT = process.env.FOOTSTEPS_SITES_OUT ?? '';
const requireSharp = createRequire(require.resolve('next/package.json'));

const PLACES: { name: string; year: number; box: Box }[] = [
  { name: 'Italy 1000 BCE', year: -1000, box: { west: 7, east: 19, south: 36, north: 47.5 } },
  { name: 'Nile 1500 CE', year: 1500, box: { west: 29, east: 35, south: 22, north: 31.5 } },
];

async function pixels(file: string): Promise<Pixels & { channels: number }> {
  const sharp = requireSharp('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), channels: 4 };
}

/** Which of the cell's 16 candidates the first group of each cell took (matched by offset), as shares: 'candidate 0 wins everywhere' shows as one tall bar. */
function candidateHistogram(units: { length: number; ids: Uint32Array; positions: Float32Array }, cellDeg: number, box: Box) {
  const counts = new Array(CANDIDATES).fill(0);
  let total = 0;
  for (let u = 0; u < units.length; u++) {
    const lon = units.positions[u * 2];
    const lat = units.positions[u * 2 + 1];
    if (lon < box.west || lon > box.east || lat < box.south || lat > box.north) continue;
    const slot = units.ids[u] % 32;
    if (slot !== 0 && slot !== 20 && slot !== 25) continue; // the first group of a band or camp cell, or a farming cell
    const cell = Math.floor(units.ids[u] / 32);
    const row = Math.floor(cell / 4320);
    const x = (lon + 180) / cellDeg - (cell - row * 4320) - 0.5;
    const y = -((90 - lat) / cellDeg - row - 0.5);
    const { x: cx, y: cy } = candidateOffsets(cell);
    let best = 0;
    for (let k = 1; k < CANDIDATES; k++) if (Math.hypot(cx[k] - x, cy[k] - y) < Math.hypot(cx[best] - x, cy[best] - y)) best = k;
    if (Math.hypot(cx[best] - x, cy[best] - y) > 0.01) continue; // a layout moved it off its spot (hamlet follower)
    counts[best]++;
    total++;
  }
  return counts.map((c) => +(c / total).toFixed(3));
}

run('regularity of group positions on the shipped data', () => {
  it('measures the default path, ?sites=0 and ?settlements=1', async () => {
    const terrainImg = await pixels(path.join(WEB, 'public/sites/site_terrain.webp'));
    const waterImg = await pixels(path.join(WEB, 'public/water/water_distance.webp'));
    const n = terrainImg.width * terrainImg.height;
    const depth = new Uint8Array(n);
    const packed = new Uint8Array(n);
    for (let i = 0; i < n; i++) { depth[i] = terrainImg.data[i * 4]; packed[i] = terrainImg.data[i * 4 + 1]; }
    const code = new Uint8Array(waterImg.width * waterImg.height);
    for (let i = 0; i < code.length; i++) code[i] = waterImg.data[i * 4];
    const ranker = createSiteRanker({
      terrain: { width: terrainImg.width, height: terrainImg.height, depth, packed },
      water: { width: waterImg.width, height: waterImg.height, code },
    }, 4320);
    const catalog: SettlementCatalog = JSON.parse(fs.readFileSync(path.join(WEB, 'public/settlements.json'), 'utf8'));

    const report: Record<string, unknown>[] = [];
    for (const place of PLACES) {
      const pop = await pixels(path.join(DATA, 'grid', `humans_${place.year}.webp`));
      const land = await pixels(path.join(DATA, 'grid', `landuse_${place.year}.png`));
      const data = gridDataFrom(place.year, pop, land, null);
      const row: Record<string, unknown> = { place: place.name, year: place.year };
      const modes = {
        'default (no flag)': () => prepareYearGrid(place.year, data),
        '?settlements=1&sites=0': () => prepareYearGrid(place.year, data, { catalog, habitat: null, sites: null }),
        '?settlements=1': () => prepareYearGrid(place.year, data, { catalog, habitat: null, sites: ranker }),
      };
      for (const [mode, build] of Object.entries(modes)) {
        const units = build().units;
        let people = 0;
        for (let u = 0; u < units.length; u++) people += units.people[u];
        const r = regularity(units.positions, units.ids, place.box, data.cellDeg, 4320);
        row[mode] = {
          groups: units.length, people: Math.round(people),
          inBox: r.n, meanNN: +r.meanNN.toFixed(3), cv: +r.cv.toFixed(3), clarkEvans: +r.clarkEvans.toFixed(3),
          square: +r.square.toFixed(3), alignX: +r.alignX.toFixed(3), alignY: +r.alignY.toFixed(3),
          ...(mode === '?settlements=1' ? { firstGroupCandidate: candidateHistogram(units, data.cellDeg, place.box) } : {}),
        };
      }
      report.push(row);
      console.log(JSON.stringify(row));
    }
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, process.env.FOOTSTEPS_SITES_FILE ?? 'regularity.json'), JSON.stringify(report, null, 2));
    }
  }, 600_000);
});
