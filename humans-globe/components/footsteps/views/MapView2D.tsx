"use client";

import DeckGL, { type DeckGLProps } from "@deck.gl/react";
import type { LayersList } from "@deck.gl/core";
import { ReactNode } from "react";

type BasicViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

interface MapView2DProps {
  viewState: BasicViewState;
  onViewStateChange: DeckGLProps["onViewStateChange"];
  layers: LayersList;
  children?: ReactNode;
}

/**
 * 2-D map view wrapper around DeckGL. Purely presentational.
 */
export default function MapView2D({ viewState, onViewStateChange, layers, children }: MapView2DProps) {
  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={{
        dragPan: true,
        dragRotate: true,
        scrollZoom: true,
        touchZoom: true,
        touchRotate: true,
        keyboard: false,
      }}
      layers={layers}
      getCursor={() => "crosshair"}
      style={{ background: "#000810" }}
    >
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: "radial-gradient(circle at center, #001122 0%, #000000 100%)",
          zIndex: -1,
        }}
      />
      {children}
    </DeckGL>
  );
}
