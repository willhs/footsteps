"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

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
      if (typeof window !== 'undefined' && window.location && window.location.search) {
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

  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onViewStateChange = useCallback(
    ({ viewState: newViewState }: { viewState: ViewState }) => {
      const oldZoom = viewState.zoom;
      const newZoom = newViewState.zoom;
      const oldLon = viewState.longitude;
      const newLon = newViewState.longitude;
      const oldLat = viewState.latitude;
      const newLat = newViewState.latitude;

      setViewState(newViewState);

      if (typeof newZoom === 'number' && Math.abs(newZoom - oldZoom) > 0.01) {
        if (!isZooming) {
          setIsZooming(true);
        }
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(() => {
          setIsZooming(false);
        }, 800); // Increased from 150ms to 800ms for better debouncing
      }

      const panThreshold = 0.1;
      if (
        (Math.abs(newLon - oldLon) > panThreshold ||
          Math.abs(newLat - oldLat) > panThreshold) &&
        !isZooming
      ) {
        if (!isPanning) {
          setIsPanning(true);
        }
        if (panTimeoutRef.current) {
          clearTimeout(panTimeoutRef.current);
        }
        panTimeoutRef.current = setTimeout(() => {
          setIsPanning(false);
        }, 600); // Increased from 300ms to 600ms for better debouncing
      }
    },
    [viewState, isZooming, isPanning]
  );

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      if (panTimeoutRef.current) {
        clearTimeout(panTimeoutRef.current);
      }
    };
  }, []);

  return { viewState, isZooming, isPanning, onViewStateChange };
}