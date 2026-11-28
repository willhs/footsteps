// When towns began, by region. HYDE spreads each modern country's estimated people over its land at every date, so it crowds
// city-like numbers (URBAN_MIN_CELL, ~470 a km²) into cells long before any city stood there: central Mexico glows like a city
// at 3000 BCE, in the Late Archaic (research 0015). A cell that full is drawn as a city glow only from the region's first towns
// on; before them it is a dense farming village (lib/waysOfLife.ts). Dates are the first sizeable towns, rounded, from the
// standard syntheses (e.g. Smith 2019, Urban Life in the Distant Past; Fletcher 1995, The Limits of Settlement Growth); they are
// a floor for the glow, not a claim that every cell was a city after them.
//
// Boxes are [west, east, south, north]; the first box holding a point decides, so narrower early regions come first.

export type FirstCities = { name: string; box: readonly [number, number, number, number]; year: number; source: string };

export const FIRST_CITIES: readonly FirstCities[] = [
  { name: 'Mesopotamia, the Levant and Iran', box: [25, 62, 24, 42], year: -3500, source: 'Uruk and the Uruk expansion, ~3500 BCE' },
  { name: 'Egypt and Nubia', box: [24, 36, 15, 32], year: -3100, source: 'Early Dynastic Egypt (Memphis, Hierakonpolis), ~3100 BCE; Kerma by ~2500 BCE' },
  { name: 'The Indus', box: [60, 78, 20, 36], year: -2600, source: 'Mature Harappan cities (Mohenjo-daro, Harappa), ~2600 BCE' },
  { name: 'Central Asia', box: [50, 90, 35, 50], year: -2200, source: 'Bactria-Margiana towns (Gonur), ~2200 BCE' },
  { name: 'Anatolia, the Aegean and the Balkans', box: [19, 45, 34, 43], year: -2500, source: 'Early Bronze Age towns (Troy II, Kültepe) ~2500 BCE; Minoan palaces ~2000 BCE' },
  { name: 'China', box: [100, 125, 20, 42], year: -2000, source: 'Taosi and Erlitou, ~2300-1900 BCE' },
  { name: 'The Andes', box: [-82, -65, -20, 0], year: -2600, source: 'Caral-Supe, ~2600 BCE' },
  { name: 'Mesoamerica', box: [-106, -86, 13, 23], year: -1200, source: 'Olmec San Lorenzo ~1200 BCE; Teotihuacan from ~100 BCE' },
  { name: 'South Arabia', box: [42, 56, 12, 24], year: -800, source: 'Saba (Marib), ~800 BCE' },
  { name: 'South Asia beyond the Indus', box: [68, 98, 5, 32], year: -600, source: 'The Ganges second urbanisation (the mahajanapadas), ~600 BCE' },
  { name: 'The west Mediterranean', box: [-10, 19, 30, 46], year: -800, source: 'Phoenician, Greek and Etruscan towns, ~800-600 BCE' },
  { name: 'Europe north of the Mediterranean', box: [-11, 45, 43, 72], year: -100, source: 'Late Iron Age oppida and Roman towns, ~150-50 BCE' },
  { name: 'Ethiopia and the Horn', box: [32, 52, 3, 18], year: 100, source: 'Aksum, ~100 CE' },
  { name: 'Southeast Asia', box: [92, 141, -11, 28], year: 100, source: 'Funan (Oc Eo) and the Pyu towns, ~100 CE' },
  { name: 'West Africa', box: [-18, 16, 4, 20], year: 300, source: 'Jenne-jeno, ~250-400 CE' },
  { name: 'Korea and Japan', box: [124, 146, 30, 46], year: 600, source: 'Three Kingdoms capitals (Gyeongju) and Asuka-Nara Japan, ~600-710 CE' },
  { name: 'East and southern Africa', box: [10, 52, -35, 3], year: 1000, source: 'Swahili coast towns ~900-1000 CE; Mapungubwe and Great Zimbabwe ~1200 CE' },
  { name: 'North America', box: [-130, -60, 24, 60], year: 1050, source: 'Cahokia, ~1050 CE' },
];

/** Anywhere no box holds: HYDE's city-like numbers there before 1500 are allocation, not towns. */
export const FIRST_CITIES_ELSEWHERE = 1500;

/** The first calendar year a cell at (lon, lat) may be drawn as a city. */
export function firstCityYear(lon: number, lat: number): number {
  for (const r of FIRST_CITIES) {
    const [w, e, s, n] = r.box;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return r.year;
  }
  return FIRST_CITIES_ELSEWHERE;
}

export function citiesBy(lon: number, lat: number, year: number): boolean {
  return year >= firstCityYear(lon, lat);
}
