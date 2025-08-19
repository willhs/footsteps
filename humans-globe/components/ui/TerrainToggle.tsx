'use client';

import ToggleButton, { TOGGLE_CONTAINER_TW } from './ToggleButton';

interface TerrainToggleProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function TerrainToggle({ showTerrain, onToggle }: TerrainToggleProps) {
  return (
    <div className={TOGGLE_CONTAINER_TW} role="group" aria-label="Background style">
      <ToggleButton
        pressed={showTerrain}
        onClick={() => onToggle(true)}
        label="Terrain"
        title="🏔️ Show terrain imagery"
        activeClassName="bg-emerald-500 text-white shadow-md"
      >
        🏔️
      </ToggleButton>
      <ToggleButton
        pressed={!showTerrain}
        onClick={() => onToggle(false)}
        label="Plain"
        title="⚫️ Plain background for dot clarity"
        activeClassName="bg-emerald-500 text-white shadow-md"
      >
        ⚫️
      </ToggleButton>
    </div>
  );
}