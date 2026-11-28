// Places and times where the climate and biome models behind the hover card are known to be wrong, with what the record says
// instead. The habitat lookup reads Beyer et al. 2020 (HadCM3) climate and Krapp et al. 2021 biomes; the card keeps the model's
// row and adds one line under it, so the model is not hidden, only corrected in words.
//   Green Sahara   the Sahara was grassland, savanna and lakes ~11,500-5,500 years ago (lib/greenSahara.ts)
//   Prairie        the Great Plains were grassland from the mid-Holocene to the plough; the biome model puts forest at 40°N 95°W
//   Mammoth steppe at the glacial maximum the north was cold, dry grassland; the biome model puts taiga at the ice edge
//   Sahel          savanna stayed on the Sahel after the Sahara dried, to ~4.5 ka (correctedBiome only: the close-up's trees)
// `correctedBiome` gives the close-up 3D ground (its trees and ground cover) the same corrections as Krapp biome codes.
import { inGreenSahara, GREEN_SAHARA_NOTE, GREEN_SAHARA_FROM, GREEN_SAHARA_TO } from './greenSahara';
import type { Ground } from './close3d';

export type BiomeNote = { text: string; detail: string };

/** The biome model's tree-covered classes (Krapp et al. 2021 ids 1-11 and the open woodlands 15-17), by name. */
const FOREST = /forest|taiga|woodland/i;

const PRAIRIE = { west: -104, east: -94, south: 33, north: 49, from: -6000, to: 1880 } as const;
export const PRAIRIE_NOTE: BiomeNote = {
  text: 'Grassland, not forest: the prairie',
  detail: 'tallgrass and mixed-grass prairie from the mid-Holocene until the plough (1870s–1900s); the biome model puts trees here (Williams, Shuman & Bartlein 2009)',
};

/** Northern Eurasia and Beringia south of the ice. Years: the glacial maximum and the late glacial, before the forests returned. */
const STEPPE_BOXES = [
  { west: -10, east: 180, south: 45, north: 75 },
  { west: -180, east: -130, south: 55, north: 72 },
] as const;
const STEPPE_FROM = -28000;
const STEPPE_TO = -13000;
export const MAMMOTH_STEPPE_NOTE: BiomeNote = {
  text: 'Steppe-tundra, not forest: the mammoth steppe',
  detail: 'cold, dry grassland with mammoth, horse, bison and reindeer across the north at the glacial maximum, trees only in sheltered valleys; the biome model puts forest here (Guthrie 1990; Zimov et al. 2012)',
};

/** What the card should add under the model's biome at a point and year, or null where no known bias applies. */
export function biomeNoteAt(lon: number, lat: number, time: number, biome: string | null): BiomeNote | null {
  if (inGreenSahara(lon, lat, time)) return GREEN_SAHARA_NOTE;
  if (!biome || !FOREST.test(biome)) return null;
  const p = PRAIRIE;
  if (time >= p.from && time < p.to && lon >= p.west && lon <= p.east && lat >= p.south && lat <= p.north) return PRAIRIE_NOTE;
  if (time >= STEPPE_FROM && time < STEPPE_TO && STEPPE_BOXES.some((b) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north))
    return MAMMOTH_STEPPE_NOTE;
  return null;
}

// Krapp et al. 2021 biome codes (public/habitat_meta.json).
const B = { tropicalSavanna: 12, tropicalXericShrub: 13, temperateXericShrub: 14, tropicalGrassland: 19, temperateGrassland: 20, desert: 21, steppeTundra: 22, barren: 27 } as const;
const FOREST_CODES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17]);
const DRY_CODES = new Set<number>([B.tropicalXericShrub, B.temperateXericShrub, B.desert, B.barren]);
/** The Sahel band: the African Humid Period ended here later than in the Sahara, at ~4.5 ka (Shanahan et al. 2015, Nat Geosci 8:140,
 * a time-transgressive end, later to the south). */
const SAHEL = { west: -17, east: 40, south: 10, north: 18, to: -2500 } as const;

/** The biome code the close-up should draw: the model's, except where a known bias above applies. Codes as Krapp's (0 sea, 28 ice). */
export function correctedBiome(lon: number, lat: number, time: number, biome: number): number {
  if (biome === 0 || biome === 28) return biome;
  if (DRY_CODES.has(biome) || biome === B.tropicalGrassland) {
    const s = SAHEL;
    const sahel = time >= GREEN_SAHARA_FROM && time < s.to && lon >= s.west && lon <= s.east && lat >= s.south && lat <= s.north;
    if (sahel) return B.tropicalSavanna;
    if (inGreenSahara(lon, lat, time) && DRY_CODES.has(biome)) return lat < 20 ? B.tropicalSavanna : B.tropicalGrassland;
    return biome;
  }
  if (!FOREST_CODES.has(biome)) return biome;
  const p = PRAIRIE;
  if (time >= p.from && time < p.to && lon >= p.west && lon <= p.east && lat >= p.south && lat <= p.north) return B.temperateGrassland;
  if (time >= STEPPE_FROM && time < STEPPE_TO && STEPPE_BOXES.some((b) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north))
    return B.steppeTundra;
  return biome;
}

/** Which corrections hold in a year: two years with the same key get the same `correctedBiome` everywhere, so the close-up's ground
 * is rebuilt only when this changes, not as the year scrubs. */
export function biomeCorrectionKey(time: number): string {
  const sahara = time >= GREEN_SAHARA_FROM && time < GREEN_SAHARA_TO;
  const sahel = time >= GREEN_SAHARA_FROM && time < SAHEL.to;
  const prairie = time >= PRAIRIE.from && time < PRAIRIE.to;
  const steppe = time >= STEPPE_FROM && time < STEPPE_TO;
  return [sahara, sahel, prairie, steppe].map((b) => (b ? 1 : 0)).join('');
}

/** The close-up ground with `correctedBiome` applied, as `withIce` applies the ice. */
export function withBiomeCorrections(ground: Ground, time: number): Ground {
  const out: Ground = { ...ground, biomeAt: (lon, lat) => correctedBiome(lon, lat, time, ground.biomeAt(lon, lat)) };
  if (ground.withDetail) out.withDetail = (tile) => withBiomeCorrections(ground.withDetail!(tile), time);
  return out;
}
