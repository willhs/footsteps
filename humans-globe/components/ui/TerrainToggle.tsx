'use client';

interface TerrainToggleProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function TerrainToggle({ showTerrain, onToggle }: TerrainToggleProps) {
  return (
    <div className="relative inline-flex rounded-full bg-gray-700/70 p-0.5 backdrop-blur-md shadow-lg ring-1 ring-gray-600/40">
      {/* Sliding highlight */}
      <span
        className={`absolute top-0.5 left-0.5 h-7 w-1/2 rounded-full bg-green-500/90 shadow-md transition-transform duration-300 ease-out ${
          showTerrain ? '' : 'translate-x-full'
        }`}
      />
      <button
        onClick={() => onToggle(true)}
        className={`relative z-10 flex-1 text-center text-xs px-4 py-1.5 rounded-full transition-all duration-200 ${
          showTerrain 
            ? 'text-white font-bold shadow-inner' 
            : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-105 hover:shadow-inner'
        }`}
        title="Show Earth terrain imagery"
      >
        Terrain
      </button>
      <button
        onClick={() => onToggle(false)}
        className={`relative z-10 flex-1 text-center text-xs px-4 py-1.5 rounded-full transition-all duration-200 ${
          !showTerrain 
            ? 'text-white font-bold shadow-inner' 
            : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-105 hover:shadow-inner'
        }`}
        title="Show solid background for better dot visibility"
      >
        Plain
      </button>
    </div>
  );
}