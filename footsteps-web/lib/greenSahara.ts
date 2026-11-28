// The Green Sahara: from ~11,500 to ~5,500 years ago the Sahara held grassland, savanna, lakes and rivers (the African Humid
// Period; deMenocal & Tierney 2016, Nature Education Knowledge 7(12):12; Tierney et al. 2017, Sci Adv 3:e1601503, leaf-wax
// rainfall ~250-1,500 mm a year more than today). The climate model behind the habitat lookup and the terrain (Beyer et al.
// 2020, HadCM3; Krapp et al. 2021 biomes) is known to under-state it, so the hover card says desert and a few tens of mm of
// rain. The terrain images paint an overlay for it (footstep-generator/terrain_image.py `green_sahara`; same years and
// reach); the habitat lookup has none, so the card says the model is too dry here.

const BOX = { west: -17, east: 35, south: 15, north: 31 } as const;
/** Calendar years (negative = BCE): the middle of terrain_image.py's ease-in and ease-out (`sahara_weight`). */
export const GREEN_SAHARA_FROM = -9000;
export const GREEN_SAHARA_TO = -3500;

export function inGreenSahara(lon: number, lat: number, time: number): boolean {
  return time >= GREEN_SAHARA_FROM && time < GREEN_SAHARA_TO && lon >= BOX.west && lon <= BOX.east && lat >= BOX.south && lat <= BOX.north;
}

export const GREEN_SAHARA_NOTE = {
  text: 'Wetter than shown: the Green Sahara',
  detail: 'grassland, savanna and lakes ~11,500–5,500 years ago; the climate model here is too dry (Tierney et al. 2017)',
};
