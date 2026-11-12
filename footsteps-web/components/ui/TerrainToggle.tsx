'use client';

import ToggleButton, { TOGGLE_CONTAINER_TW } from './ToggleButton';
import { PlainIcon, TerrainIcon } from './icons';

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
        title="Terrain: land, sea and ice of the time"
      >
        <TerrainIcon />
      </ToggleButton>
      <ToggleButton
        pressed={!showTerrain}
        onClick={() => onToggle(false)}
        label="Plain"
        title="Plain: dark background for clearer dots"
      >
        <PlainIcon />
      </ToggleButton>
    </div>
  );
}
