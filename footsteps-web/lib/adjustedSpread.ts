// The climate-adjusted HYDE spread (`?spread=1`, off by default until Will has reviewed it): HYDE's people for 10,000–4,000 BCE
// moved within continent-scale regions by climate then vs today (Green Sahara, exposed shelves), regional totals kept.
// Baked by footstep-generator/hyde_climate_spread.py into data/tiles/grid_adjusted/, served at /grid/adjusted/ in the same
// encoding as /grid/. This file owns the flag, its years and its words. See docs/ops/hyde-climate-spread.md.
import { HYDE_TOTALS } from './time';
import type { PeopleMode } from './pastWater';

/** Years with an adjusted image: the generator's default YEARS (hyde_climate_spread.py). Every other year reads HYDE's image. */
export const ADJUSTED_SPREAD_YEARS: readonly number[] = [-10000, -9000, -8000, -7000, -6000, -5000, -4000];

/** What every screen showing these people says in place of "measured". */
export const ADJUSTED_SPREAD_LABEL = 'Adjusted spread (modelled on HYDE)';

/** The adjusted image must keep HYDE's world total. HYDE_TOTALS is rounded to 3 significant figures (≤ 0.5%) and the generator keeps
 * totals to grid_image.TOTAL_RTOL (3e-4), so a miss beyond 1% is a wrong file, never rounding. */
export const SPREAD_TOTAL_RTOL = 0.01;

const METHOD =
  "HYDE 3.5 spreads early people by today's land; here they are moved within continent-scale regions toward where the climate then let them live "
  + '(the Green Sahara, Doggerland, Sundaland, Beringia, the Sahul shelf), keeping each region’s total, so the world total is HYDE’s. '
  + 'A model on top of a model: new people sit in ~55 km blocks.';

/** `?spread=1` turns it on. Read once per page load by the page and the grid worker. */
export function spreadParam(search: string): boolean {
  return new URLSearchParams(search).get('spread') === '1';
}

export function adjustedSpreadYear(year: number): boolean {
  return ADJUSTED_SPREAD_YEARS.includes(year);
}

export function adjustedGridUrl(year: number): string {
  return `/grid/adjusted/humans_${year}.webp`;
}

/** Does a decoded adjusted image keep HYDE's world total for its year? False for a year with no HYDE total. */
export function spreadTotalOk(total: number, year: number): boolean {
  const hyde = HYDE_TOTALS[year];
  return hyde !== undefined && Math.abs(total - hyde) <= SPREAD_TOTAL_RTOL * hyde;
}

/**
 * The note under the counter with the flag on. `year` is the data year on screen; `adjusted` is whether the grid on screen came from the
 * adjusted image (GridData.adjusted), undefined while it loads. The words follow what is drawn, never just the flag.
 */
export function spreadNote(year: number, mode: PeopleMode, adjusted: boolean | undefined): { label: string; title: string } {
  if (mode === 'dots') {
    return { label: 'Adjusted spread: not applied to Dots', title: `Dots is a static archive of HYDE's own spread; switch to Units or Grid to see the adjusted one. ${METHOD}` };
  }
  if (!adjustedSpreadYear(year)) {
    return {
      label: 'Adjusted spread: 10,000–4,000 BCE only; unchanged here',
      title: `The adjustment covers 10,000 to 4,000 BCE (the African Humid Period and low seas). Other dates are drawn as without the flag. ${METHOD}`,
    };
  }
  if (adjusted === undefined) return { label: `${ADJUSTED_SPREAD_LABEL}: loading`, title: METHOD };
  if (!adjusted) {
    return {
      label: "Adjusted spread unavailable: showing HYDE's",
      title: `The adjusted image for this year could not be read (not published yet, or its total did not match HYDE's), so HYDE's own spread is drawn. ${METHOD}`,
    };
  }
  return { label: ADJUSTED_SPREAD_LABEL, title: METHOD };
}
