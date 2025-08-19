'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import useDebouncedFlag from '@/components/footsteps/hooks/useDebouncedFlag';
import parseInitialViewState, {
  type ViewState,
} from '@/lib/parseInitialViewState';

// Thresholds centralized for easy tweaking; small changes below these values
// come from deck.gl's internal updates and shouldn't trigger interaction flags.
const ZOOM_DELTA_THRESHOLD = 0.01;
const PAN_THRESHOLD = 0.1;

type BasicViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

export default function useGlobeViewState() {
  // Read optional initial state from URL query on first mount for QA/debug convenience
  // Example: ?lat=28.6&lon=77.2&zoom=8
  const [viewState, setViewState] = useState<ViewState>(() =>
    parseInitialViewState(
      typeof window !== 'undefined' ? window.location.search : '',
    ),
  );
  const viewStateRef = useRef<ViewState>(viewState);

  const [isZooming, triggerZoom] = useDebouncedFlag(800);
  const [isPanning, triggerPan] = useDebouncedFlag(600);

  const isZoomingRef = useRef(isZooming);
  useEffect(() => {
    isZoomingRef.current = isZooming;
  }, [isZooming]);

  const onViewStateChange = useCallback(
    ({ viewState: newViewState }: { viewState: BasicViewState }) => {
      const normalized: ViewState = {
        longitude: newViewState.longitude,
        latitude: newViewState.latitude,
        zoom: newViewState.zoom,
        pitch: newViewState.pitch ?? 0,
        bearing: newViewState.bearing ?? 0,
      };

      const oldState = viewStateRef.current;
      viewStateRef.current = normalized;
      setViewState(normalized);

      if (
        typeof normalized.zoom === 'number' &&
        Math.abs(normalized.zoom - oldState.zoom) > ZOOM_DELTA_THRESHOLD
      ) {
        triggerZoom();
      }
      if (
        (Math.abs(normalized.longitude - oldState.longitude) > PAN_THRESHOLD ||
          Math.abs(normalized.latitude - oldState.latitude) > PAN_THRESHOLD) &&
        !isZoomingRef.current
      ) {
        triggerPan();
      }
    },
    [triggerZoom, triggerPan],
  );

  return { viewState, isZooming, isPanning, onViewStateChange };
}
