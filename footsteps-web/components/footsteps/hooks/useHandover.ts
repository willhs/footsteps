import { useEffect, useRef, useState } from 'react';

/** How long the far-out fires and the groups take to cross-fade once the groups' data is ready. */
export const HANDOVER_MS = 450;

/**
 * 0 while `ready` is false; once it turns true, rises to 1 over HANDOVER_MS (and drops back to 0 at once if it turns false
 * again). The zoom-driven blend between two looks multiplies by this, so a look that is not ready yet is never faded in
 * over an empty map, and one that becomes ready mid-zoom eases in rather than popping.
 */
export default function useHandover(ready: boolean, durationMs = HANDOVER_MS): number {
  const [value, setValue] = useState(ready ? 1 : 0);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!ready) {
      setValue(0);
      return;
    }
    if (valueRef.current >= 1) return;
    const startValue = valueRef.current;
    const startTime = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const next = Math.min(1, startValue + (now - startTime) / durationMs);
      setValue(next);
      if (next < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ready, durationMs]);

  return value;
}
