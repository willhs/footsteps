import { WebMercatorViewport } from '@deck.gl/core';
import { WORLD, type Region } from './unitRegion';

/** How people are drawn. `auto` (the default) picks the look from zoom; the
 * others are debug overrides reached with `?mode=`. */
export type PeopleMode = 'auto' | 'units' | 'grid' | 'dots';
export const PEOPLE_MODES: PeopleMode[] = ['auto', 'units', 'grid', 'dots'];

/** Everything zoom decides about the people layers; all continuous in zoom,
 * so zooming changes uniforms and opacities, never the uploaded marks. */
export type ViewBlend = {
  glow: number; // density texture opacity
  units: number; // unit marks opacity; 0 means units are not built at all
  minPx: number; // smallest drawn radius of a unit mark
  brightness: number; // alpha multiplier for bands and villages
  pickable: boolean; // close zoom: a click names the group under the cursor
  people: number; // street-level zoom: individual people (group marks fade out)
  settle: number; // 1 = groups drift and breathe; 0 = still (close in)
  halo: number; // px: smallest fire sprite for a band or village
};

// A ~9 km cell is 3.3 px at zoom 4.8 and 7 px at 5.8 (512 px world, 4320 cells).
export const ZOOM = {
  unitsIn: 4.6, // units start to fade in
  unitsFull: 5.4, // units fully drawn
  glowGone: 5.4, // glow has faded out under the units
  groups: 7, // marks are big enough to click one by one
  peopleIn: 11.5, // individual people start to appear (~60 m per pixel)
  peopleFull: 12.5, // people fully drawn, group marks gone
} as const;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Piecewise-linear through [zoom, value] stops, clamped at both ends. */
function ramp(stops: [number, number][], zoom: number) {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (zoom <= z1) {
      const [z0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

export function viewBlend(zoom: number, mode: PeopleMode): ViewBlend {
  const minPx = ramp([[3, 0.35], [4.6, 1.0], [5.4, 1.5], [7, 3.2], [9, 5]], zoom);
  // Close in, groups stop drifting: a mark should hold still under the cursor.
  const settle = 1 - smoothstep(6, 8.5, zoom);
  // Match the far-out firelight sprites (FireLayer: 4-13 px) where they hand over.
  const halo = ramp([[4.6, 7], [7, 8], [9, 9]], zoom);
  const brightness = ramp([[3, 0.3], [4.6, 0.6], [5.4, 0.6], [7, 1]], zoom);
  const pickable = zoom >= ZOOM.groups;
  if (mode === 'auto')
    return {
      glow: 1 - smoothstep(ZOOM.unitsIn, ZOOM.glowGone, zoom),
      units: smoothstep(ZOOM.unitsIn, ZOOM.unitsFull, zoom),
      minPx,
      brightness,
      pickable,
      people: smoothstep(ZOOM.peopleIn, ZOOM.peopleFull, zoom),
      settle,
      halo,
    };
  if (mode === 'units')
    return {
      glow: 0,
      units: 1,
      minPx,
      brightness,
      pickable,
      people: smoothstep(ZOOM.peopleIn, ZOOM.peopleFull, zoom),
      settle,
      halo,
    };
  return { glow: 0, units: 0, minPx, brightness, pickable: false, people: 0, settle, halo };
}

type View = { longitude: number; latitude: number; zoom: number };

/** The lon/lat box on screen. Globe view uses the same Mercator box with a
 * wider margin (its degrees-per-pixel differ away from the equator). */
export function viewBounds(
  view: View,
  width: number,
  height: number,
): Region {
  const [west, south, east, north] = new WebMercatorViewport({
    ...view,
    width: Math.max(1, width),
    height: Math.max(1, height),
  }).getBounds();
  return normalise({ west, south, east, north });
}

/** Clamp latitude and collapse a box wider than the world to the whole world. */
function normalise(r: Region): Region {
  const south = Math.max(-90, r.south);
  const north = Math.min(90, r.north);
  return r.east - r.west >= 360
    ? { west: WORLD.west, south, east: WORLD.east, north }
    : { ...r, south, north };
}

const area = (r: Region) => (r.east - r.west) * (r.north - r.south);
const contains = (outer: Region, inner: Region) =>
  outer.west <= inner.west &&
  outer.east >= inner.east &&
  outer.south <= inner.south &&
  outer.north >= inner.north;

/** Pad by `margin` of the span on every side and snap outward to whole degrees,
 * so small pans keep the same region and nothing is rebuilt. */
export function padRegion(bounds: Region, margin: number): Region {
  const dx = (bounds.east - bounds.west) * margin;
  const dy = (bounds.north - bounds.south) * margin;
  return normalise({
    west: Math.floor(bounds.west - dx),
    east: Math.ceil(bounds.east + dx),
    south: Math.floor(bounds.south - dy),
    north: Math.ceil(bounds.north + dy),
  });
}

/** Keep the current region while it still covers the screen and is not much
 * bigger than needed (after zooming in); otherwise cut a new padded one. */
export function nextRegion(
  current: Region | null,
  bounds: Region,
  margin: number,
): Region {
  const screen = normalise(bounds);
  const padded = padRegion(screen, margin);
  if (current && contains(current, screen) && area(current) <= 4 * area(padded))
    return current;
  return padded;
}
