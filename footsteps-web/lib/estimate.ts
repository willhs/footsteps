// "How we estimate this" (`?explain=1`, off until Will decides how, or whether, to show uncertainty): for one place and year,
// which sources and methods the map's people, way of life, land, sea and climate come from, and how far to trust each,
// in plain words. Pure: the panel (components/footsteps/overlays/EstimatePanel.tsx) only lays it out.
// Confidence is a word, never a number or a visual: it is how well the sources agree, not a statistical interval.
import estimates from './population_estimates.json';
import series from '../public/climate_series.json';
import { HYDE_MIN, dataStatus, calendarLabel, populationRangeAt, populationRangeLabel, populationLabel } from './time';

/** How far to trust a line: sources agree closely / roughly / differ several-fold / nobody measured it. */
export type Confidence = 'fair' | 'rough' | 'very rough' | 'imagined';

export type EstimateLine = {
  id: 'people' | 'between' | 'spread' | 'life' | 'groups' | 'land' | 'climate' | 'corrections';
  /** What on the map this line explains. */
  shapes: string;
  /** The source in a few words, shown before the line is opened. */
  cite: string;
  /** Where the numbers come from. */
  source: string;
  /** How they become what is drawn, in a sentence or two. */
  method: string;
  confidence: Confidence;
  /** Why that confidence, for this year (and place, where it matters). */
  why: string;
};

/** A known problem with the data at one place and time (research 0015's HYDE audit). */
export type PlaceCaveat = { text: string; source: string };

export type EstimateInput = {
  time: number;
  /** The place the panel is about: the selected spot, else the last hovered one, else the view centre. */
  lon: number;
  lat: number;
  /** Corrections that apply at this place and year (PR 155's tables), worded by their owner; empty when none or not wired. */
  corrections?: PlaceCaveat[];
};

type Spread = { year: number; low: number; high: number };
const SPREADS: Spread[] = (estimates as { years: Spread[] }).years;

/** Published world estimates for the year (research 0005): the lowest and highest, interpolated geometrically between years. */
export function worldSpreadAt(time: number): { low: number; high: number } | null {
  if (time < SPREADS[0].year || time > SPREADS[SPREADS.length - 1].year) return null;
  for (let i = 0; i < SPREADS.length - 1; i++) {
    const a = SPREADS[i];
    const b = SPREADS[i + 1];
    if (time >= a.year && time <= b.year) {
      const f = (time - a.year) / (b.year - a.year);
      return { low: a.low * Math.pow(b.low / a.low, f), high: a.high * Math.pow(b.high / a.high, f) };
    }
  }
  const last = SPREADS[SPREADS.length - 1];
  return { low: last.low, high: last.high };
}

/** How closely world estimates agree: within a third (fair), within three-fold (rough), or worse (very rough). */
export function agreement(low: number, high: number): Confidence {
  const ratio = high / low;
  return ratio < 1.5 ? 'fair' : ratio < 3 ? 'rough' : 'very rough';
}

const STEP_DOWN: Record<Confidence, Confidence> = { fair: 'rough', rough: 'very rough', 'very rough': 'very rough', imagined: 'imagined' };

/** Sea level and its 1σ at a year, from the same series the coasts are drawn at (lib/climate.ts). */
export function seaLevelWithSigma(time: number): { level: number; sigma: number } {
  const years: number[] = series.years;
  const levels: number[] = series.seaLevel.values;
  const sigmas: number[] = series.seaLevel.sigma;
  const t = Math.min(years[years.length - 1], Math.max(years[0], time));
  let i = years.findIndex((y) => y >= t);
  if (i <= 0) i = Math.max(1, i);
  const f = (t - years[i - 1]) / (years[i] - years[i - 1] || 1);
  return { level: levels[i - 1] + (levels[i] - levels[i - 1]) * f, sigma: sigmas[i - 1] + (sigmas[i] - sigmas[i - 1]) * f };
}

type Box = { west: number; east: number; south: number; north: number; from: number; to: number } & PlaceCaveat;

