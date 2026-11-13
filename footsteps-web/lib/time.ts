// Continuous time: the slider moves through any year; people-image years are
// labelled points along it, not stops. Everything between them is an
// estimate (geometric interpolation, since populations grow multiplicatively).
// From 10,000 BCE the people are HYDE's (measured); before that they are the
// MODEL in footstep-generator/prehistory_population.py, and say so.
import prehistory from '../public/prehistory_totals.json';
import { PEOPLE_YEARS, TARGET_YEARS, TERRAIN_YEARS } from './constants';

/** Reference "now" for years-ago labels. */
export const NOW = 2025;
/** The slider reaches back to the oldest terrain image (100,000 BCE)... */
export const TIME_MIN = TERRAIN_YEARS[0];
export const TIME_MAX = TARGET_YEARS[TARGET_YEARS.length - 1];
/** ...HYDE population data starts here; before it people are modelled. */
export const HYDE_MIN = TARGET_YEARS[0];

/** Where a year's people come from: HYDE head counts, or the pre-HYDE model. */
export type Evidence = 'modelled' | 'measured';
export const evidenceAt = (time: number): Evidence => (time < HYDE_MIN ? 'modelled' : 'measured');

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

/** World total at a people-image year. Measured years have no range (low = high). */
export type PopulationRange = { low: number; central: number; high: number };

/** World totals per people-image year: the model's low / central / high before
 * HYDE (prehistory_population.py), HYDE's single figure from 10,000 BCE. */
export const PEOPLE_TOTALS: Record<number, PopulationRange> = {
  ...Object.fromEntries(
    prehistory.years.map((y, i): [number, PopulationRange] => [
      y,
      { low: prehistory.low[i], central: prehistory.central[i], high: prehistory.high[i] },
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(HYDE_TOTALS).map(([y, t]): [number, PopulationRange] => [Number(y), { low: t, central: t, high: t }]),
  ),
};

export const clampTime = (t: number) => Math.min(TIME_MAX, Math.max(TIME_MIN, t));

/** The two `years` (ascending) either side of `time`, and how far between them (0..1). */
function bracketIn(years: readonly number[], time: number): { y0: number; y1: number; f: number } {
  const t = Math.min(years[years.length - 1], Math.max(years[0], time));
  for (let i = 0; i < years.length - 1; i++) {
    const y0 = years[i];
    const y1 = years[i + 1];
    if (t >= y0 && t <= y1) return { y0, y1, f: (t - y0) / (y1 - y0) };
  }
  const last = years[years.length - 1];
  return { y0: last, y1: last, f: 0 };
}

/** The people-image years either side of `time`, and how far between them (0..1). */
export function bracket(time: number): { y0: number; y1: number; f: number } {
  return bracketIn(PEOPLE_YEARS, time);
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

/** World population at `time`: the range between the people-image years either
 * side, each of low / central / high interpolated geometrically. */
export function populationRangeAt(time: number): PopulationRange {
  const { y0, y1, f } = bracket(time);
  const a = PEOPLE_TOTALS[y0];
  const b = PEOPLE_TOTALS[y1];
  const mix = (p: number, q: number) => p * Math.pow(q / p, f);
  return { low: mix(a.low, b.low), central: mix(a.central, b.central), high: mix(a.high, b.high) };
}

/** The central estimate of `populationRangeAt`. */
export function populationAt(time: number): number {
  return populationRangeAt(time).central;
}

/** "data year" (a people-image year) when within a hair of one, else "estimated between a and b". */
export function dataStatus(time: number): { exact: boolean; y0: number; y1: number } {
  const { y0, y1, f } = bracket(time);
  const tolerance = 0.5 / Math.max(1, y1 - y0);
  return { exact: f <= tolerance || f >= 1 - tolerance, y0, y1 };
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
  if (p < 1e6) return `${sig(p / 1e3)} thousand`;
  return `${(p / 1e6).toFixed(p < 1e7 ? 1 : 0)} million`;
}

/** Two significant figures, no trailing zeros: 2.1, 10, 480. */
const sig = (n: number) => String(Number(n.toPrecision(2)));

/** "2.1–8.3 million" for a modelled range; `populationLabel` of the single figure when there is no range (HYDE). */
export function populationRangeLabel({ low, central, high }: PopulationRange): string {
  if (high - low < high * 1e-6) return populationLabel(central); // measured: no range
  const [unit, div] = high >= 1e6 ? ['million', 1e6] : ['thousand', 1e3];
  const lo = sig(low / div);
  const hi = sig(high / div);
  return lo === hi ? `${hi} ${unit}` : `${lo}–${hi} ${unit}`;
}
