// Habitat and climate per 0.5° cell, read from the images footstep-generator/habitat_lookup.py
// writes (docs/ops/habitat-lookup.md). Pure: decoding to RGBA lives in habitatImages.ts.
import meta from '../public/habitat_meta.json';

export type Surface = 'sea' | 'land' | 'ice';

/** What the model says a 0.5° cell was like at a Krapp step. Null = the source has no value. */
export type HabitatCell = {
  surface: Surface;
  biome: string | null;
  tempC: number | null;
  precipMm: number | null;
};

/** HYDE land use averaged over a 0.5° cell, as shares of its area (0..1). */
export type LandUse = { crop: number; grazing: number };

const BP_ZERO = 1950;
const BYTES_PER_PIXEL = 4; // decoded RGBA
/** Bump when the images are regenerated: Cloudflare caches /habitat for a day. */
const HABITAT_VERSION = 1;

/** The Krapp step (thousands of years BP) nearest a calendar year; same rule as habitat_lookup.year_to_ka. */
export function habitatStep(year: number): number {
  const bp = BP_ZERO - year;
  return Math.min(meta.maxKa, Math.max(0, Math.floor(bp / meta.stepYears + 0.5)));
}

export const habitatUrl = (ka: number) => `/habitat/bp_${ka}.webp?v=${HABITAT_VERSION}`;
export const landUseUrl = (year: number) => `/habitat/use_${year}.webp?v=${HABITAT_VERSION}`;

/** Byte offset of the cell holding lon/lat in a decoded RGBA image (north up, column 0 = 180W). */
export function cellOffset(lon: number, lat: number): number {
  const cellDeg = 360 / meta.width;
  const col = Math.floor((((lon + 180) % 360) + 360) % 360 / cellDeg);
  const row = Math.min(meta.height - 1, Math.max(0, Math.floor((90 - lat) / cellDeg)));
  return (row * meta.width + col) * BYTES_PER_PIXEL;
}

export const decodeTemp = (b: number) => meta.temperature.min + (b - 1) * meta.temperature.step;
export const decodePrecip = (b: number) =>
  Math.expm1(((b - 1) / 254) * Math.log1p(meta.precipitation.max));

const BIOMES: Record<string, string> = meta.biomes;

export function readHabitat(rgba: Uint8ClampedArray, lon: number, lat: number): HabitatCell {
  const o = cellOffset(lon, lat);
  const biome = rgba[o];
  const surface: Surface = biome === 0 ? 'sea' : biome === meta.iceBiome ? 'ice' : 'land';
  return {
    surface,
    biome: surface === 'land' ? (BIOMES[String(biome)] ?? null) : null,
    tempC: rgba[o + 1] ? decodeTemp(rgba[o + 1]) : null,
    precipMm: rgba[o + 2] ? decodePrecip(rgba[o + 2]) : null,
  };
}

export function readLandUse(rgba: Uint8ClampedArray, lon: number, lat: number): LandUse {
  const o = cellOffset(lon, lat);
  return { crop: rgba[o] / 255, grazing: rgba[o + 1] / 255 };
}

/** Change against today's field; null when either side has no climate. Rain change is a
 * percentage only where today is wet enough for one to mean something. */
export function climateChange(
  then: HabitatCell,
  now: HabitatCell | null,
): { tempC: number | null; precipPct: number | null } | null {
  if (!now) return null;
  const tempC = then.tempC !== null && now.tempC !== null ? then.tempC - now.tempC : null;
  const precipPct =
    then.precipMm !== null && now.precipMm !== null && now.precipMm >= 20
      ? (then.precipMm / now.precipMm - 1) * 100
      : null;
  return tempC === null && precipPct === null ? null : { tempC, precipPct };
}

/** A display class from HYDE land use (shares of a 0.5° cell), not evidence of what any one
 * group did. Thresholds are coarse: a 5% share of a 55 km cell is already ~150 km². */
export type LifeKind = 'farming' | 'herding' | 'mostly-foraging' | 'foraging';

export function lifeKind({ crop, grazing }: LandUse): LifeKind {
  if (crop >= 0.05) return 'farming';
  if (grazing >= 0.1) return 'herding';
  if (crop + 0.35 * grazing >= 0.01) return 'mostly-foraging';
  return 'foraging';
}

const LIFE_LABEL: Record<LifeKind, string> = {
  farming: 'Farming',
  herding: 'Herding and grazing',
  'mostly-foraging': 'Foraging, with a little farming or herding',
  foraging: 'Foraging',
};

export const wayOfLife = (use: LandUse): string => LIFE_LABEL[lifeKind(use)];
