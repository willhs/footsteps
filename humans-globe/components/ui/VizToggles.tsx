'use client';

import TerrainToggle, { TOGGLE_BUTTON_TW, TOGGLE_CONTAINER_TW } from './TerrainToggle';

interface VizTogglesProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
  is3DMode: boolean;
  onModeChange: (is3D: boolean) => void;
  className?: string;
}

export default function VizToggles({
  showTerrain,
  onToggle,
  is3DMode,
  onModeChange,
  className,
}: VizTogglesProps) {
  return (
    <div className={className}>
      {/* 2D / 3D view toggle */}
      <div className={TOGGLE_CONTAINER_TW} role="group" aria-label="View mode">
        <button
          onClick={() => onModeChange(false)}
          className={`${TOGGLE_BUTTON_TW} ${
            !is3DMode
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-gray-200 hover:text-white hover:bg-white/10'
          }`}
          title="🗺️ 2D Map view"
          aria-pressed={!is3DMode}
          aria-label="Map view"
        >
          🗺️
        </button>
        <button
          onClick={() => onModeChange(true)}
          className={`${TOGGLE_BUTTON_TW} ${
            is3DMode
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-gray-200 hover:text-white hover:bg-white/10'
          }`}
          title="🌍 3D Globe view"
          aria-pressed={is3DMode}
          aria-label="Globe view"
        >
          🌍
        </button>
      </div>

      {/* Terrain / Plain toggle */}
      <div className="mt-2">
        <TerrainToggle showTerrain={showTerrain} onToggle={onToggle} />
      </div>
    </div>
  );
}