'use client';

import { useEffect, useRef, useState } from 'react';

export type YearFrame<T> = { snapshot: T; opacity: number };
type Crossfade<T> =
  | { kind: 'empty' }
  | { kind: 'steady'; snapshot: T }
  | { kind: 'fading'; from: T; to: T; startedAt: number };

const FADE_MS = 300;

/** Finish an in-flight blend before taking the latest decoded snapshot.
 * This keeps rapid scrubbing continuous without accumulating GPU datasets.
 */
export default function useYearCrossfade<T>(
  snapshot: T | null,
  enabled = true,
) {
  const transition = useRef<Crossfade<T>>({ kind: 'empty' });
  const [frames, setFrames] = useState<YearFrame<T>[]>([]);

  useEffect(() => {
    if (!enabled) {
      transition.current = { kind: 'empty' };
      setFrames([]);
      return;
    }
    if (snapshot === null) return;
    let frame: number;
    const draw = (now: number) => {
      let state = transition.current;
      if (state.kind === 'empty') state = { kind: 'steady', snapshot };
      if (state.kind === 'fading' && now - state.startedAt >= FADE_MS) {
        state = { kind: 'steady', snapshot: state.to };
      }
      if (state.kind === 'steady' && state.snapshot !== snapshot) {
        state = {
          kind: 'fading',
          from: state.snapshot,
          to: snapshot,
          startedAt: now,
        };
      }
      transition.current = state;
      if (state.kind === 'steady') {
        setFrames([{ snapshot: state.snapshot, opacity: 1 }]);
        return;
      }
      const progress = Math.max(
        0,
        Math.min((now - state.startedAt) / FADE_MS, 1),
      );
      setFrames([
        { snapshot: state.from, opacity: 1 - progress },
        { snapshot: state.to, opacity: progress },
      ]);
      frame = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [snapshot, enabled]);

  return frames;
}
