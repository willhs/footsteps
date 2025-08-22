'use client';

import DeckGL, { type DeckGLProps } from '@deck.gl/react';
import { _GlobeView as GlobeView, MapView, type LayersList } from '@deck.gl/core';
import { ReactNode, useMemo } from 'react';

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

  const globeView = useMemo(() => new GlobeView(), []);
  const mapView = useMemo(() => new MapView(), []);

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

  return (
    <DeckGL
      views={is3D ? globeView : mapView}
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={is3D ? true : controller2D}
      layers={layers}
      getCursor={() => 'crosshair'}
      style={{ background: is3D ? '#000010' : '#000810' }}
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
  );
}
