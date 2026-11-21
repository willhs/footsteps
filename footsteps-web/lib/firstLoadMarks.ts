// First-load signals for scripts/first-load.mjs (docs/ops/first-load.md): User Timing marks, set once per page load.
// `first-globe`: the first deck.gl frame drawn with the Earth (era images, or the plain sea with terrain off).
// `first-people`: the first frame drawn with the year's people layers (firelight, grid, units, or Dots).
export const FIRST_GLOBE = 'footsteps:first-globe';
export const FIRST_PEOPLE = 'footsteps:first-people';
export type FirstLoadMark = typeof FIRST_GLOBE | typeof FIRST_PEOPLE;

const done = new Set<FirstLoadMark>();

/** Sets the mark the first time only; true when it was set now. */
export function markOnce(name: FirstLoadMark): boolean {
  if (done.has(name) || typeof performance === 'undefined' || typeof performance.mark !== 'function') return false;
  done.add(name);
  performance.mark(name);
  return true;
}

/** True once the mark is set. */
export const marked = (name: FirstLoadMark) => done.has(name);
