'use client';

import React from 'react';

function LoadingOverlay() {
  return (
    <div
      className="absolute backdrop-blur-md bg-black/50 rounded-lg p-4 text-slate-200 font-sans flex items-center justify-center"
      style={{
        top: '5rem',
        left: '2rem',
        zIndex: 30,
        minWidth: '200px',
        minHeight: '120px',
      }}
    >
      <span className="animate-pulse text-sm text-slate-300">
        Loading human presence data…
      </span>
    </div>
  );
}

export default React.memo(LoadingOverlay);
