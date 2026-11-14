import type { GridData } from '../hooks/gridData';
import { UnitKind, KIND_OF_WAY, type Units, type UnitKindValue } from './units';
import { WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import { profileAt, type SettlementCatalog } from '@/lib/settlements';

const slots = [0, 20, 24, 25];
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
 * Fixed positions and existing ID slots preserve the year morph's contract. */
export function buildSettlementUnits(
  data: GridData, catalog: SettlementCatalog, year: number, habitat: Uint8ClampedArray | null,
): Units {
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
    total += per[i];
  }
  const out: Units = {
    length: total, positions: new Float32Array(total * 2), people: new Float32Array(total),
    kind: new Uint8Array(total), ids: new Uint32Array(total), counts: [0, 0, 0, 0],
    mobility: new Float32Array(total),
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
    const rand = random(data.cellIds[i] * 2246822519 + 7);
    const centres = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const choice = random(data.cellIds[i] * 2654435761);
    for (let c = 0; c < count; c++) {
      let target = choice() * weight;
      const component = components.find((item) => (target -= item.weight) <= 0);
      // Truncated Pareto tail; normalisation below preserves every cell's budget.
      sizes.push((component?.size ?? 1) * Math.min(8, (1 - choice()) ** -0.8));
      mobility.push(!component || component.mode === 'settled' ? 0 : component.mode === 'aggregation' ? 0.1
        : component?.moves !== null && component?.moves !== undefined ? Math.min(1, component.moves / 12) : 0.5);
    }
    const sum = sizes.reduce((a, b) => a + b, 0);
    let assigned = 0;
    for (let c = 0; c < count; c++) {
      const jitter = kind === UnitKind.Glow ? 0 : 0.9;
      const centre = (c % 2) * 2;
      out.positions[j * 2] = data.positions[i * 2] + (centres[centre] * 0.65 + (rand() - 0.5) * 0.3) * data.cellDeg * jitter;
      out.positions[j * 2 + 1] = data.positions[i * 2 + 1] + (centres[centre + 1] * 0.65 + (rand() - 0.5) * 0.3) * data.cellDeg * jitter;
      out.people[j] = c === count - 1 ? Math.max(0, data.people[i] - assigned) : data.people[i] * sizes[c] / sum;
      assigned += out.people[j];
      out.kind[j] = kind;
      out.mobility![j] = mobility[c];
      out.ids[j] = data.cellIds[i] * 32 + slots[kind] + c;
      out.counts[kind]++;
      j++;
    }
  }
  return out;
}
