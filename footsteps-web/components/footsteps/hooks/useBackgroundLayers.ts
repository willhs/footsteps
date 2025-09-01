'use client';

import { useState, useMemo } from 'react';
import { createSeaLayer, createContinentsLayer, createTerrainLayer } from '@/components/footsteps/layers';

const ENABLE_PLAIN_BASEMAP = (process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP || 'true') === 'true';

export default function useBackgroundLayers() {
  const [showTerrain, setShowTerrain] = useState(() => !ENABLE_PLAIN_BASEMAP);

  const backgroundLayers = useMemo(() => {
    if (!showTerrain) return [createSeaLayer(), createContinentsLayer()];
    return [createTerrainLayer()];
  }, [showTerrain]);

  return { backgroundLayers, showTerrain, setShowTerrain } as const;
}

