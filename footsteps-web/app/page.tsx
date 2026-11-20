'use client';

import { useEffect, useState } from 'react';
import { clampTime } from '@/lib/time';
import FootstepsViz from '@/components/footsteps/FootstepsViz';
import TimeBar from '@/components/ui/TimeBar';
import TimeNavigator from '@/components/ui/TimeNavigator';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function Home() {
  const [time, setTime] = useState(-1000);
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
        <FootstepsViz time={time} onLoadingChange={setLoading} />
      </ErrorBoundary>
      <Bar time={time} onChange={setTime} loading={loading} />
    </main>
  );
}
