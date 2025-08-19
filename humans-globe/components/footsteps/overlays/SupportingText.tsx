'use client';

import React from 'react';
import { formatPopulation, getDetailContext, formatYear } from '@/lib/format';
import LoadingOverlay from '@/components/footsteps/overlays/LoadingOverlay';
import DebugInfo from '@/components/footsteps/overlays/DebugInfo';

interface Props {
  loading?: boolean;
  dotCount: number;
  totalPopulation: number;
  viewState: { zoom: number };
  lodLevel: number;
  year: number;
}

function SupportingText({
  loading = false,
  dotCount,
  totalPopulation,
  viewState,
  lodLevel,
  year,
}: Props) {
  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <div
      className="absolute backdrop-blur-md bg-black/40 bg-opacity-50 rounded-md p-3 text-slate-200 font-sans"
      style={{ top: '1rem', left: '1rem', zIndex: 30 }}
    >
      {/* Current year */}
      <div className="text-xs text-slate-400 mb-1">{formatYear(year)}</div>

      {/* Title and primary metric */}
      <div className="text-sm mb-1">Human presence</div>
      <div className="text-xl font-semibold mb-2">
        {formatPopulation(totalPopulation)}
      </div>

      {/* Current view context */}
      <div className="text-xs text-slate-400 mb-1">
        {getDetailContext(viewState.zoom)}
      </div>

      <DebugInfo
        zoom={viewState.zoom}
        lodLevel={lodLevel}
        dotCount={dotCount}
      />
    </div>
  );
}

export default React.memo(SupportingText);
