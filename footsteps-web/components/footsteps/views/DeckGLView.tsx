'use client';

import DeckGL, { type DeckGLProps, type DeckGLRef } from '@deck.gl/react';
import {
  _GlobeView as GlobeView,
  MapView,
  type LayersList,
} from '@deck.gl/core';
import { ReactNode, useCallback, useMemo, useRef } from 'react';

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
  onClick?: DeckGLProps['onClick'];
  /** Redraw every frame (shader animation, e.g. flickering night lights). */
  animate?: boolean;
  children?: ReactNode;
}

export default function DeckGLView({
  mode,
  viewState,
  onViewStateChange,
  layers,
  onClick,
  animate = false,
  children,
}: DeckGLViewProps) {
  const is3D = mode === '3d';
  // Let deck.gl size its own canvas from the container (it handles DPR and
  // resizes). Passing fixed view sizes and remounting on resize left the
  // drawing buffer stuck at the 600x300 browser default.
  // luma.gl 9.1 bug: CanvasContext.update() records the new size before
  // resize(), and the first resize() no-ops because the GL context isn't
  // ready yet, so the drawing buffer stays at the 300x150 default (600x300
  // at 2x DPR) until the window next resizes. Force one resize once loaded.
  const deckRef = useRef<DeckGLRef>(null);
  const handleLoad = useCallback(() => {
    const ctx = (
      deckRef.current?.deck as unknown as {
        device?: { canvasContext?: { resize: () => void } };
      }
    )?.device?.canvasContext;
    ctx?.resize();
    deckRef.current?.deck?.redraw('initial resize');
  }, []);

  const globeView = useMemo(() => new GlobeView(), []);
  const mapView = useMemo(() => new MapView(), []);

  const controller = useMemo(
    () => ({
      dragPan: true,
      inertia: 300,
      scrollZoom: { speed: 0.02, smooth: true },
      dragRotate: true,
      touchZoom: true,
      touchRotate: true,
      keyboard: false,
    }),
    [],
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <DeckGL
        ref={deckRef}
        _animate={animate}
        // Small, moving marks (people) need a forgiving click target.
        pickingRadius={8}
        onLoad={handleLoad}
        views={is3D ? globeView : mapView}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={controller}
        layers={layers}
        onClick={onClick}
        getCursor={() => 'crosshair'}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          background: is3D ? '#000010' : '#000810',
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
