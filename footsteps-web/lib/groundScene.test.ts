import meta from '../public/habitat_meta.json';
import { GLACIAL_END, SCENE_IDS, eraFor, groundImageUrl, groundView, landscapeOf, sceneFor } from './groundScene';
import { lifeKind, wayOfLife, type HabitatCell } from './habitat';
import { settledLife } from './hoverCard';

const land = (biome: string, tempC: number | null = 5): HabitatCell => ({ surface: 'land', biome, tempC, precipMm: 500 });
const sea: HabitatCell = { surface: 'sea', biome: null, tempC: null, precipMm: null };
const ice: HabitatCell = { surface: 'ice', biome: null, tempC: -20, precipMm: 100 };

test('every land biome of the habitat lookup has a landscape', () => {
  const names = Object.entries(meta.biomes)
    .filter(([id]) => Number(id) !== meta.iceBiome)
    .map(([, name]) => name);
  expect(names.filter((n) => landscapeOf(land(n)) === null)).toEqual([]);
});

test('sea and unnamed land have no scene', () => {
  expect(sceneFor(sea, -20_000, null)).toBeNull();
  expect(sceneFor(null, -20_000, null)).toBeNull();
  expect(sceneFor({ surface: 'land', biome: null, tempC: null, precipMm: null }, 0, null)).toBeNull();
});

test('era: farming and herding win where people live; otherwise the Ice Age ends at GLACIAL_END', () => {
  expect(eraFor(1500, 'farming')).toBe('farming');
  expect(eraFor(1500, 'herding')).toBe('herding');
  expect(eraFor(1500, 'mostly-foraging')).toBe('holocene');
  expect(eraFor(GLACIAL_END - 1, null)).toBe('glacial');
  expect(eraFor(GLACIAL_END, null)).toBe('holocene');
});

test('picks the exact painted scene, else the nearest era, never another landscape', () => {
  expect(sceneFor(land('Shrub tundra'), -30_000, null)?.id).toBe('tundra-glacial');
  expect(sceneFor(land('Temperate deciduous forest'), 800, 'farming')?.id).toBe('temperate-forest-farming');
  // no farming rainforest painted: the warm-period one stands in
  const rain = sceneFor(land('Tropical evergreen forest'), 800, 'farming');
  expect(rain).toMatchObject({ id: 'rainforest-holocene', era: 'holocene' });
  // no Ice Age rainforest either
  expect(sceneFor(land('Tropical evergreen forest'), -40_000, null)?.id).toBe('rainforest-holocene');
  expect(sceneFor(ice, 500, null)?.id).toBe('ice-glacial');
});

test('every painted scene is reachable from some spot', () => {
  const reachable = new Set<string>();
  for (const [id, name] of Object.entries(meta.biomes)) {
    if (Number(id) === meta.iceBiome) continue;
    for (const [time, life] of [[-40_000, null], [-5000, null], [800, 'farming'], [800, 'herding']] as const) {
      const s = sceneFor(land(name), time, life);
      if (s) reachable.add(s.id);
    }
  }
  reachable.add(sceneFor(ice, -20_000, null)!.id);
  expect([...SCENE_IDS].filter((id) => !reachable.has(id))).toEqual([]);
});

test('the view names the facts it came from, and says when it used a nearby era', () => {
  const v = groundView({ time: -40_000, habitat: land('Shrub tundra', -11.6), life: null, peopleModelled: true });
  expect(v).toEqual({ scene: 'tundra-glacial', basis: ['Shrub tundra', '−11.6 °C', 'foraging'] });
  const far = groundView({ time: 1200, habitat: land('Tropical evergreen forest', 26.4), life: 'farming', peopleModelled: false });
  expect(far).toMatchObject({ scene: 'rainforest-holocene', basis: ['Tropical evergreen forest', '26.4 °C', 'farming'], note: 'Nearest picture: warm-period' });
  // empty land claims no way of life
  expect(groundView({ time: -40_000, habitat: land('Desert', 20), life: null, peopleModelled: false })?.basis).toEqual(['Desert', '20.0 °C']);
  expect(groundView({ time: 0, habitat: sea, life: null, peopleModelled: false })).toBeNull();
});

test('picture urls are versioned', () => {
  expect(groundImageUrl('tundra-glacial', 3)).toBe('/ground/tundra-glacial.webp?v=3');
});

test('the way-of-life classes keep their words', () => {
  expect(lifeKind({ crop: 0.2, grazing: 0 })).toBe('farming');
  expect(lifeKind({ crop: 0, grazing: 0.5 })).toBe('herding');
  expect(lifeKind({ crop: 0.02, grazing: 0 })).toBe('mostly-foraging');
  expect(wayOfLife({ crop: 0, grazing: 0 })).toBe('Foraging');
});

test('settledLife is HYDE land use only where people are counted', () => {
  const use = { crop: 0.4, grazing: 0 };
  expect(settledLife({ people: { count: 10, evidence: 'measured', cellDeg: 0.08 }, landUse: use })).toBe('farming');
  expect(settledLife({ people: { count: 0, evidence: 'measured', cellDeg: 0.08 }, landUse: use })).toBeNull();
  expect(settledLife({ people: { count: 10, evidence: 'modelled', cellDeg: 0.5 }, landUse: use })).toBeNull();
  expect(settledLife({ people: null, landUse: use })).toBeNull();
});
