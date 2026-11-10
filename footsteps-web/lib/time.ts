// Continuous time: the slider moves through any year; HYDE data years are
// labelled points along it, not stops. Everything between data years is an
// estimate (geometric interpolation, since populations grow multiplicatively).
import { TARGET_YEARS, TERRAIN_YEARS } from './constants';

/** Reference "now" for years-ago labels. */
export const NOW = 2025;
export const TIME_MIN = TARGET_YEARS[0];
export const TIME_MAX = TARGET_YEARS[TARGET_YEARS.length - 1];

/** World totals per data year from the population images (grid_image.py). */
export const HYDE_TOTALS: Record<number, number> = {
  [-10000]: 4.59e6, [-9000]: 5.8e6, [-8000]: 7.46e6, [-7000]: 9.84e6,
  [-6000]: 13.54e6, [-5000]: 19.55e6, [-4000]: 29.46e6, [-3000]: 45.54e6,
  [-2000]: 74.43e6, [-1000]: 113.42e6, 0: 238.73e6, 100: 243.57e6,
  200: 247.29e6, 300: 233.71e6, 400: 247.84e6, 500: 259.4e6, 600: 277.64e6,
  700: 284.36e6, 800: 291.87e6, 900: 317.82e6, 1000: 330.53e6,
  1100: 407.23e6, 1200: 455.6e6, 1300: 467.94e6, 1400: 453.33e6,
  1500: 516.03e6, 1600: 530.95e6, 1700: 608.84e6, 1800: 991.54e6,
  1900: 1730.31e6,
};

export const clampTime = (t: number) => Math.min(TIME_MAX, Math.max(TIME_MIN, t));

/** The two `years` (ascending) either side of `time`, and how far between them (0..1). */
function bracketIn(years: readonly number[], time: number): { y0: number; y1: number; f: number } {
  const t = clampTime(time);
  for (let i = 0; i < years.length - 1; i++) {
    const y0 = years[i];
    const y1 = years[i + 1];
    if (t >= y0 && t <= y1) return { y0, y1, f: (t - y0) / (y1 - y0) };
  }
  const last = years[years.length - 1];
  return { y0: last, y1: last, f: 0 };
}

/** The data years either side of `time`, and how far between them (0..1). */
export function bracket(time: number): { y0: number; y1: number; f: number } {
  return bracketIn(TARGET_YEARS, time);
}

/** The terrain images either side of `time`, cross-faded by `f`. */
export function terrainBracket(time: number): { y0: number; y1: number; f: number } {
  return bracketIn(TERRAIN_YEARS, time);
}

/** The data year to use where a view can only show whole data years. */
export function nearestDataYear(time: number): number {
  const { y0, y1, f } = bracket(time);
  return f < 0.5 ? y0 : y1;
}

export function populationAt(time: number): number {
  const { y0, y1, f } = bracket(time);
  const p0 = HYDE_TOTALS[y0];
  const p1 = HYDE_TOTALS[y1];
  return p0 * Math.pow(p1 / p0, f);
}

/** "data year" when within a hair of one, else "estimated between a and b". */
export function dataStatus(time: number): { exact: boolean; y0: number; y1: number } {
  const { y0, y1, f } = bracket(time);
  const tolerance = 0.5 / Math.max(1, y1 - y0);
  return { exact: f <= tolerance || f >= 1 - tolerance, y0, y1 };
}

// Lives-lived scale: position proportional to person-years since TIME_MIN.
const STEP = 5;
const SAMPLES = Math.ceil((TIME_MAX - TIME_MIN) / STEP) + 1;
let cumulative: Float64Array | null = null;
function cum(): Float64Array {
  if (cumulative) return cumulative;
  cumulative = new Float64Array(SAMPLES);
  for (let i = 1; i < SAMPLES; i++) {
    cumulative[i] = cumulative[i - 1] + populationAt(TIME_MIN + (i - 0.5) * STEP) * STEP;
  }
  return cumulative;
}
/** Share of person-years (TIME_MIN..TIME_MAX) lived before `time`, 0..1. */
export function livesFraction(time: number): number {
  const c = cum();
  const x = (clampTime(time) - TIME_MIN) / STEP;
  const i = Math.min(SAMPLES - 2, Math.floor(x));
  return (c[i] + (c[i + 1] - c[i]) * (x - i)) / c[SAMPLES - 1];
}
/** Inverse of livesFraction. */
export function timeAtLivesFraction(q: number): number {
  const c = cum();
  const target = Math.min(1, Math.max(0, q)) * c[SAMPLES - 1];
  let lo = 0;
  let hi = SAMPLES - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = c[hi] - c[lo] || 1;
  return clampTime(TIME_MIN + (lo + (target - c[lo]) / span) * STEP);
}

const int = (n: number) => Math.round(n).toLocaleString('en-US');
export function calendarLabel(time: number): string {
  const y = Math.round(time);
  const n = Math.abs(y);
  // "1800 CE", "3000 BCE", but "10,000 BCE": calendar years read without a
  // thousands separator below 10,000.
  const text = n >= 10000 ? int(n) : String(n);
  return y < 0 ? `${text} BCE` : `${text} CE`;
}
export function agoLabel(time: number): string {
  return `${int(NOW - time)} years ago`;
}
export function populationLabel(p: number): string {
  if (p >= 1e9) return `${(p / 1e9).toFixed(2)} billion`;
  return `${(p / 1e6).toFixed(p < 1e7 ? 1 : 0)} million`;
}
