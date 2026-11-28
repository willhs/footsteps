// The hover card's "Languages spreading here" line behind ?langs=deep: cited expansions (research 0007 steps 2-3,
// docs/ops/languages.md) from footstep-generator/anthropology/languages_expansions.yaml, compiled to
// public/languages/expansions.json. Pure: the hook fetches the table, this picks the rows for a place and year and words them.

/** 5,000 years before 1950. Nothing is said earlier, whatever a row says (the research's rule). */
export const EXPANSIONS_FLOOR_YEAR = -3050;
const BP_ZERO = 1950;

/** [south, west, north, east] degrees on the 5° atlas grid; half-open (south ≤ lat < north, west ≤ lon < east). */
export type Box = [number, number, number, number];

export type ExpansionRow = {
  id: string;
  family: string;
  glottocode: string;
  /** First year the row may be shown: its start, or the older end of its range, never before the floor. */
  from_year: number;
  /** Historical rows: the start year (CE, negative BCE). */
  start_year?: number;
  /** Deep rows: the study's start range, years before 1950, [recent end, older end]. */
  range_bp?: [number, number];
  boxes: Box[];
  disputed: boolean;
  /** Short source for the card ("Koile et al. 2022"). */
  cite: string;
  /** The date was read in the source this table cites (DOI or publisher page); otherwise the YAML says why not. */
  checked: boolean;
};

export type ExpansionData = { version: number; checked_on: string; floor_year: number; note: string; rows: ExpansionRow[] };

export const langsDeepEnabled = (search: string) => new URLSearchParams(search).get('langs') !== '0';

const inBox = ([s, w, n, e]: Box, lon: number, lat: number) => lat >= s && lat < n && lon >= w && lon < e;

/** The rows spreading in this place by this year, oldest first. Empty before the 5 ka floor. */
export function expansionsHere(data: ExpansionData, lon: number, lat: number, year: number): ExpansionRow[] {
  if (year < EXPANSIONS_FLOOR_YEAR) return [];
  return data.rows
    .filter((r) => year >= Math.max(r.from_year, EXPANSIONS_FLOOR_YEAR) && r.boxes.some((b) => inBox(b, lon, lat)))
    .sort((a, b) => a.from_year - b.from_year);
}

const hundreds = (n: number) => (Math.round(n / 100) * 100).toLocaleString('en-US');

/** "from 1519 CE", "from about 1190-1290 CE", "from about 4,000-5,000 years ago", "from about 5,200 years ago". */
export function startWords(r: Pick<ExpansionRow, 'start_year' | 'range_bp'>): string {
  if (r.start_year !== undefined) return r.start_year < 0 ? `from ${-r.start_year} BCE` : `from ${r.start_year} CE`;
  const [lo, hi] = r.range_bp ?? [0, 0];
  const [early, late] = [BP_ZERO - hi, BP_ZERO - lo];
  if (early >= 1) return early === late ? `from about ${early} CE` : `from about ${early}-${late} CE`;
  const [a, b] = [hundreds(lo), hundreds(hi)];
  return a === b ? `from about ${b} years ago` : `from about ${a}-${b} years ago`;
}

export function expansionLine(rows: ExpansionRow[]): { text: string; detail: string } {
  // One short line (Will, 2026-11-28): family and when; the citation stays in the table.
  const items = rows.map((r) => `${r.family} (${startWords(r)}${r.disputed ? ', disputed' : ''})`);
  const unverified = rows.some((r) => !r.checked);
  return { text: `Spreading: ${items.join('; ')}`, detail: unverified ? 'cited, not all verified · rough areas' : 'cited · rough areas' };
}
