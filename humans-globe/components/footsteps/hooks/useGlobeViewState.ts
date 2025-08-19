'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import useDebouncedFlag from '@/components/footsteps/hooks/useDebouncedFlag';

type BasicViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export default function useGlobeViewState() {
  // Read optional initial state from URL query on first mount for QA/debug convenience
  // Example: ?lat=28.6&lon=77.2&zoom=8
  const getInitialViewState = (): ViewState => {
    try {
      if (
        typeof window !== 'undefined' &&
        window.location &&
        window.location.search
      ) {
        const sp = new URLSearchParams(window.location.search);
        const lat = Number(sp.get('lat'));
        const lon = Number(sp.get('lon') || sp.get('lng'));
        const zoom = Number(sp.get('zoom') || sp.get('z'));
        return {
          longitude: Number.isFinite(lon) ? lon : 0,
          latitude: Number.isFinite(lat) ? lat : 20,
          zoom: Number.isFinite(zoom) ? zoom : 1.5,
          pitch: 0,
          bearing: 0,
        };
      }
    } catch {
      // ignore and fall back to defaults
    }
    return {
      longitude: 0,
      latitude: 20,
      zoom: 1.5,
      pitch: 0,
      bearing: 0,
    };
  };

  const [viewState, setViewState] = useState<ViewState>(getInitialViewState);
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
        Math.abs(normalized.zoom - oldState.zoom) > 0.01
      ) {
        triggerZoom();
      }

      const panThreshold = 0.1;
      if (
        (Math.abs(normalized.longitude - oldState.longitude) > panThreshold ||
          Math.abs(normalized.latitude - oldState.latitude) > panThreshold) &&
        !isZoomingRef.current
      ) {
        triggerPan();
      }
    },
    [triggerZoom, triggerPan],
  );

  return { viewState, isZooming, isPanning, onViewStateChange };
}
