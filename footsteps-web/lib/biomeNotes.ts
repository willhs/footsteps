// Places and times where the climate and biome models behind the hover card are known to be wrong, with what the record says
// instead. The habitat lookup reads Beyer et al. 2020 (HadCM3) climate and Krapp et al. 2021 biomes; the card keeps the model's
// row and adds one line under it, so the model is not hidden, only corrected in words.
//   Green Sahara   the Sahara was grassland, savanna and lakes ~11,500-5,500 years ago (lib/greenSahara.ts)
//   Prairie        the Great Plains were grassland from the mid-Holocene to the plough; the biome model puts forest at 40°N 95°W
//   Mammoth steppe at the glacial maximum the north was cold, dry grassland; the biome model puts taiga at the ice edge
import { inGreenSahara, GREEN_SAHARA_NOTE } from './greenSahara';

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
