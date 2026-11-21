'use client';

import { useEffect, useState } from 'react';
import { bracket, clampTime } from '@/lib/time';
import { DEFAULT_TIME } from '@/lib/constants';
import { loadGridData } from '@/components/footsteps/hooks/gridLoader';
import FootstepsViz from '@/components/footsteps/FootstepsViz';
import TimeBar from '@/components/ui/TimeBar';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// `?bar=old` only (the previous navigator, kept for comparison): its code loads with the flag.
const TimeNavigator = dynamic(() => import('@/components/ui/TimeNavigator'), { ssr: false });

// Start the grid worker on the opening years as soon as this script runs, not after React mounts (docs/ops/first-load.md):
// the far-out firelight draws from exactly these (usePresenceLayers), and the requests join the head's preloads.
function warmOpeningYears() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'dots' || params.get('tour') === '1') return;
  const asked = Number(params.get('year') ?? NaN);
  const { y0, y1 } = bracket(Number.isFinite(asked) ? clampTime(asked) : DEFAULT_TIME);
  for (const year of new Set([y0, y1])) loadGridData(year).catch(() => {}); // the hooks report failures when they ask again
}
if (typeof window !== 'undefined') warmOpeningYears();

export default function Home() {
  const [time, setTime] = useState(DEFAULT_TIME);
  const [loading, setLoading] = useState<[number, number] | null>(null);
  // ?bar=old shows the previous two-strip navigator for comparison (remove after one round).
  const [oldBar, setOldBar] = useState(false);
  // ?year=-6000 opens at that year (deep links, screenshots).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const y = Number(params.get('year') ?? NaN);
    if (Number.isFinite(y)) setTime(clampTime(y));
    setOldBar(params.get('bar') === 'old');
  }, []);

  const Bar = oldBar ? TimeNavigator : TimeBar;
  return (
    // data-loading: the time bar's loading flag as an attribute, for the visual regression run to wait on (docs/ops/visual-regression.md).
    <main className="relative w-full h-full overflow-hidden bg-black" data-loading={loading ? 'true' : 'false'}>
      <ErrorBoundary>
        <FootstepsViz time={time} onLoadingChange={setLoading} onTimeChange={setTime} />
      </ErrorBoundary>
      <Bar time={time} onChange={setTime} loading={loading} />
    </main>
  );
}
