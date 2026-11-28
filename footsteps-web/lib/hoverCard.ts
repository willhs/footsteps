// What the hover card says for one spot at one year, and where it sits. Pure: the hook
// gathers the inputs (cursor position, decoded lookups, the people grid), this decides the
// words. Every row carries the kind of claim it is (docs/philosophy/vision.md).
import { climateChange, lifeKind, wayOfLife, type HabitatCell, type LandUse, type LifeKind } from './habitat';
import { seaLevelLabel } from './climate';
import { WayOfLife, type WayOfLifeValue } from './waysOfLife';
import type { BiomeNote } from './biomeNotes';
import type { FoodItem } from './food';
import type { Evidence } from './time';
import type { LargestSettlement } from './rankSize';
import { LANGUAGES_FROM, languageLine, type LanguageBlock } from './languages';
import { EXPANSIONS_FLOOR_YEAR, expansionLine, type ExpansionRow } from './languageExpansions';

export type CardRow = {
  id: 'habitat' | 'ice' | 'climate' | 'climate-note' | 'people' | 'life' | 'region' | 'largest' | 'animals' | 'food' | 'languages' | 'spread';
  text: string;
  detail?: string;
  /** Measured = counted or observed; modelled = reconstructed by a model. (No row is imagined yet.) */
  evidence: Evidence;
};

export type HoverCardInput = {
  time: number;
  /** null while the lookup is loading or failed to load. */
  habitat: HabitatCell | null;
  /** Up to four notable large animals (lib/fauna.ts); null while loading, empty when none are modelled here. */
  animals?: string[] | null;
  food?: FoodItem[] | null;
  /** Glottolog's languages for the cell (lib/languages.ts); shown only from LANGUAGES_FROM, whatever the caller passes. */
  languages?: LanguageBlock | null;
  /** `?langs=deep` only: cited expansions spreading in this cell by this year (lib/languageExpansions.ts); never before 5 ka. */
  expansions?: ExpansionRow[] | null;
  /** The same cell at 0 BP, for "vs today". */
  today: HabitatCell | null;
  /** Head counts from the decoded population grid; null while it loads or in Dots mode. */
  /** `way`: the cell's way of life as the map draws it (lib/waysOfLife.ts `classifyCell`), so the card and the marks agree. */
  people: { count: number; evidence: Evidence; cellDeg: number; adjusted?: boolean; way?: WayOfLifeValue | null } | null;
  /** HYDE land use for the same cell, only for HYDE years. */
  landUse: LandUse | null;
  /** `?settlements=1` only: the modelled regional group this cell belongs to (lib/regionalGroup.ts), people in it. */
  region?: { people: number } | null;
  /** `?ice=1` only: the dated ice sheet under the point (lib/iceSheets.ts `iceHoverRow`), or null off the ice. */
  ice?: { text: string; detail: string } | null;
  /** A known bias of the climate or biome model at this point and year (lib/biomeNotes.ts): the Green Sahara, the prairie, the mammoth steppe. */
  climateNote?: BiomeNote | null;
  /** `?settlements=1` only: the biggest settlement in the ~590 km block (lib/rankSize.ts), or null where the model says nothing. */
  largest?: LargestSettlement | null;
};

const WAY_TEXT: Record<WayOfLifeValue, string> = {
  [WayOfLife.Forager]: 'Foraging',
  [WayOfLife.Farmer]: 'Farming',
  [WayOfLife.Herder]: 'Herding',
  [WayOfLife.Urban]: 'Town or city',
};

const MINUS = '−';
const signed = (n: number, digits: number, unit: string) => {
  const r = Number(n.toFixed(digits));
  return `${r < 0 ? MINUS : r > 0 ? '+' : ''}${Math.abs(r).toFixed(digits)}${unit}`;
};
const twoFigures = (n: number) => Number(n.toPrecision(2)).toLocaleString('en-US');
const share = (s: number) => (s > 0 && s < 0.005 ? '<1%' : `${Math.round(s * 100)}%`);

