'use client';
// The `?tour=1` guided tour as one component (hooks/useTour.ts + overlays/TourPanel.tsx), so FootstepsViz loads it
// only with the flag (docs/ops/first-load.md).
import TourPanel from './overlays/TourPanel';
import useTour from './hooks/useTour';

export default function TourGuide(props: Parameters<typeof useTour>[0]) {
  const tour = useTour(props);
  return tour ? <TourPanel tour={tour} /> : null;
}
