'use client';

import { useState } from 'react';
import { createSeaLayer, createContinentsLayer } from '@/components/footsteps/layers/backgroundLayers';
import useTerrainLayers from './useTerrainLayers';

const ENABLE_CONTINENTS = (process.env.NEXT_PUBLIC_ENABLE_CONTINENTS || 'true') === 'true';

/** Terrain on: the Earth of the year at `time`. Off: flat sea and land. */
export default function useBackgroundLayers(time: number, close3d = false) {
  // Terrain is the default: the Earth of each era is part of the story.
  const [showTerrain, setShowTerrain] = useState(true);
  const terrainLayers = useTerrainLayers(time, showTerrain, close3d);

  const backgroundLayers = showTerrain
    ? terrainLayers
    : [
        createSeaLayer(),
        ...(ENABLE_CONTINENTS ? [createContinentsLayer()] : []),
      ];

  return { backgroundLayers, showTerrain, setShowTerrain } as const;
}
