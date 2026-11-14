// The time bar's fixed scale and the small rules for moving along it.
// One track, log of years ago: the deep past is compressed, recent history roomy.
// The scale never changes at runtime; precision comes from scrubbing off the bar, keys or typing.
import { NOW, TIME_MAX, TIME_MIN, clampTime } from './time';

/** Years-ago offset: larger keeps recent centuries from taking most of the bar. */
const K = 400;
const lg = (time: number) => Math.log(NOW - time + K);
const LG_MIN = lg(TIME_MAX); // right end
const LG_SPAN = lg(TIME_MIN) - LG_MIN;

/** Position on the bar, 0 (oldest) to 1 (latest). */
export function posAt(time: number): number {
  return 1 - (lg(clampTime(time)) - LG_MIN) / LG_SPAN;
}

/** The year at a bar position (clamped). */
export function timeAt(pos: number): number {
  const p = Math.min(1, Math.max(0, pos));
  return clampTime(NOW + K - Math.exp(LG_MIN + (1 - p) * LG_SPAN));
}

/** Years per whole bar width at `time` (the local slope dt/dpos). */
export function yearsPerPos(time: number): number {
  return (NOW - clampTime(time) + K) * LG_SPAN;
}

/** A round step (1, 2 or 5 x 10^k years) at least `raw`. */
function niceAtLeast(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  for (const m of [1, 2, 5]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/** Arrow-key step near `time`: about 0.25% of the bar, rounded; `big` is 10x. */
export function keyStep(time: number, big: boolean): number {
  return niceAtLeast(yearsPerPos(time) * 0.0025) * (big ? 10 : 1);
}

/** The next round year from `time` in `dir`, on multiples of the key step. */
export function stepTime(time: number, dir: 1 | -1, big: boolean): number {
  // Take the step from the side we are moving into, so steps stay even across scale changes.
  const step = keyStep(dir > 0 ? time : time - 1, big);
  const k = time / step;
  const next = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return clampTime(next * step);
}

/**
 * A typed year to a slider year, or null. Accepts "1347", "1347 CE", "AD 800",
 * "-500", "500 BC", "10,000 BCE", "12k BCE", "12000 years ago", "50 ka".
 */
export function parseYear(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  const m = s.match(/^(ad |ce )?(-)?(\d+(?:\.\d+)?)\s*(k|ka)?\s*(bce|bc|ce|ad|years ago|yrs ago|ago|ya)?$/);
  if (!m) return null;
  const [, pre, minus, num, kilo, suffix] = m;
  let n = Number(num) * (kilo ? 1000 : 1);
  if (!Number.isFinite(n)) return null;
  const ago = suffix === 'years ago' || suffix === 'yrs ago' || suffix === 'ago' || suffix === 'ya' || kilo === 'ka';
  let year: number;
  if (ago) {
    if (pre || minus) return null;
    year = NOW - n;
  } else {
    const bce = suffix === 'bce' || suffix === 'bc';
    if (bce && (pre || minus)) return null;
    if (minus) n = -n;
    year = bce ? -n : n;
  }
  return clampTime(Math.round(year));
}

/**
 * A drag along the bar. On the bar the needle stays under the finger (rough seek).
 * Sliding the finger up or down off the bar, while still dragging, slows the needle
 * to a fixed fraction of the finger: a visible, chosen mode rather than one guessed
 * from speed. Back on the bar, the needle eases back under the finger as it moves.
 */
export type Drag = { pos: number; x: number; gain: number };

/** Speed levels by distance (px) off the bar: 1:1 on it, then 1/4, then 1/16. */
export const SCRUB_LEVELS = [
  { from: 0, gain: 1, label: '' },
  { from: 40, gain: 1 / 4, label: '¼ speed' },
  { from: 110, gain: 1 / 16, label: '1/16 speed' },
] as const;

export function scrubLevel(offBar: number) {
  let level: (typeof SCRUB_LEVELS)[number] = SCRUB_LEVELS[0];
  for (const l of SCRUB_LEVELS) if (offBar >= l.from) level = l;
  return level;
}

export function dragStart(time: number, x: number): Drag {
  return { pos: posAt(time), x, gain: 1 };
}

/**
 * Next drag state for the pointer at `x` (px), `offBar` px above or below the bar;
 * `fingerPos` is the finger's x on the bar (0..1).
 */
export function dragMove(d: Drag, x: number, offBar: number, width: number, fingerPos: number): Drag {
  const dx = x - d.x;
  const { gain } = scrubLevel(offBar);
  let pos = d.pos + (dx / Math.max(1, width)) * gain;
  if (gain === 1) {
    // Ease back under the finger over ~60px of movement (no jump after fine work).
    pos += (fingerPos - pos) * Math.min(1, Math.abs(dx) / 60);
  }
  return { pos: Math.min(1, Math.max(0, pos)), x, gain };
}

/** Wheel/trackpad nudge, as a fraction of the bar per pixel of scroll. */
export const WHEEL_GAIN = 0.12;

/** The few labels under the bar. */
export const BAR_LABELS: { time: number; text: string }[] = [
  { time: -100000, text: '100k BCE' },
  { time: -50000, text: '50k' },
  { time: -20000, text: '20k' },
  { time: -10000, text: '10k' },
  { time: 0, text: '0' },
  { time: 1000, text: '1000' },
  { time: 1900, text: '1900' },
].filter((l) => l.time >= TIME_MIN && l.time <= TIME_MAX);