/** Where HYDE is known to be wrong, as rough boxes (research 0015, the world-model audit). A hint, not a mask. */
export const HYDE_CAVEATS: readonly Box[] = [
  {
    west: 112, east: 154, south: -44, north: -10, from: -10000, to: 1787,
    text: 'HYDE holds Australia flat at about 260,000 people until 1700; recent estimates for 1788 are 750,000 to 1.2 million.',
    source: 'research 0015',
  },
  {
    west: 60, east: 180, south: 50, north: 75, from: 1700, to: 1900,
    text: 'Siberia is undercounted around 1800: HYDE has about 97,000 people in Yakutia against roughly 200,000 Sakha.',
    source: 'research 0015',
  },
  {
    west: -73, east: -12, south: 59, north: 84, from: 500, to: 1300,
    text: 'HYDE leaves Greenland empty, though Late Dorset people lived there until about 1300.',
    source: 'research 0015',
  },
];

export function caveatsAt(lon: number, lat: number, time: number): PlaceCaveat[] {
  return HYDE_CAVEATS.filter((b) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north && time >= b.from && time <= b.to).map(
    ({ text, source }) => ({ text, source }),
  );
}

function peopleLine(time: number): EstimateLine {
  if (time < HYDE_MIN) {
    return {
      id: 'people',
      shapes: 'How many people, and where',
      cite: 'Footsteps’ forager model',
      source: 'Footsteps’ own model (research 0002): plant productivity from Beyer et al. 2020 climate, Tallavaara et al. 2018’s forager density fit, a table of first arrivals, scaled to published world totals',
      method: 'Puts a forager population of a published size where plants would feed it best. Nobody has counted these people: no census, no ground truth.',
      confidence: 'very rough',
      why: `The world total alone could be ${populationRangeLabel(populationRangeAt(time))}; where people sat within a region is a guess from habitat.`,
    };
  }
  const spread = worldSpreadAt(time);
  const conf = spread ? agreement(spread.low, spread.high) : 'rough';
  return {
    id: 'people',
    shapes: 'How many people, and where',
    cite: 'HYDE 3.5',
    source: 'HYDE 3.5 (Klein Goldewijk et al.), the standard reconstruction of historical population and land use',
    method:
      'Historians’ estimates for each country and era, shared out over its land by soil, climate, water and where people live today. Each map cell is about 10 km.',
    confidence: conf,
    why: spread
      ? `Published world totals for ${calendarLabel(time)} range ${populationLabel(spread.low)} to ${populationLabel(spread.high)}.`
      : 'HYDE gives one figure with no range.',
  };
}

function spreadLine(time: number): EstimateLine | null {
  if (time < HYDE_MIN) return null;
  const spread = worldSpreadAt(time);
  const world = spread ? agreement(spread.low, spread.high) : 'rough';
  return {
    id: 'spread',
    shapes: 'Which cells hold the people',
    cite: 'HYDE 3.5 weights',
    source: 'HYDE 3.5’s allocation weights',
    method:
      time < 1
        ? 'Before 1 CE HYDE shares out modern country totals, so the pattern still follows today’s borders and today’s towns.'
        : 'Within each country HYDE weights land by soil, climate, rivers and today’s settlement pattern.',
    confidence: STEP_DOWN[world],
    why:
      time < -4000
        ? 'HYDE’s split between continents is doubtful this early: at 10,000 BCE it puts half the world in the Americas and 5% in Africa. Local counts are rules, not records.'
        : 'Local counts are less certain than the world total: the weights are rules, not records of where people lived.',
  };
}

function betweenLine(time: number): EstimateLine | null {
  const { exact, y0, y1 } = dataStatus(time);
  if (exact) return null;
  const gap = y1 - y0;
  return {
    id: 'between',
    shapes: 'This year, between data years',
    cite: `${calendarLabel(y0)} and ${calendarLabel(y1)} blended`,
    source: `The people images for ${calendarLabel(y0)} and ${calendarLabel(y1)}`,
    method: 'Blended between the two, assuming steady growth (geometric). Wars, plagues and famines inside the gap do not show.',
    confidence: gap > 500 ? 'very rough' : 'rough',
    why: `The nearest data are ${gap.toLocaleString('en-US')} years apart.`,
  };
}

