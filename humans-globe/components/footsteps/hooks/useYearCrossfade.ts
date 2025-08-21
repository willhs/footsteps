'use client';

import { useRef } from 'react';

export default function useYearCrossfade(year: number) {
  const newLayerHasTileRef = useRef<boolean>(false);

  return {
    previousYear: null,
    currentOpacity: 1,
    previousOpacity: 0,
    newLayerReadyRef: { current: true },
    newLayerHasTileRef,
    startCrossfade: () => {},
  };
}
