import { useEffect, useState } from 'react';
import { configureSolarClock, solarClockBent, solarNowMs } from '@/lib/solarClock';

/** Shared instant for shading and the local solar clock, independent of era. Real time, unless the
 * URL bends it (`?utc=`, `?warp=`: lib/solarClock.ts). */
export default function useSolarClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // The query string is only known in the browser, so it is read here, after hydration.
    configureSolarClock(window.location.search);
    const tick = () => setNow(new Date(solarNowMs()));
    tick();
    const id = window.setInterval(tick, solarClockBent() ? 1_000 : 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
