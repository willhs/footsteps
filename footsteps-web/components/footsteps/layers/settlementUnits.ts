import type { GridData } from '../hooks/gridData';
import { UnitKind, KIND_OF_WAY, type Units, type UnitKindValue } from './units';
import { WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import { layoutOfPattern, profileAt, type Layout, type SettlementCatalog } from '@/lib/settlements';
import { seaLevelAt } from '@/lib/climate';
import { CAUSE_ICE, CAUSE_WATER, type SiteRanker } from './siteRanking';
import { DISPERSE_POOL, layGroups } from './settlementLayout';
import { NO_SOCIETY, type DwellingTable } from '@/lib/dwellings';
import { NO_EPOCHS, type Epochs } from '@/lib/pastWater';

const slots = [0, 20, 24, 25];
const laidInto = { x: new Float64Array(20), y: new Float64Array(20) }; // layGroups' scratch: at most 20 groups a cell
const limits = [20, 4, 1, 4];

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bounded, deterministic long-tail allocations. Shares represent people assigned
 * to a group, not a census of a real settlement. Even sub-person cells conserve mass.
 * Fixed positions and existing ID slots preserve the year morph's contract.
 * With `sites`, a cell's groups sit on its ranked spots (siteRanking.ts: flat, near fresh water, near the year's coast, never in
 * the sea), and a farming cell's groups follow the settlement pattern of the analog each was drawn from (settlementLayout.ts:
 * scattered farmsteads, a tight hamlet, or villages apart); without `sites`, at invented positions that ignore land and water. */
