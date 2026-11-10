'use client';

import { useState } from 'react';
import FootstepsViz from '@/components/footsteps/FootstepsViz';
import TimeNavigator from '@/components/ui/TimeNavigator';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function Home() {
  const [time, setTime] = useState(-1000);
  const [loading, setLoading] = useState<[number, number] | null>(null);
  
  return (
    <main className="relative w-full h-full overflow-hidden bg-black">
      <ErrorBoundary>
        {/* Globe visualization - now with React 18 compatibility */}
        <FootstepsViz time={time} onLoadingChange={setLoading} />
      </ErrorBoundary>
      
      {/* Time control slider */}
      <TimeNavigator time={time} onChange={setTime} loading={loading} />
      
      {/* Branding indicator - only show when not loading */}
      {/* <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="text-white/50 text-center">
          <div className="text-2xl font-bold mb-2">Globe of Humans</div>
          <div className="text-sm">React 18 Compatible</div>
        </div>
      </div> */}
    </main>
  );
}
