// Which painted scene fits a spot at a year, for the hover card's ground view (docs/ops/ground-view.md).
// The pictures are imagined; this only chooses one and says which facts it was chosen from.
import scenes from './groundScenes.json';
import type { HabitatCell, LifeKind } from './habitat';

export type Era = keyof typeof scenes.eras;
export type SceneId = `${string}-${Era}`;

/** The Ice Age ends here for picture purposes (Greenland-ice-core end of the Younger Dryas, ~9,700 BCE). */
export const GLACIAL_END = -9700;

/** The scenes that have a picture to generate. A scene id is `${landscape}-${era}`. */
export const SCENE_IDS: ReadonlySet<string> = new Set(scenes.scenes.map((s) => `${s.landscape}-${s.era}`));

const LANDSCAPE_OF_BIOME: ReadonlyMap<string, string> = new Map(
  Object.entries(scenes.landscapes).flatMap(([landscape, l]) =>
    ('biomes' in l ? l.biomes : []).map((biome) => [biome, landscape] as const),
  ),
);

export function landscapeOf(h: HabitatCell): string | null {
  if (h.surface === 'ice') return 'ice';
  return h.surface === 'land' && h.biome ? (LANDSCAPE_OF_BIOME.get(h.biome) ?? null) : null;
}

/** The era that decides the picture: what people were doing where known, else the climate age. */
export function eraFor(time: number, life: LifeKind | null): Era {
  if (life === 'farming') return 'farming';
  if (life === 'herding') return 'herding';
  return time < GLACIAL_END ? 'glacial' : 'holocene';
}

/** A scene for the spot, with the nearest era when the exact one was not painted; null at sea or without a biome. */
export function sceneFor(
  h: HabitatCell | null,
  time: number,
  life: LifeKind | null,
): { id: SceneId; era: Era; landscape: string } | null {
  const landscape = h && landscapeOf(h);
  if (!landscape) return null;
  const wanted = eraFor(time, life);
  for (const era of new Set<Era>([wanted, 'holocene', 'glacial'])) {
    const id = `${landscape}-${era}` as SceneId;
    if (SCENE_IDS.has(id)) return { id, era, landscape };
  }
  return null;
}

export type GroundView = {
  scene: SceneId;
  /** The facts the scene was chosen from, in the words the card uses. */
  basis: string[];
  /** Set when the exact era was not painted and the nearest was used. */
  note?: string;
};

const ERA_NAME: Record<Era, string> = {
  glacial: 'Ice Age',
  holocene: 'warm-period',
  farming: 'farming-era',
  herding: 'herding-era',
};

export function groundView(i: {
  time: number;
  habitat: HabitatCell | null;
  /** Way of life where HYDE says people live here; null otherwise. */
  life: LifeKind | null;
  /** Foragers are assumed (modelled) where there are people but no land use. */
  peopleModelled: boolean;
}): GroundView | null {
  const found = sceneFor(i.habitat, i.time, i.life);
  if (!i.habitat || !found) return null;
  const { habitat: h } = i;
  const basis = [
    h.surface === 'ice' ? 'Land ice' : (h.biome ?? 'Land'),
    h.tempC !== null ? `${h.tempC.toFixed(1).replace('-', '−')} °C` : null,
    i.life ? (i.life === 'farming' ? 'farming' : i.life === 'herding' ? 'herding' : 'foraging') : i.peopleModelled ? 'foraging' : null,
  ].filter((b): b is string => b !== null);
  const wanted = eraFor(i.time, i.life);
  return {
    scene: found.id,
    basis,
    ...(found.era !== wanted && found.landscape !== 'ice' && { note: `Nearest picture: ${ERA_NAME[found.era]}` }),
  };
}

export const groundImageUrl = (id: SceneId, version: number) => `/ground/${id}.webp?v=${version}`;
