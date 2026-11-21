// Code that only some visits need (the close-up 3D, opt-in features) loads on first use instead of with the page
// (docs/ops/first-load.md). One `Lazy` per dynamic import, at module level, so every caller shares one download.
//
//   const CLOSE3D = lazy(() => import('../layers/Close3DLayer'));
//   const mod = useLazy(CLOSE3D, close3d);     // null until wanted and loaded; then the module, for good
//   if (mod) layers.push(new mod.default({...}));
import { useEffect, useState } from 'react';
import { FIRST_PEOPLE, marked } from './firstLoadMarks';

export type Lazy<T> = {
  /** Starts the download once; later calls share it. */
  load: () => Promise<T>;
  /** The module if it has loaded, else null. */
  current: () => T | null;
};

export function lazy<T>(importer: () => Promise<T>): Lazy<T> {
  let promise: Promise<T> | null = null;
  let value: T | null = null;
  return {
    load: () =>
      (promise ??= importer().then(
        (m) => (value = m),
        (error) => {
          promise = null; // a failed chunk (offline, a deploy in between) can be tried again
          throw error;
        },
      )),
    current: () => value,
  };
}

/** The module once `wanted` has been true and it has loaded; null before. Never goes back to null. */
export function useLazy<T>(mod: Lazy<T>, wanted: boolean): T | null {
  const [value, setValue] = useState<T | null>(mod.current);
  useEffect(() => {
    if (!wanted || value) return;
    let live = true;
    mod
      .load()
      .then((m) => live && setValue(() => m))
      .catch((error) => console.warn('[lazy] failed to load a chunk', error));
    return () => {
      live = false;
    };
  }, [mod, wanted, value]);
  return value;
}

/**
 * Loads `mod` in the background once the first people are on screen and the main thread is idle, so a later zoom or
 * click does not wait for it. Returns a cancel function (for an effect's cleanup).
 */
export function prefetchAfterFirstPeople(mod: Lazy<unknown>): () => void {
  let timer = 0;
  let idle = 0;
  const idleCb = (cb: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 3000 }) : window.setTimeout(cb, 200);
  const tick = () => {
    if (!marked(FIRST_PEOPLE)) {
      timer = window.setTimeout(tick, 250);
      return;
    }
    idle = idleCb(() => void mod.load().catch(() => {}));
  };
  tick();
  return () => {
    window.clearTimeout(timer);
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    else window.clearTimeout(idle);
  };
}
