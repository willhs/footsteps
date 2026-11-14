import type { GridData } from '@/components/footsteps/hooks/gridData';
import { readHabitat } from './habitat';

export type SettlementComponent = {
  weight: number;
  size: number;
  moves: number | null;
  pattern: number | null;
  mode: 'mobile' | 'aggregation' | 'settled';
  society: string;
};
export type SettlementProfile = { components: SettlementComponent[]; storage: null };
export type HistoricalCity = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  observations: [number, number][];
  source: string;
};
export type SettlementCatalog = {
  version: 1;
  cities: HistoricalCity[];
  regions: Record<string, SettlementProfile[]>;
  climate: Record<string, SettlementProfile>;
};
export type AllocatedCity = {
  id: string;
  name: string;
  position: [number, number];
  requested: number;
  people: number;
};

/** Same endpoint interpolation as the residual Units morph. */
export function blendCities(from: AllocatedCity[], to: AllocatedCity[], progress: number): AllocatedCity[] {
  const previous = new Map(from.map((city) => [city.id, city]));
  const next = new Map(to.map((city) => [city.id, city]));
  return [...new Set([...previous.keys(), ...next.keys()])].map((id) => {
    const a = previous.get(id);
    const b = next.get(id);
    return { ...(a ?? b)!,
      people: (a?.people ?? 0) * (1 - progress) + (b?.people ?? 0) * progress,
      requested: (a?.requested ?? 0) * (1 - progress) + (b?.requested ?? 0) * progress,
    };
  });
}

/** No extrapolation and no interpolation across a gap over 500 years. */
export function cityPopulation(city: HistoricalCity, year: number): number {
  const obs = city.observations;
  for (let i = 0; i < obs.length; i++) {
    const [date, count] = obs[i];
    if (date === year) return count;
    if (date > year) {
      if (!i) return 0;
      const [before, previous] = obs[i - 1];
      return date - before <= 500
        ? previous + (count - previous) * (year - before) / (date - before)
        : 0;
    }
  }
  return 0;
}

function distanceKm(lon: number, lat: number, x: number, y: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((y - lat) * rad / 2) ** 2
    + Math.cos(lat * rad) * Math.cos(y * rad) * Math.sin((x - lon) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Whole-year ledger, before viewport slicing. Cities spend nearest cells first;
 * stable city ID order settles overlapping claims. Original grid stays untouched. */
export function allocateCities(data: GridData, catalog: HistoricalCity[], year: number) {
  const people = data.people.slice();
  const cities: AllocatedCity[] = [];
  const width = Math.round(360 / data.cellDeg);
  const height = Math.round(180 / data.cellDeg);
  const index = new Map<number, number>();
  data.cellIds.forEach((id, i) => index.set(id, i));
  for (const city of [...catalog].sort((a, b) => a.id.localeCompare(b.id))) {
    const requested = cityPopulation(city, year);
    if (!(requested > 0)) continue;
    const nearby: { i: number; distance: number }[] = [];
    const latSpan = 100 / 110;
    const lonSpan = Math.min(180, latSpan / Math.max(0.001, Math.cos(city.lat * Math.PI / 180)));
    const minRow = Math.max(0, Math.floor((90 - city.lat - latSpan) / data.cellDeg));
    const maxRow = Math.min(height - 1, Math.floor((90 - city.lat + latSpan) / data.cellDeg));
    const minCol = Math.floor((city.lon - lonSpan + 180) / data.cellDeg);
    const maxCol = Math.min(minCol + width - 1, Math.floor((city.lon + lonSpan + 180) / data.cellDeg));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const i = index.get(row * width + ((col % width) + width) % width);
        if (i === undefined || people[i] <= 0) continue;
        const distance = distanceKm(city.lon, city.lat, data.positions[i * 2], data.positions[i * 2 + 1]);
        if (distance <= 100) nearby.push({ i, distance });
      }
    }
    nearby.sort((a, b) => a.distance - b.distance || a.i - b.i);
    let allocated = 0;
    for (const { i } of nearby) {
      const before = people[i];
      people[i] = Math.max(0, before - (requested - allocated));
      // Count the actual Float32 debit, not an unrounded desired amount.
      allocated += before - people[i];
      if (allocated >= requested) break;
    }
    cities.push({ id: city.id, name: city.name, position: [city.lon, city.lat], requested, people: allocated });
  }
  return { residual: { ...data, people }, cities };
}

export function profileAt(
  catalog: SettlementCatalog, lon: number, lat: number, way: number,
  year: number, habitat: Uint8ClampedArray | null,
): SettlementProfile {
  if (year < -10000) {
    if (!habitat) throw new Error('Settlement model requires prehistory habitat');
    const cell = readHabitat(habitat, lon, lat);
    // Explicit unknown profile; do not invent a climate match where data is absent.
    if (cell.tempC === null || cell.precipMm === null) return { components: [], storage: null };
    const temp = Math.max(-20, Math.min(35, Math.round(cell.tempC / 5) * 5));
    const rain = Math.max(0, Math.min(3000, Math.round(cell.precipMm / 250) * 250));
    return catalog.climate[`${temp},${rain}`];
  }
  const row = Math.min(35, Math.max(0, Math.floor((90 - lat) / 5)));
  const col = Math.min(71, Math.max(0, Math.floor((lon + 180) / 5)));
  return catalog.regions[`${row},${col}`][way];
}
