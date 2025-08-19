'use client';

import React from 'react';

interface DebugInfoProps {
  zoom: number;
  lodLevel: number;
  dotCount: number;
}

function DebugInfo({ zoom, lodLevel, dotCount }: DebugInfoProps) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <details open className="mt-3 text-xs text-slate-500">
      <summary className="cursor-pointer">Debug</summary>
      <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1">
        <div>
          Zoom: {zoom.toFixed(1)}x • LOD: {lodLevel}
        </div>
        <div>Dots drawn: {dotCount.toLocaleString()}</div>
      </div>
    </details>
  );
}

export default React.memo(DebugInfo);
