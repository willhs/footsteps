import { useEffect, useState } from 'react';
import { configureSolarClock, onSolarClockChange, solarClockBent, solarNowMs } from '@/lib/solarClock';

/** Shared instant for shading and the local solar clock, independent of era. Real time, unless the
 * URL bends it (`?utc=`, `?warp=`: lib/solarClock.ts) or the time-of-day dial sets it. */
export default function useSolarClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // The query string is only known in the browser, so it is read here, after hydration.
    configureSolarClock();
    const tick = () => setNow(new Date(solarNowMs()));
    tick();
    const id = window.setInterval(tick, solarClockBent() ? 1_000 : 20_000);
    const unsubscribe = onSolarClockChange(tick);
    return () => {
      window.clearInterval(id);
      unsubscribe();
    };
  }, []);
  return now;
}