export function buildSettlementUnits(
  data: GridData, catalog: SettlementCatalog, year: number, habitat: Uint8ClampedArray | null, sites?: SiteRanker | null,
  dwellings?: DwellingTable | null,
  epochs: Epochs = NO_EPOCHS,
): Units {
  const seaLevel = seaLevelAt(year);
  // By cause too: a cell under both ice and modelled water counts in each, so each note says only what its own layer did.
  const unresolved = { groups: 0, people: 0, ice: { groups: 0, people: 0 }, water: { groups: 0, people: 0 } };
  const per = new Uint8Array(data.length);
  const kinds = new Uint8Array(data.length);
  const profiles = new Map<string, ReturnType<typeof profileAt>>();
  const componentsFor = (i: number, way: number) => {
    const lon = data.positions[i * 2];
    const lat = data.positions[i * 2 + 1];
    const deg = year < -10000 ? 0.5 : 5;
    const key = `${Math.floor((90 - lat) / deg)},${Math.floor((lon + 180) / deg)},${way}`;
    let profile = profiles.get(key);
    if (!profile) {
      profile = profileAt(catalog, lon, lat, way, year, habitat);
      profiles.set(key, profile);
    }
    return profile.components;
  };
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    const way = year < -10000 ? WayOfLife.Forager : data.ways[i] as WayOfLifeValue;
    const kind = KIND_OF_WAY[way];
    kinds[i] = kind;
    if (data.people[i] <= 0) continue;
    const components = componentsFor(i, way);
    const weight = components.reduce((sum, c) => sum + c.weight, 0);
    const size = weight ? components.reduce((sum, c) => sum + c.size * c.weight, 0) / weight : Infinity;
    per[i] = Math.min(limits[kind], Math.max(1, Math.round(data.people[i] / size)));
    // A cell modelled past water covers entirely has no dry ground: its people stay in the totals, its groups are not drawn (and counted here).
    const spots = epochs.length && sites?.inScenario(data.cellIds[i]) ? sites.spotsFor(data.cellIds[i], seaLevel, 1, epochs) : null;
    if (spots?.unresolved) {
      unresolved.groups += per[i];
      unresolved.people += data.people[i];
      for (const [bit, tally] of [[CAUSE_ICE, unresolved.ice], [CAUSE_WATER, unresolved.water]] as const) {
        if ((spots.cause ?? CAUSE_WATER) & bit) {
          tally.groups += per[i];
          tally.people += data.people[i];
        }
      }
      per[i] = 0;
      continue;
    }
    total += per[i];
  }
  const out: Units = {
    length: total, positions: new Float32Array(total * 2), people: new Float32Array(total),
    kind: new Uint8Array(total), ids: new Uint32Array(total), counts: [0, 0, 0, 0],
    mobility: new Float32Array(total), society: new Uint16Array(total).fill(NO_SOCIETY),
    ...(epochs.length ? { unresolved } : {}),
  };
  let j = 0;
  for (let i = 0; i < data.length; i++) {
    const count = per[i];
    if (!count) continue;
    const kind = kinds[i] as UnitKindValue;
    const way = year < -10000 ? WayOfLife.Forager : data.ways[i];
    const components = componentsFor(i, way);
    const weight = components.reduce((sum, c) => sum + c.weight, 0);
    const sizes: number[] = [];
    const mobility: number[] = [];
    const layouts: Layout[] = [];
    const societies: number[] = [];
    const rand = random(data.cellIds[i] * 2246822519 + 7);
    const centres = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const choice = random(data.cellIds[i] * 2654435761);
    for (let c = 0; c < count; c++) {
      let target = choice() * weight;
      const component = components.find((item) => (target -= item.weight) <= 0);
      // Truncated Pareto tail; normalisation below preserves every cell's budget.
      layouts.push(layoutOfPattern(component?.pattern ?? null));
      societies.push((component && dwellings?.index.get(component.society)) ?? NO_SOCIETY);
      sizes.push((component?.size ?? 1) * Math.min(8, (1 - choice()) ** -0.8));
      mobility.push(!component || component.mode === 'settled' ? 0 : component.mode === 'aggregation' ? 0.1
        : component?.moves !== null && component?.moves !== undefined ? Math.min(1, component.moves / 12) : 0.5);
    }
    const sum = sizes.reduce((a, b) => a + b, 0);
    let assigned = 0;
    const spots = sites && kind !== UnitKind.Glow ? sites.spotsFor(data.cellIds[i], seaLevel, kind === UnitKind.Village ? Math.max(count, DISPERSE_POOL) : count, epochs) : null;
    // A city's glow is the cell, so it stays on the cell centre unless the centre is under water.
    const glowSpot = sites && kind === UnitKind.Glow && sites.isWet(data.cellIds[i], 0, 0, seaLevel, epochs) ? sites.spotsFor(data.cellIds[i], seaLevel, 1, epochs) : null;
    // Only farmers have a layout: bands and camps keep one ranked spot each (every group 'nucleated' is exactly that).
    const laid = spots && kind === UnitKind.Village
      ? layGroups(layouts, spots, (x, y) => sites!.isWet(data.cellIds[i], x, y, seaLevel, epochs), data.cellIds[i], laidInto) : null;
    for (let c = 0; c < count; c++) {
      if (laid) {
        out.positions[j * 2] = data.positions[i * 2] + laid.x[c] * data.cellDeg;
        out.positions[j * 2 + 1] = data.positions[i * 2 + 1] + laid.y[c] * data.cellDeg;
      } else if (spots || glowSpot) {
        // More groups than dry spots stack on the dry ones, never in the sea.
        const at = spots ?? glowSpot!;
        const s = at.dry ? c % at.dry : 0;
        out.positions[j * 2] = data.positions[i * 2] + at.x[s] * data.cellDeg;
        out.positions[j * 2 + 1] = data.positions[i * 2 + 1] + at.y[s] * data.cellDeg;
      } else {
        const jitter = kind === UnitKind.Glow ? 0 : 0.9;
        const centre = (c % 2) * 2;
        out.positions[j * 2] = data.positions[i * 2] + (centres[centre] * 0.65 + (rand() - 0.5) * 0.3) * data.cellDeg * jitter;
        out.positions[j * 2 + 1] = data.positions[i * 2 + 1] + (centres[centre + 1] * 0.65 + (rand() - 0.5) * 0.3) * data.cellDeg * jitter;
      }
      out.people[j] = c === count - 1 ? Math.max(0, data.people[i] - assigned) : data.people[i] * sizes[c] / sum;
      assigned += out.people[j];
      out.kind[j] = kind;
      out.mobility![j] = mobility[c];
      out.society![j] = societies[c];
      out.ids[j] = data.cellIds[i] * 32 + slots[kind] + c;
      out.counts[kind]++;
      j++;
    }
  }
  return out;
}
