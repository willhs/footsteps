import type { MutableRefObject } from 'react';
import { NEW_YEAR_FADE_MS, YEAR_FADE_MS } from '../hooks/useYearCrossfade';

export function computeFadeMs(
  isNewYearLayer: boolean,
  newLayerReadyRef: MutableRefObject<boolean>,
) {
  return newLayerReadyRef.current
    ? isNewYearLayer
      ? NEW_YEAR_FADE_MS
      : YEAR_FADE_MS
    : 0;
}

export function handleTileLoad(
  isNewYearLayer: boolean,
  newLayerHasTileRef: MutableRefObject<boolean>,
  setTileLoading: (loading: boolean) => void,
) {
  if (isNewYearLayer) {
    setTileLoading(false);
    if (!newLayerHasTileRef.current) {
      newLayerHasTileRef.current = true;
    }
  }
}

export function triggerCrossfade(
  setTileLoading: (loading: boolean) => void,
  startCrossfade: () => void,
) {
  setTileLoading(false);
  startCrossfade();
}
