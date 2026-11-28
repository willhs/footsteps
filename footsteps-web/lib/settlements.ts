import type { GridData } from '@/components/footsteps/hooks/gridData';
import { readHabitat } from './habitat';
import { WayOfLife } from './waysOfLife';

/** The settlement model is the default Units view; `?settlements=0` turns it off (back to even groups at random spots).
 * Read once per page load by the page and the grid worker. */
export function settlementsFromParams(params: URLSearchParams): boolean {
  return params.get('settlements') !== '0';
}

export type SettlementComponent = {
  weight: number;
  size: number;
  moves: number | null;
  pattern: number | null;
  mode: 'mobile' | 'aggregation' | 'settled';
  society: string;
};
/** `km` (regional profiles only): how far the nearest of its analogs lives from the 5° cell's centre. */
export type SettlementProfile = { components: SettlementComponent[]; storage: null; km?: number };
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
/** How a farming region's groups sit on the land, from the EA030 settlement pattern of the societies it is drawn from
 * (D-PLACE; 5 dispersed homesteads, 6 hamlets, 7 villages/towns, 8 complex permanent). A modelled reading of ethnography,
 * recorded in the 1930s-ish; the geometry it implies is imagined (docs/ops/settlements.md). */
export type Layout = 'dispersed' | 'hamlet' | 'nucleated';
/** Codes 1-4 (nomadic to impermanent) and a missing code have no farmstead geometry, so they keep the plain ranked spots. */
export function layoutOfPattern(pattern: number | null): Layout {
  return pattern === 5 ? 'dispersed' : pattern === 6 ? 'hamlet' : 'nucleated';
}

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

/** Names the catalog (Reba et al. 2016) files under a later city: Cahokia's 1000 CE figure sits under "St. Louis", Tenochtitlan's
 * under "Mexico City". Before `until`, the place is labelled with the name it had then. */
const EARLIER_NAMES: Record<string, { until: number; name: string }[]> = {
  'St. Louis': [{ until: 1700, name: 'Cahokia' }],
  'Mexico City': [{ until: 1521, name: 'Tenochtitlan' }],
  Istanbul: [{ until: 330, name: 'Byzantium' }, { until: 1453, name: 'Constantinople' }],
};

/** A catalog city's name in a year: the earlier name where the catalog files it under a later one. */
export function cityNameAt(name: string, year: number): string {
  return EARLIER_NAMES[name]?.find((n) => year < n.until)?.name ?? name;
}

/** Whole-year ledger, before viewport slicing. Cities spend nearest cells first;
 * stable city ID order settles overlapping claims. Original grid stays untouched. */
export function allocateCities(data: GridData, catalog: HistoricalCity[], year: number) {
  const people = data.people.slice();
  const cities: AllocatedCity[] = [];
  const width = Math.round(360 / data.cellDeg);
  const height = Math.round(180 / data.cellDeg);
  // Cell id → index. Decoded grids list their cells in id order, so a binary search does without a Map of every cell (a few hundred
  // thousand entries a year, built even in years whose cities claim a handful of cells); any other order falls back to the Map.
  const ids = data.cellIds;
  let sorted = true;
  for (let i = 1; i < data.length && sorted; i++) sorted = ids[i] > ids[i - 1];
  const map = sorted ? null : new Map<number, number>();
  if (map) ids.forEach((id, i) => map.set(id, i));
  const indexOf = (id: number): number | undefined => {
    if (map) return map.get(id);
    let lo = 0;
    let hi = data.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = ids[mid];
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  };
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
        const i = indexOf(row * width + ((col % width) + width) % width);
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
    cities.push({ id: city.id, name: cityNameAt(city.name, year), position: [city.lon, city.lat], requested, people: allocated });
  }
  return { residual: { ...data, people }, cities };
}

/** Holocene foragers whose region's own forager analogs all live farther than this take a climate-matched profile instead.
 * The regional mixes are ranked by distance and way of life only, so where no foragers were recorded nearby they reach far:
 * Mesolithic Britain and France were drawn from Greenland Inuit (snow houses) and 19th-century Latvian fishing villages, the
 * Natufian Levant and the Green Sahara from Congo forest Mbuti, Jōmon Japan from St Lawrence Island Yupik. The climate mix
 * (Binford's hunter-gatherers matched on the year's temperature and rainfall, as before 10,000 BCE) is the better guess there.
 * Near analogs keep the region (Arctic Inuit, Australia, the Kalahari, the Northwest Coast, California). A modelling choice. */
export const FAR_FORAGER_KM = 1000;

function climateProfile(catalog: SettlementCatalog, lon: number, lat: number, habitat: Uint8ClampedArray): SettlementProfile {
  const cell = readHabitat(habitat, lon, lat);
  // Explicit unknown profile; do not invent a climate match where data is absent.
  if (cell.tempC === null || cell.precipMm === null) return { components: [], storage: null };
  const temp = Math.max(-20, Math.min(35, Math.round(cell.tempC / 5) * 5));
  const rain = Math.max(0, Math.min(3000, Math.round(cell.precipMm / 250) * 250));
  return catalog.climate[`${temp},${rain}`];
}

/** Whether a Holocene forager cell takes the climate mix (its region's forager analogs are far away). Needs no habitat. */
export function foragerUsesClimate(catalog: SettlementCatalog, lon: number, lat: number, way: number, year: number): boolean {
  if (year < -10000) return true;
  if (way !== WayOfLife.Forager) return false;
  return (regionalProfile(catalog, lon, lat, way).km ?? 0) > FAR_FORAGER_KM;
}

function regionalProfile(catalog: SettlementCatalog, lon: number, lat: number, way: number): SettlementProfile {
  const row = Math.min(35, Math.max(0, Math.floor((90 - lat) / 5)));
  const col = Math.min(71, Math.max(0, Math.floor((lon + 180) / 5)));
  return catalog.regions[`${row},${col}`][way];
}

export function profileAt(
  catalog: SettlementCatalog, lon: number, lat: number, way: number,
  year: number, habitat: Uint8ClampedArray | null,
): SettlementProfile {
  if (year < -10000) {
    if (!habitat) throw new Error('Settlement model requires prehistory habitat');
    return climateProfile(catalog, lon, lat, habitat);
  }
  // Without the year's habitat (rank-size, or a failed fetch) a far forager keeps its regional mix.
  if (habitat && foragerUsesClimate(catalog, lon, lat, way, year)) {
    const climate = climateProfile(catalog, lon, lat, habitat);
    if (climate.components.length) return climate;
  }
  return regionalProfile(catalog, lon, lat, way);
}

let catalogRequest: Promise<SettlementCatalog> | undefined;
/** The catalog (`/settlements.json`, about 4 MB), fetched once per page and thread. A failed fetch is retried by the next caller. */
export function loadSettlementCatalog(): Promise<SettlementCatalog> {
  if (!catalogRequest) catalogRequest = fetch('/settlements.json').then(async (response) => {
    if (!response.ok) throw new Error(`Settlements: HTTP ${response.status}`);
    const catalog: SettlementCatalog = await response.json();
    if (catalog.version !== 1) throw new Error('Unsupported settlement catalog');
    return catalog;
  }).catch((error) => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}
