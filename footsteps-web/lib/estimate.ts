// "How we estimate this" (`?explain=1`, off until Will decides how, or whether, to show uncertainty): for one place and year,
// which sources and methods the map's people, way of life, land, sea and climate come from, and how far to trust each,
// in plain words. Pure: the panel (components/footsteps/overlays/EstimatePanel.tsx) only lays it out.
// Confidence is a word, never a number or a visual: it is how well the sources agree, not a statistical interval.
import estimates from './population_estimates.json';
import series from '../public/climate_series.json';
import { unsettledAt } from './firstSettlement';
import { FIRST_CITIES, citiesBy } from './firstCities';
import { MISSING_ISLANDS, islandPeopleAt } from './missingIslands';
import { REGION_TOTALS, inRegion, regionWeightAt } from './regionTotals';
import { HYDE_MIN, dataStatus, calendarLabel, populationRangeAt, populationRangeLabel, populationLabel } from './time';
import type { IconName } from './icons';

/** How far to trust a line: sources agree closely / roughly / differ several-fold / nobody measured it. */
export type Confidence = 'fair' | 'rough' | 'very rough' | 'imagined';

export type EstimateLine = {
  id: 'people' | 'continents' | 'between' | 'spread' | 'life' | 'groups' | 'land' | 'climate' | 'corrections';
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
    text: 'HYDE likely undercounts Australia: ~260k here, 0.75–1.2M by newer estimates for 1788.',
    source: 'research 0015',
  },
  {
    west: 60, east: 180, south: 50, north: 75, from: 1700, to: 1900,
    text: 'HYDE likely undercounts Siberia: ~97k in Yakutia vs ~200k Sakha.',
    source: 'research 0015',
  },
  {
    west: -73, east: -12, south: 59, north: 84, from: 500, to: 1300,
    text: 'HYDE leaves Greenland empty; Dorset people lived here.',
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
      shapes: 'People',
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
    shapes: 'People',
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

function spreadLine(time: number, adjusted: boolean): EstimateLine | null {
  if (time < HYDE_MIN) return null;
  const spread = worldSpreadAt(time);
  const world = spread ? agreement(spread.low, spread.high) : 'rough';
  if (adjusted) {
    return {
      id: 'spread',
      shapes: 'Where in the region',
      cite: 'HYDE + past climate',
      source: 'HYDE 3.5, adjusted spread (docs/ops/hyde-climate-spread.md), Beyer et al. 2020 climate',
      method:
        'HYDE’s people are moved within continent-scale regions toward where the climate then let people live (the Green Sahara, the dry shelves); each region keeps HYDE’s total.',
      confidence: 'very rough',
      why: 'A model on top of HYDE, and HYDE’s split between continents is itself doubtful this early.',
    };
  }
  return {
    id: 'spread',
    shapes: 'Where in the region',
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
    shapes: 'Between data years',
    cite: `${calendarLabel(y0)} ↔ ${calendarLabel(y1)}`,
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
      shapes: 'Way of life',
      cite: 'all foragers',
      source: 'None before 10,000 BCE: everyone is drawn as foragers',
      method: 'Farming and herding had not begun anywhere, so all groups are bands.',
      confidence: 'fair',
      why: 'Domestication starts after 10,000 BCE in every record.',
    };
  }
  return {
    id: 'life',
    shapes: 'Way of life',
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
  shapes: 'Groups close in',
  cite: 'recorded societies',
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
    shapes: 'Coasts and land',
    cite: 'sea level, biomes',
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
    shapes: 'Climate',
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

/** 13,000-3000 BCE: each continent's total re-weighted from HYDE's to the forager model's share (lib/holoceneShares.ts, research 0016). */
function continentsLine(time: number): EstimateLine | null {
  if (time < -13000 || time > -3000) return null;
  return {
    id: 'continents',
    shapes: 'Continent totals',
    cite: 'forager model, fading to HYDE',
    source: 'lib/holoceneShares.ts (research 0016): the pre-HYDE forager model’s continental shares',
    method:
      'HYDE’s early split between continents is a shrunken modern map, so each continent’s total is set to the forager model’s share, fading back to HYDE’s by 3000 BCE. West Asia is kept as HYDE has it.',
    confidence: 'very rough',
    why: 'Two models handing over; no count of people by continent exists for these years.',
  };
}

/** Corrections Footsteps makes to HYDE and the model at this place and year (PR 155's tables), one short line each. */
export function correctionsAt(lon: number, lat: number, time: number): PlaceCaveat[] {
  const out: PlaceCaveat[] = [];
  const empty = unsettledAt(lon, lat, time);
  if (empty) {
    out.push(
      'year' in empty
        ? { text: `No one here yet: first settlers by ${calendarLabel(empty.year)}.`, source: empty.source }
        : { text: `Left empty: ${empty.name.toLowerCase()}.`, source: empty.source },
    );
  }
  if (time >= HYDE_MIN && !citiesBy(lon, lat, time)) {
    const region = FIRST_CITIES.find(({ box: [w, e, s, n] }) => lon >= w && lon <= e && lat >= s && lat <= n);
    if (region) out.push({ text: `No towns yet: first towns here ${calendarLabel(region.year)}.`, source: region.source });
  }
  for (const island of MISSING_ISLANDS) {
    const near = island.centres.some(([x, y]) => Math.hypot(x - lon, y - lat) <= island.radiusDeg * 3);
    const people = near ? islandPeopleAt(island, time) : 0;
    if (people > 0) out.push({ text: `Added: HYDE has no one on ${island.name}; ~${Math.round(people).toLocaleString('en-US')} from the literature.`, source: island.source });
  }
  for (const region of REGION_TOTALS) {
    if (inRegion(region, lon, lat) && regionWeightAt(region, time) > 0) {
      out.push({ text: `Raised: HYDE has ${region.name} flat; moved toward ~${Math.round(region.targetPeople / 1000).toLocaleString('en-US')},000 by contact.`, source: region.source });
    }
  }
  return out;
}

/** Everything the panel says for one place and year, people first. */
export function estimateLines({ time, adjusted = false }: Pick<EstimateInput, 'time'> & { adjusted?: boolean }): EstimateLine[] {
  return [peopleLine(time), continentsLine(time), spreadLine(time, adjusted), betweenLine(time), lifeLine(time), GROUPS_LINE, landLine(time), climateLine(time)].filter(
    (l): l is EstimateLine => l !== null,
  );
}

/** Notes about this place at this year: corrections Footsteps makes, then known problems with the data. */
export function placeNotes({ time, lon, lat, corrections = correctionsAt(lon, lat, time) }: EstimateInput): PlaceCaveat[] {
  return [...corrections, ...caveatsAt(lon, lat, time)];
}

/** One icon per line, so the panel reads at a glance. */
export const LINE_ICON: Record<EstimateLine['id'], IconName> = {
  people: 'people',
  continents: 'continents',
  spread: 'spread',
  between: 'between',
  life: 'way-of-life',
  groups: 'groups',
  land: 'land',
  climate: 'climate',
  corrections: 'corrections',
};

/** What each trust word means, for its tooltip. */
export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  fair: 'Sources agree within about a third',
  rough: 'Sources agree within about three-fold',
  'very rough': 'Sources differ more, or nobody counted',
  imagined: 'Drawn to look plausible, not estimated',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  fair: 'Fair',
  rough: 'Rough',
  'very rough': 'Very rough',
  imagined: 'Illustrative',
};

