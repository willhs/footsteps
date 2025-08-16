'use client';

interface TerrainToggleProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
}

export const TOGGLE_BUTTON_TW =
  'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full leading-none text-2xl transition-colors duration-200';
export const TOGGLE_CONTAINER_TW =
  'inline-flex items-center gap-0 rounded-full bg-gray-700/70 p-0 backdrop-blur-md shadow-lg ring-1 ring-gray-600/40';

export default function TerrainToggle({ showTerrain, onToggle }: TerrainToggleProps) {
  return (
    <div className={TOGGLE_CONTAINER_TW} role="group" aria-label="Background style">
      <button
        onClick={() => onToggle(true)}
        className={`${TOGGLE_BUTTON_TW}  ${
          showTerrain
            ? 'bg-emerald-500 text-white shadow-md'
            : 'text-gray-200 hover:text-white hover:bg-white/10'
        }`}
        title="🏔️ Show terrain imagery"
        aria-pressed={showTerrain}
        aria-label="Terrain"
      >
        🏔️
      </button>
      <button
        onClick={() => onToggle(false)}
        className={`${TOGGLE_BUTTON_TW} ${
          !showTerrain
            ? 'bg-emerald-500 text-white shadow-md'
            : 'text-gray-200 hover:text-white hover:bg-white/10'
        }`}
        title="⚫️ Plain background for dot clarity"
        aria-pressed={!showTerrain}
        aria-label="Plain"
      >
        ⚫️
      </button>
    </div>
  );
}