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
  className?: string;
}

export default function VizToggles({
  showTerrain,
  onToggle,
  is3DMode,
  onModeChange,
  colorScheme,
  onColorSchemeChange,
  className,
}: VizTogglesProps) {
  return (
    <div className={className}>
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
      <div className="mt-2">
        <TerrainToggle showTerrain={showTerrain} onToggle={onToggle} />
      </div>

      {/* Color scheme toggle */}
      <div className="mt-2">
        <ColorSchemeToggle 
          colorScheme={colorScheme}
          onSchemeChange={onColorSchemeChange}
        />
      </div>
    </div>
  );
}