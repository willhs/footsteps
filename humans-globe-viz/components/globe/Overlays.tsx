'use client';

import { useState } from 'react';

interface OverlaysProps {
  currentHumanDots: any[];
  totalPopulation: number;
  viewState: any;
  samplingRate: number;
  lodEnabled: boolean;
  setLodEnabled: (enabled: boolean) => void;
  renderMetrics: {
    loadTime: number;
    processTime: number;
    renderTime: number;
    lastUpdate: number;
  };
  dataCache: Map<number, any[]>;
}

export function Overlays({
  currentHumanDots,
  totalPopulation,
  viewState,
  samplingRate,
  lodEnabled,
  setLodEnabled,
  renderMetrics,
  dataCache
}: OverlaysProps) {
  return (
    <>
      {/* Data info overlay */}
      <div 
        className="absolute bg-black/90 rounded-lg p-4 text-white font-sans"
        style={{ top: '2rem', left: '2rem', zIndex: 30 }}
      >
        <div className="text-sm text-blue-300 font-normal">Deep History of Human Settlement</div>
        <div className="text-lg font-bold text-orange-400 font-mono">
          {currentHumanDots.length.toLocaleString()} dots
        </div>
        <div className="text-xs text-gray-500 mt-1 font-normal">
          Dot size represents population (sqrt scaling)
        </div>
        <div className="text-xs text-gray-500 mt-1 font-normal">
          Total population ≈ {totalPopulation.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-1 font-normal">
          Zoom level: {viewState.zoom.toFixed(1)}x
        </div>
        <div className="text-xs text-gray-500 mt-1 font-normal">
          Sampling rate: {samplingRate.toFixed(1)}%
        </div>
        
        {/* LOD info and toggle */}
        <div className="text-xs mt-1 font-normal flex items-center gap-2">
          <div className="text-purple-400">
            LOD: {lodEnabled ? (viewState.zoom < 4 ? 'Regional' : viewState.zoom < 6 ? 'Local' : 'Detailed') : 'Disabled'} (z{viewState.zoom.toFixed(1)})
          </div>
          <button 
            onClick={() => setLodEnabled(!lodEnabled)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              lodEnabled 
                ? 'bg-purple-600 text-white hover:bg-purple-700' 
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
            title={lodEnabled ? 'Disable LOD filtering to show all data' : 'Enable LOD filtering for better performance'}
          >
            {lodEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        
        {/* Performance metrics */}
        <div className="text-xs text-gray-600 mt-2 border-t border-gray-700 pt-2">
          <div>Load: {renderMetrics.loadTime.toFixed(0)}ms</div>
          <div>Process: {renderMetrics.processTime.toFixed(0)}ms</div>
          <div>Render: {renderMetrics.renderTime.toFixed(0)}ms</div>
          <div>Cache: {dataCache.size} years cached</div>
        </div>
      </div>

      {/* Legend */}
      <div 
        className="absolute bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white"
        style={{ top: '2rem', right: '2rem', zIndex: 30 }}
      >
        <div className="text-sm font-semibold mb-2 text-blue-300">Deep History</div>
        <div className="text-xs text-gray-400 mb-3">12,000 Years of Settlement</div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-400"></div>
            <span>Human settlements</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400 opacity-60"></div>
            <span>Population density</span>
          </div>
          <div className="pt-2 border-t border-gray-700 mt-2">
            <div className="font-semibold mb-1">Dot Size</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-orange-400"></div>
              <span>Smaller population</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-orange-400"></div>
              <span>Larger population</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
