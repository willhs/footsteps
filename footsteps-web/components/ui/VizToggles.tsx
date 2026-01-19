'use client';

import ToggleButton, { TOGGLE_CONTAINER_TW } from './ToggleButton';
import TerrainToggle from './TerrainToggle';
import ColorSchemeToggle from './ColorSchemeToggle';
import { type ColorScheme } from '../footsteps/layers/color';

interface VizTogglesProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
  is3DMode: boolean;
  onModeChange: (is3D: boolean) => void;
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  showAnthromes: boolean;
  onToggleAnthromes: (show: boolean) => void;
  className?: string;
}

export default function VizToggles({
  showTerrain,
  onToggle,
  is3DMode,
  onModeChange,
  colorScheme,
  onColorSchemeChange,
  showAnthromes,
  onToggleAnthromes,
  className,
}: VizTogglesProps) {
  return (
    <div className={`flex flex-col gap-3 ${className || ''}`}>
      {/* 2D / 3D view toggle */}
      <div className={TOGGLE_CONTAINER_TW} role="group" aria-label="View mode">
        <ToggleButton
          pressed={!is3DMode}
          onClick={() => onModeChange(false)}
          label="Map view"
          title="🗺️ 2D Map view"
          activeClassName="bg-blue-500 text-white shadow-md"
        >
          🗺️
        </ToggleButton>
        <ToggleButton
          pressed={is3DMode}
          onClick={() => onModeChange(true)}
          label="Globe view"
          title="🌍 3D Globe view"
          activeClassName="bg-blue-500 text-white shadow-md"
        >
          🌍
        </ToggleButton>
      </div>

      {/* Terrain / Plain toggle */}
      <TerrainToggle showTerrain={showTerrain} onToggle={onToggle} />

      {/* Color scheme toggle */}
      <ColorSchemeToggle 
        colorScheme={colorScheme}
        onSchemeChange={onColorSchemeChange}
      />

      {/* Anthrome overlay toggle */}
      <button
        type="button"
        aria-label="Toggle human biome overlay"
        aria-pressed={showAnthromes}
        onClick={() => onToggleAnthromes(!showAnthromes)}
        className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full border border-gray-600/40 bg-gray-700/70 text-xl transition-colors duration-200 shadow-lg ${
          showAnthromes
            ? 'bg-emerald-500 text-white ring-1 ring-emerald-300/70'
            : 'text-gray-200 hover:bg-gray-600/60 hover:text-white'
        }`}
      >
        🌱
      </button>
    </div>
  );
}
