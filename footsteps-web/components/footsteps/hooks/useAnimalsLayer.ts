import { useMemo } from 'react';
import { animalsForView } from '@/lib/animals';
import { readHabitat } from '@/lib/habitat';
import type { Person } from '../layers/people';
import AnimalsLayer from '../layers/AnimalsLayer';
import useFauna from './useFauna';
import useFood from './useFood';
import useHabitatLookups from './useHabitatLookups';

export default function useAnimalsLayer({
  enabled,
  time,
  lon,
  lat,
  opacity,
  people,
}: {
  enabled: boolean;
  time: number;
  lon: number;
  lat: number;
  opacity: number;
  people: readonly Person[];
}) {
  const range = useFauna(enabled ? { lon, lat } : null, time);
  const food = useFood(enabled, enabled);
  const { step } = useHabitatLookups(enabled, time, null);
  // Snap the region centre: moving the camera within a patch changes no instances.
  const x = Math.floor(lon * 100) / 100,
    y = Math.floor(lat * 100) / 100;
  const species = range?.species,
    block = range?.block,
    key = range?.key;
  const animals = useMemo(
    () =>
      enabled && step
        ? animalsForView({
            lon: x,
            lat: y,
            year: time,
            range: species && block && key ? { species, block, key } : null,
            food,
            people,
            land: (a, b) => readHabitat(step, a, b).surface === 'land',
          })
        : [],
    [enabled, step, x, y, time, species, block, key, food, people],
  );
  return useMemo(
    () =>
      enabled
        ? [
            new AnimalsLayer({
              id: 'animals',
              data: animals,
              opacity,
              getPosition: (a) => a.position,
              getRadius: (a) => 9 * a.size,
              getFillColor: [172, 184, 190, 245],
              radiusUnits: 'pixels',
              stroked: false,
              antialiasing: false,
              pickable: true,
              parameters: { depthCompare: 'always', depthWriteEnabled: false },
            }),
          ]
        : [],
    [enabled, animals, opacity],
  );
}
