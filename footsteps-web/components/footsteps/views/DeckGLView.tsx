'use client';

import DeckGL, { type DeckGLProps } from '@deck.gl/react';
import { _GlobeView as GlobeView, MapView, type LayersList } from '@deck.gl/core';
import { ReactNode, useMemo, useEffect, useLayoutEffect, useState, useRef } from 'react';
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_LOGS === '1';

type BasicViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

interface DeckGLViewProps {
  mode: '2d' | '3d';
  viewState: BasicViewState;
  onViewStateChange: DeckGLProps['onViewStateChange'];
  layers: LayersList;
  children?: ReactNode;
}

export default function DeckGLView({
  mode,
  viewState,
  onViewStateChange,
  layers,
  children,
}: DeckGLViewProps) {
  const is3D = mode === '3d';
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const globeView = useMemo(() => new GlobeView({
    width: dimensions.width,
    height: dimensions.height
  }), [dimensions.width, dimensions.height]);
  const mapView = useMemo(() => new MapView({
    width: dimensions.width,
    height: dimensions.height
  }), [dimensions.width, dimensions.height]);

  const controller2D = useMemo(
    () => ({
      dragPan: true,
      dragRotate: true,
      scrollZoom: true,
      touchZoom: true,
      touchRotate: true,
      keyboard: false,
    }),
    [],
  );

  // Use ResizeObserver to track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const newDimensions = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };
      if (DEBUG) console.log('[DECK-SIZE] Container size:', newDimensions);
      setDimensions(newDimensions);
    };

    // Initial size
    updateDimensions();

    // Use ResizeObserver for more reliable size tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);


  if (DEBUG) console.log('[DECK-SIZE] Rendering with dimensions:', dimensions);
  if (DEBUG) console.log('[DECK-SIZE] Key for recreation:', `${dimensions.width}x${dimensions.height}`);

  return (
    <div 
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <DeckGL
        key={`${dimensions.width}x${dimensions.height}`}
        views={is3D ? globeView : mapView}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={is3D ? true : controller2D}
        layers={layers}
        getCursor={() => 'crosshair'}
        width={dimensions.width}
        height={dimensions.height}
        style={{ 
          position: 'absolute',
          top: '0px',
          left: '0px',
          background: is3D ? '#000010' : '#000810' 
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: is3D
              ? 'radial-gradient(circle at center, #000020 0%, #000000 100%)'
              : 'radial-gradient(circle at center, #001122 0%, #000000 100%)',
            zIndex: -1,
          }}
        />
        {children}
      </DeckGL>
    </div>
  );
}
