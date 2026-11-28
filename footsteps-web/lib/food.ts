import type { HabitatCell } from './habitat';
import { HYDE_MIN } from './time';

export type FoodItem = { name: string; confidence: 'low' | 'medium' | 'high'; checked: boolean };
export type FoodData = {
  version: number;
  eras: number[];
  taxa: { id: string; name: string; kind: 'crop' | 'animal' }[];
  cells: Record<string, Record<string, [number, FoodItem['confidence'], boolean]>>;
  biomes: Record<string, { plants: string[]; animals: string[]; plant_weight: string }>;
};

export const foodEnabled = (search: string) => new URLSearchParams(search).get('food') !== '0';

/** Crops that went with a staple rather than being one: Mesoamerica's squash and beans grew among the maize (milpa), pulses
 * beside the cereals. They follow the staples in `cropsAround`'s order. */
const SIDE_CROPS = new Set(['squash', 'common_bean', 'ne_pulses', 'soybean', 'sugarcane']);

/** Grazing and draught animals: where none had arrived, a farm has no pasture (the pre-Columbian Americas outside the Andes, Oceania). */
const HERD_ANIMALS = new Set(['sheep', 'goat', 'cattle', 'zebu', 'horse', 'donkey', 'dromedary', 'bactrian', 'llama', 'water_buffalo']);

function cellAt(data: FoodData, lon: number, lat: number, time: number) {
  if (time < HYDE_MIN || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  const west = Math.floor(((((lon + 180) % 360) + 360) % 360 - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  const cell = data.cells[`${south},${west}`];
  if (!cell) return null;
  let era = 0;
  while (era + 1 < data.eras.length && data.eras[era + 1] <= time) era++;
  return { cell, era };
}

/** Ids of the crops around a place (its 5° cell) by a HYDE-era time, staples first; empty before HYDE or with none. Staples are the
 * crops grown there longest (earliest era in the cell), then side crops; ties keep the table's order. In table order Old World crops
 * led everywhere they had reached, so central Mexico at 1600 grew wheat and barley before maize. The close-up fields (`?fields=1`)
 * colour their plots by these, favouring the first. */
export function cropsAround(data: FoodData, lon: number, lat: number, time: number): string[] {
  const at = cellAt(data, lon, lat, time);
  if (!at) return [];
  const { cell, era } = at;
  return data.taxa
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === 'crop' && cell[t.id] && cell[t.id][0] <= era)
    .sort((a, b) => Number(SIDE_CROPS.has(a.t.id)) - Number(SIDE_CROPS.has(b.t.id)) || cell[a.t.id][0] - cell[b.t.id][0] || a.i - b.i)
    .map(({ t }) => t.id);
}

/** Whether any grazing or draught animal had reached a place (its 5° cell) by a HYDE-era time. */
export function herdsAround(data: FoodData, lon: number, lat: number, time: number): boolean {
  const at = cellAt(data, lon, lat, time);
  return !!at && data.taxa.some((t) => t.kind === 'animal' && HERD_ANIMALS.has(t.id) && at.cell[t.id] && at.cell[t.id][0] <= at.era);
}

/** Possible availability, not calorie shares or evidence of farming at this spot. */
export function foodHere(data: FoodData, lon: number, lat: number, time: number, habitat: HabitatCell | null): FoodItem[] {
  if (habitat?.surface !== 'land' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return [];
  const west = Math.floor(((((lon + 180) % 360) + 360) % 360 - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  const cell = data.cells[`${south},${west}`];
  if (time >= HYDE_MIN && cell) {
    let era = 0;
    while (era + 1 < data.eras.length && data.eras[era + 1] <= time) era++;
    const available = data.taxa.filter((t) => cell[t.id] && cell[t.id][0] <= era);
    const crops = available.filter((t) => t.kind === 'crop');
    const animals = available.filter((t) => t.kind === 'animal');
    const selected = [...crops.slice(0, 2), ...animals.slice(0, 2), ...crops.slice(2), ...animals.slice(2)].slice(0, 4);
    if (selected.length) return selected.map((t) => ({ name: t.name, confidence: cell[t.id][1], checked: cell[t.id][2] }));
  }
  const diet = habitat.biome ? data.biomes[habitat.biome] : null;
  if (!diet) return [];
  const staples = diet.plant_weight === 'low' || diet.plant_weight === 'none'
    ? [...diet.animals.slice(0, 2), ...diet.plants, ...diet.animals.slice(2)]
    : [...diet.plants.slice(0, 2), ...diet.animals, ...diet.plants.slice(2)];
  return [...new Set(staples)].slice(0, 4).map((name) => ({ name, confidence: 'low', checked: false }));
}
