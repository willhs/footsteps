import { useEffect, useState } from 'react';

/** Shared instant for shading and the local solar clock, independent of era. */
export default function useSolarClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