function boundText(b: LargestSettlement['bound']): string {
  if (b.kind === 'city') return b.capped ? `capped at ${b.name}, the biggest known city within 1,500 km (${twoFigures(b.people)})` : 'bounded by the block\'s farming people';
  if (b.kind === 'ceiling') return 'capped at 5,000: no known city within 1,500 km then';
  return 'bounded by the block\'s farming people';
}

export function formatPlace(lon: number, lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function habitatRow(time: number, h: HabitatCell): CardRow {
  const text = h.surface === 'sea' ? 'Open sea' : h.surface === 'ice' ? 'Land ice' : (h.biome ?? 'Land');
  return { id: 'habitat', text, detail: `global ${seaLevelLabel(time)}`, evidence: 'modelled' };
}

function climateRow(h: HabitatCell, today: HabitatCell | null): CardRow | null {
  if (h.tempC === null && h.precipMm === null) return null;
  const parts = [
    h.tempC !== null ? `${h.tempC.toFixed(1).replace('-', MINUS)} °C` : null,
    h.precipMm !== null ? `${twoFigures(h.precipMm)} mm rain a year` : null,
  ].filter(Boolean);
  const change = climateChange(h, today);
  const dT = change?.tempC != null ? Number(change.tempC.toFixed(1)) : null;
  const dP = change?.precipPct != null ? Math.round(change.precipPct) : null;
  const delta = [
    dT !== null ? signed(dT, 1, ' °C') : null,
    dP !== null ? `rain ${signed(dP, 0, '%')}` : null,
  ].filter(Boolean);
  const same = delta.length > 0 && !dT && !dP;
  return {
    id: 'climate',
    text: parts.join(' · '),
    detail: delta.length ? (same ? 'same as today' : `vs today ${delta.join(', ')}`) : undefined,
    evidence: 'modelled',
  };
}

function peopleRow(p: NonNullable<HoverCardInput['people']>): CardRow {
  const km = p.cellDeg <= 0.1 ? 10 : 55;
  const cell = `in this ~${km} km ${p.evidence === 'modelled' ? 'block' : 'cell'}`;
  // `?spread=1`: the count is the adjusted spread, a model on HYDE's (lib/adjustedSpread.ts), so the row says so and is not "measured".
  if (p.adjusted) {
    const where = `${cell} · adjusted spread (modelled on HYDE)`;
    if (p.count <= 0) return { id: 'people', text: 'No one in the adjusted spread', detail: where, evidence: 'modelled' };
    return { id: 'people', text: p.count < 1 ? 'Under 1 person' : `≈ ${p.count < 10 ? Math.round(p.count) : twoFigures(p.count)} people`, detail: where, evidence: 'modelled' };
  }
  const where = cell;
  if (p.count <= 0) {
    return { id: 'people', text: p.evidence === 'modelled' ? 'No one modelled' : 'No one counted', detail: where, evidence: p.evidence };
  }
  const text = p.count < 1 ? 'Under 1 person' : `≈ ${p.count < 10 ? Math.round(p.count) : twoFigures(p.count)} people`;
  return { id: 'people', text, detail: where, evidence: p.evidence };
}

/** HYDE's way of life, only where it counted people living here. Null before HYDE and where no one lives. */
export function settledUse(i: Pick<HoverCardInput, 'people' | 'landUse'>): LandUse | null {
  return i.people && i.people.evidence === 'measured' && i.people.count > 0 ? i.landUse : null;
}

export function settledLife(i: Pick<HoverCardInput, 'people' | 'landUse'>): LifeKind | null {
  const use = settledUse(i);
  return use && lifeKind(use);
}

export function hoverCardRows(i: HoverCardInput): CardRow[] {
  const rows: CardRow[] = [];
  if (i.habitat) {
    rows.push(habitatRow(i.time, i.habitat));
    if (i.ice) rows.push({ id: 'ice', ...i.ice, evidence: 'modelled' });
    const c = climateRow(i.habitat, i.today);
    if (c) rows.push(c);
    if (i.climateNote && i.habitat.surface === 'land') rows.push({ id: 'climate-note', ...i.climateNote, evidence: 'modelled' });
  }
  // Open sea with no one in it says nothing about people.
  const emptySea = i.habitat?.surface === 'sea' && (i.people?.count ?? 0) <= 0;
  if (i.people && !emptySea) rows.push(peopleRow(i.people));
  const use = settledUse(i);
  if (use) {
    const way = i.people?.way;
    rows.push({
      id: 'life',
      // The map's class when known (it also weighs head count and what had been domesticated), else HYDE's land use alone.
      text: way !== undefined && way !== null ? WAY_TEXT[way] : wayOfLife(use),
      detail: `${share(use.crop)} cropland, ${share(use.grazing)} grazing`,
      evidence: 'modelled',
    });
  }
  if (i.languages && i.time >= LANGUAGES_FROM) {
    // A recorded baseline, not a measurement for this year: no family colours, nothing before it.
    rows.push({ id: 'languages', ...languageLine(i.languages), evidence: 'measured' });
  }
  if (i.expansions?.length && i.time >= EXPANSIONS_FLOOR_YEAR && i.habitat?.surface === 'land') {
    // Cited spreads drawn as hand-made 5° areas: modelled, even where the date is a written record.
    rows.push({ id: 'spread', ...expansionLine(i.expansions), evidence: 'modelled' });
  }
  if (i.region) {
    rows.push({
      id: 'region',
      text: `Part of a regional group of about ${twoFigures(i.region.people)} people`,
      detail: 'tinted on the map · the edge is imagined',
      evidence: 'modelled',
    });
  }
  if (i.largest) {
    const l = i.largest;
    const block = `a ~${l.blockKm} km block`;
    rows.push({
      id: 'largest',
      text: l.city
        ? `Largest settlement around here: ${l.city}, about ${twoFigures(l.people)} people`
        : `Largest settlement around here: about ${twoFigures(l.people)} people`,
      detail: l.city
        ? `a named city, population estimated · in ${block}`
        : `a tail of bigger and smaller villages, exponent ${l.exponent} assumed (imagined) · ${boundText(l.bound)} · in ${block}`,
      evidence: 'modelled',
    });
  }
  if (i.animals?.length && i.habitat && i.habitat.surface === 'land') {
    rows.push({ id: 'animals', text: i.animals.join(', '), detail: 'animals here, natural range', evidence: 'modelled' });
  }
  if (i.food?.length && i.habitat?.surface === 'land') {
    rows.push({
      id: 'food',
      text: `Food here: ${i.food.slice(0, 4).map((f) => `${f.name} (${f.confidence}${f.checked ? ', checked' : ', not verified'})`).join('; ')}`,
      detail: 'possible foods · 5° model, not a measured diet',
      evidence: 'modelled',
    });
  }
  return rows;
}

/** The two viewport calls `lonLatAt` needs (deck.gl's `Viewport` has both). */
export type PixelViewport = {
  unproject(xy: [number, number]): number[];
  project(lonLat: [number, number]): number[];
};

/**
 * The lon/lat under a container pixel, or null when the pixel is not on the map. Off the edge of
 * the globe deck.gl still returns a coordinate (clamped to the limb), so check it projects back
 * to the same pixel: it does on the map and does not in space.
 */
export function lonLatAt(viewport: PixelViewport | undefined, x: number, y: number): [number, number] | null {
  if (!viewport) return null;
  const [lon, lat] = viewport.unproject([x, y]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  const [px, py] = viewport.project([lon, lat]);
  return Math.hypot(px - x, py - y) <= 2 ? [lon, lat] : null;
}
