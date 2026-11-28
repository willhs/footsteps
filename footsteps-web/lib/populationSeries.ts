// The world-population chart behind `?chart=1` (components/ui/PopulationChart.tsx): what it draws, as plain numbers.
// One source of truth: the counter's own totals (`PEOPLE_TOTALS` in time.ts: the model's low / central / high before
// HYDE, HYDE's single figure from HYDE_MIN) and the time bar's own scale (`posAt` / `timeAt` in timeScale.ts), so a
// year is the same fraction of the chart's width as of the bar's. Nothing here is read from anywhere else.
import { PEOPLE_YEARS } from './constants';
import { PEOPLE_TOTALS, evidenceAt, populationAt } from './time';
import { posAt } from './timeScale';

/** A point of the modelled band: x along the time axis (0 oldest .. 1 latest), people low..high, and the central estimate. */
export type BandPoint = { year: number; x: number; low: number; central: number; high: number };
/** A point of the measured (HYDE) line. */
export type LinePoint = { year: number; x: number; people: number };

export type PopulationSeries = {
  /** Modelled years before HYDE_MIN, then one join point AT HYDE_MIN where the band has closed to HYDE's figure. */
  modelled: BandPoint[];
  /** HYDE's measured totals from HYDE_MIN: the solid line. Its first point is the band's last. */
  measured: LinePoint[];
};

/** Build the series from the counter's totals. The join is the one place both parts meet: the band's last point is
 * the line's first (low = central = high = HYDE's figure), so there is no gap between them and no year drawn twice. */
export function buildSeries(years: readonly number[] = PEOPLE_YEARS): PopulationSeries {
  const modelled: BandPoint[] = [];
  const measured: LinePoint[] = [];
  for (const year of years) {
    const { low, central, high } = PEOPLE_TOTALS[year];
    if (evidenceAt(year) === 'modelled') modelled.push({ year, x: posAt(year), low, central, high });
    else measured.push({ year, x: posAt(year), people: central });
  }
  const first = measured[0];
  modelled.push({ year: first.year, x: first.x, low: first.people, central: first.people, high: first.people });
  return { modelled, measured };
}

/** The vertical axis: log10 of people, fitted to the data with a little room (the model's lowest low is 100,000; the rough modern years end at 8.2 billion). */
export const Y_MIN = 7e4;
export const Y_MAX = 1.2e10;
const LY_MIN = Math.log10(Y_MIN);
const LY_SPAN = Math.log10(Y_MAX) - LY_MIN;

/** Height on the chart for a head count, 0 (bottom) .. 1 (top); clamped. */
export function yAt(people: number): number {
  return Math.min(1, Math.max(0, (Math.log10(Math.max(1, people)) - LY_MIN) / LY_SPAN));
}

/** The year marker: where the slider year sits across the chart and how high the world total is there. */
export function markerAt(time: number): { x: number; y: number } {
  return { x: posAt(time), y: yAt(populationAt(time)) };
}
