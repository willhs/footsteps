// What the hover card says for one spot at one year, and where it sits. Pure: the hook
// gathers the inputs (cursor position, decoded lookups, the people grid), this decides the
// words. Every row carries the kind of claim it is (docs/philosophy/vision.md).
import { climateChange, lifeKind, wayOfLife, type HabitatCell, type LandUse, type LifeKind } from './habitat';
import { seaLevelLabel } from './climate';
import type { Evidence } from './time';

export type CardRow = {
  id: 'habitat' | 'climate' | 'people' | 'life' | 'animals';
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
  /** The same cell at 0 BP, for "vs today". */
  today: HabitatCell | null;
  /** Head counts from the decoded population grid; null while it loads or in Dots mode. */
  people: { count: number; evidence: Evidence; cellDeg: number } | null;
  /** HYDE land use for the same cell, only for HYDE years. */
  landUse: LandUse | null;
};

const MINUS = '−';
const signed = (n: number, digits: number, unit: string) => {
  const r = Number(n.toFixed(digits));
  return `${r < 0 ? MINUS : r > 0 ? '+' : ''}${Math.abs(r).toFixed(digits)}${unit}`;
};
const twoFigures = (n: number) => Number(n.toPrecision(2)).toLocaleString('en-US');
const share = (s: number) => (s > 0 && s < 0.005 ? '<1%' : `${Math.round(s * 100)}%`);

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
  const where = `in this ~${km} km ${p.evidence === 'modelled' ? 'block' : 'cell'}`;
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
    const c = climateRow(i.habitat, i.today);
    if (c) rows.push(c);
  }
  // Open sea with no one in it says nothing about people.
  const emptySea = i.habitat?.surface === 'sea' && (i.people?.count ?? 0) <= 0;
  if (i.people && !emptySea) rows.push(peopleRow(i.people));
  const use = settledUse(i);
  if (use) {
    rows.push({
      id: 'life',
      text: wayOfLife(use),
      detail: `${share(use.crop)} cropland, ${share(use.grazing)} grazing`,
      evidence: 'modelled',
    });
  }
  if (i.animals?.length && i.habitat && i.habitat.surface === 'land') {
    rows.push({ id: 'animals', text: i.animals.join(', '), detail: 'animals here, natural range', evidence: 'modelled' });
  }
  return rows;
}

/** About as tall as the card gets (picture, caption, place and four rows; measured ~350 px), so it can be placed without measuring. */
export const CARD_MAX_HEIGHT = 360;

/**
 * Fixed-position anchor. The card sits below the cursor when it fits there, above it when it fits
 * there, else pinned inside the viewport (over the cursor, which it never blocks). It grows away from
 * the nearer side edge.
 */
export function cardAnchor(x: number, y: number, vw: number, vh: number, gap = 16) {
  const horizontal = x > vw / 2 ? { right: vw - x + gap } : { left: x + gap };
  if (vh - y - gap >= CARD_MAX_HEIGHT) return { ...horizontal, top: y + gap };
  if (y - gap >= CARD_MAX_HEIGHT) return { ...horizontal, bottom: vh - y + gap };
  return { ...horizontal, top: Math.max(gap / 2, Math.min(y + gap, vh - CARD_MAX_HEIGHT - gap / 2)) };
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
