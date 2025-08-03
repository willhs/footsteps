import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export default function useGlobeViewState() {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
    pitch: 0,
    bearing: 0,
  });

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
        }, 150);
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
        }, 300);
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
