'use client';

import { useYear } from '@/lib/useYear';
import FootstepsViz from '@/components/footsteps/FootstepsViz';
import TimeSlider from '@/components/ui/TimeSlider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function Home() {
  const { year, sliderValue, updateSlider } = useYear(-1000); // Start at 1000 BC (we know this data exists)
  
  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ErrorBoundary>
        {/* Globe visualization - now with React 18 compatibility */}
        <FootstepsViz year={year} />
      </ErrorBoundary>
      
      {/* Time control slider */}
      <TimeSlider 
        value={sliderValue} 
        onChange={updateSlider}
      />
      
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