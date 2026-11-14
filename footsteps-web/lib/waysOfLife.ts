// How people lived: the one place that decides a populated cell's way of life
// and what each way looks like. Units (layers/units.ts), the far-out firelight
// (layers/FireLayer.ts) and the legend all read this, so a place keeps its
// colour from the whole-world view down to a single camp.
//
// A class is a display reading of HYDE land use, not evidence of what any one
// group did. Land use is HYDE's, per 5′ cell (~10 km), encoded by
// footstep-generator/grid_image.py (docs/ops/grid-images.md): crop and grazing
// are shares of the cell, 0–1.

export const WayOfLife = { Forager: 0, Farmer: 1, Herder: 2, Urban: 3 } as const;
export type WayOfLifeValue = (typeof WayOfLife)[keyof typeof WayOfLife];

/** Cropland share of a cell at which its people count as farmers (~1.7 km² of ~85). */
export const FARMER_CROP_SHARE = 0.02;
/** Grazing share at which people on uncropped land count as herders. */
export const HERDER_GRAZING_SHARE = 0.1;
/** Above this many people in one ~10 km cell nobody lives by foraging alone
 * (~7 per km²; foragers sit well under 1): such a cell is settled, so Farmer,
 * even where HYDE records little cropland. */
export const SETTLED_MIN_CELL = 600;
/** A cell this full is a town or city: drawn as one glow, not as groups. */
export const URBAN_MIN_CELL = 40_000;

/** Class a populated cell. Order matters: a city is a city whatever grows round
 * it, crops outrank pasture (HYDE grazes the farmland too), and a dense cell
 * with no herding is settled rather than foraging. `crop` and `grazing` are
 * shares of the cell, 0–1. */
export function classifyCell(people: number, crop: number, grazing: number): WayOfLifeValue {
  if (people >= URBAN_MIN_CELL) return WayOfLife.Urban;
  if (crop >= FARMER_CROP_SHARE) return WayOfLife.Farmer;
  if (grazing >= HERDER_GRAZING_SHARE) return WayOfLife.Herder;
  return people >= SETTLED_MIN_CELL ? WayOfLife.Farmer : WayOfLife.Forager;
}

type Look = {
  /** What the legend and the details panel call these people. */
  name: string;
  /** How the group is drawn at street level. */
  mark: string;
  rgb: readonly [number, number, number];
};

/** One warm firelight family on purpose: way of life is told mostly by the kind of
 * mark (band, village, camp, city glow) and the details panel, not loud hues.
 * unitMorphVertex.ts reads a mark's kind from its colour, so the palette must
 * keep: Urban red < 0.5 (city), Forager and Herder green < 0.8 (they roam),
 * Farmer green ≥ 0.8 (settled). waysOfLife.test.ts pins this. */
export const LOOKS: Record<WayOfLifeValue, Look> = {
  [WayOfLife.Forager]: { name: 'Foragers', mark: 'band', rgb: [255, 190, 110] },
  [WayOfLife.Farmer]: { name: 'Farmers', mark: 'village', rgb: [255, 225, 160] },
  [WayOfLife.Herder]: { name: 'Herders', mark: 'camp', rgb: [255, 176, 120] },
  [WayOfLife.Urban]: { name: 'Towns and cities', mark: 'glow', rgb: [60, 230, 255] },
};

export const cssRgb = (way: WayOfLifeValue) => `rgb(${LOOKS[way].rgb.join(',')})`;
