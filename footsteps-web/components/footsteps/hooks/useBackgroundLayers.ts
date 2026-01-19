'use client';

import { useState } from 'react';
import { createSeaLayer, createContinentsLayer, createTerrainLayer } from '@/components/footsteps/layers';

const ENABLE_PLAIN_BASEMAP = (process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP || 'true') === 'true';
const ENABLE_CONTINENTS = (process.env.NEXT_PUBLIC_ENABLE_CONTINENTS || 'true') === 'true';

export default function useBackgroundLayers() {
  const [showTerrain, setShowTerrain] = useState(() => !ENABLE_PLAIN_BASEMAP);

  const backgroundLayers = showTerrain
    ? [createTerrainLayer()]
    : [
        createSeaLayer(),
        ...(ENABLE_CONTINENTS ? [createContinentsLayer()] : []),
      ];

  return { backgroundLayers, showTerrain, setShowTerrain } as const;
}
