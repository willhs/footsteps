'use client';

import dynamic from 'next/dynamic';
import { useYear } from '../lib/useYear';
import TimeSlider from './TimeSlider';
import { ErrorBoundary } from './ErrorBoundary';

const Globe = dynamic(() => import('./Globe'), { ssr: false });

export default function HomeClient() {
  const { year, sliderValue, updateSlider } = useYear(0);

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ErrorBoundary>
        <Globe year={year} />
      </ErrorBoundary>

      <TimeSlider value={sliderValue} onChange={updateSlider} />
    </main>
  );
}