function lifeLine(time: number): EstimateLine {
  if (time < HYDE_MIN) {
    return {
      id: 'life',
      shapes: 'Way of life (forager, farmer, herder, town)',
      cite: 'all foragers',
      source: 'None before 10,000 BCE: everyone is drawn as foragers',
      method: 'Farming and herding had not begun anywhere, so all groups are bands.',
      confidence: 'fair',
      why: 'Domestication starts after 10,000 BCE in every record.',
    };
  }
  return {
    id: 'life',
    shapes: 'Way of life (forager, farmer, herder, town)',
    cite: 'HYDE land use',
    source: 'HYDE 3.5 cropland and grazing per cell, gated by the dates crops and herd animals reached each region',
    method: 'A cell’s share of cropland and grazing picks farmers, herders or foragers; dense cells become towns once a region has its first towns.',
    confidence: time < 1500 ? 'very rough' : 'rough',
    why:
      time < 1500
        ? 'Before about 1500 HYDE’s land use is an allocation per head of population, not observed fields.'
        : 'Land use after 1500 draws on recorded farmland, still shared out by rules.',
  };
}

const GROUPS_LINE: EstimateLine = {
  id: 'groups',
  shapes: 'Bands, villages and camps close in',
  cite: 'ethnographic analogs',
  source: 'Group sizes and layouts from ethnographic analogs (D-PLACE: Ethnographic Atlas, Binford), placed on flat land near fresh water',
  method: 'Each cell’s people are split into groups the size recorded societies like them lived in, then set on the best-ranked spots.',
  confidence: 'imagined',
  why: 'The total in the cell is the estimate; each group’s exact place and size is illustrative. The ethnographic present is not the past.',
};

function landLine(time: number): EstimateLine {
  const { level, sigma } = seaLevelWithSigma(time);
  const deep = Math.abs(level) > 5;
  return {
    id: 'land',
    shapes: 'Coasts, land cover and ice',
    cite: 'Spratt & Lisiecki 2025, Krapp 2021',
    source: 'Sea level: Spratt & Lisiecki 2025. Biomes: Krapp et al. 2021. Relief: today’s elevation and seabed (Terrain Tiles)',
    method: 'The sea is drawn at the year’s level over today’s relief and seabed; biomes come from a vegetation model driven by past climate.',
    confidence: deep ? 'rough' : 'fair',
    why: deep
      ? `Sea level ${Math.round(level)} m ± ${Math.round(sigma)} m. Today’s seabed stands in for the old ground: sediment and rebounding land since then are ignored, so old coasts are approximate.`
      : 'The sea has been within a few metres of today’s for 7,000 years; small coast changes (deltas, silted harbours) are not drawn.',
  };
}

function climateLine(time: number): EstimateLine {
  const bp = 1950 - time;
  return {
    id: 'climate',
    shapes: 'Temperature and rain (hover card)',
    cite: 'Beyer et al. 2020',
    source: 'Beyer, Krapp & Manica 2020, a palaeoclimate model downscaled to 0.5°',
    method: bp > 22000 ? 'Model snapshots every 2,000 years, blended between.' : 'Model snapshots every 1,000 years, blended between.',
    confidence: 'rough',
    why:
      time > 0
        ? 'The last 2,000 years are nearly flat in the model: the Medieval Warm Period and Little Ice Age do not show.'
        : 'A climate model, checked against pollen and ice cores at a few times; regional rain is the least certain part.',
  };
}

/** Everything the panel says for one place and year, people first. */
export function estimateLines({ time }: Pick<EstimateInput, 'time'>): EstimateLine[] {
  return [peopleLine(time), spreadLine(time), betweenLine(time), lifeLine(time), GROUPS_LINE, landLine(time), climateLine(time)].filter(
    (l): l is EstimateLine => l !== null,
  );
}

/** Notes about this place at this year: corrections Footsteps makes, then known problems with the data. */
export function placeNotes({ time, lon, lat, corrections = [] }: EstimateInput): PlaceCaveat[] {
  return [...corrections, ...caveatsAt(lon, lat, time)];
}

/** Whether `?explain=1` is set. */
export function explainParam(search: string): boolean {
  return new URLSearchParams(search).get('explain') === '1';
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  fair: 'Fair',
  rough: 'Rough',
  'very rough': 'Very rough',
  imagined: 'Illustrative',
};

