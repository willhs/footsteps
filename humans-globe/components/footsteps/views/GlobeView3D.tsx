"use client";

import DeckGL from "@deck.gl/react";
import { _GlobeView as GlobeView } from "@deck.gl/core";
import { ReactNode } from "react";

interface GlobeView3DProps {
  viewState: any;
  onViewStateChange: (params: { viewState: any }) => void;
  layers: any[];
  children?: ReactNode; // overlays rendered on top of DeckGL
}

/**
 * Lightweight wrapper around DeckGL configured for 3-D globe view.
 * All expensive data / state management lives in the parent. This
 * component is purely presentational.
 */
export default function GlobeView3D({ viewState, onViewStateChange, layers, children }: GlobeView3DProps) {
  return (
    <DeckGL
      views={new GlobeView()}
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={true}
      layers={layers}
      getCursor={() => "crosshair"}
      style={{ background: "#000010" }}
    >
      {/* subtle space-like vignette */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: "radial-gradient(circle at center, #000020 0%, #000000 100%)",
          zIndex: -1,
        }}
      />
      {children}
    </DeckGL>
  );
}
