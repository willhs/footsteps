'use client';

import DeckGL, { type DeckGLProps, type DeckGLRef } from '@deck.gl/react';
import {
  _GlobeView as GlobeView,
  MapView,
  type LayersList,
} from '@deck.gl/core';
import { lonLatAt } from '@/lib/hoverCard';
import { TiltMapController, type GroundZ } from './tiltController';
import { HTMLAttributes, MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';

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
  onInteractionStateChange?: DeckGLProps['onInteractionStateChange'];
  layers: LayersList;
  onClick?: DeckGLProps['onClick'];
  /** Called after every frame deck.gl draws (first-load marks). */
  onAfterRender?: () => void;
  /** Redraw every frame (shader animation, e.g. flickering night lights). */
  animate?: boolean;
  /** Pointer handlers for the container, e.g. the hover card's. */
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** Filled with a function that turns container pixels into lon/lat (null off the map). */
  unprojectRef?: MutableRefObject<((x: number, y: number) => [number, number] | null) | null>;
  children?: ReactNode;
  /** CSS background shown wherever nothing is drawn (`?sky=1`: the sky, lib/sky.ts skyBackdrop); the default is the night gradient. */
  backdrop?: string;
  /** The map's tilt for a zoom when it tilts with zoom (the close-up); zooming then keeps the spot under the cursor put. */
  tilt?: (zoom: number) => number | null;
  /** Drawn height (m) of the 3D ground under a point, so a tilted zoom holds the ground you point at, not sea level beyond it. */
  ground?: GroundZ;
  /** deck.gl's far-plane multiplier for the map (lib/close3d.ts farMultiplier); unset keeps deck.gl's default. */
  farZMultiplier?: number;
}

export default function DeckGLView({
  mode,
  viewState,
  onViewStateChange,
  onInteractionStateChange,
  layers,
  onClick,
  onAfterRender,
  animate = false,
  containerProps,
  unprojectRef,
  children,
  backdrop,
  tilt,
  ground,
  farZMultiplier,
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

  useEffect(() => {
    if (!unprojectRef) return;
    unprojectRef.current = (x, y) => lonLatAt(deckRef.current?.deck?.getViewports()[0], x, y);
  }, [unprojectRef]);

  const globeView = useMemo(() => new GlobeView(), []);
  const mapView = useMemo(() => new MapView(farZMultiplier ? { farZMultiplier } : {}), [farZMultiplier]);

  const controller = useMemo(
    () => ({
      type: TiltMapController,
      tilt,
      ground,
      dragPan: true,
      inertia: 300,
      scrollZoom: { speed: 0.02, smooth: true },
      dragRotate: true,
      touchZoom: true,
      touchRotate: true,
      keyboard: false,
    }),
    [tilt, ground],
  );

  return (
    <div
      {...containerProps}
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
        onInteractionStateChange={onInteractionStateChange}
        controller={controller}
        layers={layers}
        onClick={onClick}
        onAfterRender={onAfterRender}
        getCursor={() => 'crosshair'}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          background: backdrop ?? (is3D ? '#000010' : '#000810'),
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: backdrop ?? (is3D
              ? 'radial-gradient(circle at center, #000020 0%, #000000 100%)'
              : 'radial-gradient(circle at center, #001122 0%, #000000 100%)'),
            zIndex: -1,
          }}
        />
        {children}
      </DeckGL>
    </div>
  );
}
