'use client';

import DeckGL, { type DeckGLProps } from '@deck.gl/react';
import { _GlobeView as GlobeView, type LayersList } from '@deck.gl/core';
import { ReactNode } from 'react';

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

  return (
    <DeckGL
      views={is3D ? new GlobeView() : undefined}
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={
        is3D
          ? true
          : {
              dragPan: true,
              dragRotate: true,
              scrollZoom: true,
              touchZoom: true,
              touchRotate: true,
              keyboard: false,
            }
      }
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
