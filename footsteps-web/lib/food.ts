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

export const foodEnabled = (search: string) => new URLSearchParams(search).get('food') === '1';

/** Ids of the crops around a place (its 5° cell) by a HYDE-era time, longest-established first (earliest era, then the table's order); empty before HYDE or with none.
 * The close-up fields (`?fields=1`) colour their plots by these. */
export function cropsAround(data: FoodData, lon: number, lat: number, time: number): string[] {
  if (time < HYDE_MIN || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return [];
  const west = Math.floor(((((lon + 180) % 360) + 360) % 360 - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  const cell = data.cells[`${south},${west}`];
  if (!cell) return [];
  let era = 0;
  while (era + 1 < data.eras.length && data.eras[era + 1] <= time) era++;
  return data.taxa
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === 'crop' && cell[t.id] && cell[t.id][0] <= era)
    .sort((a, b) => cell[a.t.id][0] - cell[b.t.id][0] || a.i - b.i)
    .map(({ t }) => t.id);
}

/** Possible availability, not calorie shares or evidence of farming at this spot. Domesticates are listed longest-established
 * first (earliest era in the cell, then the table's order), so maize leads in central Mexico after wheat and sheep arrive.
 * `game`: large prey modelled here then (lib/fauna.ts `gameAnimals`); where given, foragers' animal staples are these, not the biome's.
 * `foraging`: the people here forage (the way of life), so they get the wild staples even where farmers nearby had crops. */
export function foodHere(
  data: FoodData, lon: number, lat: number, time: number, habitat: HabitatCell | null, game?: string[] | null, foraging = false,
): FoodItem[] {
  if (habitat?.surface !== 'land' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return [];
  const west = Math.floor(((((lon + 180) % 360) + 360) % 360 - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  const cell = data.cells[`${south},${west}`];
  if (time >= HYDE_MIN && cell && !foraging) {
    let era = 0;
    while (era + 1 < data.eras.length && data.eras[era + 1] <= time) era++;
    const order = new Map(data.taxa.map((t, i) => [t.id, i]));
    const available = data.taxa
      .filter((t) => cell[t.id] && cell[t.id][0] <= era)
      .sort((a, b) => cell[a.id][0] - cell[b.id][0] || order.get(a.id)! - order.get(b.id)!);
    const crops = available.filter((t) => t.kind === 'crop');
    const animals = available.filter((t) => t.kind === 'animal');
    const selected = [...crops.slice(0, 2), ...animals.slice(0, 2), ...crops.slice(2), ...animals.slice(2)].slice(0, 4);
    if (selected.length) return selected.map((t) => ({ name: t.name, confidence: cell[t.id][1], checked: cell[t.id][2] }));
  }
  const biomeDiet = habitat.biome ? data.biomes[habitat.biome] : null;
  if (!biomeDiet) return [];
  const diet = game && game.length ? { ...biomeDiet, animals: game } : biomeDiet;
  const staples = diet.plant_weight === 'low' || diet.plant_weight === 'none'
    ? [...diet.animals.slice(0, 2), ...diet.plants, ...diet.animals.slice(2)]
    : [...diet.plants.slice(0, 2), ...diet.animals, ...diet.plants.slice(2)];
  return [...new Set(staples)].slice(0, 4).map((name) => ({ name, confidence: 'low', checked: false }));
}
