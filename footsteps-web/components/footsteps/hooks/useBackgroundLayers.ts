'use client';

import { useState } from 'react';
import { createSeaLayer, createContinentsLayer } from '@/components/footsteps/layers/backgroundLayers';
import useTerrainLayers from './useTerrainLayers';

const ENABLE_PLAIN_BASEMAP = (process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP || 'true') === 'true';
const ENABLE_CONTINENTS = (process.env.NEXT_PUBLIC_ENABLE_CONTINENTS || 'true') === 'true';

/** Terrain on: the Earth of the year at `time`. Off: flat sea and land. */
export default function useBackgroundLayers(time: number) {
  const [showTerrain, setShowTerrain] = useState(() => !ENABLE_PLAIN_BASEMAP);
  const terrainLayers = useTerrainLayers(time, showTerrain);

  const backgroundLayers = showTerrain
    ? terrainLayers
    : [
        createSeaLayer(),
        ...(ENABLE_CONTINENTS ? [createContinentsLayer()] : []),
      ];

  return { backgroundLayers, showTerrain, setShowTerrain } as const;
}
